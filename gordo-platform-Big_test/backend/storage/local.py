"""
Локальное файловое хранилище для raw-файлов.

Структура на диске:

    <storage_raw_dir>/
        2026/05/27/
            <uuid>__<safe_original_name>

Префикс по дате — чтобы каталог не разрастался; uuid — чтобы избежать коллизий
имён между разными загрузками.
"""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO

from .base import RawStorage, StoredBlob


_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._\-]+")


def _safe_name(name: str) -> str:
    base = os.path.basename(name).strip() or "file"
    base = _SAFE_NAME_RE.sub("_", base)
    return base[:200]  # запас на длину пути


class LocalRawStorage(RawStorage):
    def __init__(self, root: str | os.PathLike[str]) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _today_subdir(self) -> Path:
        now = datetime.now(timezone.utc)
        sub = self.root / f"{now.year:04d}" / f"{now.month:02d}" / f"{now.day:02d}"
        sub.mkdir(parents=True, exist_ok=True)
        return sub

    def save(self, *, filename: str, data: BinaryIO) -> StoredBlob:
        subdir = self._today_subdir()
        name = f"{uuid.uuid4().hex}__{_safe_name(filename)}"
        dest = subdir / name

        sha = hashlib.sha256()
        size = 0
        # Стримим, чтобы не держать всё в памяти (важно для больших Excel).
        with dest.open("wb") as fh:
            while True:
                chunk = data.read(1024 * 1024)
                if not chunk:
                    break
                fh.write(chunk)
                sha.update(chunk)
                size += len(chunk)

        rel = dest.relative_to(self.root).as_posix()
        return StoredBlob(storage_path=rel, size=size, sha256=sha.hexdigest())

    def open(self, storage_path: str) -> BinaryIO:
        full = self._resolve(storage_path)
        return full.open("rb")

    def delete(self, storage_path: str) -> None:
        full = self._resolve(storage_path)
        try:
            full.unlink(missing_ok=True)
        except OSError:
            # Не критично — удаление файлов best-effort
            pass

    def absolute_path(self, storage_path: str) -> str:
        return str(self._resolve(storage_path))

    def _resolve(self, storage_path: str) -> Path:
        # Защита от path traversal: путь должен оставаться внутри root.
        candidate = (self.root / storage_path).resolve()
        if not str(candidate).startswith(str(self.root)):
            raise ValueError(f"Invalid storage_path (escapes root): {storage_path!r}")
        return candidate

    @classmethod
    def from_settings(cls) -> "LocalRawStorage":
        # Импорт здесь, чтобы избежать циклов на этапе alembic env.py.
        from db.config import settings  # type: ignore
        return cls(settings.storage_raw_dir)


_default: LocalRawStorage | None = None


def get_default_storage() -> RawStorage:
    """Singleton-обёртка вокруг LocalRawStorage.from_settings()."""
    global _default
    if _default is None:
        _default = LocalRawStorage.from_settings()
    return _default


# Утилита: убедиться, что shutil доступен (на некоторых slim-образах нет).
_ = shutil  # noqa: F401
