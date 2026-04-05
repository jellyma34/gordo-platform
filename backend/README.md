# GORDO backend (FastAPI)

## Railway (Docker, API)

Отдельный сервис **backend** на Railway:

- **Root Directory**: `backend`
- **Builder**: **Dockerfile** (`backend/Dockerfile`)
- Запуск: **`uvicorn main:app --host 0.0.0.0 --port $PORT`**

Фронтенд (Next.js) в **корне** репозитория: **Nixpacks** (`railway.json` + `nixpacks.toml` в корне) — другой сервис Railway.

## Локальный запуск

Из каталога `backend` в корне репозитория:

```bash
PORT=8080 uvicorn main:app --reload --host 0.0.0.0 --port $PORT
```

API: `http://127.0.0.1:${PORT}`  
Документация: `http://127.0.0.1:${PORT}/docs`  
Логин: `POST http://127.0.0.1:${PORT}/auth/login`

Фронтенд в `.env.local` должен указывать **HTTP**, не HTTPS:

`NEXT_PUBLIC_API_URL=http://127.0.0.1:${PORT}`

## CORS

В `app/main.py` — **`CORSMiddleware`**: явный список origin (прод-фронтенд Railway + localhost для `next dev`), без `["*"]` при `allow_credentials=True`. Проверка: **`GET /test`**.
