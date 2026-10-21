import uuid

from django.db import transaction
from rest_framework import serializers

from .domain import ContentError, validate_exercise
from .classification import normalize_classification
from .models import Exercise, Lesson, LessonBlock


class ExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exercise
        fields = ["id", "title", "kind", "prompt", "starter_code", "config", "rules", "hints", "updated_at"]
        read_only_fields = ["id", "updated_at"]

    def validate(self, attrs):
        data = {field: getattr(self.instance, field) for field in
                ["title", "kind", "prompt", "starter_code", "config", "rules", "hints"]} if self.instance else {
                    "starter_code": "", "config": {}, "rules": {}, "hints": []}
        data.update(attrs)
        try:
            validate_exercise(data)
        except ContentError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return attrs


class BlockSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(default=uuid.uuid4)

    class Meta:
        model = LessonBlock
        fields = ["id", "kind", "title", "body", "exercise"]
        extra_kwargs = {"body": {"max_length": 30000}}

    def validate(self, attrs):
        if "kind" not in attrs:
            raise serializers.ValidationError("Укажите тип блока.")
        attrs.setdefault("id", uuid.uuid4())
        exercise = attrs.get("exercise")
        if attrs["kind"] == "exercise" and not exercise:
            raise serializers.ValidationError("Выберите задание.")
        if attrs["kind"] == "text" and exercise:
            raise serializers.ValidationError("У текстового блока не должно быть задания.")
        if attrs["kind"] == "text" and not attrs.get("body", "").strip():
            raise serializers.ValidationError("Добавьте объяснение.")
        if exercise and exercise.owner_id != self.context["request"].user.id and not self.context["request"].user.is_superuser:
            raise serializers.ValidationError("Можно использовать только свои задания.")
        return attrs


class LessonSerializer(serializers.ModelSerializer):
    blocks = BlockSerializer(many=True)
    release_count = serializers.IntegerField(source="releases.count", read_only=True)

    class Meta:
        model = Lesson
        fields = ["id", "title", "summary", "section", "tags", "blocks", "release_count", "updated_at"]
        read_only_fields = ["id", "updated_at"]
        extra_kwargs = {"summary": {"max_length": 4000}}

    def validate(self, attrs):
        try:
            section, tags = normalize_classification(
                attrs.get("section", self.instance.section if self.instance else ""),
                attrs.get("tags", self.instance.tags if self.instance else []),
            )
        except ContentError as exc:
            raise serializers.ValidationError({"classification": str(exc)}) from exc
        attrs.update(section=section, tags=tags)
        return attrs

    def validate_blocks(self, value):
        if len(value) > 100:
            raise serializers.ValidationError("Не больше 100 блоков в уроке.")
        ids = [block["id"] for block in value]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError("Блоки должны иметь разные идентификаторы.")
        conflicts = LessonBlock.objects.filter(id__in=ids)
        if self.instance:
            conflicts = conflicts.exclude(lesson=self.instance)
        if conflicts.exists():
            raise serializers.ValidationError("Блок принадлежит другому уроку.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        blocks = validated_data.pop("blocks")
        lesson = Lesson.objects.create(**validated_data)
        self._write_blocks(lesson, blocks)
        return lesson

    @transaction.atomic
    def update(self, instance, validated_data):
        # Serialize edits and publication for this lesson.
        instance = Lesson.objects.select_for_update().get(pk=instance.pk)
        blocks = validated_data.pop("blocks", None)
        instance = super().update(instance, validated_data)
        if blocks is not None:
            instance.blocks.all().delete()
            self._write_blocks(instance, blocks)
        return instance

    @staticmethod
    def _write_blocks(lesson, blocks):
        LessonBlock.objects.bulk_create([LessonBlock(lesson=lesson, position=index, **block)
                                         for index, block in enumerate(blocks)])
