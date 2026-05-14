# Finance module

## Status

Partially implemented. No dedicated Python backend router found.
Frontend pages exist but business logic is minimal.

## Routes

| Path | Description |
|---|---|
| `/edit/finance` | Finance edit page |
| `/presentation/finance` | Finance presentation |

## Components

`components/finance/` — directory exists but contents not analysed (TBD).

## Known logic

- Cashflow chart series built via `lib/buildCashflowSeries.ts`
- Shared with marketing cashflow inflow: `lib/cashflowInflowChartSeries.ts`
- Payment plan data (from marketing upload) used in finance views

## Missing / TBD

- No backend router for finance data persistence
- No financial models / forecasts implementation found
- Budget / estimate analytics: TBD
- Plan/fact financial analytics: TBD
- Payment schedules (beyond CSV upload): TBD
