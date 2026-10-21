from django.db import transaction
from django.db.models import Max

from .domain import ContentError, validate_exercise
from .models import Lesson, LessonRelease


@transaction.atomic
def publish(lesson):
    lesson = Lesson.objects.select_for_update().get(pk=lesson.pk)
    blocks = []
    for block in lesson.blocks.select_related("exercise"):
        data = {"id": str(block.id), "kind": block.kind, "title": block.title, "body": block.body}
        if block.kind == "exercise":
            exercise = block.exercise
            definition = {key: getattr(exercise, key) for key in
                          ["title", "kind", "prompt", "starter_code", "config", "rules", "hints"]}
            validate_exercise(definition)
            definition["id"] = str(exercise.id)
            data["exercise"] = definition
        elif not block.body.strip():
            raise ContentError("Текстовый блок не может быть пустым.")
        blocks.append(data)
    if not blocks or not any(block["kind"] == "exercise" for block in blocks):
        raise ContentError("Добавьте хотя бы одно задание перед публикацией.")
    last = lesson.releases.aggregate(value=Max("version"))["value"] or 0
    return LessonRelease.objects.create(lesson=lesson, version=last + 1, snapshot={
        "schema_version": 1, "title": lesson.title, "summary": lesson.summary, "blocks": blocks,
    })
