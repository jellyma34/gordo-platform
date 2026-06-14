# Backend

## Stack

- Python 3.12
- FastAPI 0.115+
- SQLAlchemy 2.0 ORM (sync)
- PostgreSQL (psycopg2-binary)
- uvicorn with standard extras
- python-jose — JWT (HS256)
- bcrypt — password hashing
- pydantic v2 + pydantic-settings
- python-multipart — file upload

## Entry point

`backend/app/main.py` — creates `FastAPI` app, registers CORS, includes all routers.

Startup sequence (lifespan):
1. `Base.metadata.create_all` — creates tables if missing
2. `ensure_*` helpers — add missing columns (schema migrations without Alembic)
3. `ensure_project_parts` — seeds "Жилой дом" and "Встроенно-пристроенная автостоянка"
4. `bootstrap_admin_if_needed` — creates initial admin from env if no admin exists

## Routers

| Router | Prefix | Description |
|---|---|---|
| `auth` | `/auth` | login, logout, `/auth/me` |
| `admin` | `/admin` | user CRUD, logs, user analytics |
| `gpr` | `/gpr` | GPR tasks, project parts, deviations |
| `tender` | `/tender` | tenders CRUD + CSV import |
| `tmc` | `/tmc` | TMC items CRUD + CSV import |
| `entity_versions` | `/entity` | entity history, versions, rollback |
| `sections` | — | section-level access helpers |
| `debug` | — | debug endpoints (dev only) |

## Database models (`app/models.py`)

| Table | Description |
|---|---|
| `users` | Auth users: email, password_hash, role, status, allowed_sections (JSON) |
| `activity_logs` | Audit trail: user_email, action, entity, details (JSON) |
| `project_parts` | Construction parts (residential / parking) |
| `gpr_tasks` | GPR tasks: code, name, level, plan/fact dates, completion, related_tmc_ids |
| `gpr_related_deviations` | Linked deviations per task |
| `entity_history` | Unified change history snapshot (before update) for gpr/tender/tmc |
| `gpr_data_versions` | Legacy versions table (superseded by entity_history) |
| `tenders` | Tender items with stage, dates, cost, contractor |
| `tmc` | TMC items with external_id, gpr_stage, plan/fact cost and dates |

## Auth

- JWT bearer tokens (HS256, `SECRET_KEY` env var)
- Roles: `admin`, `manager`, `employee`
- `employee` access restricted to `allowed_sections` list stored as JSON in DB
- Blocked users cannot login (403 with `code: blocked_user`)
- `app/deps.py` provides: `get_current_user`, `require_admin`, `require_admin_or_manager`, `require_gpr_write`

## Schema migrations

No Alembic. Migrations are `ensure_*` functions in `database.py`, executed on every startup.
Idempotent: checks column/table existence before altering.

## API base URL

- Dev: `http://localhost:8080` (uvicorn default in `npm run backend`)
- Production: set via `NEXT_PUBLIC_API_URL` in Railway frontend service

## File storage (backend)

Backend does not handle file uploads — deals JSON and payment plan CSV are stored via
Next.js API routes in the `data/` directory of the frontend service.
