# DZHERO Agent Studio — judge guide

## What to evaluate

DZHERO Agent Studio turns one grounded short-form signal into:

- one complete, shoot-ready Reel;
- two distinct creative directions;
- a quality evaluation and bounded revision;
- an optional owner-directed Hybrid;
- a connected seven-day plan;
- an explicit human-approved write to the existing Content Plan.

The clearest differentiator is the accountable chain from source evidence to a production-ready weekly package, not the number of animated agents.

## Recommended demo path

1. Enter the prepared coffee-shop workspace.
2. Open **Agent Studio · Beta**.
3. Choose **Adapt a Reel** and use the prepared public source.
4. Use the weekday-morning-visits objective.
5. Start the team and inspect the real stage rail and agent activity.
6. Open grounded evidence and the full shot-by-shot hero.
7. Select two directions and create a Hybrid.
8. Approve the full Hybrid package.
9. Open Content Plan and confirm seven new items.
10. Inspect the run usage summary.

The **Find from my Signals** entry currently selects from the workspace’s existing Signals. It is not presented as live whole-internet discovery.

## Local setup

Requirements:

- Node.js compatible with the checked-in lockfile;
- npm;
- server-side OpenAI and Gemini credentials;
- source-provider credentials for Instagram/TikTok resolution when those platforms are used.

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

Add secret values only to the local `.env`; never commit them.

Start two terminals:

```powershell
npm run dev:backend
npm run dev:build-week
```

Open `http://127.0.0.1:5180/`.

The standard development profile remains frontend `5173` and backend `3000`.

## Verification

```powershell
npm run test:agent-studio
npm run build
```

See the [verification record](openai-build-week-verification.md) for the last recorded result and focused commands.

## Architecture in one minute

```text
React UI
  → authenticated workspace API
  → persisted bounded run state
  → OpenAI specialist agents
  → Gemini video evidence tool
  → Critic quality gate
  → optional Hybrid pass
  → human approval
  → existing Content Plan
```

OpenAI agents own reasoning and production. Gemini owns video observation. Apify-backed resolution is used only where a public social platform requires it. The backend owns state, schemas, limits, error classification, persistence, and writes.

## Honest limitations

- Active progress uses polling.
- The latest run is persisted but is not automatically restored in the UI after a full page refresh.
- Interrupted active work becomes an explicit retryable failure after backend restart.
- Public platforms can block media retrieval.
- USD usage totals are estimates except where a provider reports cost.
- DZHERO does not autonomously publish content.

## Build Week extension boundary

Before Build Week, DZHERO already had Signals, Gemini Studio, Brand Brain, Jeryk, Content Plan, auth, billing, and localization.

Agent Studio, OpenAI multi-agent orchestration, structured contracts, Hybrid Producer, Critic revision requirements, approval rules, safe agent trace, and provider usage telemetry are the documented Build Week extension.

## Access note

The final submission must include either a public repository or the judge access requested by Devpost, plus a stable deployed demo or tested sandbox account. Those details will be added after deployment.
