# CLAUDE.md

## Project overview

GORDO is a real-estate development management platform.

Core stack:
- Next.js App Router
- TypeScript
- FastAPI backend
- PostgreSQL
- Railway deployment

Main modules:
- Marketing
- Construction (GPR / TMC / Tenders)
- Admin
- Auth
- Finance (partial)
- Analytics

Documentation index:
- docs/architecture.md
- docs/modules.md
- docs/frontend.md
- docs/backend.md
- docs/auth.md
- docs/construction.md
- docs/marketing.md
- docs/finance.md
- docs/ppr.md
- docs/roadmap.md
- docs/conventions.md

## AI agent rules

Before modifying code:
1. Read relevant docs first
2. Make minimal patches only
3. Never refactor unrelated modules
4. Preserve existing architecture
5. Preserve UI style and chart behavior
6. Prefer editing existing files over creating new abstractions
7. Do not rename APIs/components without request
8. Avoid large-scale rewrites
9. Do not touch deployment configs unless requested
10. Never commit automatically

## Important project conventions

- Marketing module is production-critical
- Presentation mode and Edit mode are separate behaviors
- CSV/JSON imports must remain backward compatible
- Plan/fact chart logic is sensitive
- Railway environments:
  - dev
  - tester
  - production

## Current priorities

1. Marketing analytics
2. Presentation generation
3. Construction/GPR workflows
4. Financial planning
5. Performance optimization

---

# Stack

- Next.js 15 App Router
- TypeScript
- React
- TailwindCSS
- Recharts
- PostgreSQL
- Railway
- JSON / CSV imports

---

# Platform Modules

## Construction
Contains:
- construction stages
- schedules
- progress tracking
- contractor analytics
- deviations
- project milestones

## Finance
Contains:
- project budgets
- cashflow
- financial models
- forecasts
- plan/fact analytics
- payment schedules

## Marketing
Contains:
- sales analytics
- cashflow dynamics
- plan/fact charts
- buyer analytics
- object analytics
- sales structure
- imported CRM analytics

## Apartment Matrix / Product Analytics
Contains:
- apartmentography
- unit mix analysis
- area metrics
- product efficiency
- price per m² analytics
- layout statistics

## Project Charter
Contains:
- consolidated project KPIs
- unit economics
- construction indicators
- Revit metrics
- estimate metrics
- financial benchmarks

---

# Core Rules

- Do NOT scan the entire repository unless explicitly requested.
- Work ONLY with specified files.
- Do NOT refactor architecture.
- Do NOT rename files or folders.
- Do NOT modify unrelated code.
- Prefer minimal patches.
- Preserve existing UI and logic.
- Return concise responses.

---

# Workflow

Always:
- make targeted edits
- preserve existing structure
- return minimal diffs
- avoid rewriting full components

If additional files are needed:
- explain why first.

---

# UI Rules

Style:
- light enterprise UI
- premium analytics dashboard aesthetic
- soft gradients
- large spacing
- minimalistic cards
- clean typography

Do NOT:
- introduce dark UI
- change design system
- alter spacing globally
- redesign layouts without request

---

# Analytics Rules

Important:
- preserve filtering logic
- preserve aggregation logic
- preserve existing calculations
- avoid rebuilding charts unnecessarily

Charts are business-critical.

---

# Data Sources

Platform uses:
- PostgreSQL
- uploaded JSON
- uploaded CSV
- cached snapshots
- aggregated analytics

Important:
- uploaded analytics must be visible to all users
- do NOT keep important analytics only in local state

---

# Approved UX Decisions

## Cashflow Chart
- blue = fact
- orange = plan
- fact line ends at current date
- plan continues through full project timeline
- vertical month labels
- avoid overlapping labels

## Deals Cards
- soft gradients
- no gray peak labels
- minimal captions

## Object Parameters
Hide price per m² for:
- storage
- parking
- commercial

## Buyer Parameters
- use real buyer names from JSON
- never use manager names as buyers
- hidden columns:
  - type
  - city
  - payment method

---

# Performance

Ignore:
- node_modules
- .next
- dist
- build

Avoid reading generated files.

---

# Git

Main branches:
- dev
- tester/test

For merges:
- prefer dev changes on conflicts

---

# Railway

Do NOT modify:
- env variables
- deployment config
- DB connection logic

unless explicitly requested.

