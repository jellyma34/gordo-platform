# Modules

## Implemented modules

### Construction (ГПР / GPR)

Route: `/construction`, `/presentation/construction`, `/edit/construction`

- GPR task table with hierarchical codes (2.04.xx, 2.05.xx, 2.06.xx, 2.07.xx)
- Plan/fact dates, completion %, deviations
- Two project parts: residential (`Жилой дом`, part_id=1), parking (`Встроенно-пристроенная автостоянка`, part_id=2)
- CSV import from MS Project report (`gpr-report-sample.csv`)
- Entity history with rollback support

### Tenders

Route: `/construction?section=tenders`, `/presentation/construction?section=tenders`

- Linked to GPR tasks via `related_tmc_ids`
- Fields: code, name, stage, plan/fact start, plan/fact contract date, cost, contractor, status
- CSV import supported

### TMC (Materials / ТМЦ)

Route: `/construction?section=tmc`, `/presentation/construction?section=tmc`

- Material supply items linked to GPR stages
- Fields: external_id, project_part, gpr_stage, plan/fact cost, plan/fact date
- CSV import supported
- Dependency chart linking TMC to GPR tasks (`GPRTmcDependencyChart`)

### Marketing / Sales

Routes:
- `/marketing/sales-plan` — sales plan KPI dashboard
- `/marketing/sales-plan/work` — work mode with interactive plan
- `/marketing/plan/edit` — plan edit
- `/presentation/marketing/sales-plan` — presentation
- `/presentation/marketing/deals` — deals analytics
- `/presentation/marketing/installments` — installment plans

Data source: uploaded JSON (CRM export) stored in `data/marketing-deals-current.json`.
Payment plan: CSV uploaded via `/api/marketing/payment-plan`.

### Finance

Routes: `/edit/finance`, `/presentation/finance`

Components: `components/finance/` — TBD (directory empty or minimal, no dedicated backend router found)

### Admin

Route: `/admin`, `/admin/users`, `/admin/history`

- User management: create, edit, block/unblock, delete, set password
- Role-based access: `admin` | `manager` | `employee`
- Section-level permissions per user: `gpr`, `tenders`, `materials`, `marketing`
- Activity log with pagination
- Entity history viewer with rollback

### Presentation hub

Route: `/presentation`

- Entry point for all presentation views
- Splits into: construction, finance, marketing sub-presentations

## Modules not found / TBD

- **Apartment Matrix / Product Analytics** — no dedicated route or component directory found (`TBD`)
- **Project Charter** — no dedicated route or component directory found (`TBD`)
- **Finance backend router** — no Python router in `backend/app/routers/` (`TBD`)
- **BIM/Revit integration** — mentioned in platform description, not found in code (`TBD`)
- **Estimate/budget module** — not found (`TBD`)
