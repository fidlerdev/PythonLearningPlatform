from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase

from learning.models import Exercise, Lesson, LessonRelease, User


class ContentImportTests(TestCase):
    def test_challenges_import_and_publish_under_teacher_without_replacing_existing_lesson(self):
        teacher = User.objects.create_user(username="author", role="teacher")
        existing = Lesson.objects.create(owner=teacher, title="Авторский урок")
        content = Path(__file__).resolve().parents[1] / "content/robot-challenges.json"
        call_command("import_lessons", str(content), owner=teacher.username, publish=True, stdout=StringIO())
        self.assertEqual(Lesson.objects.count(), 5)
        self.assertEqual(LessonRelease.objects.count(), 4)
        self.assertEqual(Exercise.objects.count(), 16)
        self.assertTrue(Lesson.objects.filter(pk=existing.pk, title="Авторский урок").exists())
        for release in LessonRelease.objects.all():
            self.assertEqual(release.lesson.section, "Циклы")
            self.assertTrue(release.lesson.tags)
            tasks = [block["exercise"] for block in release.snapshot["blocks"] if block["kind"] == "exercise"]
            self.assertEqual(len(tasks), 4)
            for exercise in tasks:
                if exercise["kind"] == "robot":
                    self.assertIn("max_code_commands", exercise["rules"])
                    self.assertIn("max_commands", exercise["rules"])
