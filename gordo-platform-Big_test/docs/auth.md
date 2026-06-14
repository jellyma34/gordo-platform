# Auth

## Login flow

```
POST /auth/login { email, password }
→ { token: string, user: ApiLoginUser }
→ saveAuth(token, role, allowedSections, userLabel, user)  — localStorage
→ redirect to first accessible section
```

On 401 from any protected request: `clearAuth()` + redirect to `/login?next=<path>`.

## Session storage

`lib/authStorage.ts` — reads/writes localStorage keys:
- token
- role
- allowed_sections (JSON array)
- user_label
- user (JSON object: fio / fullName / full_name / name / email)

## Roles

| Role | Description |
|---|---|
| `admin` | full access + user management |
| `manager` | full access to all sections |
| `employee` | access only to `allowed_sections` |

## Sections

`API_SECTION_KEYS = ["gpr", "tenders", "materials", "marketing"]`

- `admin` and `manager` always get all sections
- `employee` access controlled per-user via `allowed_sections` in DB
- UI maps `materials` → `tmc` route segment

## Mock mode (dev)

`NEXT_PUBLIC_AUTH_MOCK=true` (default in `development`):
- Any non-empty email + password logs in as `manager` with all sections
- No backend call made
- Token is `"mock-dev-token"`, `/auth/me` is skipped for this token

## Guard components

- `AuthGateRoot` (`components/auth/AuthGateRoot.tsx`) — root layout provider, initialises context
- `AuthGate` (`components/auth/AuthGate.tsx`) — page-level guard, redirects if not authenticated
- `AuthProvider` (`components/auth/AuthProvider.tsx`) — React context with session state

## User blocking

- Admin can block a user with an optional reason
- Blocked users get HTTP 403 on login (`code: blocked_user`, `reason` in response)
- Frontend shows `BLOCKED_LOGIN_MESSAGE` + reason suffix to user
