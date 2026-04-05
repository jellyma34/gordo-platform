# GORDO backend (FastAPI)

## Railway (Docker, API)

Отдельный сервис **backend** на Railway:

- **Root Directory**: корень репозитория (пусто / `.`), не каталог `backend` — иначе `COPY backend /app` в **`Dockerfile`** на корне не сработает.
- **Dockerfile**: **`Dockerfile`** в корне репозитория (контекст сборки — весь репозиторий).
- Локальная сборка только из `backend/`: **`backend/Dockerfile`** (`docker build -t gordo-api .` из `backend/`).
- Запуск в контейнере: **`python run.py`**

Фронтенд (Next.js) в **корне** репозитория: **Nixpacks** (`railway.json` + `nixpacks.toml` в корне) — другой сервис Railway.

## Локальный запуск

Из каталога `backend` в корне репозитория:

```bash
PORT=8080 python run.py
# или: PORT=8080 uvicorn app.main:app --reload --host 0.0.0.0 --port $PORT
```

API: `http://127.0.0.1:${PORT}`  
Документация: `http://127.0.0.1:${PORT}/docs`  
Логин: `POST http://127.0.0.1:${PORT}/auth/login`

Фронтенд в `.env.local` должен указывать **HTTP**, не HTTPS:

`NEXT_PUBLIC_API_URL=http://127.0.0.1:${PORT}`

## CORS

В `app/main.py` — **`CORSMiddleware`**. Проверка: **`GET /health`**, **`GET /test`**.
