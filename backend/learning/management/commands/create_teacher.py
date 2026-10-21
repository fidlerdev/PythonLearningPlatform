import getpass
import os

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from learning.models import User


class Command(BaseCommand):
    help = "Создать преподавателя. Пароль вводится скрыто или через TEACHER_PASSWORD."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--name", default="Преподаватель")

    def handle(self, *args, **options):
        if User.objects.filter(username=options["username"]).exists():
            raise CommandError("Этот логин уже занят. Существующий пользователь не изменён.")
        password = os.environ.get("TEACHER_PASSWORD")
        if not password:
            password = getpass.getpass("Пароль преподавателя: ")
            if password != getpass.getpass("Повторите пароль: "):
                raise CommandError("Пароли не совпадают.")
        user = User(username=options["username"], first_name=options["name"], role=User.Role.TEACHER)
        try:
            user.full_clean(exclude=["password"])
            validate_password(password, user)
        except ValidationError as exc:
            raise CommandError("; ".join(exc.messages)) from exc
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Преподаватель {user.username} создан."))
