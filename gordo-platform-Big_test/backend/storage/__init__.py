"""
Storage layer для сырых файлов ingestion.

Сейчас одна реализация — LocalRawStorage (диск).
Интерфейс RawStorage спроектирован под будущую замену на S3 / Azure Blob
без правок parsers / services_ingestion.
"""
from .base import RawStorage, StoredBlob
from .local import LocalRawStorage, get_default_storage

__all__ = ["RawStorage", "StoredBlob", "LocalRawStorage", "get_default_storage"]
