# File Map

## Start files

- `AGENTS.md` - root pointer for new agents.
- `docs/agent-context/START-HERE.md` - read order and repo rules.
- `docs/agent-context/PROJECT-SNAPSHOT.md` - product and technical snapshot.
- `docs/agent-context/WORKING-MEMORY.md` - recent context from conversations.
- `docs/agent-context/OPEN-ISSUES.md` - known issues and next checks.

## Existing root docs

- `README.md` - legacy overview and commands. Some text may be mojibake.
- `CONTEXT.md` - product context.
- `REQ.md` - functional and non-functional requirements.
- `STATUS.md` - status snapshot.
- `STATE.md` - technical state snapshot.

## Existing docs folder

- `docs/MVP_TZ.md` - MVP technical/product spec.
- `docs/PRODUCT_FLOW.md` - MVP flow from brief to content plan and Direct.
- `docs/BACKEND.md` - backend routes and current backend skeleton.
- `docs/BACKEND_ROADMAP.md` - backend milestones and module plan.
- `docs/POSTGRES_STORAGE.md` - Postgres storage notes.

## Important frontend files

- `src/main.jsx` - main app UI and most screen logic.
- `src/styles.css` - app styling.
- `src/sourceContext.cjs` - source context cleanup and adaptation input handling.
- `src/data/uaMarket.js` - local/demo market data.

## Important backend files

- `backend/server.js` - Express API server and route wiring.
- `backend/services/remixEngine.js` - AI remix/adaptation generation.
- `backend/services/agentEngine.js` - AI agent/helper logic.
- `backend/services/scoringEngine.js` - signal scoring.
- `backend/services/usageLimits.cjs` - plan and usage limit checks.
- `backend/services/youtubePopularFallback.cjs` - YouTube category fallback logic.
- `backend/data/db.json` - local runtime DB. Do not commit casually.

## Tests and checks

- `scripts/test-source-context.js`
- `scripts/test-usage-limits.js`
- `scripts/test-youtube-popular-fallback.js`
- `scripts/check-calendar-overflow.js`

Run:

```powershell
node scripts/test-source-context.js
node scripts/test-usage-limits.js
node scripts/test-youtube-popular-fallback.js
npm.cmd run build
```

