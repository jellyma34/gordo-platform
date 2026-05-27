# GORDO Ingestion

Подсистема загрузки и нормализации маркетинговых Excel/CSV файлов.
Запускается отдельно от основного GORDO API (`backend/app/`) — у них общая
PostgreSQL база, но независимые жизненные циклы и таблицы.

## Структура

```
backend/
  bot/                  # Telegram-бот (aiogram v3) для загрузки файлов
    bot.py              # entrypoint: python -m bot.bot
    handlers.py         # /start, /help, document upload

  api/                  # FastAPI ingestion-сервис
    main.py             # entrypoint: uvicorn api.main:app
    uploads.py          # POST /uploads, GET /uploads/{id}, /errors
    metrics.py          # GET /metrics — обработанные данные
    projects.py         # CRUD dim_projects + aliases
    schemas.py

  parsers/              # Парсеры файлов
    base.py             # BaseParser, ParseResult, ParserError
    registry.py         # реестр парсеров
    csv_parser.py       # первая реализация (CSV)

  normalizers/          # Нормализаторы значений
    projects.py         # имя проекта → dim_projects.id

  db/                   # SQLAlchemy
    config.py           # IngestionSettings (env)
    session.py          # engine, SessionLocal, get_db
    models.py           # все 6 таблиц ingest_*

  storage/              # Хранилище сырых файлов
    base.py             # RawStorage (абстракция)
    local.py            # LocalRawStorage
    raw/                # default storage_raw_dir

  services_ingestion/   # Оркестрация
    ingestion.py        # IngestionService — общий pipeline
    errors.py           # ErrorLogger → ingest_parse_error_log

  alembic/              # Миграции (изолированы от backend/app)
    versions/
      20260527_0001_ingestion_initial.py
  alembic.ini
  requirements-ingestion.txt
```

## Таблицы в БД

Все с префиксом `ingest_`:

| Таблица                          | Назначение                                   |
| -------------------------------- | -------------------------------------------- |
| `ingest_raw_uploads`             | метаданные загруженного файла                |
| `ingest_staging_marketing_data`  | сырые строки из распарсенного файла (JSON)  |
| `ingest_dim_projects`            | канонический справочник проектов             |
| `ingest_project_aliases`         | маппинг "грязного" имени проекта → проект    |
| `ingest_fact_marketing_metrics`  | нормализованные факты — то, что отдаёт API   |
| `ingest_parse_error_log`         | журнал ошибок парсинга и нормализации        |

## Pipeline

```
file → storage.save() → ingest_raw_uploads
  → parsers.resolve() → parser.parse() → ingest_staging_marketing_data
  → normalizers.ProjectNormalizer → ingest_fact_marketing_metrics
  ↘ errors → ingest_parse_error_log
```

Точка входа для обоих путей загрузки (REST и Telegram) —
`services_ingestion.IngestionService.ingest_blob_and_run(...)`.

## Установка

```bash
cd backend
pip install -r requirements.txt -r requirements-ingestion.txt
```

## Конфигурация (backend/.env)

```ini
DATABASE_URL=postgresql://user:pass@host:5432/gordo
STORAGE_RAW_DIR=./storage/raw                 # необязательно
CORS_ORIGINS=*                                # для ingestion API

# Telegram bot
TELEGRAM_BOT_TOKEN=123:ABC...
TELEGRAM_ALLOWED_USER_IDS=12345,67890         # пусто = разрешено всем (dev)

# Limits
MAX_UPLOAD_BYTES=52428800                     # 50 MiB
```

## Запуск

### 1. Применить миграции
```bash
cd backend
alembic upgrade head
```

### 2. FastAPI ingestion-сервис (порт 8001)
```bash
cd backend
uvicorn api.main:app --host 0.0.0.0 --port 8001
```
Swagger: <http://localhost:8001/docs>

### 3. Telegram bot
```bash
cd backend
python -m bot.bot
```

## API (кратко)

| Метод/путь                              | Описание                          |
| --------------------------------------- | --------------------------------- |
| `POST /uploads`                         | загрузить файл, запустить pipeline|
| `GET /uploads`                          | список загрузок                   |
| `GET /uploads/{id}`                     | детали загрузки                   |
| `GET /uploads/{id}/errors`              | ошибки парсинга по загрузке       |
| `GET /metrics`                          | обработанные fact-данные          |
| `GET /projects` / `POST /projects`      | справочник проектов               |
| `POST /projects/{id}/aliases`           | ручное добавление alias           |
| `GET /projects/{id}/aliases`            | список алиасов проекта            |

## Добавление нового парсера (XLSX и т.п.)

1. Создать `parsers/xlsx_parser.py` с классом, унаследованным от `BaseParser`:
   - указать `extensions = ("xlsx",)`, `content_types = (...)`
   - реализовать `parse(file_path: str) -> ParseResult`
2. Зарегистрировать в `parsers/registry.py::_register_defaults`:
   ```python
   registry.register(XlsxMarketingParser())
   ```
3. Никакие другие модули править не нужно — `IngestionService` сам выберет
   парсер по filename / content-type.

## Масштабирование

- **Очередь**: сейчас `run_pipeline` синхронный. Когда понадобится — заменить
  его вызов в `ingest_blob_and_run` на `enqueue(...)` (Celery / Arq / RQ) без
  изменения интерфейса.
- **S3 / Azure Blob**: реализовать `storage/s3.py: S3RawStorage(RawStorage)`,
  переключить `get_default_storage()` через env.
- **Идемпотентность**: уникальный индекс по `(project_id, period_month,
  metric_name, source_upload_id)` в `ingest_fact_marketing_metrics` позволяет
  повторно обрабатывать загрузки без дублей.
- **Изоляция Alembic**: используется `version_table="alembic_version_ingestion"`,
  поэтому миграции основного backend/app не конфликтуют.
