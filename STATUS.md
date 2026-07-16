# DZHERO status

Last updated: **2026-07-17**

Active branch: `hackathon/openai-build-week`

Implementation baseline before the final UI/documentation pass: `3529d80`

## Current state

DZHERO is a working full-stack MVP, not a static prototype. The Build Week branch contains the existing product plus the feature-flagged **Agent Studio Beta** workflow.

Local Build Week profile:

```text
Frontend: http://127.0.0.1:5180/
Backend:  http://127.0.0.1:3100/
```

Judge-accessible deployment:

```text
https://openaibuildweek.up.railway.app
```

The production health endpoint was checked on 2026-07-17 and returned `ok: true` with `storage: postgres`.

## Implemented

- Responsive English/Ukrainian DZHERO workspace with authentication, themes, Signals, Studio, Agent Studio, Content Plan, and Settings.
- Workspace-scoped backend APIs with usage controls and provider configuration.
- Railway deployment serving the React build and Express API from one public service.
- PostgreSQL-backed production state; local development keeps a JSON-file fallback.
- Manual signal import and budget-bounded **Find fresh signals** discovery.
- Scheduled Instagram/TikTok discovery worker with accounts, keywords, hashtags, and trend lanes.
- Agent Studio multi-agent workflow using OpenAI Agents SDK and GPT-5.6.
- Gemini video evidence for public YouTube sources and resolved Instagram/TikTok media.
- Authenticated Apify media transfer for restricted TikTok assets.
- Creative Playbook, deterministic quality gate, one bounded revision, and optional Hybrid Producer.
- Human approval that idempotently writes exactly seven items to Content Plan.
- Safe agent activity trace and per-run OpenAI, Gemini, and Apify usage telemetry.
- Calendar month, week, and schedule experiences with post details and editing flows.
- Focused Agent Studio, discovery, localization, storage, UI-state, and build checks.

## Verified

- `npm run test:agent-studio` passed after the 2026-07-17 TikTok media-authentication fix.
- `npm run build` passed after the same fix.
- A provider-backed reference run completed Hybrid, Critic acceptance, approval, and a seven-item Content Plan write.
- The owner manually confirmed both YouTube and TikTok Agent Studio source flows on 2026-07-17.
- Production `/api/health` returns HTTP 200 and reports PostgreSQL storage.
- Fresh-signal discovery is deployed and the Railway worker is enabled.

See [the verification record](docs/hackathon/openai-build-week-verification.md) for measured evidence and the fields that must be refreshed during the final rehearsal.

## Required before submission

- Complete one final signed-out English production rehearsal.
- Confirm the exact final commit deployed by Railway after the UI/documentation commit.
- Check that the demo workspace contains no private customer or billing data.
- Record and publish the sub-three-minute demo video.
- Make the repository judge-accessible and identify the submitted branch/commit.
- Run Codex `/feedback`, save the Session ID, and complete the Devpost submission.

## Honest limitations

- Active Agent Studio progress uses polling rather than server-sent events.
- The current browser restores its remembered Agent Studio run after refresh, but there is no cross-device latest-run discovery.
- Long-running work does not yet use a durable distributed queue.
- Production state is stored in PostgreSQL as a transactional JSONB application-state document, not as a fully normalized multi-service schema.
- Public platforms can revoke or restrict media access; classified retry/context states remain necessary.
- DZHERO does not autonomously publish content.
- The main frontend bundle still produces a non-blocking size warning.

## Repository hygiene

- Never commit `.env` or provider credentials.
- Do not stage `backend/data/db.json`; it is local runtime/demo state.
- Treat `3529d80` as the pre-polish baseline, not the final submission commit.
