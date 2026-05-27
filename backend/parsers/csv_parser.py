"""
CSV-парсер маркетинговых файлов.

Стратегия (намеренно толерантная):

1. Авто-определение разделителя через csv.Sniffer (`,`, `;`, `\\t`).
2. Авто-определение кодировки: пробуем utf-8-sig → cp1251 → latin-1.
3. Шапка нормализуется: lower-case, trim, замена кириллических синонимов.
4. Для каждой строки:
   - всю строку кладём в payload (для аудита);
   - пытаемся распознать project / period / metric / value (опционально).
5. Ошибки уровня строки — в ParseResult.errors, файл при этом не падает.
   Фатальные проблемы (нечитаемый файл / нет шапки) — ParserError.

Что считать "горячими" колонками — настраивается через COLUMN_ALIASES.
Эти эвристики легко расширяются: если в будущем файлы стандартизуют,
просто допишите в COLUMN_ALIASES.
"""
from __future__ import annotations

import csv
import re
from typing import Any

import pandas as pd

from .base import BaseParser, ParsedRow, ParseResult, ParserError, RowError


# Канонические колонки → варианты заголовков в файлах.
COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "project": (
        "project", "projectname", "project_name", "проект", "проекта",
        "объект", "жк", "название_проекта",
    ),
    "period": (
        "period", "month", "date", "период", "месяц", "дата",
    ),
    "metric": (
        "metric", "metric_name", "indicator", "показатель", "метрика",
    ),
    "value": (
        "value", "amount", "metric_value", "значение", "сумма", "кол-во", "количество",
    ),
}


_NORM_HEADER_RE = re.compile(r"[\s\-_]+")


def _norm_header(s: str) -> str:
    return _NORM_HEADER_RE.sub("_", s.strip().lower())


def _build_header_map(headers: list[str]) -> dict[str, str | None]:
    """Возвращает {canonical_field: original_header_or_None}."""
    norm = {_norm_header(h): h for h in headers}
    out: dict[str, str | None] = {k: None for k in COLUMN_ALIASES}
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in norm:
                out[canonical] = norm[alias]
                break
    return out


def _read_text(file_path: str) -> tuple[str, str]:
    """Возвращает (text, encoding)."""
    for enc in ("utf-8-sig", "utf-8", "cp1251", "latin-1"):
        try:
            with open(file_path, "r", encoding=enc, newline="") as fh:
                return fh.read(), enc
        except UnicodeDecodeError:
            continue
    raise ParserError(
        code="encoding_unknown",
        message="Не удалось определить кодировку CSV-файла (utf-8/cp1251/latin-1).",
    )


def _sniff_dialect(sample: str) -> csv.Dialect:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;|\t")
    except csv.Error:
        class _Default(csv.Dialect):
            delimiter = ","
            quotechar = '"'
            doublequote = True
            skipinitialspace = True
            lineterminator = "\n"
            quoting = csv.QUOTE_MINIMAL

        return _Default()


def _to_float(raw: Any) -> float | None:
    """Толерантный парсинг чисел: '1 234,56' → 1234.56."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s = s.replace("\u00a0", "").replace(" ", "")
    # запятая как десятичный разделитель
    if s.count(",") == 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


class CsvMarketingParser(BaseParser):
    name = "csv_marketing_v1"
    fmt = "csv"
    extensions = ("csv",)
    content_types = ("text/csv", "application/csv", "application/vnd.ms-excel")

    def parse(self, *, file_path: str) -> ParseResult:
        text, encoding = _read_text(file_path)
        if not text.strip():
            raise ParserError(code="empty_file", message="CSV-файл пуст.")

        # Sniff dialect на первых ~4 KB.
        dialect = _sniff_dialect(text[:4096])

        reader = csv.reader(text.splitlines(), dialect=dialect)
        try:
            headers = next(reader)
        except StopIteration:
            raise ParserError(code="no_header", message="В CSV отсутствует строка заголовков.")

        if not headers or all(not (h or "").strip() for h in headers):
            raise ParserError(code="empty_header", message="Пустая строка заголовков.")

        header_map = _build_header_map(headers)
        result = ParseResult(parser_name=self.name, detected_format=self.fmt)

        # row_index считаем от 1 (= номер строки данных без шапки), это удобно для логов.
        for i, raw_row in enumerate(reader, start=1):
            if not raw_row or all((c or "").strip() == "" for c in raw_row):
                # Пропускаем пустые строки молча.
                continue

            try:
                # Выровнять длину строки под шапку.
                row = list(raw_row) + [None] * max(0, len(headers) - len(raw_row))
                row = row[: len(headers)]
                payload: dict[str, Any] = {h: row[idx] for idx, h in enumerate(headers)}

                raw_project = _pick(payload, header_map["project"])
                period = _pick(payload, header_map["period"])
                metric = _pick(payload, header_map["metric"])
                value = _to_float(_pick(payload, header_map["value"]))

                result.rows.append(
                    ParsedRow(
                        row_index=i,
                        payload=payload,
                        raw_project_name=_clean_str(raw_project),
                        period_label=_clean_str(period),
                        metric_name=_clean_str(metric),
                        metric_value=value,
                    )
                )
            except Exception as exc:  # noqa: BLE001
                result.errors.append(
                    RowError(
                        row_index=i,
                        code="row_parse_failed",
                        message=str(exc),
                        context={"raw_row": list(raw_row)[:50], "encoding": encoding},
                    )
                )

        # Если ни одной успешной строки и ни одной "горячей" колонки —
        # вероятно, формат не подходит: оставляем staging пустым.
        if not result.rows and not result.errors:
            raise ParserError(
                code="no_data",
                message="CSV-файл не содержит строк данных.",
            )

        return result


def _pick(payload: dict[str, Any], header: str | None) -> Any:
    if header is None:
        return None
    return payload.get(header)


def _clean_str(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


# `pandas` импортируется для будущего XLSX-парсера и для совместимости
# (и потому что юзер указал его в стеке). Здесь используется в helper-ах
# при отладке и для будущих агрегатов.
_ = pd  # noqa: F401
