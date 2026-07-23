# DZHERO

DZHERO is an AI producer for small businesses, creators, SMM specialists, and multi-brand teams. It turns real short-form content signals into brand-specific scripts, production instructions, and an actionable content plan.

## Product analytics and communication consent

The public product loads the anonymous-only DZHERO tracker v1.4. Page paths, allowlisted CTA identifiers, UTM attribution, an anonymous visitor ID, and successful-generation identifiers may be sent to the CRM; browser requests never contain email, Google subject, name, or avatar.

After verified Google sign-in, the DZHERO backend synchronizes verified identity to CRM with `DZHERO_CRM_API_URL` and `DZHERO_CRM_SYNC_TOKEN`. Users receive three independent, optional, unchecked communication preferences (product education, early-bird offers, and research invitations). They can skip the first prompt and later grant or revoke each preference in Settings → Email preferences. Product access never depends on these choices.

Contract checks:

```powershell
npm run test:crm-sync
npm run test:crm-sync-api
npm run test:crm-contract
npm run test:communication-preferences
npm run test:telemetry-adapter
npm run test:telemetry-identity
npm run test:telemetry-integration
```

## Public beta mode

The public product and the Build Week demo use the same codebase with server-side feature flags:

- Free Trial workspaces read an existing shared Signals bank and can adapt those signals without starting a new paid discovery run;
- the shared bank is projected into each trial workspace at read time, without copying database rows or exposing saved brand adaptations;
- paid discovery and advanced imports are rejected by the backend for plans without explicit discovery access;
- public Brand Scan uses public metadata and Gemini unless its optional paid source expansion is explicitly enabled;
- Agent Studio stays available on the Build Week deployment, while the public product shows it as disabled **Coming soon** when `ENABLE_AGENT_STUDIO=false`;
- checkout is disabled by default with `ENABLE_BILLING_PURCHASES=false`, so the pricing grid is visible but cannot create a payment.

Configure the production signal bank with `SHARED_SIGNAL_BANK_WORKSPACE_ID` or `SHARED_SIGNAL_BANK_OWNER_EMAIL`. The workspace id is preferred; the email fallback selects that user's workspace with the largest existing bank. If both are empty, the first `UNLIMITED_ACCESS_EMAILS` account is used as a safe owner-only fallback.

## OpenAI Build Week: Agent Studio Beta

Agent Studio is the Build Week extension inside the existing DZHERO product. It is an accountable multi-agent workflow that turns one real signal into:

- one complete, shoot-ready Reel;
- two meaningfully different creative directions;
- grounded video evidence;
- an independent quality evaluation;
- a connected seven-day content plan;
- an explicit human approval before any workspace write.

The extension is additive and feature-flagged. It does not replace the existing Signals, Gemini Studio, Brand Brain, Jeryk assistant, billing, or Content Plan.

**Current Build Week state (2026-07-20):** the full-stack application is deployed on Railway at [openaibuildweek.up.railway.app](https://openaibuildweek.up.railway.app), production state is backed by PostgreSQL, and the owner has manually verified both YouTube and TikTok Agent Studio source flows. The current verified code tip is `a22a955` on `hackathon/openai-build-week`. On July 20, the deployed frontend was matched exactly to the branch-tip production build after normalizing the expected Railway API URL and Windows/Linux SVG line endings. The exact backend revision must still be confirmed in the Railway deployment dashboard because the final `a22a955` change is server-only.

## Product flow

The owner starts in one of two modes:

- **Choose from my Signals** — Trend Analyst chooses the best existing signal in the current workspace for the stated business objective. In the current MVP this mode does not claim to search the whole internet in real time.
- **Adapt a Reel** — the owner selects an existing DZHERO signal or pastes a public YouTube, Instagram, TikTok, or other supported video URL.

Both modes enter the same bounded workflow:

```text
Trend Analyst
→ Gemini Video Analyst
→ Brand Strategist
→ Creative Producer
→ Critic
→ optional single revision
→ Content Planner
→ Jeryk Manager
→ human approval
```

Before approval, the owner can select exactly two creative directions and run **Hybrid Producer**. This is a real additional OpenAI agent pass followed by another Critic check, a fresh seven-day plan, and a new Jeryk review.

Compact alternatives are intentionally not treated as finished production scripts. They must be combined through Hybrid Producer before they can be approved. Only a full hero or hybrid package can be added to Content Plan.

## Why the architecture is multi-agent

The roles have different failure modes and should not approve their own work:

| Role | Responsibility |
| --- | --- |
| Trend Analyst | Selects the source mechanic that best fits the objective |
| Gemini Video Analyst | Extracts observed frames, audio, on-screen text, and uncertainty |
| Brand Strategist | Maps the transferable mechanic to Brand Brain and the local market |
| Creative Producer | Creates one complete hero Reel and two distinct alternatives |
| Hybrid Producer | Combines two owner-selected directions into a stronger full script |
| Critic | Enforces grounding, originality, brand fit, feasibility, language, and creative quality |
| Content Planner | Expands the accepted strategy into seven connected days |
| Jeryk Manager | Presents the final package and asks the human to approve it |

Every OpenAI specialist returns a strict Zod-validated artifact. The backend owns the state machine, limits, persistence, error classification, and workspace writes.

## Grounding and source handling

- YouTube URLs are passed to Gemini as native video input.
- Instagram and TikTok URLs are resolved through narrow Apify actors.
- Resolved media is downloaded server-side with provider authentication when required, uploaded temporarily to Gemini Files API for evidence extraction, and deleted after analysis.
- The backend still supports authenticated source-file recovery for blocked media, but the main Build Week UI is URL-first and does not expose manual upload as the primary flow.
- Metadata, user notes, and observed video evidence remain separate source types.
- If reliable evidence is unavailable, the run enters `needs_context` instead of inventing scenes.

Source pages, captions, transcripts, video frames, and metadata are treated as untrusted data, never as instructions.

## Creative quality system

Agent Studio includes a DZHERO Creative Playbook and a deterministic server-side quality gate.

The system requires:

- a visible pattern interrupt in the first two seconds;
- hook → tension → development → proof/reveal → CTA;
- at least three concrete shot-by-shot beats;
- specific framing, objects, actions, on-screen text, and voice-over;
- evidence references and Brand Brain references;
- one complete hero Reel and two mechanically different alternatives;
- production notes realistic for one person filming on a phone;
- no generic AI/agency copy or unsupported commercial claims.

Critic scores grounding, brand fit, originality, feasibility, language, commercial fit, hook strength, mechanic fidelity, and creative boldness.

A revision contract assigns stable `REV-*` identifiers to blocking issues. On the final pass, Critic must classify every remaining issue as:

- unresolved `REV-*`;
- `NEW_CRITICAL:` regression;
- non-blocking `SUGGESTION:`.

This prevents the evaluator from moving the goalposts or accepting a paraphrased unresolved blocker.

## Human approval and Content Plan

Approval is idempotent and accepts only production-ready hero or hybrid candidates.

After approval:

- exactly seven normalized posts are written once;
- day one includes the concept, hero hook, scenes, and production notes;
- every day includes its objective, hook, and CTA;
- Agent Studio displays a success state and an **Open Content Plan** action.

Agents cannot publish content or write to the workspace without this explicit human action.

## Provider usage telemetry

Each run records a bounded, deduplicated usage envelope for:

- OpenAI agent requests and token counts;
- Gemini video-analysis token counts;
- Apify provider-reported cost.

The public API exposes only a safe aggregate:

- provider call counts;
- input, cached input, output, thought, and total tokens;
- estimated OpenAI/Gemini cost;
- provider-reported Apify cost;
- telemetry completeness.

Raw provider payloads, prompts, API keys, response IDs, invocation IDs, and hidden reasoning are never exposed.

## Build Week extension versus the existing product

DZHERO existed before OpenAI Build Week. The product already included authenticated workspaces, Signals, Brand Brain, Gemini-powered adaptation, Jeryk, billing/usage controls, and Content Plan.

The isolated `hackathon/openai-build-week` branch adds:

- the Agent Studio state machine and workspace-scoped API;
- OpenAI Agents SDK specialists running on GPT-5.6;
- strict structured-output contracts;
- the Creative Playbook and deterministic quality gate;
- stable revision contracts;
- Gemini evidence and Apify source resolution;
- Hybrid Producer;
- honest production-ready approval rules;
- safe public orchestration trace;
- per-run provider usage telemetry;
- a separate English/Ukrainian Agent Studio interface;
- focused unit, integration, regression, and build verification;
- the judge, demo, and submission documentation package.

The dated branch history is the implementation record for the Build Week extension.

## How Codex contributed

Codex was the engineering partner for the Build Week extension. It:

- inspected the existing DZHERO architecture and isolated the work in a dedicated worktree;
- translated the product concept into schemas, state transitions, bounded agent roles, and tests;
- implemented the backend orchestration and React interface;
- diagnosed real provider, quality-gate, CORS, approval, and persistence failures;
- coordinated focused review agents for repository, UX, and telemetry audits;
- ran local and integration verification;
- prepared the documentation and submission package.

Human product decisions remained explicit: keep Agent Studio additive, use a deterministic state machine, separate OpenAI reasoning from Gemini evidence, allow only one automatic revision, preserve source honesty, and require human approval.

## Technology

- React 19 and Vite 8;
- Node.js and Express 5;
- OpenAI Agents SDK with GPT-5.6;
- Zod structured outputs;
- Gemini video understanding;
- Apify public-source resolution;
- JSON/Postgres state abstraction;
- workspace-scoped authentication and usage controls.

## Local setup

Requirements:

- Node.js 22 or newer;
- npm;
- server-side OpenAI and Gemini credentials;
- Apify token for Instagram/TikTok URL resolution.

Install:

```bash
npm install
```

Copy `.env.example` to `.env` and configure at minimum:

```text
OPENAI_API_KEY=...
OPENAI_AGENT_MODEL=gpt-5.6
GEMINI_API_KEY=...
APIFY_TOKEN=...
ENABLE_AGENT_STUDIO=true
AGENT_STUDIO_MAX_TURNS=12
AGENT_STUDIO_TIMEOUT_MS=90000
```

Never use a `VITE_` prefix for provider keys and never commit `.env`.

### Standard local profile

```text
Frontend: http://127.0.0.1:5173/
Backend:  http://127.0.0.1:3000/
API:      http://127.0.0.1:3000/api
```

```bash
npm run dev:backend
npm run dev
```

### Isolated Build Week profile

The local judge/demo profile used during Build Week keeps the branch separate from other DZHERO processes:

```text
VITE_API_URL=http://127.0.0.1:3100/api
PORT=3100
CLIENT_URL=http://127.0.0.1:5180
```

Start the backend, then the strict frontend port:

```bash
npm run dev:backend
npm run dev:build-week
```

Open `http://127.0.0.1:5180/` and choose **Open Agent Studio demo** or enter an authenticated workspace.

## Agent Studio API

Authenticated, workspace-scoped routes:

```text
GET  /api/workspaces/:workspaceId/agent-studio/config
POST /api/workspaces/:workspaceId/agent-studio/uploads
POST /api/workspaces/:workspaceId/agent-studio/runs
GET  /api/workspaces/:workspaceId/agent-studio/runs/:runId
POST /api/workspaces/:workspaceId/agent-studio/runs/:runId/retry-source
POST /api/workspaces/:workspaceId/agent-studio/runs/:runId/source-file
POST /api/workspaces/:workspaceId/agent-studio/runs/:runId/context
POST /api/workspaces/:workspaceId/agent-studio/runs/:runId/cancel
POST /api/workspaces/:workspaceId/agent-studio/runs/:runId/hybrid
POST /api/workspaces/:workspaceId/agent-studio/runs/:runId/approve
```

Upload routes are authenticated recovery primitives. The main Agent Studio UI remains URL-first.

## Verification

Run the complete Agent Studio suite:

```bash
npm run test:agent-studio
npm run build
```

Focused commands:

```bash
npm run test:agent-studio-quality
npm run test:agent-studio-usage
npm run test:agent-studio-ui
node scripts/test-agent-studio-api.mjs
```

The API test starts a temporary local backend with deterministic stub providers and spends no external API credits.

With the local frontend and backend running, the reusable Playwright UI/UX audit clicks through every primary page at desktop, laptop, and mobile widths:

```bash
npm run audit:ui -- --theme light --output ./ui-audit-artifacts
```

Add `--viewport mobile`, `--theme dark`, or `--resume <run-id>` for focused visual regression checks. `--live` performs the real Agent Studio Hybrid and approval flow and can consume provider credits.

The following smoke check makes a bounded live OpenAI call and consumes API credits:

```bash
npm run smoke:agent-studio-openai
```

## Verified reference run

On July 16, 2026, a real local coffee-shop run completed the full flow:

- status: `completed`;
- approved candidate: full hybrid;
- Critic decision: `accept`;
- seven Content Plan days written;
- 11 OpenAI calls, 1 Gemini call, and 1 Apify call;
- 51,627 input tokens and 8,626 output tokens;
- estimated OpenAI/Gemini cost: approximately `$0.492`;
- provider-reported Apify cost: approximately `$0.001`.

Provider latency and cost vary by source, model output, revisions, and Hybrid usage. These numbers are a verified reference, not a promise.

On July 17, 2026, the owner also manually verified public YouTube and TikTok inputs through the Agent Studio workflow after the authenticated Apify media-transfer fix in `3529d80`.

On July 20, 2026:

- all nine deterministic Agent Studio suites passed without external provider calls;
- the production build passed with only the documented non-blocking bundle-size warning;
- the public homepage, Terms, Privacy, and `/api/health` returned HTTP 200;
- `/api/health` reported `ok: true` and `storage: postgres`;
- the Railway frontend matched the current Build Week branch-tip build after environment and line-ending normalization.

A final signed-out production rehearsal is still required before submission.

## Judge and submission documentation

Start with [docs/hackathon/README.md](docs/hackathon/README.md).

The package includes:

- judge runbook;
- sub-three-minute demo script;
- Devpost submission copy;
- verification evidence;
- ownership and licensing statement;
- final pre-submission checklist;
- architecture and implementation record.

## Current limitations

- Active runs use polling rather than server-sent events.
- The current browser restores its remembered Agent Studio run after refresh, but there is no cross-device latest-run discovery.
- A backend restart converts an interrupted active run into an explicit retryable failure; there is no distributed job queue.
- Public platforms can block media retrieval.
- OpenAI/Gemini USD amounts are rate-card estimates; Apify cost is provider-reported.
- Autonomous publishing and automatic Brand Brain changes are intentionally excluded.

## Post-hackathon roadmap

- discover and restore the latest workspace run across browsers and devices;
- compare model routing only after collecting more real per-agent telemetry;
- add team approval roles and version comparison;
- feed measured post performance back into future signal selection;
- move long-running work to a durable job queue.

Signals now includes an explicit **Find fresh signals** flow. It pulls a budget-bounded, mixed batch from connected accounts, brand keywords, hashtags, and trend searches across Instagram and TikTok; the same planner also powers scheduled discovery when the background worker is enabled.

## License

The repository is source-available for evaluation and judging. It is not open-sourced for unrestricted reuse. See [LICENSE](LICENSE).
