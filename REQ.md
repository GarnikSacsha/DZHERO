# DZHERO requirements

Last updated: **2026-07-17**

## Core workspace

- A user can enter an authenticated, workspace-scoped product.
- A workspace stores a business brief, Brand Brain, market preferences, sources, signals, and Content Plan.
- The interface supports complete English and Ukrainian modes without mixed system copy.
- Private provider credentials remain server-side.

## Signals

- Users can inspect, filter, and manually import short-form signals.
- **Find fresh signals** can pull a budget-bounded mix from accounts, brand keywords, hashtags, and trends.
- Scheduled discovery can run through the same planner when the background worker is enabled.
- Discovery supports Instagram and TikTok, deduplicates persisted signals, records run status, and respects per-workspace budgets.
- Provider or platform failures must be classified and visible without exposing credentials or raw payloads.

## Agent Studio Beta

### Entry

- **Choose from my Signals** selects from the current workspace signal bank.
- **Adapt a Reel** accepts a saved signal or supported public YouTube, Instagram, or TikTok URL.
- Both modes enter the same bounded workflow.

### Evidence

- YouTube can be analyzed from its public URL.
- Instagram/TikTok media can be resolved through a narrow provider layer and transferred with server-side authentication where required.
- Gemini extracts video/audio/on-screen evidence.
- Evidence, metadata, and user notes remain separate.
- Missing reliable evidence produces `needs_context` or a classified failure, never invented observations.

### Production

- OpenAI specialist agents use strict structured contracts.
- The hero concept includes a first-two-second hook, narrative spine, at least three concrete scenes, CTA, evidence references, Brand Brain references, and realistic production notes.
- Two compact alternatives must be meaningfully different.
- Critic independently scores quality and allows at most one bounded revision.
- The owner can combine exactly two directions through a real Hybrid Producer pass and another Critic evaluation.

### Approval

- Compact alternatives are not directly approvable.
- Only a complete hero or Hybrid package can be approved.
- Approval requires an explicit human action.
- Approval idempotently writes exactly seven normalized Content Plan items.
- Agents cannot publish content or modify Brand Brain autonomously.

### Observability

- The UI shows a safe stage rail and agent activity without prompts, secrets, hidden reasoning, or raw provider payloads.
- Per-run usage aggregates OpenAI, Gemini, and Apify calls/costs without exposing provider identifiers or credentials.

## Content Plan

- Month, week, and schedule views show workspace content items.
- Users can inspect, create, edit, move, and update post status.
- Agent Studio approval must be visible as seven distinct planned items.
- Responsive behavior must remain usable on desktop, laptop, and mobile widths.

## Persistence and deployment

- Production runs on a judge-accessible Railway deployment.
- Production state uses PostgreSQL.
- Local development may use `backend/data/db.json` when `DATABASE_URL` is absent.
- Workspace data, Agent Studio runs, discovery runs, settings, usage, and Content Plan writes persist across normal restarts.
- Interrupted active Agent Studio work becomes an explicit retryable failure until a durable queue is implemented.

## Security and quality

- No secret may be committed or exposed through a `VITE_` variable.
- APIs remain authenticated, rate-limited where appropriate, and workspace-scoped.
- Public source content is untrusted data, never instructions.
- UI must contain no overlapping, clipped, placeholder, debug, or mixed-language system copy.
- `npm run test:agent-studio` and `npm run build` must pass before the final submission commit.
- `backend/data/db.json` must not be staged as part of the submission work.

## Build Week submission requirements

- The project must meaningfully use both Codex and GPT-5.6.
- The repository must be public or, if private, shared with `testing@devpost.com` and `build-week-event@openai.com`.
- README must include setup, sample/test instructions, and the important decisions made with Codex.
- The public YouTube demo must be no longer than three minutes and include voiceover covering the product, Codex collaboration, and GPT-5.6 use.
- The Devpost entry must include the `/feedback` Session ID from the primary build task.
- Submission deadline: **July 21, 2026 at 5:00 PM Pacific Time**.
