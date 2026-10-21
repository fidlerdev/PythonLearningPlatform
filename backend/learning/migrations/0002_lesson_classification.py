from django.db import migrations, models


# Classify only the five shipped lessons; leave teachers' own content untouched.
LESSONS = {
    "Робот и сила повторений": ["for", "range", "Команды робота"],
    "Курьер: короткая программа": ["for", "range", "Лимит команд"],
    "Повороты, стены и запас батареи": ["for", "Планирование маршрута", "Лимит команд"],
    "Лестницы и вложенные циклы": ["Вложенные циклы", "range", "Лимит команд"],
    "Экспедиция: маршрут с бюджетом": ["Вложенные циклы", "Переменная цикла", "Планирование маршрута"],
}


def classify_seed_lessons(apps, schema_editor):
    Lesson = apps.get_model("learning", "Lesson")
    for title, tags in LESSONS.items():
        Lesson.objects.using(schema_editor.connection.alias).filter(title=title, section="", tags=[]).update(section="Циклы", tags=tags)


class Migration(migrations.Migration):
    dependencies = [("learning", "0001_initial")]
    operations = [
        migrations.AddField(model_name="lesson", name="section", field=models.CharField(blank=True, max_length=80)),
        migrations.AddField(model_name="lesson", name="tags", field=models.JSONField(blank=True, default=list)),
        migrations.RunPython(classify_seed_lessons, migrations.RunPython.noop),
    ]
