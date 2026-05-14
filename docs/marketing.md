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
- Stored in `data/marketing-payment-plan/`
  - `default.plan.raw.csv` — plan
  - `default.fact.raw.csv` — fact
  - `default.json` — parsed/cached
- Parser: `lib/paymentScheduleCsv.ts`

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
