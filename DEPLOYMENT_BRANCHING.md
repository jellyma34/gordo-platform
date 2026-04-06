# Branching and Deploy: dev / staging

## Branch strategy

- `dev` — active development, unstable changes allowed.
- `staging` — test environment, only validated changes.

Recommended flow:

1. Develop and review in `dev`.
2. Merge tested changes from `dev` to `staging`.
3. Railway deploys only from `staging`.

## Environment separation

Use different variables and databases per environment:

- Frontend:
  - `NEXT_PUBLIC_APP_ENV=development|staging`
  - `NEXT_PUBLIC_API_URL=<backend-url-for-env>`
- Backend:
  - `APP_ENV=dev|staging|production`
  - `DATABASE_URL=<separate DB per env>`
  - `BOOTSTRAP_ADMIN_SYNC_ON_START=false` (keep test data safe)

Important:

- The backend no longer resets existing admin credentials by default at startup.
- Bootstrap updates existing admin only if `BOOTSTRAP_ADMIN_SYNC_ON_START=true`.

## Git workflow commands

Create branches once:

```bash
git checkout -b dev
git push -u origin dev
git checkout -b staging
git push -u origin staging
```

Daily development:

```bash
git checkout dev
git pull origin dev
# ...work...
git add .
git commit -m "Your change"
git push origin dev
```

Promote to test environment:

```bash
git checkout staging
git pull origin staging
git merge --no-ff dev
git push origin staging
```

## Railway setup (manual)

### Required in Railway dashboard

For each Railway service (frontend and backend):

1. Open service settings connected to GitHub.
2. Set **Deploy Branch** to `staging`.
3. Disable auto-deploy for other branches (or keep branch filter strictly `staging`).

Result:

- Pushes to `dev` do not deploy.
- Pushes/merges to `staging` trigger deploy.

### Recommended project layout in Railway

- Either one Railway project with two services (`frontend`, `backend`) both pinned to `staging`,
- or separate Railway environments/projects (`development`, `staging`) with distinct branch filters and variables.

## Safety checklist for test environment

- `BOOTSTRAP_ADMIN_SYNC_ON_START=false`
- No startup reset scripts for domain data
- Staging uses dedicated DB (not shared with dev)
- Promote to staging only via merge from `dev`
