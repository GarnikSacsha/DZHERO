# Backend

This is the first backend skeleton for InstaProducer.

## Current purpose

The backend is not production-ready yet. It is a starting API layer for the MVP:

- health check;
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

## Next backend steps

1. Split routes into modules.
2. Add validation layer.
3. Add real database.
4. Add auth/users/workspaces properly.
5. Add Meta Login sandbox.
6. Add sync jobs table/queue.
7. Add AI scoring endpoints.
