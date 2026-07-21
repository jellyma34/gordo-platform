# GORDO backend (FastAPI)

## Railway (Docker, API)

Отдельный сервис **backend** на Railway:

- **Root Directory**: корень репозитория (пусто / `.`), не каталог `backend` — иначе `COPY backend /app` в **`Dockerfile`** на корне не сработает.
- **Dockerfile**: **`Dockerfile`** в корне репозитория (контекст сборки — весь репозиторий).
- Локальная сборка только из `backend/`: **`backend/Dockerfile`** (`docker build -t gordo-api .` из `backend/`).
- Запуск в контейнере: **`uvicorn app.main:app --host 0.0.0.0 --port 8080`** (см. корневой `Dockerfile`). Если в Railway задан другой **`PORT`**, выставьте в настройках сервиса **`PORT=8080`** или поменяйте `--port` в `CMD`.

Фронтенд (Next.js) в **корне** репозитория: **Nixpacks** (`railway.json` + `nixpacks.toml` в корне) — другой сервис Railway.

## Локальный запуск

Из каталога `backend` в корне репозитория:

```bash
cp .env.example .env   # Windows: copy .env.example .env
PORT=8000 python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Первый вход:** при старте создаётся администратор, если в БД ещё нет пользователя с email из `BOOTSTRAP_ADMIN_EMAIL`. Логин и пароль — `backend/.env` (`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`). Локальный этalon: `marislova34@gmail.com` / `1234` (см. `.env.example`). Устаревший placeholder `admin@example.com` при старте мигрируется или удаляется.

Смена пароля: через админ-панель или однократно `BOOTSTRAP_ADMIN_SYNC_ON_START=true` и перезапуск backend (только локально).

Фронтенд: `NEXT_PUBLIC_API_URL=http://localhost:8000`, реальный вход (`NEXT_PUBLIC_AUTH_MOCK=false` в `.env.development`).

API: `http://127.0.0.1:${PORT}`  
Документация: `http://127.0.0.1:${PORT}/docs`  
Логин: `POST http://127.0.0.1:${PORT}/auth/login`

Фронтенд в `.env.local` должен указывать **HTTP**, не HTTPS:

`NEXT_PUBLIC_API_URL=http://127.0.0.1:${PORT}`

## CORS

В `app/main.py` — **`CORSMiddleware`**. Проверка: **`GET /health`**, **`GET /test`**.

## Environments (dev / staging)

Рекомендуемые переменные окружения для backend:

- `APP_ENV=dev|staging|production`
- `DATABASE_URL=...` (отдельная БД для каждого окружения)
- `BOOTSTRAP_ADMIN_EMAIL=...`
- `BOOTSTRAP_ADMIN_PASSWORD=...`
- `BOOTSTRAP_ADMIN_SYNC_ON_START=false`

Важно:

- По умолчанию приложение **не ресетит** существующего админа на старте.
- Синхронизация пароля/роли админа на старте выполняется **только** при явном `BOOTSTRAP_ADMIN_SYNC_ON_START=true`.
- Для тестового окружения (`staging`) оставляйте `BOOTSTRAP_ADMIN_SYNC_ON_START=false`.
