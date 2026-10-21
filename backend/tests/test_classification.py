import copy
import importlib
import json
import tempfile
import uuid
from io import StringIO
from pathlib import Path
from types import SimpleNamespace

from django.apps import apps
from django.core.management import call_command, CommandError
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient

from learning.models import Attempt, Exercise, Lesson, LessonBlock, LessonRelease, User
from learning.services import publish
from tests.test_domain import exercise


class ClassificationTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(username="author", role="teacher")
        self.student = User.objects.create_user(username="learner", teacher=self.teacher)
        definition = exercise("predict-loop")
        definition.pop("key")
        task = Exercise.objects.create(owner=self.teacher, **definition)
        self.lesson = Lesson.objects.create(owner=self.teacher, title="Цикл")
        self.block = LessonBlock.objects.create(lesson=self.lesson, position=0, kind="exercise", exercise=task)
        self.release = publish(self.lesson)
        self.client = APIClient()
        self.client.force_login(self.teacher)
        self.url = f"/api/author/lessons/{self.lesson.id}/"

    def test_reclassification_is_live_without_republishing_or_losing_progress(self):
        self.client.force_login(self.student)
        response = self.client.post(f"/api/releases/{self.release.id}/blocks/{self.block.id}/attempts/", {
            "request_id": str(uuid.uuid4()), "answer": {"selected": ["four"]},
        }, format="json")
        self.assertEqual(response.status_code, 201)
        snapshot = copy.deepcopy(self.release.snapshot)
        self.client.force_login(self.teacher)
        result = self.client.patch(self.url, {"section": " Циклы ", "tags": ["for", " range ", "FOR"]}, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["section"], "Циклы")
        self.assertEqual(result.data["tags"], ["for", "range"])
        self.client.force_login(self.student)
        for data in [self.client.get("/api/catalog/").json()[0], self.client.get(f"/api/releases/{self.release.id}/").json()]:
            self.assertEqual(data["section"], "Циклы")
            self.assertEqual(data["tags"], ["for", "range"])
            self.assertEqual(data["progress"]["completed_blocks"], [str(self.block.id)])
        self.release.refresh_from_db()
        self.assertEqual(self.release.snapshot, snapshot)
        self.assertEqual(LessonRelease.objects.count(), 1)
        self.assertEqual(Attempt.objects.count(), 1)

    def test_invalid_metadata_is_rejected_without_partial_changes(self):
        for payload in [{"tags": "for"}, {"tags": ["a"] * 11}, {"tags": ["a" * 33]},
                        {"tags": [""]}, {"tags": [5]}, {"tags": None}, {"section": "x" * 81}]:
            with self.subTest(payload=payload):
                response = self.client.patch(self.url, payload, format="json")
                self.assertEqual(response.status_code, 400)
        self.lesson.refresh_from_db()
        self.assertEqual(self.lesson.tags, [])
        self.assertEqual(self.lesson.section, "")

    def test_only_owner_can_classify_and_fields_can_be_cleared(self):
        other = User.objects.create_user(username="other", role="teacher")
        self.client.force_login(other)
        self.assertEqual(self.client.patch(self.url, {"section": "Другое"}, format="json").status_code, 404)
        self.client.force_login(self.student)
        self.assertEqual(self.client.patch(self.url, {"section": "Другое"}, format="json").status_code, 403)
        self.client.force_login(self.teacher)
        self.client.patch(self.url, {"section": "Циклы", "tags": ["for"]}, format="json")
        result = self.client.patch(self.url, {"section": "", "tags": []}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["tags"], [])
        self.assertEqual(result.data["section"], "")

    def test_import_supports_classification_and_rolls_back_invalid_bundle(self):
        bundle = json.loads((Path(__file__).resolve().parents[1] / "content/robot-challenges.json").read_text())
        bundle["lessons"][1]["tags"] = ["x" * 33]
        initial = (Lesson.objects.count(), Exercise.objects.count())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lessons.json"
            path.write_text(json.dumps(bundle))
            with self.assertRaises(CommandError):
                call_command("import_lessons", str(path), owner=self.teacher.username, stdout=StringIO())
        self.assertEqual((Lesson.objects.count(), Exercise.objects.count()), initial)

    def test_seed_migration_leaves_custom_classification_and_snapshots_alone(self):
        seed = Lesson.objects.create(owner=self.teacher, title="Робот и сила повторений")
        custom = Lesson.objects.create(owner=self.teacher, title="Курьер: короткая программа", section="Авторский раздел", tags=["Своё"])
        migration = importlib.import_module("learning.migrations.0002_lesson_classification")
        migration.classify_seed_lessons(apps, SimpleNamespace(connection=connection))
        seed.refresh_from_db(); custom.refresh_from_db(); self.lesson.refresh_from_db()
        self.assertEqual(seed.section, "Циклы")
        self.assertIn("for", seed.tags)
        self.assertEqual(custom.section, "Авторский раздел")
        self.assertEqual(custom.tags, ["Своё"])
        self.assertEqual(self.lesson.section, "")
