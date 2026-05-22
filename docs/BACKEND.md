# Backend

This is the first backend skeleton for Dzhero.

## Current purpose

The backend is not production-ready yet. It is a starting API layer for the MVP:

- health check;
- local MVP auth;
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
POST /api/auth/register
POST /api/auth/login
POST /api/auth/demo
GET  /api/auth/me
POST /api/auth/logout
GET  /api/workspaces
POST /api/workspaces
GET  /api/workspaces/:workspaceId/brief
PUT  /api/workspaces/:workspaceId/brief
GET  /api/workspaces/:workspaceId/competitors
POST /api/workspaces/:workspaceId/competitors
GET  /api/workspaces/:workspaceId/reels
GET  /api/workspaces/:workspaceId/ideas
POST /api/workspaces/:workspaceId/ideas
```

## Demo workspace

```text
ws_demo_ua
```

## Meta Login setup

Create a Meta Developer app and set these backend environment variables:

```text
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=http://127.0.0.1:3000/api/auth/meta/callback
META_SCOPES=instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement
```

The current implementation builds the OAuth URL and receives the callback code. The next backend step is exchanging the code for an access token, reading connected Instagram Business/Creator accounts, and creating a workspace session.

## Next backend steps

1. Split routes into modules.
2. Add validation layer.
3. Add real database.
4. Replace local MVP auth with production auth/session storage.
5. Finish Meta Login token exchange and Instagram account discovery.
6. Add sync jobs table/queue.
7. Add AI scoring endpoints.
