# DZHERO current technical state

Last updated: **2026-08-12**

## Current objective

The core redesign MVP path is connected on Railway staging. The next phase is
product validation and closing the remaining honest-input fallbacks—not another
broad architecture rewrite or Signal Filter revision.

## Verified staging state

- Branch: `codex/product-live-core`.
- Manual-video implementation commit: `0093e4f`.
- Railway staging frontend and backend both reported `Success` for that SHA.
- Frontend `/`, direct backend `/api/health`, and frontend-proxied
  `/api/health` returned HTTP 200.
- Staging uses PostgreSQL.
- Production remains untouched.

## Completed on 2026-08-12

### Same-origin authentication

- The staging frontend proxies `/api/*` to the backend.
- Google OAuth callback uses the frontend origin.
- `CLIENT_URL` is the frontend origin, while the Google redirect URI retains
  the full callback path.
- CORS preflight from the frontend origin returned 204 after configuration was
  corrected.
- The owner manually verified logout, repeat login, and mobile iPhone login.

### Grounded personal-video Studio flow

- Gemini Interactions `steps[]` parsing and current structured output are
  implemented.
- Public YouTube URLs use Gemini's official URL input with one video-analysis
  invocation and no automatic retry.
- Trusted evidence is normalized into Overview, Transcript, Deep Analysis,
  Adaptation, and Script Editor state.
- TikTok and Instagram/Reels fail closed with a safe capability diagnostic;
  metadata is never promoted to analysis.
- Existing adaptations survive a failed refresh, and non-retryable failures do
  not expose a futile retry.
- The owner accepted one real staging YouTube run with populated Overview,
  verified source evidence, spoken Transcript, and Deep Analysis.
- Deterministic regressions prove three retained adaptations and a structured,
  shootable Script Editor scenario.

### Staging test entitlement

- One acceptance workspace has a reversible staging-only tester grant.
- No subscription record, public plan semantics, production access, or Railway
  configuration is changed by this documentation state.

## Frozen contracts

- Signal Filter v3.1 prompt, schema, policy, and thresholds.
- `maxVideoAnalysesPerRun=1`.
- Separate `decision` and `admittedToBank` fields.
- Redesign-only product work; legacy UI and main domain remain untouched.
- Paid providers require explicit permission, preflight, and hard budget.

## Current backlog

1. Wire a user-owned video upload into the redesign personal-URL fallback.
2. Add owner-authorized captions where platform permission and provenance can
   be verified.
3. Keep TikTok/Instagram arbitrary public URLs fail-closed unless an official,
   compliant audiovisual input path is approved; do not add a downloader.
4. Run 5–7 target-user MVP tests and measure adaptation, return use, and actual
   payment.
5. Validate adaptation quality across a small diverse signal set, including
   live Script Editor usability, without changing Signal Filter v3.1.
6. Capture provider usage/cost evidence in a future explicitly budgeted live
   audit if exact accounting is needed.

## Known risks

- Gemini public YouTube URL analysis is a preview feature and may reject some
  otherwise public videos or change rate/pricing behavior.
- Private, unlisted, login, age, region, safety, or empty-evidence restrictions
  must continue to fail honestly.
- The large `backend/server.js`, `src/main.jsx`, and `src/styles.css` remain
  maintainability debt; no broad refactor is currently authorized.
- Staging tester access is operational state and should not be mistaken for
  validated billing behavior.

## Verification commands

```powershell
npm.cmd run test:public-video-grounding
npm.cmd run test:personal-url-grounded-harness
npm.cmd run test:saved-urls
npm.cmd run test:studio-view
npm.cmd run test:i18n-core
npm.cmd run test:i18n-components
node scripts/test-signal-quality-gate.cjs
node scripts/test-signal-quality-policy-v3-regression.cjs
npm.cmd run build
```

The public-video and personal-URL harnesses are deterministic and make zero
real provider/network calls.
