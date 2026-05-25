# Marketing module

## Routes

| Path | Description |
|---|---|
| `/marketing/sales-plan` | Sales plan KPI dashboard |
| `/marketing/sales-plan/work` | Work mode with interactive planning |
| `/marketing/sales-plan/explain` | Explain/breakdown view |
| `/marketing/sales-plan/presentation` | Presentation for sales plan |
| `/marketing/plan/edit` | Plan edit |
| `/edit/marketing` | Upload / edit mode |
| `/presentation/marketing` | Hub for marketing presentations |
| `/presentation/marketing/sales-plan` | Sales plan presentation |
| `/presentation/marketing/deals` | Deals analytics presentation |
| `/presentation/marketing/installments` | Installment plans presentation |

## Data sources

### Deals JSON

- Uploaded via `/edit/marketing` → `POST /api/deals/uploads`
- Stored as `data/marketing-deals-current.json`
- Snapshots stored in `data/marketing-deals-snaps/`
- Versions index: `data/marketing-deals-versions.json`
- Shared across all users (server-side file, not per-user)

JSON envelope formats supported:
- Array of deal rows
- `{ data: [...] }` envelope
- Object of arrays keyed by segment (flattened)

### Payment plan CSV

- Uploaded via `/edit/marketing` → `POST /api/marketing/payment-plan`
- Stored in `data/marketing-payment-plan/` (shared for all users on the instance)
  - `{projectId}.plan.raw.csv` — plan
  - `{projectId}.fact.raw.csv` — fact
  - `{projectId}.json` — parsed cache (`projectId`, `uploadedAt`, `uploadedBy`, `planMeta`, `factMeta`)
- Loaded on page open via `GET /api/marketing/payment-plan?projectId=…` (not `localStorage`)
- Parser: `lib/paymentScheduleCsv.ts`

### Supplemental marketing CSVs (investors, segments, units, apartments, parking, storages)

- `POST/GET/DELETE /api/projects/{projectId}/marketing/storage`
- **Source of truth (git + Railway deploy):** `public/data/analytics/*.csv` — реестр в `lib/analytics/analyticsCsvRegistry.ts`
- Runtime cache (не в git): `data/projects/{projectId}/marketing/*.json` + `*.raw.csv`
- При upload CSV дублируется в `public/data/analytics/`; после загрузки закоммитьте `public/data/analytics/*.csv` и push
- Hydration: GET storage читает public CSV → парсит → отдаёт datasets; legacy sync из `data/projects/.../raw.csv` при первом запросе
- One-time migration from browser `localStorage` via `lib/marketingCsvLocalMigration.ts`

### Sales plan execution CSV (Verba)

- `POST/GET/DELETE /api/marketing/sales-plan-execution?projectId=…`
- `data/marketing-sales-plan-execution/{projectId}.execution.json` + `.raw.csv`

## Analytics logic

### Deals normalisation

`lib/marketingDealSegmentIdentity.ts` — canonical segment keys.
`lib/marketingDealSegmentInference.ts` — infer segment from deal fields.
`lib/marketingDealBuyerEntity.ts` — extract buyer identity.
`lib/marketingDealBuyerPrivacy.ts` — privacy masking rules.

### Sales plan

- `lib/salesPlanAnalytics.ts` — plan/fact aggregation per segment
- `lib/salesPlanDynamicsKpi.ts` — KPI dynamics over time
- `lib/salesPlanVelocityChartData.ts` — velocity chart builder
- `lib/buildSalesPlanPresentationExplain.ts` — explain mode data
- `lib/buildSegmentPlanFactFromDeals.ts` — segment plan/fact from raw deals

### Cashflow

- `lib/buildCashflowSeries.ts` — builds plan + fact series
- `lib/cashflowInflowChartSeries.ts` — inflow chart series builder
- `components/marketing/SalesPlanCashflowDynamicsChart.tsx`

## UI rules

- Deal cards: soft gradients, no gray peak labels
- Object parameters: hide price/m² for parking, storage, commercial types
- Buyer parameters: use buyer names (not manager names); hidden columns: type, city, payment method
- Cashflow: blue = fact, orange = plan; fact ends at current date

## Tabs

`MarketingTab = "sales" | "deals" | "installment"`

- `sales` — sales plan section
- `deals` — deals feed / segment analytics
- `installment` — installment plan analytics (`InstallmentsSection`)

## Context providers (client)

- `marketingDealsFeedContext.tsx` — deals data + filters state
- `marketingLayoutChromeContext.tsx` — layout chrome state
- `marketingEditTabContext.tsx` — current edit tab
- `marketingPresentationLightContext.tsx` — light presentation mode flag
