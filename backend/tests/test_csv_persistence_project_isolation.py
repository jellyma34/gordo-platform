"""
Тесты изоляции CSV-импортов по project_id (TMC).

Запуск (нужен PostgreSQL + DATABASE_URL):
  cd backend && python -m pytest tests/test_csv_persistence_project_isolation.py -q

Без БД — unit-тесты normalize_project_id всё равно проходят.
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.project_ids import CANONICAL_DEFAULT_PROJECT_ID, normalize_project_id


def test_normalize_project_id_canonical():
    assert normalize_project_id(None) == CANONICAL_DEFAULT_PROJECT_ID
    assert normalize_project_id("") == CANONICAL_DEFAULT_PROJECT_ID
    assert normalize_project_id("default") == CANONICAL_DEFAULT_PROJECT_ID
    assert normalize_project_id("verba-phase-1") == "verba-phase-1"
    assert normalize_project_id("other-project") == "other-project"


@pytest.fixture(scope="module")
def api_client():
    try:
        from app.config import settings

        db_url = (os.environ.get("DATABASE_URL") or settings.database_url or "").strip()
    except Exception:
        db_url = (os.environ.get("DATABASE_URL") or "").strip()
    if not db_url.startswith("postgresql://"):
        pytest.skip("DATABASE_URL postgresql required for integration tests")
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as client:
        yield client


def _login(client, email: str, password: str) -> str:
    r = client.post("/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text}")
    body = r.json()
    token = body.get("token") or body.get("access_token")
    if not token:
        pytest.skip(f"login response without token: {body}")
    return token


def _tmc_item(ext: str, name: str = "Item"):
    return {
        "external_id": ext,
        "project_part": "residential",
        "name": name,
        "gpr_stage": "2.05",
        "plan_cost": 100,
        "fact_cost": None,
        "plan_date": "2026-01-15",
        "fact_date": None,
        "details": {"id": ext, "name": name, "rowKind": "position"},
    }


def _admin_creds():
    try:
        from app.config import settings

        email = (os.environ.get("BOOTSTRAP_ADMIN_EMAIL") or settings.bootstrap_admin_email or "").strip()
        password = (os.environ.get("BOOTSTRAP_ADMIN_PASSWORD") or settings.bootstrap_admin_password or "").strip()
    except Exception:
        email = (os.environ.get("BOOTSTRAP_ADMIN_EMAIL") or "").strip()
        password = (os.environ.get("BOOTSTRAP_ADMIN_PASSWORD") or "").strip()
    return email, password


@pytest.mark.integration
def test_user_a_import_user_b_sees_same(api_client):
    """TEST A/B: User A uploads → User B GET same project → same records."""
    admin_email, admin_pass = _admin_creds()
    if not admin_email or not admin_pass:
        pytest.skip("BOOTSTRAP_ADMIN_* required")

    token_a = _login(api_client, admin_email, admin_pass)
    # Same admin acts as A and B (shared project data, not user-scoped).
    token_b = token_a

    project_a = "verba-phase-1"
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    payload = {
        "projectId": project_a,
        "replace_missing": True,
        "items": [_tmc_item("tmc-persist-1", "Pipe"), _tmc_item("tmc-persist-2", "Valve")],
    }
    r = api_client.post("/tmc/bulk-import", json=payload, headers=headers_a)
    assert r.status_code == 200, r.text
    imported = r.json()
    assert len(imported) == 2

    r2 = api_client.get(f"/tmc?projectId={project_a}", headers=headers_b)
    assert r2.status_code == 200
    ids = {x["external_id"] for x in r2.json()}
    assert "tmc-persist-1" in ids and "tmc-persist-2" in ids


@pytest.mark.integration
def test_different_project_isolation(api_client):
    """TEST H: Project B does not see Project A data."""
    admin_email, admin_pass = _admin_creds()
    if not admin_email or not admin_pass:
        pytest.skip("BOOTSTRAP_ADMIN_* required")

    token = _login(api_client, admin_email, admin_pass)
    headers = {"Authorization": f"Bearer {token}"}

    api_client.post(
        "/tmc/bulk-import",
        json={
            "projectId": "project-alpha",
            "replace_missing": True,
            "items": [_tmc_item("shared-code", "Alpha only")],
        },
        headers=headers,
    )
    api_client.post(
        "/tmc/bulk-import",
        json={
            "projectId": "project-beta",
            "replace_missing": True,
            "items": [_tmc_item("beta-only", "Beta only")],
        },
        headers=headers,
    )

    alpha = api_client.get("/tmc?projectId=project-alpha", headers=headers).json()
    beta = api_client.get("/tmc?projectId=project-beta", headers=headers).json()
    assert any(x["external_id"] == "shared-code" for x in alpha)
    assert not any(x["external_id"] == "shared-code" for x in beta)
    assert any(x["external_id"] == "beta-only" for x in beta)


@pytest.mark.integration
def test_duplicate_import_no_uncontrolled_dupes(api_client):
    """TEST I: повторный import upsert, не плодит дубли."""
    admin_email, admin_pass = _admin_creds()
    if not admin_email or not admin_pass:
        pytest.skip("BOOTSTRAP_ADMIN_* required")

    token = _login(api_client, admin_email, admin_pass)
    headers = {"Authorization": f"Bearer {token}"}
    pid = "verba-dup-test"

    body = {
        "projectId": pid,
        "replace_missing": True,
        "items": [_tmc_item("dup-1", "One")],
    }
    assert api_client.post("/tmc/bulk-import", json=body, headers=headers).status_code == 200
    assert api_client.post("/tmc/bulk-import", json=body, headers=headers).status_code == 200
    rows = api_client.get(f"/tmc?projectId={pid}", headers=headers).json()
    assert len([r for r in rows if r["external_id"] == "dup-1"]) == 1


@pytest.mark.integration
def test_marketing_import_postgres(api_client):
    pid = "verba-phase-1"
    kind = "investors"
    put = api_client.put(
        "/marketing/imports",
        json={
            "projectId": pid,
            "kind": kind,
            "payload": {"rows": [{"id": 1}], "fileName": "t.csv", "updatedAt": "2026-08-12T00:00:00Z"},
            "fileName": "t.csv",
            "uploadedBy": "test",
        },
    )
    assert put.status_code == 200, put.text
    get = api_client.get(f"/marketing/imports/{kind}?projectId={pid}")
    assert get.status_code == 200
    assert get.json()["payload"]["rows"][0]["id"] == 1
