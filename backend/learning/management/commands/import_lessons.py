"""Import a portable content bundle. The same format can later back a web importer."""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from learning.domain import ContentError, validate_exercise
from learning.classification import normalize_classification
from learning.models import Exercise, Lesson, LessonBlock, User
from learning.services import publish


class Command(BaseCommand):
    help = "Импорт уроков из JSON. Повторный импорт создаёт новые черновики."

    def add_arguments(self, parser):
        parser.add_argument("file", type=Path)
        parser.add_argument("--owner", required=True, help="Логин преподавателя")
        parser.add_argument("--publish", action="store_true")

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            owner = User.objects.get(username=options["owner"])
        except User.DoesNotExist as exc:
            raise CommandError("Преподаватель не найден.") from exc
        if not owner.can_author:
            raise CommandError("Владелец должен быть преподавателем.")
        try:
            bundle = json.loads(options["file"].read_text())
            if not isinstance(bundle, dict) or bundle.get("schema_version") != 1:
                raise ContentError("Неподдерживаемая версия формата.")
            if not isinstance(bundle.get("exercises"), list) or not isinstance(bundle.get("lessons"), list):
                raise ContentError("exercises и lessons должны быть списками объектов.")
            exercises = {}
            for definition in bundle["exercises"]:
                if not isinstance(definition, dict):
                    raise ContentError("Задание должно быть объектом.")
                definition = definition.copy()
                key = definition.pop("key")
                if not isinstance(key, str) or key in exercises:
                    raise ContentError("Ключи заданий должны быть уникальными строками.")
                validate_exercise(definition)
                exercises[key] = Exercise.objects.create(owner=owner, **definition)
            for definition in bundle["lessons"]:
                if not isinstance(definition, dict) or not isinstance(definition.get("title"), str) or not definition["title"].strip():
                    raise ContentError("Заполните название урока.")
                if len(definition["title"]) > 200 or not isinstance(definition.get("summary", ""), str) or len(definition.get("summary", "")) > 4000:
                    raise ContentError("Проверьте длину названия и описания урока.")
                if not isinstance(definition.get("blocks"), list) or len(definition["blocks"]) > 100:
                    raise ContentError("blocks должен быть списком, не более 100 блоков.")
                section, tags = normalize_classification(definition.get("section", ""), definition.get("tags", []))
                lesson = Lesson.objects.create(owner=owner, title=definition["title"], summary=definition.get("summary", ""), section=section, tags=tags)
                for index, block in enumerate(definition["blocks"]):
                    if not isinstance(block, dict):
                        raise ContentError("Блок должен быть объектом.")
                    if block["kind"] not in ("text", "exercise"):
                        raise ContentError("Неизвестный тип блока.")
                    if not isinstance(block.get("title", ""), str) or len(block.get("title", "")) > 200 or not isinstance(block.get("body", ""), str) or len(block.get("body", "")) > 30000:
                        raise ContentError("Проверьте заголовок и текст блока.")
                    exercise = exercises[block["exercise_key"]] if block["kind"] == "exercise" else None
                    if block["kind"] == "text" and not block.get("body", "").strip():
                        raise ContentError("Объяснение не может быть пустым.")
                    LessonBlock.objects.create(lesson=lesson, position=index, kind=block["kind"],
                                               title=block.get("title", ""), body=block.get("body", ""), exercise=exercise)
                if options["publish"]:
                    publish(lesson)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise CommandError(f"Ошибка импорта: {exc}") from exc
        self.stdout.write(self.style.SUCCESS(f"Импортировано уроков: {len(bundle['lessons'])}, заданий: {len(exercises)}"))
