# Open issues

Last updated: **2026-07-17**

## Required before Build Week submission

- Complete one final signed-out English coffee-shop flow in production.
- Confirm that the branch tip containing UI/docs integration `be3ab33`, not only baseline `3529d80`, is deployed by Railway.
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

## Repository hygiene

- `backend/data/db.json` is local runtime state and must not be committed.
- `src/main.jsx`, `src/styles.css`, and `backend/server.js` remain large; refactor only for a concrete need.
- Production PostgreSQL storage uses a transactional JSONB application-state document; normalized tables are future scaling work.
- Keep English and Ukrainian system copy complete and unmixed.
- The non-blocking main-bundle size warning can remain until after submission unless the final demo reveals a visible performance problem.
