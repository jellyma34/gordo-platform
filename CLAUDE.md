# CLAUDE.md

## Project

GORDO Platform — enterprise real estate development management platform.

The system combines:
- construction management
- financial planning
- sales analytics
- marketing analytics
- apartment matrix analytics
- project charter calculations
- BIM/Revit-based metrics
- estimate and budget analytics

Main goal:
predict and control construction and financial risks across the project lifecycle.

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