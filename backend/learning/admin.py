from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Attempt, Draft, Exercise, HintUsage, Lesson, LessonBlock, LessonRelease, User


@admin.register(User)
class PlatformUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Обучение", {"fields": ["role", "teacher"]}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Обучение", {"fields": ["role", "teacher"]}),)


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ["title", "kind", "owner", "updated_at"]
    list_filter = ["kind"]
    search_fields = ["title"]


class BlockInline(admin.TabularInline):
    model = LessonBlock
    extra = 0


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ["title", "section", "owner", "updated_at"]
    list_filter = ["section"]
    search_fields = ["title", "section"]
    inlines = [BlockInline]


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


for model in [LessonRelease, Attempt, HintUsage, Draft]:
    admin.site.register(model, ReadOnlyAdmin)
