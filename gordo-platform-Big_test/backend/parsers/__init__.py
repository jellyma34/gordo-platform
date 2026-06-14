"""
Парсеры файлов маркетинга.

- base.py     — BaseParser, ParsedRow, ParseResult, ParserError
- registry.py — реестр парсеров (resolve по filename / content_type)
- csv_parser.py — первая реализация: CSV → ParsedRow

Добавление XLSX/JSON/etc.:
    1. написать класс на BaseParser
    2. зарегистрировать его в registry.register_default()
"""
from .base import BaseParser, ParsedRow, ParseResult, ParserError, RowError
from .csv_parser import CsvMarketingParser
from .registry import ParserRegistry, get_registry

__all__ = [
    "BaseParser",
    "ParsedRow",
    "ParseResult",
    "ParserError",
    "RowError",
    "CsvMarketingParser",
    "ParserRegistry",
    "get_registry",
]
