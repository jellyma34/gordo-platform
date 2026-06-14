"""
Структурированное логирование ошибок парсинга / нормализации в БД.

Использует стандартный logging для stdout (Railway собирает по умолчанию)
и пишет дубликат в `ingest_parse_error_log` для UI/диагностики.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from db.models import ParseErrorLog, ParseErrorSeverity


_LOGGER = logging.getLogger("ingestion")


class ErrorLogger:
    def __init__(self, db: Session, *, upload_id: int):
        self.db = db
        self.upload_id = upload_id

    def log(
        self,
        *,
        code: str,
        message: str,
        severity: ParseErrorSeverity = ParseErrorSeverity.error,
        row_index: int | None = None,
        column_name: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        row = ParseErrorLog(
            upload_id=self.upload_id,
            row_index=row_index,
            column_name=column_name,
            severity=severity,
            code=code,
            message=message[:8000],  # защита от очень длинных traceback
            context=context,
        )
        self.db.add(row)

        log_fn = {
            ParseErrorSeverity.warning: _LOGGER.warning,
            ParseErrorSeverity.error: _LOGGER.error,
            ParseErrorSeverity.fatal: _LOGGER.critical,
        }[severity]
        log_fn(
            "ingestion upload_id=%s row=%s col=%s code=%s msg=%s",
            self.upload_id, row_index, column_name, code, message,
        )

    def warning(self, **kwargs: Any) -> None:
        self.log(severity=ParseErrorSeverity.warning, **kwargs)

    def error(self, **kwargs: Any) -> None:
        self.log(severity=ParseErrorSeverity.error, **kwargs)

    def fatal(self, **kwargs: Any) -> None:
        self.log(severity=ParseErrorSeverity.fatal, **kwargs)
