# Architecture

## Overview

GORDO Platform — enterprise real estate development management system.
Monorepo: Next.js 15 frontend + FastAPI Python backend, deployed on Railway.

## System layers

```
Browser (SPA)
  └─ Next.js 15 App Router (TypeScript, TailwindCSS, Recharts, Chart.js)
       ├─ /app/api/* — Next.js route handlers (file storage proxy, CSV upload)
       └─ lib/apiClient.ts — all calls to Python backend via fetch + Bearer JWT

FastAPI backend (Python 3.12, uvicorn)
  └─ PostgreSQL (Railway managed)
```

## Data flow

1. User authenticates → `POST /auth/login` → JWT token stored in localStorage.
2. Frontend fetches data via `fetchAuthorizedApi()` → Bearer JWT header.
3. Marketing analytics data (deals JSON, payment plan CSV) is uploaded via
   Next.js API routes and stored in `data/` directory on the filesystem.
4. Construction data (GPR tasks, tenders, TMC) persists in PostgreSQL via
   FastAPI routers.

## Key env vars (frontend)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Python backend base URL |
| `NEXT_PUBLIC_AUTH_MOCK` | `true` enables mock login in dev |
| `NEXT_PUBLIC_DEBUG_API` | `1` enables API request logging |

## Key env vars (backend)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql://...` (required) |
| `SECRET_KEY` | JWT signing key |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `BOOTSTRAP_ADMIN_SYNC_ON_START` | `false` in staging/prod to keep test data |

## Deployment

- Frontend and backend both deployed on Railway.
- Active dev branch: `dev`. Staging/production branch: `staging` (Railway watches `staging`).
- No Alembic migrations — schema changes applied via `ensure_*` helpers in `database.py` on startup.

## Local dev

```bash
npm run dev:all    # starts uvicorn (port 8080) + Next.js (port 3000) concurrently
npm run dev        # Next.js only (uses NEXT_PUBLIC_AUTH_MOCK=true mock backend)
```
