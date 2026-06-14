"""
Aiogram handlers: /start, /help, document upload.

Авторизация:
    Если settings.allowed_user_ids непустое — пускаем только из этого списка.
    Пустое — режим dev (любой пользователь).

После загрузки бот отвечает кратким отчётом по результату ingestion.
"""
from __future__ import annotations

import io
import logging
from typing import Final

from aiogram import F, Router
from aiogram.filters import CommandStart, Command
from aiogram.types import Document, Message

from db import SessionLocal
from db.config import settings
from db.models import UploadSource
from services_ingestion import IngestionService


logger = logging.getLogger("ingestion.bot")
router = Router(name="ingestion")


SUPPORTED_HINT: Final = (
    "Поддерживаются файлы:\n"
    "• CSV (.csv)\n"
    "• Excel в будущем (.xlsx) — добавление парсера тривиально."
)


def _is_authorized(message: Message) -> bool:
    allowed = settings.allowed_user_ids
    if not allowed:
        return True  # dev-режим
    user = message.from_user
    return bool(user and user.id in allowed)


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    await message.answer(
        "Привет! Я принимаю маркетинговые файлы и складываю их в GORDO.\n\n"
        f"{SUPPORTED_HINT}\n\n"
        "Просто отправь файл документом."
    )


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(
        "Отправьте файл *документом* (не фото и не сжатый).\n"
        f"{SUPPORTED_HINT}",
        parse_mode="Markdown",
    )


@router.message(F.document)
async def on_document(message: Message) -> None:
    if not _is_authorized(message):
        logger.warning("Reject upload from unauthorized user_id=%s", message.from_user.id if message.from_user else None)
        await message.answer("Нет прав на загрузку. Свяжитесь с администратором.")
        return

    doc: Document = message.document  # type: ignore[assignment]
    if doc is None:
        return

    if doc.file_size and doc.file_size > settings.max_upload_bytes:
        await message.answer(
            f"Файл больше лимита {settings.max_upload_bytes // (1024 * 1024)} МБ. Отклонено."
        )
        return

    await message.answer(f"Принял файл «{doc.file_name}». Парсю…")

    # Скачиваем содержимое в память. Для больших файлов — заменить на
    # стриминг в tempfile; сейчас лимит держим через max_upload_bytes.
    buf = io.BytesIO()
    try:
        await message.bot.download(doc, destination=buf)
    except Exception as exc:  # noqa: BLE001
        logger.exception("download failed")
        await message.answer(f"Не удалось скачать файл: {exc}")
        return
    buf.seek(0)

    user = message.from_user
    uploader_ref = (
        f"tg:{user.id}" if user and user.id else "tg:unknown"
    )
    extra = {
        "telegram": {
            "user_id": user.id if user else None,
            "username": user.username if user else None,
            "full_name": user.full_name if user else None,
            "chat_id": message.chat.id,
            "message_id": message.message_id,
            "caption": message.caption,
        }
    }

    db = SessionLocal()
    try:
        service = IngestionService(db)
        outcome = service.ingest_blob_and_run(
            filename=doc.file_name or "telegram_upload",
            data=buf,
            content_type=doc.mime_type,
            source=UploadSource.telegram,
            uploader_ref=uploader_ref,
            extra=extra,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("ingestion failed")
        await message.answer(f"Ошибка при обработке: {exc}")
        return
    finally:
        db.close()

    await message.answer(
        "Готово.\n"
        f"• upload_id: `{outcome.upload_id}`\n"
        f"• статус: *{outcome.status.value}*\n"
        f"• строк: {outcome.rows_total} (успешно {outcome.rows_ok}, с ошибками {outcome.rows_failed})\n"
        f"• fact-записей: {outcome.facts_written}\n"
        f"• нераспознанных проектов: {outcome.unresolved_projects}",
        parse_mode="Markdown",
    )


@router.message()
async def on_other(message: Message) -> None:
    await message.answer(
        "Я ожидаю файл *документом*.\n" + SUPPORTED_HINT,
        parse_mode="Markdown",
    )
