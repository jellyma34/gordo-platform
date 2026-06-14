# Roadmap

## Already implemented

- Auth: JWT login, roles (admin/manager/employee), section-level permissions, user blocking
- Admin panel: user CRUD, activity logs, entity history with rollback
- Construction / GPR: task table, plan/fact dates, deviations, CSV import, history
- Construction / Tenders: CRUD, CSV import, dependency chart
- Construction / TMC: CRUD, CSV import, dependency chart linked to GPR
- Marketing: deals JSON upload, sales plan dashboard, cashflow chart, installments
- Marketing: segment analytics, buyer params, object params, KPI cards
- Marketing: plan/fact bar charts, radar chart, dynamics section
- Presentation mode for construction and marketing
- Multi-part project support (residential + parking)
- Dev mock auth mode

## In progress / partially implemented

- Finance module — routes exist, logic minimal; no backend router
- Presentation explain views — `buildConstructionPresentationExplain`, `buildSalesPlanWorkModeExplain` present but coverage unclear

## Next priorities (TBD)

- Finance module: backend router, financial models, cashflow persistence
- Apartment matrix / product analytics module
- Project charter / unit economics module
- BIM/Revit metrics integration
- Estimate and budget analytics

## Technical debt

- No Alembic: schema migrations via `ensure_*` helpers, fragile for complex changes
- `gpr_data_versions` table is legacy — superseded by `entity_history`, both exist
- `data/` directory used for file storage in Next.js service — not suitable for multi-instance deploy
- `lib/gprMockData.ts`, `lib/salesDealsMockData.ts`, `lib/marketingMockData.ts` — mock data files still in codebase
- Several `scripts/_patch_*.py` one-off patch scripts remain in repo root
- `Dockerfile.old` — stale file in repo root
- `lib/gprPdfRawText.txt`, `lib/source.pdf` — source material files committed to repo
- Frontend fallback API URL hardcoded to dev Railway instance (`gordo-platform-dev.up.railway.app`)
