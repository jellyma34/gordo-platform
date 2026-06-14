"""
Точка входа aiogram-бота.

Запуск:
    cd backend
    python -m bot.bot

Переменные окружения (backend/.env):
    TELEGRAM_BOT_TOKEN=...
    TELEGRAM_ALLOWED_USER_IDS=12345,67890  # необязательно
    DATABASE_URL=postgresql://...
    STORAGE_RAW_DIR=...                    # необязательно
"""
from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher

from db.config import settings

from .handlers import router as ingestion_router


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ingestion.bot")


def build_bot() -> Bot:
    token = (settings.telegram_bot_token or "").strip()
    if not token:
        raise RuntimeError(
            "TELEGRAM_BOT_TOKEN не задан. Установите его в backend/.env "
            "или Railway Variables."
        )
    return Bot(token=token)


def build_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    dp.include_router(ingestion_router)
    return dp


async def _main() -> None:
    bot = build_bot()
    dp = build_dispatcher()
    logger.info("Ingestion bot starting…")
    # drop pending updates на старте, чтобы не разгребать очередь после простоя
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)


def run_polling() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    run_polling()
