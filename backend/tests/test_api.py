import copy
import uuid

from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from learning.models import Attempt, Draft, Exercise, HintUsage, Lesson, LessonBlock, User
from learning.services import publish
from tests.test_domain import exercise


class LearningAPITests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(username="teacher", password="test-password-123", role="teacher")
        self.other_teacher = User.objects.create_user(username="other-teacher", role="teacher")
        self.student = User.objects.create_user(username="student", password="test-password-123", teacher=self.teacher)
        self.other_student = User.objects.create_user(username="other", teacher=self.other_teacher)
        data = exercise("predict-loop")
        data.pop("key")
        self.exercise = Exercise.objects.create(owner=self.teacher, **data)
        self.lesson = Lesson.objects.create(owner=self.teacher, title="Урок")
        self.block = LessonBlock.objects.create(lesson=self.lesson, position=0, kind="exercise", exercise=self.exercise)
        self.release = publish(self.lesson)
        self.client = APIClient()
        self.client.force_login(self.student)
        self.base = f"/api/releases/{self.release.id}/blocks/{self.block.id}/"

    def submit(self, selected=None, request_id=None):
        return self.client.post(self.base + "attempts/", {"request_id": request_id or str(uuid.uuid4()),
                                                         "answer": {"selected": selected or ["four"]}}, format="json")

    def test_anonymous_cannot_access_content(self):
        self.client.logout()
        self.assertEqual(self.client.get("/api/catalog/").status_code, 403)

    def test_student_cannot_read_answer_library_or_create_content(self):
        self.assertEqual(self.client.get("/api/author/exercises/").status_code, 403)
        self.assertEqual(self.client.post("/api/author/lessons/", {}, format="json").status_code, 403)

    def test_release_does_not_expose_private_answers(self):
        result = self.client.get(f"/api/releases/{self.release.id}/").json()
        task = result["blocks"][0]["exercise"]
        self.assertNotIn("rules", task)
        self.assertNotIn("hints", task)

    def test_progress_and_drafts_are_isolated_between_students(self):
        self.assertEqual(self.submit().status_code, 201)
        self.assertEqual(self.client.put(self.base + "draft/", {"answer": {"selected": ["four"]}}, format="json").status_code, 200)
        own = self.client.get(f"/api/releases/{self.release.id}/").json()
        self.assertEqual(own["progress"]["completed_blocks"], [str(self.block.id)])
        self.client.force_login(self.other_student)
        other = self.client.get(f"/api/releases/{self.release.id}/").json()
        self.assertEqual(other["progress"]["completed_blocks"], [])
        self.assertEqual(other["drafts"], {})

    def test_answer_retries_are_idempotent(self):
        request_id = str(uuid.uuid4())
        first = self.submit(request_id=request_id)
        second = self.submit(request_id=request_id)
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(Attempt.objects.count(), 1)
        self.assertEqual(self.submit(["three"], request_id).status_code, 409)

    def test_attempt_cannot_override_student_identity(self):
        response = self.client.post(self.base + "attempts/", {"request_id": str(uuid.uuid4()), "student": self.other_student.id,
                                                            "answer": {"selected": ["four"]}}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Attempt.objects.get().student_id, self.student.id)

    def test_hints_are_sequential_and_last_requires_attempt(self):
        data = copy.deepcopy(self.release.snapshot)
        # Create a new release, preserving immutability of the original.
        self.exercise.hints = ["first", "second", "third", "solution"]
        self.exercise.save()
        release = publish(self.lesson)
        base = f"/api/releases/{release.id}/blocks/{self.block.id}/"
        for expected in ["first", "second", "third"]:
            self.assertEqual(self.client.post(base + "hint/").json()["text"], expected)
        self.assertEqual(self.client.post(base + "hint/").status_code, 400)
        self.client.post(base + "attempts/", {"request_id": str(uuid.uuid4()), "answer": {"selected": ["three"]}}, format="json")
        self.assertEqual(self.client.post(base + "hint/").json()["text"], "solution")
        self.assertEqual(self.client.post(base + "hint/").status_code, 400)
        self.assertEqual(self.release.snapshot, data)

    def test_publishing_freezes_exercises_and_keeps_old_progress(self):
        self.submit()
        self.exercise.rules = {"correct_options": ["three"]}
        self.exercise.save()
        new = publish(self.lesson)
        self.assertEqual(new.version, 2)
        self.release.refresh_from_db()
        self.assertEqual(self.release.snapshot["blocks"][0]["exercise"]["rules"]["correct_options"], ["four"])
        self.assertTrue(self.submit().json()["correct"])
        self.assertEqual(Attempt.objects.filter(release=self.release, correct=True).count(), 2)
        self.assertEqual(Attempt.objects.filter(release=new).count(), 0)
        with self.assertRaises(ValidationError):
            self.release.save()

    def test_teacher_cannot_edit_another_teachers_content(self):
        self.client.force_login(self.other_teacher)
        self.assertEqual(self.client.get(f"/api/author/exercises/{self.exercise.id}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/author/lessons/{self.lesson.id}/").status_code, 404)

    def test_teacher_cannot_attach_another_teachers_exercise(self):
        self.client.force_login(self.other_teacher)
        response = self.client.post("/api/author/lessons/", {"title": "Чужое задание", "blocks": [
            {"kind": "exercise", "exercise": str(self.exercise.id)}]}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_teacher_can_build_reorder_and_publish_lesson(self):
        self.client.force_login(self.teacher)
        response = self.client.post("/api/author/lessons/", {"title": "Новый урок", "blocks": [
            {"kind": "text", "title": "Идея", "body": "Проверь повторения."},
            {"kind": "exercise", "exercise": str(self.exercise.id)}]}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        lesson = response.json()
        lesson["blocks"].reverse()
        updated = self.client.put(f"/api/author/lessons/{lesson['id']}/", lesson, format="json")
        self.assertEqual(updated.status_code, 200, updated.content)
        self.assertEqual(updated.json()["blocks"][0]["kind"], "exercise")
        self.assertEqual(self.client.post(f"/api/author/lessons/{lesson['id']}/publish/").status_code, 201)

    def test_teacher_sees_only_own_students(self):
        self.client.force_login(self.teacher)
        usernames = [user["username"] for user in self.client.get("/api/author/students/").json()]
        self.assertEqual(usernames, ["student"])
        self.assertEqual(self.client.get(f"/api/author/students/{self.other_student.id}/attempts/").status_code, 404)

    def test_wrong_block_cannot_save_or_submit(self):
        url = f"/api/releases/{self.release.id}/blocks/{uuid.uuid4()}/"
        self.assertEqual(self.client.put(url + "draft/", {"answer": {"selected": []}}, format="json").status_code, 404)
        self.assertEqual(Draft.objects.count(), 0)

    def test_login_requires_csrf_even_when_anonymous(self):
        client = APIClient(enforce_csrf_checks=True)
        credentials = {"username": "student", "password": "test-password-123"}
        self.assertEqual(client.post("/api/auth/login/", credentials, format="json").status_code, 403)
        client.get("/api/auth/session/")
        token = client.cookies["csrftoken"].value
        response = client.post("/api/auth/login/", credentials, format="json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200)
        self.assertIn("sessionid", client.cookies)

    @override_settings(CSRF_TRUSTED_ORIGINS=["http://127.0.0.1:5173", "http://localhost:5173"])
    def test_login_through_frontend_proxy_accepts_trusted_origin(self):
        for origin in ["http://127.0.0.1:5173", "http://localhost:5173"]:
            with self.subTest(origin=origin):
                client = APIClient(enforce_csrf_checks=True)
                client.get("/api/auth/session/", HTTP_HOST="backend:8000")
                response = client.post("/api/auth/login/", {"username": "student", "password": "test-password-123"},
                                       format="json", HTTP_HOST="backend:8000", HTTP_ORIGIN=origin,
                                       HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
                self.assertEqual(response.status_code, 200, response.content)
                self.assertEqual(response.json()["user"]["username"], "student")

    @override_settings(CSRF_TRUSTED_ORIGINS=["http://127.0.0.1:5173"])
    def test_login_rejects_untrusted_origin_even_with_valid_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        client.get("/api/auth/session/", HTTP_HOST="backend:8000")
        response = client.post("/api/auth/login/", {"username": "student", "password": "test-password-123"},
                               format="json", HTTP_HOST="backend:8000", HTTP_ORIGIN="https://untrusted.example",
                               HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
        self.assertEqual(response.status_code, 403)
