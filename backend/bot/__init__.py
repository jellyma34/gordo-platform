"""
Telegram-бот на aiogram v3.

- bot.py      — фабрика Bot/Dispatcher, точка входа run_polling()
- handlers.py — handler приёма документов (CSV/XLSX) и команды /start, /help

Запуск:
    cd backend
    python -m bot.bot

Бот сохраняет файл в storage/raw и сразу запускает IngestionService
(тот же пайплайн, что у POST /uploads). Это даёт нам один источник истины.
"""
from .bot import run_polling, build_bot, build_dispatcher

__all__ = ["run_polling", "build_bot", "build_dispatcher"]
