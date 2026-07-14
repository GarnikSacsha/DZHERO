# DZHERO Agent Studio Beta — Implementation Plan

**Goal:** Add an isolated, judge-ready multi-agent experience without changing the existing Studio/remix behavior.

**Architecture:** A new backend service owns a bounded `AgentStudioRun` state machine. OpenAI Agents SDK agents return Zod-validated artifacts; Gemini remains a function tool for video evidence. New workspace-scoped routes create, poll, continue, cancel, and approve runs. A new `agent-studio` React page renders two entry modes, real progress, a safe trace, the creative package, and approval to the existing Content Plan.

**Stack:** Node.js/CommonJS, Express, `@openai/agents`, Zod 4, React 19, Vite, existing JSON/Postgres state abstraction.

## Task 1: SDK, configuration, and contracts

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Create: `backend/services/agentStudioSchemas.cjs`
- Create: `scripts/test-agent-studio-schemas.cjs`

**Steps:**

1. Write failing contract tests for input normalization, evidence source labels, creative bundle cardinality, public trace redaction, and final package validation.
2. Install `@openai/agents` and Zod 4.
3. Implement strict Zod schemas and safe parse helpers.
4. Document only variable names/defaults in `.env.example`; never add secrets.
5. Run `node scripts/test-agent-studio-schemas.cjs` and `node --check` on new CommonJS files.
6. Commit: `feat: add agent studio contracts`.

## Task 2: Pure orchestration state machine

**Files:**

- Create: `backend/services/agentStudioRun.cjs`
- Create: `scripts/test-agent-studio-run.cjs`

**Steps:**

1. Write failing tests for valid transitions, forbidden skips, context pause/resume, cancellation, one repair, one critic revision, classified errors, idempotent approval, and safe public serialization.
2. Implement run creation, transitions, trace appends, artifact assignment, failure classification, interruption recovery, and approval markers as pure functions.
3. Ensure public serialization excludes prompts, secrets, provider payloads, and hidden reasoning.
4. Run both Agent Studio test scripts.
5. Commit: `feat: add bounded agent studio run state`.

## Task 3: OpenAI manager and specialists

**Files:**

- Create: `backend/services/agentStudioAgents.cjs`
- Create: `backend/services/agentStudioPrompts.cjs`
- Create: `scripts/fixtures/agent-studio-coffee-shop.cjs`
- Create: `scripts/test-agent-studio-orchestrator.cjs`

**Steps:**

1. Write mocked orchestration tests for both input modes, specialist ordering, structured outputs, critic revision, and a final seven-day plan.
2. Load `@openai/agents` through dynamic import so the CommonJS backend remains unchanged.
3. Define Jeryk as manager and specialists as bounded tools: Trend Analyst, Brand Strategist, Creative Producer, Critic, and Content Planner.
4. Use `OPENAI_AGENT_MODEL`, defaulting to `gpt-5.6`, and Zod output types.
5. Expose dependency injection for all provider calls so tests never spend credits.
6. Add a deterministic coffee-shop fixture for UI/dev/demo recovery, clearly marked as fixture data.
7. Run mocked orchestration tests.
8. Commit: `feat: orchestrate dzhero specialist agents`.

## Task 4: Gemini video evidence tool

**Files:**

- Create: `backend/services/agentStudioVideoTool.cjs`
- Create: `scripts/test-agent-studio-video-tool.cjs`
- Reuse: Gemini helpers and source metadata patterns in `backend/server.js` and `backend/services/remixEngine.js`

**Steps:**

1. Write tests for a reliable analysis, metadata-only analysis, unavailable video, malformed provider output, and user-note evidence.
2. Implement Gemini evidence extraction with explicit source types and confidence.
3. Return `needs_context` when evidence is insufficient; do not generate a silent fallback.
4. Wrap the video analysis function as an Agents SDK function tool available to Jeryk.
5. Run video tool and orchestration tests.
6. Commit: `feat: ground agent studio with video evidence`.

## Task 5: Workspace persistence and isolated API

**Files:**

- Modify: `backend/server.js`
- Create: `scripts/test-agent-studio-api.cjs`

**Steps:**

1. Write API tests for feature/config status, authenticated workspace access, create, poll, context, cancel, approve, cross-workspace denial, and idempotent Content Plan writes.
2. Add `agentStudioRuns` to the normalized DB shape.
3. Add the expensive limiter for run creation/context.
4. Add isolated routes under `/api/workspaces/:workspaceId/agent-studio`.
5. Start orchestration asynchronously after the initial run is persisted; persist only safe validated artifacts.
6. On startup/read, mark stale active runs as retryable interruption failures rather than pretending to resume.
7. Map approval into normalized existing Content Plan posts and store the approval write id.
8. Run API tests plus existing auth/workspace/content-plan tests.
9. Commit: `feat: expose isolated agent studio api`.

## Task 6: English-first Agent Studio UI

**Files:**

- Create: `src/AgentStudioPage.jsx`
- Create: `src/agentStudioUi.mjs`
- Create: `scripts/test-agent-studio-ui.mjs`
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

**Steps:**

1. Write pure UI-state tests for stage labels, terminal states, polling decisions, context requests, and safe result mapping.
2. Add `agent-studio` to the allowed app pages and sidebar with a `Beta` marker, without replacing `Studio`.
3. Build the two entry cards: `Find a trend for me` and `Adapt a Reel`.
4. Implement create/poll/context/cancel/approve calls with abort-safe effects and workspace-change guards.
5. Render real stage progress, specialist cards, safe trace, evidence, one hero Reel, two alternatives, the seven-day plan, and error recovery.
6. Keep all beta copy in the existing localization path; provide complete English and Ukrainian strings.
7. Add focused responsive styles.
8. Run UI-state tests, i18n checks, and Vite build.
9. Commit: `feat: add agent studio beta experience`.

## Task 7: Live provider smoke test and budget guard

**Files:**

- Create: `scripts/smoke-agent-studio-openai.cjs`
- Modify: `.env.example`
- Modify: `README.md`

**Steps:**

1. Add a smoke script that validates configuration, runs the cheapest bounded structured agent call needed to prove credentials/model access, and prints no secret.
2. Add timeout, max-turn, and per-run attempt limits before any live call.
3. Run the smoke test once with the personal Build Week project.
4. If the API reports quota/model access issues, surface the exact safe category and keep mocked/local work unblocked.
5. Document local setup, architecture, Gemini/OpenAI roles, and how to run the demo.
6. Commit: `docs: add build week agent studio runbook`.

## Task 8: Full verification and demo package

**Files:**

- Modify: `README.md`
- Create: `docs/hackathon/openai-build-week-demo-script.md`
- Create: `docs/hackathon/openai-build-week-submission.md`

**Steps:**

1. Run all new Agent Studio tests.
2. Run existing auth, workspace, remix, Gemini, content-plan, i18n, and billing regression scripts.
3. Run `node --check backend/server.js` and `npm.cmd run build`.
4. Run the complete coffee-shop journey locally in English and capture actual timings.
5. Write a sub-three-minute demo script that shows both entry modes but fully executes one hybrid coffee-shop story.
6. Document honest fallback behavior and distinguish live results from fixture recovery.
7. Review Git diff for secrets and confirm `.env`/`backend/data/db.json` remain ignored.
8. Commit: `docs: prepare OpenAI Build Week submission`.
