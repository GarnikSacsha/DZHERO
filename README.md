# DZHERO

DZHERO is an AI content producer for small businesses, creators, SMM specialists, and multi-brand teams. It helps users discover market signals, adapt short-form video mechanics to their brand, turn ideas into shoot-ready scripts, and carry approved work into a practical content plan.

## OpenAI Build Week: Agent Studio Beta

Agent Studio is an isolated multi-agent workflow that turns one real short-form signal into a grounded, brand-specific Reel and a seven-day content package. It does not replace the existing Signals, Studio, Jeryk assistant, Gemini remix, Brand Brain, or Content Plan flows.

The user starts in one of two ways:

- **Find a trend for me** — the Trend Analyst selects the best existing signal for the business objective.
- **Adapt a Reel** — the user supplies an existing DZHERO signal, a public URL, or a labelled description of what happens in the Reel.

Both modes enter the same bounded production workflow:

`Trend Analyst → Gemini video evidence → Brand Strategist → Creative Producer → Critic → Content Planner → Jeryk Manager → human approval`

OpenAI Agents SDK runs the manager and specialist agents with strict Zod outputs. A deterministic backend state machine limits turns, output repair, and Critic revision. Gemini remains a narrow video-evidence specialist; observations, metadata, and user notes are stored as different evidence types. If video evidence is unavailable, the run pauses and asks the user for context instead of inventing scenes.

The final package contains:

- one complete hero Reel with a shot-by-shot script;
- two meaningfully different alternative concepts;
- a grounded evidence package and public-safe agent trace;
- an independent Critic evaluation;
- exactly seven connected content-plan days.

Nothing is written to the existing Content Plan until the user explicitly approves a candidate.

## Why DZHERO

A blank AI chat still asks a business owner to act as the trend researcher, strategist, scriptwriter, critic, and planner. DZHERO separates those responsibilities and turns research into an accountable workflow with visible evidence, bounded decisions, and a final human approval step.

The product starts from a business brief rather than a user's personal entertainment feed:

1. business objective;
2. business type and product;
3. geography and audience;
4. tone of voice;
5. competitors and target markets;
6. permitted data sources and calls to action.

## Existing product surfaces

- Home command center;
- global and local Signals;
- competitor and viral Reel banks;
- existing Gemini-powered Studio;
- Agent Studio Beta;
- Brand Brain;
- AI producer assistant;
- ideas and launch workflows;
- Content Plan;
- AI Direct and sales tools;
- analytics, sources, billing, and workspace settings.

## Technology

- React 19 and Vite;
- Node.js and Express;
- OpenAI Agents SDK with GPT-5.6;
- Zod structured outputs;
- Gemini video analysis;
- workspace-scoped authenticated APIs;
- JSON/Postgres state abstraction;
- lucide-react and custom responsive CSS.

## Local setup

Requirements:

- Node.js 22 or newer;
- npm;
- server-side OpenAI and Gemini API credentials for the live Agent Studio path.

Install dependencies:

```bash
npm install
```

Create a server-only `.env` from `.env.example` and provide:

```text
OPENAI_API_KEY=...
GEMINI_API_KEY=...
OPENAI_AGENT_MODEL=gpt-5.6
ENABLE_AGENT_STUDIO=true
AGENT_STUDIO_MAX_TURNS=12
AGENT_STUDIO_TIMEOUT_MS=90000
```

Never use a `VITE_` prefix for provider keys and never commit `.env`.

Run the backend and frontend in separate terminals:

```bash
npm run dev:backend
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

The backend API is available at:

```text
http://127.0.0.1:3000/api
```

Enter an authenticated workspace and choose **Agent Studio · Beta** in the sidebar.

## Agent Studio API

The Build Week path is isolated under authenticated, workspace-scoped routes:

```text
GET  /api/workspaces/:workspaceId/agent-studio/config
POST /api/workspaces/:workspaceId/agent-studio/runs
GET  /api/workspaces/:workspaceId/agent-studio/runs/:runId
POST /api/workspaces/:workspaceId/agent-studio/runs/:runId/context
POST /api/workspaces/:workspaceId/agent-studio/runs/:runId/cancel
POST /api/workspaces/:workspaceId/agent-studio/runs/:runId/approve
```

Approval writes exactly seven normalized posts to the existing Content Plan once. Repeating the same approval does not duplicate the package.

## Safety and honest degradation

- Source pages, captions, transcripts, metadata, video frames, and user notes are untrusted data, never instructions.
- Video observations, audio observations, on-screen text, metadata, and user notes remain separate evidence types.
- Creative scenes reference evidence ids; product decisions reference Brand Brain fields.
- Missing evidence moves the run to `needs_context`.
- Raw prompts, hidden reasoning, credentials, tokens, and provider payloads are excluded from the public trace.
- Every agent output is schema-validated before the next stage begins.
- One output repair and one Critic revision are permitted; the workflow cannot loop indefinitely.
- Agents have no database, filesystem, shell, publishing, or arbitrary network access.
- Workspace writes require explicit human approval.

## Verification

Run the focused Agent Studio suite:

```bash
node scripts/test-agent-studio-schemas.cjs
node scripts/test-agent-studio-run.cjs
node scripts/test-agent-studio-orchestrator.cjs
node scripts/test-agent-studio-video-tool.cjs
node scripts/test-agent-studio-api.mjs
npm run test:agent-studio-ui
npm run build
```

The following command makes one bounded live OpenAI request and therefore consumes API credits. It reports only safe configuration status and never prints the key:

```bash
npm run smoke:agent-studio-openai
```

The repository also contains regression coverage for authentication, workspace isolation, billing, remix quality, Gemini recovery, Content Plan behavior, and English/Ukrainian localization.

## Demo and submission material

- [Sub-three-minute demo script](docs/hackathon/openai-build-week-demo-script.md)
- [Devpost submission draft](docs/hackathon/openai-build-week-submission.md)
- [Agent Studio design](docs/superpowers/specs/2026-07-14-dzhero-agent-studio-build-week-design.md)
- [Implementation plan](docs/superpowers/plans/2026-07-14-dzhero-agent-studio-build-week.md)

## Important files

- `src/AgentStudioPage.jsx` — isolated Build Week UI.
- `src/agentStudioUi.mjs` — localized copy and pure UI state helpers.
- `backend/services/agentStudioAgents.cjs` — OpenAI specialist execution and orchestration.
- `backend/services/agentStudioRun.cjs` — bounded run state machine and safe serialization.
- `backend/services/agentStudioSchemas.cjs` — strict structured-output contracts.
- `backend/services/agentStudioVideoTool.cjs` — Gemini evidence extraction.
- `backend/server.js` — authenticated API, persistence, approval, and Content Plan integration.
- `.env.example` — configuration names and safe defaults only.

## Current limitations

- Agent Studio uses polling rather than server-sent events.
- Interrupted active runs become explicit retryable failures after a backend restart; automatic distributed resume is not part of the Build Week scope.
- Public platforms may block video retrieval. DZHERO asks for labelled user context in that case.
- Autonomous publishing and automatic Brand Brain changes are intentionally excluded.

## Next steps

- per-run token and cost telemetry;
- uploaded-video support;
- durable job queue and explicit retry;
- team approval roles and version comparison;
- post-performance feedback for future signal selection.
