"""
Нормализация имён проектов.

Алгоритм:
1. Нормализуем входное имя (lower, схлопываем пробелы, убираем кавычки/префиксы).
2. Ищем точное совпадение в `ingest_project_aliases.alias_normalized`.
3. Если не нашли — ищем по `ingest_dim_projects.canonical_name` (тоже нормализованно).
4. Если совпало по canonical — авто-добавляем алиас (auto=True) и возвращаем project_id.
5. Если ничего не нашли — возвращаем результат с unresolved=True. Решение
   "создавать ли новый dim_project автоматически" принимает сервис (а не нормализатор),
   потому что это политика, а не алгоритм.

Класс кэширует map alias_normalized → project_id в памяти процесса.
Кэш инвалидируется через .invalidate() — вызывается после ручного
добавления алиаса через API.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import DimProject, ProjectAlias


_NON_WORD_RE = re.compile(r"[\s\-_\.,;:!\?\"'«»()\[\]/]+", flags=re.UNICODE)
_STOP_PREFIXES = ("жк ", "жк_", "проект ", "объект ")


def normalize_project_name(name: str) -> str:
    """
    Нижний регистр + схлопывание разделителей + удаление частых префиксов.
    НЕ должна транслитерировать кириллицу — мы хотим, чтобы 'ЖК Север' и
    'жк-север' маппились на одну строку.
    """
    s = (name or "").strip().lower()
    for pref in _STOP_PREFIXES:
        if s.startswith(pref):
            s = s[len(pref):]
            break
    s = _NON_WORD_RE.sub(" ", s).strip()
    # схлопнуть множественные пробелы
    s = re.sub(r"\s+", " ", s)
    return s


@dataclass(slots=True)
class ProjectNormalizationResult:
    project_id: int | None
    canonical_name: str | None
    matched_via: str  # 'alias' | 'canonical' | 'auto_alias' | 'unresolved'
    unresolved: bool


class ProjectNormalizer:
    """
    Привязка staging-строк к dim_projects через project_aliases.

    Использование:
        norm = ProjectNormalizer(db)
        norm.warmup()  # одноразово, до прохода по большому батчу

        res = norm.resolve("ЖК «Север»")
        if res.unresolved:
            ...  # лог warning, fact-строку не пишем
    """

    def __init__(self, db: Session):
        self.db = db
        self._alias_cache: dict[str, int] = {}
        self._canonical_cache: dict[str, tuple[int, str]] = {}
        self._warmed = False

    def warmup(self) -> None:
        if self._warmed:
            return
        alias_rows = self.db.execute(
            select(ProjectAlias.alias_normalized, ProjectAlias.project_id)
        ).all()
        self._alias_cache = {a: pid for a, pid in alias_rows}

        proj_rows = self.db.execute(
            select(DimProject.id, DimProject.canonical_name).where(DimProject.is_active.is_(True))
        ).all()
        self._canonical_cache = {
            normalize_project_name(name): (pid, name) for pid, name in proj_rows
        }
        self._warmed = True

    def invalidate(self) -> None:
        self._alias_cache.clear()
        self._canonical_cache.clear()
        self._warmed = False

    def resolve(self, raw_name: str | None) -> ProjectNormalizationResult:
        if not raw_name or not str(raw_name).strip():
            return ProjectNormalizationResult(None, None, "unresolved", True)

        self.warmup()
        key = normalize_project_name(raw_name)

        pid = self._alias_cache.get(key)
        if pid is not None:
            name = self._canonical_name_for(pid)
            return ProjectNormalizationResult(pid, name, "alias", False)

        match = self._canonical_cache.get(key)
        if match is not None:
            pid, canonical = match
            # Авто-добавляем алиас, чтобы следующая загрузка прошла без fallback'a.
            self._auto_add_alias(project_id=pid, alias=raw_name, alias_normalized=key)
            return ProjectNormalizationResult(pid, canonical, "auto_alias", False)

        return ProjectNormalizationResult(None, None, "unresolved", True)

    # ----------------------------- helpers -----------------------------

    def _canonical_name_for(self, project_id: int) -> str | None:
        for norm_name, (pid, canonical) in self._canonical_cache.items():
            if pid == project_id:
                return canonical
        # Кеш мог отстать — добираем из БД.
        row = self.db.execute(
            select(DimProject.canonical_name).where(DimProject.id == project_id)
        ).first()
        return row[0] if row else None

    def _auto_add_alias(self, *, project_id: int, alias: str, alias_normalized: str) -> None:
        # Идемпотентно: если параллельно уже вставили, ловим IntegrityError на flush.
        existing = self.db.execute(
            select(ProjectAlias.id).where(ProjectAlias.alias_normalized == alias_normalized)
        ).first()
        if existing:
            self._alias_cache[alias_normalized] = project_id
            return

        row = ProjectAlias(
            project_id=project_id,
            alias=alias.strip()[:256],
            alias_normalized=alias_normalized[:256],
            auto=True,
        )
        self.db.add(row)
        # commit на стороне вызывающего сервиса — он сам решает границы транзакции.
        self._alias_cache[alias_normalized] = project_id
