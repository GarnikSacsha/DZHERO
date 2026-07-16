# Open Issues

## Required before Build Week submission

- Repeat the English coffee-shop provider-backed judge flow.
- Deploy a stable frontend and backend.
- Create and test a judge demo workspace/account.
- Make the repository public or grant the judge access requested by Devpost.
- Record a public YouTube demo shorter than three minutes.
- Run Codex `/feedback` and save the Session ID.
- Complete and submit the Devpost entry before the deadline.

## Product improvements after the MVP

- Restore the latest persisted Agent Studio run automatically after a full page refresh.
- Move active work to a durable background queue.
- Add a separately labelled fresh-signal discovery pass; do not overload the current Signals selector.
- Add team approvals and version comparison.
- Feed measured content performance into future signal selection.
- Use accumulated per-agent telemetry to evaluate model routing.

## Provider and evidence risks

- Public YouTube, Instagram, and TikTok media can become unavailable or blocked.
- Continue distinguishing observed video evidence from metadata and user notes.
- Keep source errors classified and user-facing.
- Do not reintroduce manual upload as the primary judge flow without intentional UX work.

## Repository hygiene

- `backend/data/db.json` is local runtime state and must not be committed accidentally.
- `src/main.jsx` and `backend/server.js` remain large; refactor only for a concrete need.
- JSON storage is acceptable for the MVP but not the final multi-instance deployment architecture.
- Keep Ukrainian and English copy complete and unmixed.
- The production build currently reports a non-blocking main-bundle size warning; consider route-level code splitting after submission unless load performance becomes a judge-demo problem.
