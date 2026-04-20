"""Одноразовая проверка маршрутов (запуск: DATABASE_URL=... python _list_admin_routes.py)."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")

from app.main import app  # noqa: E402

paths = []
for route in app.routes:
    p = getattr(route, "path", None)
    if not p or "/api/admin" not in p:
        continue
    methods = sorted(getattr(route, "methods", None) or [])
    paths.append((p, methods))

for p, methods in sorted(paths):
    print(",".join(methods), p)
