# Development conventions

## General

- Minimal patches only — do not refactor unless explicitly requested
- Do not rename files, folders, or functions without a direct request
- Do not touch modules unrelated to the current task
- Do not introduce new abstractions without a clear need
- Prefer editing existing files over creating new ones

## Code style

- TypeScript strict mode — no `any` unless unavoidable
- No inline comments explaining what the code does; only add a comment for non-obvious WHY
- No docblock comments
- No trailing `// removed` or backwards-compat shims for deleted code

## UI style

- Light enterprise premium aesthetic
- Soft gradients, large spacing, minimalistic cards, clean typography
- Do NOT introduce dark mode, global spacing changes, or layout redesigns
- Charts are business-critical — preserve all filtering and aggregation logic
- Recharts is primary; Chart.js used for cashflow inflow only

## Chart rules

- Cashflow: blue = fact line (ends at current date), orange = plan line (full timeline)
- Month labels: vertical (rotated), no overlapping
- Deal cards: no gray peak labels
- Object params: hide price/m² for parking, storage, commercial

## Data upload rules

- Uploaded deals JSON and payment plan CSV must be visible to all users
- Store in `data/` directory via Next.js API routes, not in local React state
- Deals JSON supports multiple envelope formats (see `lib/marketingDealsInputShape.ts`)
- CSV encoding: auto-detect UTF-8 / Windows-1251 via `lib/csvTextEncoding.ts`

## Branch rules

- `dev` — active development (may be unstable)
- `staging` — validated changes only, Railway deploys from here
- Merge flow: dev → staging (via `git merge --no-ff`)
- On conflicts prefer `dev` changes

## Railway rules

- Do NOT modify env variables, deployment config, or DB connection logic without explicit request
- `BOOTSTRAP_ADMIN_SYNC_ON_START=false` must stay `false` in staging/prod
- Backend uses PostgreSQL only — `DATABASE_URL` must start with `postgresql://`

## Backend rules

- No Alembic — add schema changes as `ensure_*` functions in `database.py`
- Every `ensure_*` function must be idempotent (check before alter)
- History before every write: use `append_entity_history` from `app/services/history`
- Audit every mutating action via `ActivityLog`

## Performance

- Never read `node_modules`, `.next`, `dist`, `build`, `.vs`
- Do not scan the full repo unless explicitly asked
- Avoid rebuilding charts unnecessarily — preserve existing Recharts config
