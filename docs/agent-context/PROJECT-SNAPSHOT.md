# Project snapshot

Last updated: **2026-07-17**

## Product

DZHERO is an AI producer and workspace for short-form content research, adaptation, production, and planning. The active Build Week branch adds Agent Studio Beta and fresh-signal discovery to the existing product.

Primary surfaces:

- Home;
- Signals and automatic discovery;
- Studio;
- Agent Studio Beta;
- Content Plan and calendar;
- Settings, Brand Brain, sources, auth, and billing/usage controls.

## Build Week implementation

Agent Studio supports:

- **Choose from my Signals** from the workspace signal bank;
- **Adapt a Reel** from a saved signal or supported public URL;
- OpenAI specialist orchestration with GPT-5.6;
- Gemini video evidence;
- YouTube and resolved Instagram/TikTok sources;
- one full hero, two compact directions, and optional Hybrid;
- Critic quality gate with one bounded revision;
- seven-day planning;
- human approval into Content Plan;
- safe agent trace and provider usage telemetry;
- **New run** reset and retryable classified source states.

Signals supports manual imports plus budget-bounded manual/scheduled discovery from accounts, keywords, hashtags, and trend lanes across Instagram and TikTok.

## Verified current state

- Branch: `hackathon/openai-build-week`.
- Pre-polish implementation baseline: `3529d80`.
- Railway application: `https://openaibuildweek.up.railway.app`.
- Production health checked 2026-07-17: HTTP 200, `storage: postgres`.
- Fresh-signal discovery is deployed; the production worker is enabled.
- The owner manually verified YouTube and TikTok Agent Studio flows on 2026-07-17.
- A reference run completed Hybrid, approval, and exactly seven Content Plan writes.

Do not call `3529d80` the final submission commit. Final UI, English-output, tests, and documentation integration is `be3ab33`; use the branch tip after the verification-record commit as the judge checkout.

## Stack

- Frontend: React 19, Vite 8, lucide-react, custom CSS.
- Backend: Node.js, Express 5, helmet, cors, express-rate-limit.
- Agent runtime: OpenAI Agents SDK, GPT-5.6, Zod contracts.
- Video evidence: Gemini.
- Social resolution/discovery: Apify-backed services.
- Production storage: PostgreSQL `app_state` JSONB document.
- Local fallback: `backend/data/db.json`.

## Commands

```powershell
npm install
npm run test:agent-studio
npm run build
```

Standard local profile:

```text
Frontend: http://127.0.0.1:5173/
Backend:  http://127.0.0.1:3000/
```

Isolated Build Week profile:

```dotenv
VITE_API_URL=http://127.0.0.1:3100/api
PORT=3100
CLIENT_URL=http://127.0.0.1:5180
```

```powershell
npm run dev:backend
npm run dev:build-week
```

## Architecture rules

- Agent Studio remains additive and feature-flagged.
- OpenAI agents own reasoning and production; Gemini owns video observation.
- The backend owns state, schemas, retries, budgets, persistence, errors, telemetry, and writes.
- Compact alternatives are Hybrid inputs, not directly approvable scripts.
- Only a full hero or Hybrid can write exactly seven Content Plan items.
- Missing evidence must pause or fail honestly.
- Raw prompts, hidden reasoning, secrets, and provider payloads never enter the public trace.

## Honest limitations

- Polling rather than server-sent events.
- The current browser restores its remembered run after refresh, but there is no cross-device latest-run discovery.
- No durable distributed queue.
- PostgreSQL currently stores a transactional JSONB application-state document rather than a normalized schema.
- Public social media can block retrieval.
- No autonomous publishing.

## Final operations

Start at `docs/hackathon/README.md`. Remaining user-owned operations are the final signed-out rehearsal, exact deploy/commit confirmation, repository judge access, public demo video, `/feedback`, and Devpost submission.

## Security

- Never commit `.env` or secret values.
- Keep provider keys server-side.
- Do not stage `backend/data/db.json`.
- Keep Agent Studio and discovery routes authenticated and workspace-scoped.
