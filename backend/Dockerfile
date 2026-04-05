FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway подставляет PORT; слушать нужно на всех интерфейсах (см. run.py).
CMD ["python", "run.py"]
