# Open Issues

## High priority

- YouTube Shorts captions are often unavailable. Keep improving Gemini video analysis and fallback context quality.
- Validate that Gemini is truly receiving and analyzing video input, not only title/thumbnail metadata.
- Keep AI adaptation from feeling instant/fake. The frontend should show real loading tied to backend generation.
- Fix any remaining mixed-language UI in both Ukrainian and English modes.
- Avoid broken YouTube iframe previews. If embedding is blocked, show thumbnail and original-link action.

## Product quality

- Studio should produce specific localized scripts, not generic "problem -> solution -> CTA" filler.
- If context is weak, ask for short user notes and regenerate.
- User-facing copy should be short and product-like, not internal debug text.
- Existing docs/README have some mojibake. New docs in `docs/agent-context` should be treated as the clean source for future agents.

## Technical debt

- `src/main.jsx` is very large. Refactor only when it helps a concrete task.
- Backend routes are still concentrated in `backend/server.js`.
- JSON DB is acceptable for MVP but not final production storage.
- Re-check Postgres/RLS/security policy story if Supabase or user-owned database access is introduced.

## Deployment/checklist risks

- Confirm required env vars are present before testing AI/YouTube flows.
- Confirm no secrets are exposed in frontend env or build output.
- Confirm `backend/data/db.json` is not accidentally committed.
- Run relevant script tests plus `npm.cmd run build` before production pushes when time allows.

