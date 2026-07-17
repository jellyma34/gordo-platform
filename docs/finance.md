# Finance module

## Status

Partially implemented. Budget and execution CSV imports persist to **PostgreSQL** via FastAPI; Next file API and localStorage remain as secondary cache / migration fallback.

## Routes

| Path | Description |
|---|---|
| `/edit/finance` | Finance edit page |
| `/presentation/finance` | Finance presentation |

## Persistence (source of truth)

| Kind | PostgreSQL table | FastAPI |
|---|---|---|
| Budget | `finance_budget_imports` | `GET/PUT /finance/budget-imports` |
| Execution | `finance_execution_imports` | `GET/PUT /finance/execution-imports` |

**Load:** PostgreSQL only (localStorage = write-through cache; one-shot LS→DB migration if DB empty).  
**Save:** PostgreSQL required; on failure import fails. Next file routes are **not** used.

## Components

`components/finance/` — edit table, presentation KPI cards, charts.

## Known logic

- Cashflow chart series: `lib/buildCashflowSeries.ts`
- Shared with marketing cashflow inflow: `lib/cashflowInflowChartSeries.ts`

## Related modules

- Marketing shared imports: Next `data/` + `/api/marketing/*` (not Postgres yet)
- GPR / TMC: FastAPI entity tables + Next snapshot APIs
