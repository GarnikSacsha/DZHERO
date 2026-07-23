# Open issues

Last updated: **2026-07-24**

## Required before Build Week submission

- Complete one final signed-out English coffee-shop flow in production.
- Confirm in the Railway dashboard that the exact final backend revision is deployed. The July 20 frontend comparison matches the current Build Week code, but `a22a955` is server-only and cannot be proven from static assets.
- Verify the demo workspace has no private customer data, personal billing details, or keys.
- Make the repository public or share the private repository with `testing@devpost.com` and `build-week-event@openai.com`.
- Record a public YouTube demo no longer than three minutes with voiceover covering the product, Codex, and GPT-5.6.
- Run Codex `/feedback` in the primary build task and save the Session ID.
- Complete and submit the Devpost entry before July 21, 2026 at 5:00 PM Pacific Time.

## Completed on 2026-07-16/17

- Deployed the frontend/backend on Railway with PostgreSQL-backed state.
- Enabled the scheduled fresh-signal discovery worker.
- Added a separately labelled **Find fresh signals** action inside Signals.
- Balanced discovery across accounts, keywords, hashtags, trends, Instagram, and TikTok with daily budgets and bounded downloads.
- Added Agent Studio **New run** reset behavior.
- Fixed authenticated transfer of restricted Apify TikTok media into Gemini Files.
- Manually verified YouTube and TikTok Agent Studio source flows.

## Provider and evidence risks

- Public YouTube, Instagram, and TikTok media can become unavailable or blocked.
- Continue distinguishing observed video evidence from metadata and user notes.
- Keep source errors classified and user-facing.
- Use a verified backup public URL or saved rehearsal result for the recorded demo, and label saved output honestly.

## Product improvements after submission

- Discover and restore the latest workspace run across browsers and devices; the current browser already restores its remembered run after refresh.
- Move active work to a durable background queue.
- Add team approvals and version comparison.
- Feed measured content performance into future signal selection.
- Use accumulated per-agent telemetry to evaluate model routing.

## Public beta deployment

- Set `SHARED_SIGNAL_BANK_WORKSPACE_ID` to the workspace containing the curated signal bank (preferred), or set `SHARED_SIGNAL_BANK_OWNER_EMAIL` as a fallback.
- Keep `ENABLE_BILLING_PURCHASES=false` until checkout is intentionally launched.
- Keep `ENABLE_AGENT_STUDIO=false` on the public product; the separate Build Week deployment may keep it enabled.
- Configure a real `GEMINI_API_KEY` in the public Railway service. Model/base overrides are optional and should only be set intentionally; missing or failed Gemini now returns an honest typed 503/502 instead of mock success.
- Monitor provider cost against the Free Trial safety ceiling of 250 provider attempts per Kyiv day per workspace.
- Daily quota reservations use the current single-process serialized JSONB state model. Revisit atomic reservation storage before running multiple application replicas.

## Repository hygiene

- `backend/data/db.json` is local runtime state and must not be committed.
- `src/main.jsx`, `src/styles.css`, and `backend/server.js` remain large; refactor only for a concrete need.
- Production PostgreSQL storage uses a transactional JSONB application-state document; normalized tables are future scaling work.
- Keep English and Ukrainian system copy complete and unmixed.
- The non-blocking main-bundle size warning can remain until after submission unless the final demo reveals a visible performance problem.
