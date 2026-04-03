# Контекст сборки — корень репозитория (Railway: COPY только каталог backend).
FROM python:3.12-slim

WORKDIR /app

COPY backend/ .

RUN pip install --no-cache-dir -r requirements.txt

ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
