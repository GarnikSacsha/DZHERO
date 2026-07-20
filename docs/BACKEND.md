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
GET  /api/auth/google/start
GET  /api/auth/callback/google
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
GET  /api/owner/testers
POST /api/owner/testers
DELETE /api/owner/testers/:grantId
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
- `tester_pro` (internal only; never returned by the public plan catalog)

Usage is tracked per workspace and month. Enforced counters include:

- `aiOperations` (reserved before every paid AI provider attempt; failed attempts count)
- `agentChat`
- `reelImports`
- `competitors`

Check current plan and remaining usage:

```text
GET /api/workspaces/ws_demo_ua/billing
```

Payment provider integration is not active yet. In public beta, both `select-plan` and `checkout` return `billing_coming_soon` unless `ENABLE_BILLING_PURCHASES=true`. `manual-activate` remains protected by `ADMIN_TOKEN` for internal testing.

Manual card checkout is controlled by deployment variables:

```text
PAYMENT_CARD_NUMBER=
PAYMENT_CARD_HOLDER=
PAYMENT_CARD_URL=
PAYMENT_SUPPORT_URL=
PAYMENT_NOTE_PREFIX=Dzhero
ENABLE_BILLING_PURCHASES=false
```

Free Trial can use one shared, read-only signal bank without copying signals into every workspace:

```text
SHARED_SIGNAL_BANK_WORKSPACE_ID=
SHARED_SIGNAL_BANK_OWNER_EMAIL=
SHARED_SIGNAL_BANK_LIMIT=250
ENABLE_PUBLIC_APIFY_BRAND_SCAN=false
```

Use the workspace id when known. The owner-email fallback selects that user's workspace with the most saved signals; if neither shared-bank value is set, the first `UNLIMITED_ACCESS_EMAILS` account is used. Trial users cannot start automatic discovery or advanced provider imports through either the UI or direct API calls.

## Google login and Tester Pro

Google login is public. A normal new Google user receives the unchanged three-day trial. The landing page does not expose passwordless email login, and `POST /api/auth/email` does not exist.

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://dzhero.com.ua/api/auth/callback/google
GOOGLE_SCOPES=openid email profile
```

An account listed in `UNLIMITED_ACCESS_EMAILS` can open **Settings → Testers** and manage Tester Pro by Google email. A grant may be created before the tester's first sign-in; it becomes active only after the same verified Google email signs in. Grants do not expire automatically and are revoked manually.

Tester Pro limits:

- 50 paid AI provider attempts per month;
- 30 manual imports per month, with at most 5 results per manual Apify request;
- 5 competitors, 1 workspace, 1 team member, and 1 Instagram account;
- 10 Brand Brain saves and 50 content-plan posts per month;
- automatic Apify discovery targets up to 10 unique signals per UTC day (normally 5 Instagram + 5 TikTok), with one budget-consuming run and a hard USD 0.40 daily cap.

The owner account remains unlimited and is never converted to Tester Pro. Revoking a grant immediately restores the tester's unchanged base subscription/trial.

Owner session API:

```text
GET    /api/owner/testers
POST   /api/owner/testers              { "email": "tester@example.com", "note": "July feedback" }
DELETE /api/owner/testers/:grantId
```

The legacy admin-token endpoint remains available only for operational use and creates the same fixed internal Tester Pro grant (it cannot select Agency):

```bash
curl -X POST https://dzhero.com.ua/api/admin/testers/grant \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"email":"tester@example.com","note":"operational grant"}'
```

The email can be granted before the user exists. It remains pending until that verified Google account signs in.

## Public Brand Scan budget

The existing per-IP preview limiter is combined with a persistent platform-wide paid preview counter. When Apify or Gemini is configured, each preview attempt is reserved before paid work begins; failed attempts count.

```text
PUBLIC_PREVIEW_DAILY_LIMIT=10
PUBLIC_PREVIEW_GLOBAL_DAILY_LIMIT=20
```

After the global UTC-day limit is used, the API returns `429 preview_global_daily_limit_reached` and directs the visitor to Google sign-in.

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
