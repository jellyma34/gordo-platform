# PPR (ППР / Production Project Planning)

## Status

No dedicated PPR module found in the codebase.

The construction module implements **GPR** (General Project Plan / ГПР) which is the
top-level construction schedule. PPR (Project for the Production of Works / ППР) as a
separate level of detail is not implemented.

## GPR vs PPR

| | GPR (implemented) | PPR (TBD) |
|---|---|---|
| Level | Strategic schedule | Work execution details |
| Data | Tasks with plan/fact dates, completion % | Specific work methods, resources |
| Backend | `gpr_tasks` table + routers | — |

## TBD

- PPR module: not found
- If PPR data needs to be added, consider extending the GPR task hierarchy (level 4+)
  or adding a separate `ppr_tasks` table linked to `gpr_tasks`
