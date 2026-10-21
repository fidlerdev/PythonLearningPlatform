import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from learning.models import Attempt, Draft, Exercise, HintUsage, Lesson, LessonBlock, User
from learning.services import publish
from tests.test_domain import exercise


class ProgressTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(username="mentor", role="teacher")
        self.other_teacher = User.objects.create_user(username="other", role="teacher")
        self.student = User.objects.create_user(username="kid", teacher=self.teacher)
        self.other_student = User.objects.create_user(username="second", teacher=self.other_teacher)
        definition = exercise("predict-loop"); definition.pop("key")
        task = Exercise.objects.create(owner=self.teacher, **definition)
        self.lesson = Lesson.objects.create(owner=self.teacher, title="Повторения", section="Циклы", tags=["for"])
        self.block = LessonBlock.objects.create(lesson=self.lesson, position=0, kind="exercise", exercise=task, title="Попробуй цикл")
        self.release = publish(self.lesson)
        self.client = APIClient(); self.client.force_login(self.student)

    def attempt(self, correct, hints=0, student=None):
        return Attempt.objects.create(student=student or self.student, release=self.release, block_id=self.block.id,
                                      request_id=uuid.uuid4(), answer={"selected": ["four"]}, correct=correct,
                                      feedback="Получилось" if correct else "Подумай ещё", hints_used=hints)

    def report(self):
        response = self.client.get("/api/progress/")
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_empty_state_has_no_fabricated_achievements_and_recommends_first_task(self):
        report = self.report()
        self.assertEqual(report["summary"]["percent"], 0)
        self.assertEqual(report["summary"]["total_tasks"], 1)
        self.assertEqual(report["lifetime"]["attempts"], 0)
        self.assertFalse(any(item["unlocked"] for item in report["achievements"]))
        self.assertEqual(report["recommendation"]["block_id"], str(self.block.id))
        self.assertFalse(report["recommendation"]["started"])
        self.assertEqual(len(report["week"]), 7)

    def test_retry_counts_once_and_independence_allows_learning_from_errors(self):
        self.attempt(False); self.attempt(False); self.attempt(True); self.attempt(True)
        HintUsage.objects.create(student=self.student, release=self.release, block_id=self.block.id, level=0)
        report = self.report()
        self.assertEqual(report["summary"]["solved_tasks"], 1)
        self.assertEqual(report["summary"]["independent_tasks"], 1)
        self.assertEqual(report["summary"]["completed_lessons"], 1)
        self.assertEqual(report["lifetime"]["recovered_tasks"], 1)
        self.assertEqual(report["summary"]["attempts"], 4)
        self.assertEqual(report["summary"]["hints_used"], 1)
        self.assertEqual(report["summary"]["percent"], 100)
        self.assertIsNone(report["recommendation"])
        self.assertEqual(report["week"][-1]["attempts"], 4)
        self.assertTrue(next(item for item in report["achievements"] if item["id"] == "persistent")["unlocked"])

    def test_hinted_solution_is_not_relabelled_independent_after_retry(self):
        self.attempt(True, hints=1); self.attempt(True, hints=0)
        report = self.report()
        self.assertEqual(report["summary"]["independent_tasks"], 0)
        self.assertFalse(report["lessons"][0]["tasks"][0]["independent"])

    def test_unsolved_repeated_attempts_signal_support_but_drafts_are_not_attempts(self):
        Draft.objects.create(student=self.student, release=self.release, block_id=self.block.id, answer={"selected": ["three"]})
        report = self.report()
        self.assertTrue(report["recommendation"]["started"])
        self.assertEqual(report["summary"]["attempts"], 0)
        self.attempt(False); self.attempt(False)
        self.assertTrue(self.report()["lessons"][0]["tasks"][0]["needs_support"])
        self.attempt(True)
        self.assertFalse(self.report()["lessons"][0]["tasks"][0]["needs_support"])

    def test_new_publication_does_not_erase_historical_achievements(self):
        self.attempt(True)
        latest = publish(self.lesson)
        report = self.report()
        self.assertEqual(report["summary"]["solved_tasks"], 0)
        self.assertEqual(report["lifetime"]["solved_tasks"], 1)
        self.assertEqual(report["recommendation"]["release_id"], str(latest.id))
        self.assertTrue(next(item for item in report["achievements"] if item["id"] == "lesson")["unlocked"])
        self.assertEqual(len(report["recent"]), 1)

    def test_access_and_student_data_are_isolated(self):
        self.attempt(True, student=self.other_student)
        self.assertEqual(self.report()["lifetime"]["solved_tasks"], 0)
        self.assertEqual(self.client.get(f"/api/author/students/{self.student.id}/progress/").status_code, 403)
        self.client.force_login(self.other_teacher)
        self.assertEqual(self.client.get(f"/api/author/students/{self.student.id}/progress/").status_code, 404)
        self.client.force_login(self.teacher)
        result = self.client.get(f"/api/author/students/{self.student.id}/progress/")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["student"]["id"], self.student.id)
        self.assertNotIn("answer", str(result.json()))
        self.client.logout()
        self.assertEqual(self.client.get("/api/progress/").status_code, 403)


class StudentPasswordTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(username="mentor", role="teacher")
        self.student = User.objects.create_user(username="kid", teacher=self.teacher, password="Old-learning-pass-18")
        self.other = User.objects.create_user(username="other", role="teacher")
        self.client = APIClient(); self.client.force_login(self.teacher)
        self.url = f"/api/author/students/{self.student.id}/password/"

    def test_changes_hash_accepts_new_login_invalidates_old_session_and_never_returns_password(self):
        old_session = APIClient(); old_session.force_login(self.student)
        password = "  New-learning-pass-72!  "
        response = self.client.post(self.url, {"password": password}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(password, str(response.json()))
        self.student.refresh_from_db()
        self.assertNotEqual(self.student.password, password)
        self.assertTrue(self.student.check_password(password))
        self.assertFalse(self.student.check_password("Old-learning-pass-18"))
        self.assertEqual(old_session.get("/api/progress/").status_code, 403)
        login = APIClient()
        self.assertEqual(login.post("/api/auth/login/", {"username": "kid", "password": password}, format="json").status_code, 200)
        self.assertEqual(self.client.get(self.url).status_code, 405)
        self.assertNotIn("password", self.client.get("/api/author/students/").json()[0])

    def test_rejects_weak_password_and_other_teachers_students(self):
        for value in ["123", "password", "", "x" * 129, None]:
            self.assertEqual(self.client.post(self.url, {"password": value}, format="json").status_code, 400)
        self.client.force_login(self.other)
        self.assertEqual(self.client.post(self.url, {"password": "A-strong-pass-73"}, format="json").status_code, 404)
        self.client.force_login(self.student)
        self.assertEqual(self.client.post(self.url, {"password": "A-strong-pass-73"}, format="json").status_code, 403)

    def test_reset_requires_csrf_with_session_authentication(self):
        client = APIClient(enforce_csrf_checks=True); client.force_login(self.teacher)
        self.assertEqual(client.post(self.url, {"password": "A-strong-pass-73"}, format="json").status_code, 403)

    def test_creation_keeps_password_whitespace_without_exposing_it(self):
        password = "  Explore-new-learner-83!  "
        response = self.client.post("/api/author/students/", {"username": "new-kid", "first_name": "Ученик", "password": password}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("password", response.json())
        self.assertTrue(User.objects.get(username="new-kid").check_password(password))
