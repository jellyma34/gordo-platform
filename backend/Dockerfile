# Локально из каталога backend: docker build -t gordo-api .
# На Railway используйте корневой Dockerfile (репозиторий = контекст, см. backend/railway.json).
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "run.py"]
