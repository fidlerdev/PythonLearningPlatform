# Развёртывание на сервере

[← README](../README.md)

Серверный вариант использует [compose.server.yaml](../compose.server.yaml):
Nginx со статическим интерфейсом, Gunicorn и отдельную PostgreSQL.

## Настройки

Создайте серверный `.env` на основе [.env.server.example](../.env.server.example).
Задайте собственные пароли БД и преподавателя, случайный `DJANGO_SECRET_KEY`,
адрес сервера и доверенный origin. Секреты не включаются в Git.

| Переменная | Назначение |
| --- | --- |
| `APP_PORT` | Внешний порт, по умолчанию `5180` |
| `APP_BIND` | Адрес привязки; `127.0.0.1` для внешнего reverse proxy |
| `DJANGO_ALLOWED_HOSTS` | Разрешённые имена или IP без схемы и порта |
| `CSRF_TRUSTED_ORIGINS` | Полные адреса интерфейса со схемой и портом |
| `DJANGO_COOKIE_SECURE` | `1` для HTTPS; `0` для демонстрационного HTTP по IP |
| `POSTGRES_PASSWORD` | Пароль отдельной базы платформы |
| `DJANGO_SECRET_KEY` | Секрет Django |

Проверьте выбранный порт перед запуском:

```bash
ss -ltn 'sport = :5180'
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Наружу публикуется только порт фронтенда. Порты PostgreSQL и Django остаются
внутри отдельной сети Compose. Данные БД и статика хранятся в volumes с
префиксом `training-platform-server`.

## Запуск

```bash
docker compose -f compose.server.yaml up -d --build
docker compose -f compose.server.yaml ps
docker compose -f compose.server.yaml exec backend uv run --no-sync manage.py create_teacher teacher --name "Учитель"
docker compose -f compose.server.yaml exec backend uv run --no-sync manage.py import_lessons content/robot-introduction.json --owner teacher --publish
docker compose -f compose.server.yaml exec backend uv run --no-sync manage.py import_lessons content/robot-challenges.json --owner teacher --publish
```

Команда создания преподавателя запросит пароль. Не запускайте импорт повторно
для уже заполненной базы: он добавляет новые объекты. Настройте HTTPS через
reverse proxy, затем обновите origin, host и `DJANGO_COOKIE_SECURE=1`.
Резервное копирование PostgreSQL настраивается отдельно.

## Если сервер не может получить образ uv из GHCR

Соберите образы локально:

```bash
docker build -t training-platform-server-backend backend
docker build -f frontend/Dockerfile.server -t training-platform-server-frontend frontend
```

Перенесите код, конфигурацию и образы на сервер. `.env` создаётся отдельно:

```bash
docker image save training-platform-server-backend training-platform-server-frontend | gzip | ssh user@server 'gzip -d | docker image load'
```

После загрузки образов:

```bash
docker compose -f compose.server.yaml up -d --no-build
```

Если на сервере уже есть рабочий образ backend, а Python-зависимости не менялись,
можно не переносить заново весь образ. Сначала сохраните прежний образ отдельным
тегом, затем соберите обновление на его основе:

```bash
docker tag training-platform-server-backend:latest training-platform-server-backend:before-update
docker build --pull=false -f backend/Dockerfile.update \
  --build-arg BASE_IMAGE=training-platform-server-backend:before-update \
  -t training-platform-server-backend:latest backend
```

`Dockerfile.update` сравнивает `pyproject.toml` и `uv.lock` с базовым образом:
при изменении зависимостей сборка остановится, потребуется обычная полная сборка.
Перед применением миграций сделайте резервную копию PostgreSQL. Для существующей
базы не повторяйте импорт уроков: классификацию комплектных уроков добавит миграция.

## Обновление интерфейса

После загрузки нового кода можно обновить только фронтенд:

```bash
docker compose -f compose.server.yaml build frontend
docker compose -f compose.server.yaml up -d --no-deps --no-build frontend
```

Контейнеры сервера и базы данных при этом не пересоздаются.
