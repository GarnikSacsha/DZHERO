# Backend

This is the first backend skeleton for Dzhero.

## Current purpose

The backend is not production-ready yet. It is a starting API layer for the MVP:

- health check;
- local MVP auth;
- plans/subscriptions/usage limits;
- workspaces;
- business brief;
- competitors;
- reels;
- ideas.

Data is stored in `backend/data/db.json` for now. This should later be replaced with a real database.

## Run API

```bash
npm run dev:backend
```

API URL:

```text
http://127.0.0.1:3000
```

## Endpoints

```text
GET  /api/health
GET  /api/schema
GET  /api/auth/meta/start
GET  /api/auth/meta/callback
GET  /api/auth/meta/status
POST /api/auth/register
POST /api/auth/login
POST /api/auth/demo
GET  /api/auth/me
POST /api/auth/logout
GET  /api/billing/plans
GET  /api/workspaces
POST /api/workspaces
GET  /api/workspaces/:workspaceId/billing
POST /api/workspaces/:workspaceId/billing/select-plan
GET  /api/workspaces/:workspaceId/billing/checkout
POST /api/workspaces/:workspaceId/billing/manual-activate
POST /api/admin/testers/grant
GET  /api/admin/testers
GET  /api/workspaces/:workspaceId/brief
PUT  /api/workspaces/:workspaceId/brief
GET  /api/workspaces/:workspaceId/sources
POST /api/workspaces/:workspaceId/sources
POST /api/workspaces/:workspaceId/sources/:sourceId/sync
GET  /api/workspaces/:workspaceId/competitors
POST /api/workspaces/:workspaceId/competitors
GET  /api/workspaces/:workspaceId/reels
POST /api/workspaces/:workspaceId/reels/:reelId/analyze
POST /api/workspaces/:workspaceId/reels/:reelId/generate-ideas
GET  /api/workspaces/:workspaceId/ideas
POST /api/workspaces/:workspaceId/ideas
POST /api/workspaces/:workspaceId/remix/generate
```

## Demo workspace

```text
ws_demo_ua
```

## Plans and limits

The MVP has a billing/entitlements layer before real payments are connected.

Plans:

- `demo`
- `starter`
- `pro`
- `agency`

Usage is tracked per workspace and month. The first enforced limits are:

- `agentChat`
- `reelImports`
- `competitors`

Check current plan and remaining usage:

```text
GET /api/workspaces/ws_demo_ua/billing
```

Payment provider integration is not active yet. `select-plan` records a pending payment intent. `manual-activate` is protected by `ADMIN_TOKEN` and is only for internal testing before WayForPay/Fondy/another provider is connected.

Manual card checkout is controlled by deployment variables:

```text
PAYMENT_CARD_NUMBER=
PAYMENT_CARD_HOLDER=
PAYMENT_CARD_URL=
PAYMENT_SUPPORT_URL=
PAYMENT_NOTE_PREFIX=Dzhero
```

Tester/full access can be granted by an admin token:

```bash
curl -X POST https://dzhero.com.ua/api/admin/testers/grant \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"email":"tester@example.com","planId":"agency","days":90}'
```

If the user does not exist yet, pass `workspaceId` instead of `email`.

## Meta Login setup

Create a Meta Developer app and set these backend environment variables:

```text
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=http://127.0.0.1:3000/api/auth/meta/callback
META_SCOPES=instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement
```

The current implementation builds the OAuth URL, receives the callback code, exchanges it for a token, reads linked pages with Instagram Business/Creator accounts, stores connected account metadata, and creates a `meta_account_discovery` sync job.

Check setup and connected accounts:

```text
GET /api/auth/meta/status?workspaceId=ws_demo_ua
```

## Source sync and AI layer

The MVP now has a first data-source pipeline:

1. create source;
2. sync source into an imported reel;
3. analyze reel score, quality gate and copy risk;
4. generate ideas from that reel;
5. send selected idea to remix generation.

Example:

```text
POST /api/workspaces/ws_demo_ua/sources
POST /api/workspaces/ws_demo_ua/sources/:sourceId/sync
POST /api/workspaces/ws_demo_ua/reels/:reelId/analyze
POST /api/workspaces/ws_demo_ua/reels/:reelId/generate-ideas
```

## Next backend steps

1. Split routes into modules.
2. Add validation layer.
3. Add real database.
4. Replace local MVP auth with production auth/session storage.
5. Replace manual source sync with real scheduled imports.
6. Add persistent queue/worker for sync jobs.
7. Connect AI scoring/remix endpoints to production model config and monitoring.
