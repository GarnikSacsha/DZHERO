# DZHERO Agent Studio — judge guide

Last updated: **2026-07-17**

## What to evaluate

DZHERO Agent Studio turns one grounded short-form signal into:

- one complete, shoot-ready Reel;
- two distinct creative directions;
- a quality evaluation and bounded revision;
- an optional owner-directed Hybrid;
- a connected seven-day plan;
- an explicit human-approved write to the existing Content Plan.

The differentiator is the accountable chain from source evidence to a production-ready weekly package, not the number of animated agents.

## Current judge environment

- Public application: [https://openaibuildweek.up.railway.app](https://openaibuildweek.up.railway.app)
- Production storage: PostgreSQL.
- Fresh-signal discovery: deployed with scheduled worker enabled.
- Public source paths manually verified on 2026-07-17: YouTube and TikTok.
- Branch: `hackathon/openai-build-week`.
- Baseline before final UI/docs: `3529d80`; use the verification record for the final deployed commit.

## Recommended evaluation path

1. Enter the prepared English coffee-shop workspace.
2. Open **Signals** and inspect the fresh-signal bank. **Find fresh signals** performs a real budget-bounded provider run; use it only if live provider latency/cost is appropriate.
3. Open **Agent Studio · Beta** and choose **New run** if a previous package is visible.
4. Choose **Adapt a Reel** and use the prepared verified public source.
5. Use the weekday-morning-visits objective.
6. Start the team and inspect the persisted stage rail and agent activity.
7. Open grounded evidence, the full shot-by-shot hero, and the quality gate.
8. Select two directions and create a Hybrid.
9. Approve the full Hybrid package.
10. Open Content Plan and confirm seven distinct items.
11. Inspect the run usage summary.

**Find fresh signals** and **Choose from my Signals** are intentionally different:

- **Find fresh signals** discovers and saves new signal-bank items.
- **Choose from my Signals** asks Trend Analyst to select from the current workspace bank for a stated objective.

## Local setup

Requirements:

- Node.js 22 or newer;
- npm;
- server-side OpenAI and Gemini credentials;
- Apify credentials for Instagram/TikTok resolution and discovery.

From the repository root:

```powershell
npm install
Copy-Item .env.example .env
```

For the isolated Build Week profile, set:

```dotenv
VITE_API_URL=http://127.0.0.1:3100/api
PORT=3100
CLIENT_URL=http://127.0.0.1:5180
ENABLE_AGENT_STUDIO=true
OPENAI_AGENT_MODEL=gpt-5.6
```

Add secret values only to `.env`; never commit them and never expose provider keys through a `VITE_` variable.

Start two terminals:

```powershell
npm run dev:backend
npm run dev:build-week
```

Open `http://127.0.0.1:5180/`. The standard development profile remains frontend `5173` and backend `3000`.

## Verification

```powershell
npm run test:agent-studio
npm run build
```

The Agent Studio API test uses deterministic stub providers and does not spend external API credits. `npm run audit:ui -- --theme light` is available for a broader browser audit; `--live` can consume provider credits.

See the [verification record](openai-build-week-verification.md) for measured results and final submission fields.

## Architecture in one minute

```text
React workspace
  -> authenticated workspace API
  -> persisted bounded run state
  -> OpenAI specialist agents (GPT-5.6)
  -> Gemini video evidence
  -> Critic quality gate
  -> optional Hybrid pass
  -> human approval
  -> existing Content Plan
```

OpenAI agents own reasoning and production. Gemini owns video observation. Apify-backed resolution is used where a public social platform requires it. The backend owns state, schemas, budgets, limits, error classification, persistence, and writes.

Production uses PostgreSQL; the current adapter stores a transactional JSONB application-state document. Local development uses the JSON file only when `DATABASE_URL` is absent.

## Honest limitations

- Active progress uses polling.
- The last run remembered in the current browser is restored after refresh; there is no cross-device latest-run discovery.
- Interrupted active work becomes an explicit retryable failure after backend restart; there is no distributed queue.
- Public platforms can block or revoke media retrieval.
- USD usage totals are estimates except where a provider reports cost.
- DZHERO does not autonomously publish content.

## Build Week extension boundary

Before Build Week, DZHERO already had Signals, Studio, Brand Brain, Jeryk, Content Plan, auth, billing, and localization.

The documented Build Week extension includes Agent Studio, OpenAI multi-agent orchestration, structured contracts, Hybrid Producer, Critic revision requirements, approval rules, safe agent trace, provider usage telemetry, and fresh-signal discovery.

## Repository access

The final repository must be public or, if private, shared with both:

- `testing@devpost.com`
- `build-week-event@openai.com`

The final branch and deployed commit must be recorded in the [verification record](openai-build-week-verification.md). Demo-account instructions should not be committed if they contain a reusable password; provide them through the submission's supported private field instead.
