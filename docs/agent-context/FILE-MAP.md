# File Map

Last reviewed: **2026-07-17**

## Start files

- `AGENTS.md` - root pointer for new agents.
- `docs/agent-context/START-HERE.md` - read order and repo rules.
- `docs/agent-context/PROJECT-SNAPSHOT.md` - product and technical snapshot.
- `docs/agent-context/WORKING-MEMORY.md` - recent context from conversations.
- `docs/agent-context/OPEN-ISSUES.md` - known issues and next checks.

## Existing root docs

- `README.md` - current product, Agent Studio architecture, setup, API, verification, and limitations.
- `LICENSE` - source-available evaluation and judging terms.
- `CONTEXT.md` - product context.
- `REQ.md` - functional and non-functional requirements.
- `STATUS.md` - status snapshot.
- `STATE.md` - technical state snapshot.

## Existing docs folder

- `docs/MVP_TZ.md` - MVP technical/product spec.
- `docs/PRODUCT_FLOW.md` - MVP flow from brief to content plan and Direct.
- `docs/BACKEND.md` - legacy backend route notes; verify current behavior in `backend/server.js`.
- `docs/BACKEND_ROADMAP.md` - historical backend milestones and module plan.
- `docs/POSTGRES_STORAGE.md` - Postgres storage notes.

## Build Week package

- `docs/hackathon/README.md` - judge package index.
- `docs/hackathon/openai-build-week-judge-guide.md` - evaluation and local runbook.
- `docs/hackathon/openai-build-week-demo-script.md` - sub-three-minute demo.
- `docs/hackathon/openai-build-week-submission.md` - Devpost copy.
- `docs/hackathon/openai-build-week-verification.md` - measured evidence and final fields.
- `docs/hackathon/openai-build-week-ownership.md` - entrant and rights statement.
- `docs/hackathon/openai-build-week-submission-checklist.md` - final operations.

## Important frontend files

- `src/main.jsx` - main app UI and most screen logic.
- `src/AgentStudioPage.jsx` - Agent Studio UI and API integration.
- `src/agentStudioUi.mjs` - pure Agent Studio UI-state helpers.
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
- `backend/services/agentStudio*.cjs` - Agent Studio contracts, orchestration, video/source tools, quality, and usage.
- `backend/services/automaticDiscovery*.js` - fresh-signal planning, policy, and storage helpers.
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
npm.cmd run test:agent-studio
```

