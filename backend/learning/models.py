import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        STUDENT = "student", "Ученик"
        TEACHER = "teacher", "Преподаватель"

    role = models.CharField(max_length=16, choices=Role, default=Role.STUDENT)
    teacher = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="students", limit_choices_to={"role": "teacher"})

    @property
    def can_author(self):
        return self.is_superuser or self.role == self.Role.TEACHER


class Exercise(models.Model):
    class Kind(models.TextChoices):
        QUIZ = "quiz", "Тест"
        SHORT_ANSWER = "short_answer", "Короткий ответ"
        ROBOT = "robot", "Робот"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    title = models.CharField(max_length=200)
    kind = models.CharField(max_length=24, choices=Kind)
    prompt = models.TextField()
    starter_code = models.TextField(blank=True)
    config = models.JSONField(default=dict, blank=True)
    rules = models.JSONField(default=dict, blank=True)
    hints = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        from .domain import ContentError, validate_exercise
        try:
            validate_exercise({key: getattr(self, key) for key in
                               ("kind", "title", "prompt", "starter_code", "config", "rules", "hints")})
        except ContentError as exc:
            raise ValidationError(str(exc)) from exc

    def __str__(self):
        return self.title


class Lesson(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    title = models.CharField(max_length=200)
    summary = models.TextField(blank=True)
    section = models.CharField(max_length=80, blank=True)
    tags = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class LessonBlock(models.Model):
    class Kind(models.TextChoices):
        TEXT = "text", "Объяснение"
        EXERCISE = "exercise", "Задание"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lesson = models.ForeignKey(Lesson, related_name="blocks", on_delete=models.CASCADE)
    position = models.PositiveIntegerField()
    kind = models.CharField(max_length=16, choices=Kind)
    title = models.CharField(max_length=200, blank=True)
    body = models.TextField(blank=True)
    exercise = models.ForeignKey(Exercise, null=True, blank=True, on_delete=models.PROTECT,
                                 related_name="lesson_blocks")

    class Meta:
        ordering = ["position", "id"]
        constraints = [models.UniqueConstraint(fields=["lesson", "position"], name="block_position_unique"),
                       models.CheckConstraint(condition=(
                           models.Q(kind="text", exercise__isnull=True)
                           | models.Q(kind="exercise", exercise__isnull=False)
                       ), name="block_exercise_matches_kind")]


class LessonRelease(models.Model):
    """Append-only snapshot; changes to drafts never rewrite student history."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lesson = models.ForeignKey(Lesson, related_name="releases", on_delete=models.PROTECT)
    version = models.PositiveIntegerField()
    snapshot = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version"]
        constraints = [models.UniqueConstraint(fields=["lesson", "version"], name="release_version_unique")]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Опубликованную версию нельзя изменять. Выпустите новую версию.")
        return super().save(*args, **kwargs)


class Attempt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    release = models.ForeignKey(LessonRelease, on_delete=models.PROTECT)
    block_id = models.UUIDField()
    request_id = models.UUIDField()
    answer = models.JSONField()
    correct = models.BooleanField()
    feedback = models.TextField()
    verification = models.CharField(max_length=24, default="server")
    hints_used = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [models.UniqueConstraint(fields=["student", "request_id"], name="attempt_request_unique")]
        indexes = [models.Index(fields=["student", "release", "block_id"], name="attempt_student_release_idx")]


class Draft(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    release = models.ForeignKey(LessonRelease, on_delete=models.PROTECT)
    block_id = models.UUIDField()
    answer = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["student", "release", "block_id"], name="draft_unique")]


class HintUsage(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    release = models.ForeignKey(LessonRelease, on_delete=models.PROTECT)
    block_id = models.UUIDField()
    level = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["student", "release", "block_id", "level"], name="hint_unique")]
