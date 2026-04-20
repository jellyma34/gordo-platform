# Admin API (контракт для фронта)

Стек: **FastAPI** (`app/main.py` — `app.include_router`, не Express `app.use`).

Базовый путь: **`/api/admin`** = `API_PREFIX="/api"` + роутер `APIRouter(prefix="/admin")`.

## Пользователи и логи

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/api/admin/logs` | История действий (пагинация) |
| GET | `/api/admin/users` | Список пользователей |
| POST | `/api/admin/users` | Создание пользователя |
| PUT | `/api/admin/users/{user_id}` | Обновление |
| PUT | `/api/admin/users/{user_id}/block` | Блокировка |
| PUT | `/api/admin/users/{user_id}/unblock` | Разблокировка |
| GET | `/api/admin/users/{user_id}/analytics` | Аналитика |
| PUT | `/api/admin/users/{user_id}/password` | Смена пароля |
| DELETE | `/api/admin/users/{user_id}` | Удаление |

Проверка после деплоя: открыть **`/docs`** на бэкенде — в OpenAPI должны быть **`GET /api/admin/users`** и **`POST /api/admin/users`**.

Если в production был **404**, чаще всего задеплоена **старая версия** без `API_PREFIX` в `main.py` — нужен redeploy актуального коммита.
