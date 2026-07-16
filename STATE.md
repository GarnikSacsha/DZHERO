# DZHERO technical state

Last updated: **2026-07-17**

## Git

```text
Repository: https://github.com/GarnikSacsha/insta-producer-.git
Branch:     hackathon/openai-build-week
Baseline:   3529d80 fix: authenticate Apify TikTok media downloads
UI/docs:    be3ab33 feat: polish Build Week judge experience
```

Use `git log -1 --oneline` as the source of truth for the final judge checkout because the verification-record commit follows the UI/docs implementation commit above.

## Runtime profiles

Standard local profile:

```text
Frontend: http://127.0.0.1:5173/
Backend:  http://127.0.0.1:3000/
```

Isolated Build Week profile:

```text
Frontend: http://127.0.0.1:5180/
Backend:  http://127.0.0.1:3100/
```

Production:

```text
Application: https://openaibuildweek.up.railway.app
Health:      https://openaibuildweek.up.railway.app/api/health
Storage:     PostgreSQL
```

Start locally:

```powershell
npm install
npm run dev:backend
npm run dev:build-week
```

Verify:

```powershell
npm run test:agent-studio
npm run build
```

## Architecture

- React 19 and Vite 8 provide the workspace UI.
- Express 5 serves authenticated APIs and the production frontend bundle.
- OpenAI Agents SDK specialists produce, critique, plan, and manage Agent Studio artifacts.
- Gemini performs video observation.
- Apify resolves supported Instagram/TikTok sources and supplies fresh-signal discovery.
- The backend owns schemas, limits, retries, state transitions, persistence, safe serialization, and workspace writes.
- Production uses PostgreSQL with a transactional `app_state` JSONB document.
- Local development falls back to `backend/data/db.json` when `DATABASE_URL` is absent.

## Agent Studio state model

The workflow is bounded and persisted:

```text
Trend Analyst
-> Gemini Video Analyst
-> Brand Strategist
-> Creative Producer
-> Critic
-> optional single revision
-> Content Planner
-> Jeryk Manager
-> human approval
```

Only a production-ready hero or Hybrid package can be approved. Approval writes exactly seven normalized Content Plan items once.

## Signal discovery state

- Manual URL/API import remains available.
- **Find fresh signals** runs the same budget-aware planner on demand.
- The production worker is enabled for scheduled discovery.
- Discovery mixes connected accounts, brand keywords, hashtags, and trends across Instagram and TikTok.
- Per-workspace settings, leases, checkpoints, daily budgets, deduplication, and run history are persisted.

## Deployment notes

- Railway builds from `hackathon/openai-build-week` and serves the application on its assigned `PORT`.
- `DATABASE_URL` selects PostgreSQL; the JSON file is only the local fallback/seed.
- Provider keys remain server-side and must never use a `VITE_` prefix.
- The final deployed commit must be recorded in the verification document after Railway reports success.

## Known technical debt

- `src/main.jsx`, `src/styles.css`, and `backend/server.js` remain large.
- Cross-device latest-run discovery and a durable queue are post-hackathon work; the current browser already restores its remembered run after refresh.
- The current PostgreSQL adapter serializes one application-state document; normalized tables are a future scaling step.
- Route-level bundle splitting is deferred unless the final production rehearsal reveals a judge-visible problem.
