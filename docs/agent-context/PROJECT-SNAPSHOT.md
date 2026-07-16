# Project Snapshot

## Product

DZHERO is an AI producer and workspace for short-form content research, adaptation, and planning. It helps Ukrainian businesses and content teams turn real market signals into brand-specific scripts and actionable content plans.

Core product surfaces:

- Signals;
- Gemini Studio;
- Agent Studio Beta;
- Brand Brain;
- Content Plan;
- Jeryk assistant;
- Settings, sources, billing, and auth.

## Build Week status

The `hackathon/openai-build-week` branch contains a working Agent Studio MVP.

Agent Studio supports:

- **Find from my Signals** from existing workspace Signals;
- **Adapt a Reel** from a saved signal or supported public URL;
- OpenAI specialist orchestration;
- Gemini video evidence;
- one full hero, two compact directions, and optional Hybrid;
- Critic quality gate with one bounded revision;
- seven-day planning;
- human approval into Content Plan;
- safe agent trace and provider usage telemetry.

A real provider-backed coffee-shop run completed Hybrid, approval, and seven Content Plan writes. See `docs/hackathon/openai-build-week-verification.md`.

## Stack

- Frontend: React 19, Vite 8, lucide-react, custom CSS.
- Backend: Node.js, Express 5, helmet, cors, express-rate-limit.
- Agent runtime: OpenAI Agents SDK, GPT-5.6, Zod structured contracts.
- Video evidence: Gemini.
- Social source resolution: Apify-backed services where required.
- Storage: local JSON DB for MVP, optional Postgres.

## Commands

Install and verify:

```powershell
npm install
npm run test:agent-studio
npm run build
```

Standard development profile:

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

```text
Frontend: http://127.0.0.1:5180/
Backend:  http://127.0.0.1:3100/
```

## Architecture rules

- Agent Studio remains additive and feature-flagged.
- OpenAI agents own reasoning and production; Gemini owns video observation.
- The backend owns state, schemas, retries, limits, persistence, errors, telemetry, and writes.
- Compact alternatives are Hybrid inputs, not directly approvable scripts.
- Only a full hero or Hybrid can write exactly seven Content Plan items.
- Missing evidence must pause or fail honestly.
- Raw prompts, hidden reasoning, secrets, and provider payloads never enter the public trace.

## Current limitations

- Polling rather than server-sent events.
- No automatic latest-run restoration after a full refresh.
- No durable distributed queue.
- Public social media can block retrieval.
- No autonomous publishing.

## Submission package

Start at `docs/hackathon/README.md`. Deployment, demo account, public video, repository access, `/feedback`, and Devpost submission remain final-stage operations.

## Security

- Never commit `.env` or secret values.
- Keep provider keys server-side.
- Do not stage `backend/data/db.json`; it contains local runtime state.
- Keep Agent Studio routes authenticated and workspace-scoped.
- Verify the production bundle and public API responses before deployment.
