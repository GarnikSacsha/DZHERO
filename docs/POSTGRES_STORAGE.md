# Dzhero Postgres storage

Dzhero can now run in two storage modes:

- local/dev JSON mode: `DATABASE_URL` is empty, data is stored in `backend/data/db.json`;
- production Postgres mode: `DATABASE_URL` is set, data is stored in the `app_state` table as JSONB.

This is an MVP-safe migration step. It keeps the current backend API unchanged, but moves persistent app data out of the container filesystem.

## Railway setup

Use the Postgres service connection string from Railway and set these variables on the Dzhero backend service:

```env
DATABASE_URL=postgresql://...
DATABASE_SSL=false
APP_STATE_KEY=main
```

Use `DATABASE_SSL=true` only if your database provider requires SSL. Railway private/internal Postgres connections usually do not need it.

## Why not a volume for database data

A volume can keep files between deploys, but it is still file storage. It is useful for temporary uploads, generated exports, cache files or logs.

User accounts, sessions, subscriptions, usage limits, billing events, workspaces, ideas and future Instagram sync data should live in Postgres.

## What the backend creates

On first boot with `DATABASE_URL`, the backend creates:

```sql
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

If there is no row for `APP_STATE_KEY`, it seeds the row from `backend/data/db.json`.

## Next step

After demo access and subscriptions are finalized, split the JSONB state into real normalized tables:

- users
- sessions
- workspaces
- memberships
- plans
- subscriptions
- usage_counters
- ai_jobs
- instagram_accounts
- sync_jobs
- billing_events
