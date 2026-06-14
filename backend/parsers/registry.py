"""
Реестр парсеров. Singleton с register() / resolve().

Регистрация по умолчанию (csv) — в register_default().
Добавление XLSX/JSON/... — отдельный register() вызов на старте приложения.
"""
from __future__ import annotations

from .base import BaseParser, ParserError


class ParserRegistry:
    def __init__(self) -> None:
        self._parsers: list[BaseParser] = []

    def register(self, parser: BaseParser) -> None:
        # Уникальность по имени — чтобы не дублировать.
        for existing in self._parsers:
            if existing.name == parser.name:
                return
        self._parsers.append(parser)

    def all(self) -> list[BaseParser]:
        return list(self._parsers)

    def resolve(self, *, filename: str, content_type: str | None) -> BaseParser:
        for p in self._parsers:
            if p.matches(filename, content_type):
                return p
        raise ParserError(
            code="parser_not_found",
            message=(
                f"Не найден парсер для файла {filename!r} "
                f"(content_type={content_type!r})"
            ),
            context={"filename": filename, "content_type": content_type},
        )


_registry: ParserRegistry | None = None


def get_registry() -> ParserRegistry:
    global _registry
    if _registry is None:
        _registry = ParserRegistry()
        _register_defaults(_registry)
    return _registry


def _register_defaults(registry: ParserRegistry) -> None:
    # Импорт здесь — чтобы не было циклов при инициализации модуля.
    from .csv_parser import CsvMarketingParser

    registry.register(CsvMarketingParser())
