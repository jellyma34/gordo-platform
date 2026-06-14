"""
Общий контракт для всех парсеров.

Парсер должен быть ЧИСТЫМ: он не пишет в БД, не открывает hardcoded пути.
На вход — путь к файлу (или открытый поток), на выходе — ParseResult.
Запись в staging / error log делает services_ingestion.
"""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any, Iterable


@dataclass(slots=True)
class RowError:
    row_index: int
    code: str
    message: str
    column_name: str | None = None
    context: dict[str, Any] | None = None


@dataclass(slots=True)
class ParsedRow:
    """
    Одна строка распарсенного файла.

    payload — все колонки строки как есть (для аудита и пересборки).
    raw_project_name / period_label / metric_name / metric_value —
    "горячие" поля, если parser смог их распознать. Это значительно
    ускоряет последующую нормализацию.
    """

    row_index: int
    payload: dict[str, Any]
    raw_project_name: str | None = None
    period_label: str | None = None
    metric_name: str | None = None
    metric_value: float | None = None


@dataclass(slots=True)
class ParseResult:
    parser_name: str
    detected_format: str
    rows: list[ParsedRow] = field(default_factory=list)
    errors: list[RowError] = field(default_factory=list)
    # warnings отдельно — не блокируют ingestion (например, неизвестный alias)
    warnings: list[RowError] = field(default_factory=list)

    @property
    def rows_total(self) -> int:
        return len(self.rows) + len(self.errors)

    @property
    def rows_ok(self) -> int:
        return len(self.rows)

    @property
    def rows_failed(self) -> int:
        return len(self.errors)


class ParserError(Exception):
    """Фатальная ошибка парсинга — файл целиком не удалось обработать."""

    def __init__(self, code: str, message: str, *, context: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.context = context or {}


class BaseParser(abc.ABC):
    """Базовый класс парсера."""

    #: Уникальное имя парсера для логов и БД (`RawUpload.parser_name`).
    name: str = "base"
    #: Формат, который парсер заявляет (`RawUpload.detected_format`).
    fmt: str = "unknown"
    #: Расширения, по которым registry будет его выбирать.
    extensions: tuple[str, ...] = ()
    #: MIME-типы (опционально, как дополнительный сигнал).
    content_types: tuple[str, ...] = ()

    def matches(self, filename: str, content_type: str | None) -> bool:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext and ext in self.extensions:
            return True
        if content_type and content_type.lower() in self.content_types:
            return True
        return False

    @abc.abstractmethod
    def parse(self, *, file_path: str) -> ParseResult:
        """
        Прочитать файл с диска и вернуть ParseResult.

        Может бросить ParserError для фатальных проблем (поврежденный файл,
        кодировка не распознана и т.п.).
        """

    # Хелпер для подклассов: безопасный yield → list.
    @staticmethod
    def _collect(rows: Iterable[ParsedRow]) -> list[ParsedRow]:
        return list(rows)
