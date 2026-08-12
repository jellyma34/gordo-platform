"""Канонические идентификаторы проектов (строка, не user_id)."""

from __future__ import annotations

# ЖК Верба · 1 очередь строительства — основной объект платформы.
CANONICAL_DEFAULT_PROJECT_ID = "verba-phase-1"

# Исторический ключ файлового/dev-режима — мигрируем в канонический.
LEGACY_DEFAULT_PROJECT_IDS = frozenset({"default", "DEFAULT", ""})


def normalize_project_id(raw: str | None) -> str:
    s = (raw or "").strip()
    if not s or s in LEGACY_DEFAULT_PROJECT_IDS:
        return CANONICAL_DEFAULT_PROJECT_ID
    cleaned = "".join(
        ch
        if ch.isalnum() or ch in ("_", "-", ".") or ("\u0400" <= ch <= "\u04FF")
        else "_"
        for ch in s
    )
    return (cleaned[:128] or CANONICAL_DEFAULT_PROJECT_ID)
