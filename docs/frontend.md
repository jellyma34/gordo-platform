# Frontend

## Stack

- Next.js 15 App Router (TypeScript strict)
- React 18
- TailwindCSS 3
- Recharts 3 — primary charting library
- Chart.js 4 + react-chartjs-2 — secondary (cashflow inflow charts)
- PapaParse — CSV parsing
- lucide-react — icons

## Directory layout

```
app/                    Next.js route segments
  api/
    deals/              GET/POST current deals JSON; snapshot uploads
    gpr/import/         POST GPR CSV import
    marketing/payment-plan/  GET/POST payment plan CSV
    health/             health check
  admin/                admin panel pages
  construction/         construction section (GPR / tenders / TMC)
  edit/                 edit mode pages (construction, finance, marketing)
  login/                login page
  marketing/            marketing analytics pages
  presentation/         presentation mode (construction, finance, marketing)
  page.tsx              home dashboard
  layout.tsx            root layout (AuthGateRoot)

components/             reusable UI components
  auth/                 AuthGate, AuthProvider, UserMenu
  construction/         GPRTable, GPRAnalytics, TendersSection, TMCSection
  marketing/            SalesPlanKpiDashboard, SalesDealsSection, etc.
  finance/              (minimal, TBD)
  presentation/         PresentationChrome, PresentationBody
  mode/                 ModeBar, ModeProvider (presentation/edit toggle)
  ui/                   GprDateField, RuDateInput, GprRowIssueIndicator

lib/                    business logic, data builders, API wrappers
  apiClient.ts          fetch wrappers (fetchAuthorizedApi, buildApiUrl)
  auth.ts               login/logout, admin user CRUD, entity history API
  authTypes.ts          Role, ApiSection, UserStatus types
  authStorage.ts        localStorage helpers
  gpr*.ts               GPR data, parser, schedule, aggregate logic
  marketing*.ts         deals normalisation, segment inference, analytics
  salesPlan*.ts         sales plan analytics, chart formatters
  buildCashflowSeries.ts cashflow chart builder
  tenderData.ts / tmcData.ts  tender/TMC helpers
  csvTextEncoding.ts    CSV encoding detection (Windows-1251 support)
  paymentScheduleCsv.ts payment schedule CSV parser

utils/
  status.ts             task status helpers
```

## Auth flow

1. `AuthGateRoot` (root layout) initialises auth context from localStorage.
2. `AuthGate` wraps every protected page; redirects to `/login` if no session.
3. Mock login available in dev (`NEXT_PUBLIC_AUTH_MOCK=true`): any email + non-empty password logs in as manager.
4. Real login: `POST /auth/login` → JWT stored via `saveAuth()`.
5. On 401 from any protected API call: session cleared, redirect to `/login?next=<current>`.

## Roles and section access

| Role | Access |
|---|---|
| `admin` | all sections, user management |
| `manager` | all sections |
| `employee` | only `allowed_sections` set per user |

Sections: `gpr`, `tenders`, `materials` (UI: `tmc`), `marketing`.

## Route modes

Every main module has three modes:
- **Presentation** — `/presentation/<module>` — read-only, polished view
- **Edit** — `/edit/<module>` — data entry / upload forms
- **Analytics** — `/construction`, `/marketing/*` — interactive dashboards

## Chart conventions

- Cashflow: blue = fact, orange = plan; fact line ends at current date
- Vertical month axis labels (rotated)
- No peak labels on deal cards
- Hide price/m² for parking, storage, commercial object types
- Chart data uses Recharts `ResponsiveContainer` by default

## CSV import

- GPR import: MS Project CSV, parsed via `lib/gprParser.ts` + `lib/gprReportCsv.ts`
- Tenders: `lib/tenderCsvImport.ts`
- TMC: `lib/tmcCsvImport.ts`
- Payment plan: `lib/paymentScheduleCsv.ts`
- Encoding: auto-detected (UTF-8 / Windows-1251) via `lib/csvTextEncoding.ts`
