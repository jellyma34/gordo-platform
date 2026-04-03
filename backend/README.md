# GORDO backend (FastAPI)

## Railway (Docker)

В корне репозитория лежит `railway.json`: сборка через `backend/Dockerfile`, контекст — **корень репозитория**, в образ копируется только `backend/` (`COPY backend/ .`). Точка входа: `uvicorn app.main:app` (модуль `app/main.py`).

В панели Railway у сервиса **Root Directory** оставьте пустым (корень репозитория), если репозиторий совпадает с этим проектом.

## Локальный запуск

Из каталога `backend` в корне репозитория (где лежит папка `app`):

```bash
uvicorn app.main:app --reload --port 8000
```

API: `http://127.0.0.1:8000`  
Документация: `http://127.0.0.1:8000/docs`  
Логин: `POST http://127.0.0.1:8000/auth/login`

Фронтенд в `.env.local` должен указывать **HTTP**, не HTTPS:

`NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`

## CORS (продакшен)

Список разрешённых origin для браузера задаётся переменной **`CORS_ORIGINS`** (через запятую, без пробелов вокруг URL или с пробелами — обрежутся). В `app/config.py` по умолчанию уже есть `localhost` / `127.0.0.1` на портах 3000 и 3001.

Добавьте URL фронтенда (например Vercel), иначе запросы с прод-страницы к API на Railway будут блокироваться браузером:

`CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://your-app.vercel.app`
