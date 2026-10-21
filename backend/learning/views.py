from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .domain import ContentError, grade, public_snapshot, validate_answer
from .models import Attempt, Draft, Exercise, HintUsage, Lesson, LessonRelease, User
from .serializers import ExerciseSerializer, LessonSerializer
from .services import publish, published_lessons
from .progress import student_progress


def user_data(user):
    return {"id": user.id, "username": user.username, "name": user.first_name or user.username,
            "role": "teacher" if user.can_author else "student"}


class ObjectAPIView(APIView):
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method in ("POST", "PUT", "PATCH") and not isinstance(request.data, dict):
            raise ValidationError("Тело запроса должно быть JSON-объектом.")


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"user": user_data(request.user) if request.user.is_authenticated else None})


@method_decorator(csrf_protect, name="dispatch")
class LoginView(ObjectAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_scope = "login"

    def post(self, request):
        username, password = request.data.get("username"), request.data.get("password")
        if not isinstance(username, str) or not isinstance(password, str) or len(username) > 150 or len(password) > 1024:
            raise ValidationError("Введите логин и пароль.")
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"detail": "Не получилось войти. Проверь логин и пароль."}, status=400)
        login(request, user)
        return Response({"user": user_data(user)})


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=204)


class IsAuthor(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.can_author


class OwnedViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthor]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_queryset(self):
        queryset = super().get_queryset()
        return queryset if self.request.user.is_superuser else queryset.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ExerciseViewSet(OwnedViewSet):
    queryset = Exercise.objects.all().order_by("title")
    serializer_class = ExerciseSerializer


class LessonViewSet(OwnedViewSet):
    queryset = Lesson.objects.prefetch_related("blocks", "releases").order_by("title")
    serializer_class = LessonSerializer

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        try:
            release = publish(self.get_object())
        except ContentError as exc:
            raise ValidationError(str(exc)) from exc
        return Response({"id": str(release.id), "version": release.version}, status=201)


def progress(user, release):
    attempts = Attempt.objects.filter(student=user, release=release)
    completed = list(attempts.filter(correct=True).values_list("block_id", flat=True).distinct())
    return {"completed_blocks": [str(value) for value in completed], "attempts": attempts.count(),
            "hints_used": HintUsage.objects.filter(student=user, release=release).count()}


class CatalogView(APIView):
    def get(self, request):
        # All published lessons are available to authenticated users in the first version.
        rows = []
        for lesson in published_lessons():
            release = lesson.releases.all()[0]
            rows.append({"lesson_id": str(lesson.id), "release_id": str(release.id), "version": release.version,
                         "title": release.snapshot["title"], "summary": release.snapshot["summary"],
                         "section": lesson.section, "tags": lesson.tags,
                         "task_count": sum(b["kind"] == "exercise" for b in release.snapshot["blocks"]),
                         "progress": progress(request.user, release)})
        return Response(rows)


class ReleaseView(APIView):
    def get(self, request, release_id):
        release = get_object_or_404(LessonRelease.objects.select_related("lesson"), pk=release_id)
        drafts = {str(d.block_id): d.answer for d in Draft.objects.filter(student=request.user, release=release)}
        hints = {}
        for usage in HintUsage.objects.filter(student=request.user, release=release).order_by("level"):
            block = next(b for b in release.snapshot["blocks"] if b["id"] == str(usage.block_id))
            hints.setdefault(str(usage.block_id), []).append(block["exercise"]["hints"][usage.level])
        return Response({"id": str(release.id), "version": release.version, **public_snapshot(release.snapshot),
                         "section": release.lesson.section, "tags": release.lesson.tags,
                         "progress": progress(request.user, release), "drafts": drafts, "hints": hints})


def task_block(release, block_id):
    for block in release.snapshot["blocks"]:
        if block["id"] == str(block_id) and block["kind"] == "exercise":
            return block
    raise NotFound("Задание не найдено в этой версии урока.")


def attempt_data(attempt):
    return {"id": str(attempt.id), "correct": attempt.correct, "feedback": attempt.feedback,
            "verification": attempt.verification, "hints_used": attempt.hints_used}


class DraftView(ObjectAPIView):
    def put(self, request, release_id, block_id):
        release = get_object_or_404(LessonRelease, pk=release_id)
        exercise = task_block(release, block_id)["exercise"]
        try:
            answer = validate_answer(exercise, request.data.get("answer"))
        except ContentError as exc:
            raise ValidationError(str(exc)) from exc
        Draft.objects.update_or_create(student=request.user, release=release, block_id=block_id,
                                       defaults={"answer": answer})
        return Response({"saved": True})


class AttemptView(ObjectAPIView):
    @transaction.atomic
    def post(self, request, release_id, block_id):
        release = get_object_or_404(LessonRelease, pk=release_id)
        exercise = task_block(release, block_id)["exercise"]
        request_id = serializers.UUIDField().run_validation(request.data.get("request_id"))
        # Serializes retries, attempts and hint requests for one student, even across browser tabs.
        User.objects.select_for_update().get(pk=request.user.pk)
        existing = Attempt.objects.filter(student=request.user, request_id=request_id).first()
        if existing:
            if existing.release_id != release.id or existing.block_id != block_id or existing.answer != request.data.get("answer"):
                return Response({"detail": "Этот request_id уже использован для другого ответа."}, status=409)
            return Response(attempt_data(existing))
        answer = request.data.get("answer")
        try:
            correct, feedback, verification = grade(exercise, answer)
        except ContentError as exc:
            raise ValidationError(str(exc)) from exc
        # Persist only bounded, validated answer fields; arbitrary request fields are discarded.
        stored_answer = validate_answer(exercise, answer)
        if exercise["kind"] == "robot":
            commands = answer.get("commands", [])
            if not isinstance(commands, list) or len(commands) > 1000 or any(c not in ("forward", "left", "right") for c in commands):
                raise ValidationError("Некорректный журнал команд робота.")
            stored_answer["commands"] = commands
        attempt = Attempt.objects.create(student=request.user, release=release, block_id=block_id,
                                         request_id=request_id, answer=stored_answer, correct=correct,
                                         feedback=feedback, verification=verification,
                                         hints_used=HintUsage.objects.filter(student=request.user, release=release,
                                                                            block_id=block_id).count())
        return Response(attempt_data(attempt), status=201)


class HintView(APIView):
    @transaction.atomic
    def post(self, request, release_id, block_id):
        release = get_object_or_404(LessonRelease, pk=release_id)
        exercise = task_block(release, block_id)["exercise"]
        User.objects.select_for_update().get(pk=request.user.pk)
        level = HintUsage.objects.filter(student=request.user, release=release, block_id=block_id).count()
        if level >= len(exercise["hints"]):
            raise ValidationError("Все подсказки уже открыты.")
        if level == 3 and not Attempt.objects.filter(student=request.user, release=release, block_id=block_id).exists():
            raise ValidationError("Сначала попробуй своё решение — потом откроется разбор.")
        HintUsage.objects.create(student=request.user, release=release, block_id=block_id, level=level)
        return Response({"level": level + 1, "text": exercise["hints"][level]})


class StudentSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "password"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        try:
            validate_password(attrs["password"], User(username=attrs.get("username"), first_name=attrs.get("first_name", "")))
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages}) from exc
        return attrs


class StudentsView(ObjectAPIView):
    permission_classes = [IsAuthor]

    def get(self, request):
        students = User.objects.filter(role=User.Role.STUDENT)
        if not request.user.is_superuser:
            students = students.filter(teacher=request.user)
        return Response([{**user_data(student), "attempts": Attempt.objects.filter(student=student).count(),
                          "solved": Attempt.objects.filter(student=student, correct=True)
                          .values("release_id", "block_id").distinct().count(),
                          "hints_used": HintUsage.objects.filter(student=student).count()} for student in students])

    def post(self, request):
        serializer = StudentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        student = User.objects.create_user(**serializer.validated_data, teacher=request.user, role=User.Role.STUDENT)
        return Response(user_data(student), status=201)


class StudentAttemptsView(APIView):
    permission_classes = [IsAuthor]

    def get(self, request, student_id):
        students = User.objects.filter(role=User.Role.STUDENT)
        if not request.user.is_superuser:
            students = students.filter(teacher=request.user)
        student = get_object_or_404(students, pk=student_id)
        attempts = Attempt.objects.filter(student=student).select_related("release").order_by("-created_at")[:200]
        return Response([{**attempt_data(attempt), "answer": attempt.answer, "block_id": str(attempt.block_id),
                          "lesson": attempt.release.snapshot["title"], "version": attempt.release.version,
                          "created_at": attempt.created_at.isoformat()} for attempt in attempts])


def own_student(request, student_id):
    students = User.objects.filter(role=User.Role.STUDENT)
    if not request.user.is_superuser:
        students = students.filter(teacher=request.user)
    return get_object_or_404(students, pk=student_id)


class MyProgressView(APIView):
    def get(self, request):
        return Response(student_progress(request.user))


class StudentProgressView(APIView):
    permission_classes = [IsAuthor]

    def get(self, request, student_id):
        student = own_student(request, student_id)
        return Response({"student": user_data(student), **student_progress(student)})


class StudentPasswordView(ObjectAPIView):
    permission_classes = [IsAuthor]

    def post(self, request, student_id):
        student = own_student(request, student_id)
        password = serializers.CharField(max_length=128, trim_whitespace=False).run_validation(request.data.get("password"))
        try:
            validate_password(password, student)
        except DjangoValidationError as exc:
            raise ValidationError({"password": exc.messages}) from exc
        student.set_password(password)
        student.save(update_fields=["password"])
        return Response({"detail": "Пароль изменён. Передай новый пароль ученику."})
