"""
Сервисы оркестрации ingestion.

Внутри лежит вся бизнес-логика: принять файл → сохранить → распарсить →
залить в staging → нормализовать → собрать fact. Логирование ошибок —
тоже отсюда.

Парсеры/нормализаторы/storage остаются "чистыми" и не зависят от БД.
"""
from .ingestion import IngestionService, IngestionOutcome
from .errors import ErrorLogger

__all__ = ["IngestionService", "IngestionOutcome", "ErrorLogger"]
