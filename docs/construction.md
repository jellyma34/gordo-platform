# Construction module

## Routes

| Path | Description |
|---|---|
| `/construction` | GPR dashboard (default: GPR section) |
| `/construction?section=gpr` | GPR table + analytics |
| `/construction?section=tenders` | Tenders table |
| `/construction?section=tmc` | TMC table |
| `/construction/explain` | GPR work explain view |
| `/edit/construction` | Edit mode (same section routing) |
| `/presentation/construction` | Presentation mode |

## GPR (General Project Plan / ГПР)

### Data model

`GprTask` — hierarchical task structure:
- `code` — dot-separated (e.g. `2.05.01.1`)
- `level` — 1, 2, 3 (depth)
- `part_id` — 1 (residential) or 2 (parking)
- `plan_start / plan_end / fact_start / fact_end` — ISO dates (nullable)
- `completion` — integer 0–100
- `related_tmc_ids` — JSON array of TMC external_id values

### Work catalog

`lib/gprData.ts` — static catalog of all work types with codes and names.
Codes:
- `2.04.*` — site preparation
- `2.05.*` — buildings construction
- `2.06.*` — engineering networks
- `2.07.*` — landscaping

Parking codes: `2.06.*`, `2.07.*`
House codes: `2.04.*`, `2.05.*`

### CSV import

Source: MS Project report export.
Parser: `lib/gprParser.ts` — parses CSV rows, maps columns.
`lib/gprReportCsv.ts` — builds import diff, merges with existing DB tasks.
`lib/gprTasksMergeFromReportCsv.ts` — merge/update logic (preserves manual edits).
`app/api/gpr/import/route.ts` — Next.js route handler for CSV upload.

### Analytics

- `lib/gprProjectPlanFactStages.ts` — plan/fact stage aggregation
- `lib/gprScheduleDelayToday.ts` — compute delay days as of today
- `lib/gprMainProcessAggregate.ts` — top-level aggregate metrics
- `lib/constructionStructureDiagnosticMetrics.ts` — diagnostic KPIs
- `lib/gprQuarterlyTimeline.ts` — quarterly rollup
- `lib/planFactWorkTypeTimeline.ts` — plan/fact per work type over time

Components:
- `GPRTable.tsx` — editable/read-only task table
- `GPRAnalytics.tsx` — KPI cards and charts
- `GPRForecastChart.tsx` — forecast chart
- `GPRSection.tsx` — section wrapper

### Entity history

Every update to a GPR task writes a snapshot to `entity_history` before saving.
Frontend: `listEntityHistory`, `getEntityHistoryItem`, `rollbackEntityVersion` in `lib/auth.ts`.
Rollback: `POST /entity/{id}/rollback/{version_id}?type=gpr`

## Tenders

- `lib/tenderData.ts` — type definitions and data helpers
- `lib/tenderCsvImport.ts` — CSV import parser
- `lib/tenderImportDiff.ts` — import diff / merge
- `components/construction/TendersSection.tsx`
- `components/tenders/TendersTable.tsx`
- Backend: `backend/app/routers/tender.py`
- Linked to GPR via `GPRTenderDependencyChart.tsx`

## TMC (Materials / ТМЦ)

- `lib/tmcData.ts` — types and helpers
- `lib/tmcCsvImport.ts` — CSV import parser
- `lib/tmcImportDiff.ts` — import diff
- `components/construction/TMCSection.tsx`
- `components/tmc/TmcTable.tsx`
- Backend: `backend/app/routers/tmc.py`
- Linked to GPR via `GPRTmcDependencyChart.tsx`
- `related_tmc_ids` on `GprTask` stores linked TMC external_ids
