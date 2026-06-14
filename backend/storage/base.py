"""
Абстракция хранилища сырых файлов.

Контракт намеренно простой: save / open / delete / path-resolving.
Никакой бизнес-логики ingestion не должно зависеть от деталей backend (диск/S3).
"""
from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import BinaryIO


@dataclass(slots=True)
class StoredBlob:
    """Результат сохранения файла."""

    storage_path: str   # путь относительно корня хранилища (то, что пишем в БД)
    size: int           # размер в байтах
    sha256: str         # SHA-256 контрольная сумма (hex)


class RawStorage(abc.ABC):
    """Интерфейс хранилища raw-файлов."""

    @abc.abstractmethod
    def save(self, *, filename: str, data: BinaryIO) -> StoredBlob:
        """
        Сохранить поток data под именем filename.
        Реализация САМА выбирает финальное имя/путь, чтобы избежать коллизий.
        """

    @abc.abstractmethod
    def open(self, storage_path: str) -> BinaryIO:
        """Открыть бинарный поток для чтения."""

    @abc.abstractmethod
    def delete(self, storage_path: str) -> None:
        """Удалить файл. Не ошибка, если его уже нет."""

    @abc.abstractmethod
    def absolute_path(self, storage_path: str) -> str:
        """
        Абсолютный путь / URI. Для локального бэкенда — путь на диске,
        для S3 — s3://bucket/key. Используется парсерами через open().
        """
