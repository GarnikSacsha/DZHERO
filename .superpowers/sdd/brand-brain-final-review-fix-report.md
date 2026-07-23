# Brand Brain Final Review Fix Report

Date: 2026-07-23
Base commit: `8adb218`
Required commit subject: `fix: harden Brand Brain finalization`

## Outcome

All five Important findings and all three Minor findings from the whole-branch review were reproduced, fixed, and covered by focused regressions. The complete Task 6 verification matrix passes. `backend/data/db.json` remains untracked from this work: it was already modified local runtime data and was never edited, staged, or used as the test database.

## Root causes and fixes

### 1. AI usage enforcement

Root cause:

- The Brand Brain finalize route constructed Gemini derive/rerank clients without the existing `beforeProviderAttempt` boundary.
- The extractor and recommender intentionally fell back on provider errors, which would also have swallowed a cost-control denial unless that denial was distinguished.

Fix:

- One `createSerializedPaidAiAttemptGuard` is created per finalize flight and passed to every Gemini derive and rerank attempt.
- Guard failures are tagged `providerAttemptBlocked`; the extractor and recommender rethrow those failures instead of falling back.
- The guard revalidates workspace access and plan entitlements, reserves `ai_operations`, and writes the counter before each provider call.
- The denial regression starts from a previously completed Version 2 brief, so it exercises the same route used by a Settings edit. It proves a denied attempt returns `402`, makes zero Gemini calls, and preserves the prior brief, draft, memory, and finalize-intent state.

### 2. Finalize concurrency and idempotency

Root cause:

- Idempotency was checked only against a fully persisted recommendation.
- Two identical requests could both perform provider work before either persisted.
- A slow request A could persist after newer request B because no intent/version comparison existed.

Fix:

- A process-local single-flight map is keyed by `workspaceId:answerFingerprint`, so identical in-process requests share derive/rerank work.
- A short serialized reservation transaction revalidates access, resolves the accessible signal snapshot, and writes a unique `{ fingerprint, token }` intent.
- Instagram and Gemini provider I/O run after reservation and outside the global mutation queue.
- A short serialized persistence transaction revalidates access and current accessible signals, then compares both token and fingerprint before charging/saving.
- A superseded transaction returns a marker from the storage lock; the route re-reads canonical state and returns `409 brand_brain_finalize_superseded` without allowing the old result to overwrite the newer result.
- Intent cleanup is token-CAS guarded, so an old request cannot clear a newer request's reservation.
- Canonical idempotent responses are rebuilt from the persisted brief and current accessible signals.

### 3. Empty accessible signal bank

Root cause:

- The route required a non-null recommendation and accessible signal, returning `409` even when the workspace had no accessible signals.

Fix:

- A valid Version 2 brief now persists with `recommendation: null` when the current accessible bank is empty.
- The API returns `recommendation: null` and `signal: null`.
- The client still unlocks/navigates to Signals, opens no preview, and renders the existing authoritative empty-bank state.

### 4. Strict Version 2 completeness

Root cause:

- `isBrandContextComplete` used `isBrandBrainV2Complete(brief) || isLegacyBrandComplete(brief)`, allowing an incomplete `schemaVersion: 2` brief to unlock through legacy flat fields.

Fix:

- `schemaVersion === 2` now selects only Version 2 completeness: all four authored answers must be non-empty.
- Legacy completeness applies only to non-Version-2 records.
- Contract, API/draft repairability, and root browser gating all cover the malformed-Version-2 case.

### 5. Brand Brain only in Settings after onboarding

Root cause:

- The completed `page === 'home'` branch rendered `BrandBrainStartPage` before the load redirect effect moved the user to Signals.

Fix:

- Completed Home renders `HomeDashboard`; Brand Brain remains available only through `Settings -> My Brands`.
- The existing completed-load redirect to Signals remains intact.
- A pre-login `MutationObserver` browser regression proves the Brand Brain start page is never rendered, even transiently.

### Minor: Back persistence

Root cause:

- Back only decremented local React state.

Fix:

- Back builds the normalized previous-step draft, persists it, and moves only after the PUT succeeds.
- A failed PUT leaves the current step visible and reports the save error.
- The browser regression also reloads after a successful Back and confirms the persisted earlier step resumes.

### Minor: Gemini prompt privacy

Root cause:

- Derive serialized the entire `answers` object and rerank nested that same object, including `instagramUrl`.

Fix:

- Both prompts construct an explicit authored-facts object containing only `profileDescription`, `audience`, `niche`, and `market`.
- The derive prompt retains only sanitized, verified Instagram metadata.
- Regressions assert both the exact answer keys and the absence of the raw URL/handle.

### Minor: legacy locked card

Root cause:

- The field list omitted both `market` and `location`.
- Offer/CTA/Tone labels were hardcoded in English.

Fix:

- The card displays `market`, falling back to `location`.
- Offer and Tone of voice labels are localized; CTA remains the same term in both languages.

## RED evidence

Focused failures observed before production fixes:

- `node scripts/test-brand-brain-v2-contract.js`
  - malformed Version 2 with complete legacy fields: expected `false`, actual `true`.
- `node scripts/test-brand-brain-extractor.js`
  - expected authored prompt keys only; actual keys also contained `instagramUrl`.
- `node scripts/test-brand-signal-recommender.js`
  - expected authored prompt keys only; actual nested answer keys also contained `instagramUrl`.
- `node scripts/test-public-beta-guards.cjs`
  - the controlled Gemini base-url/test boundary assertion did not match the hardcoded provider URL.
- `$env:BRAND_BRAIN_HARDENING_CASE='usage'; node scripts/test-brand-brain-finalize-hardening.mjs`
  - expected `402`, actual `200`.
- `$env:BRAND_BRAIN_HARDENING_CASE='single-flight'; node scripts/test-brand-brain-finalize-hardening.mjs`
  - expected one derive attempt, actual two.
- `$env:BRAND_BRAIN_HARDENING_CASE='newer-intent'; node scripts/test-brand-brain-finalize-hardening.mjs`
  - expected old request `409`, actual `200`.
- `$env:BRAND_BRAIN_HARDENING_CASE='empty-bank'; node scripts/test-brand-brain-finalize-hardening.mjs`
  - expected `200`, actual `409`.
- `$env:BRAND_BRAIN_HARDENING_CASE='strict-v2'; node scripts/test-brand-brain-finalize-hardening.mjs`
  - expected context `complete: false`, actual `true`.
- `node scripts/test-my-brands-ui.mjs` with the old Back implementation
  - `page.waitForResponse` timed out after 30000 ms waiting for the Back draft PUT.
- `node scripts/test-my-brands-ui.mjs` with the old completed-Home branch isolated
  - `A completed Home load must never render the Brand Brain start page, even transiently`; actual `true`, expected `false`.
- `node scripts/test-my-brands-ui.mjs` with the old legacy-card field list isolated
  - timed out waiting for exact text `Legacy market`.

## GREEN verification

Focused hardening:

- `node scripts/test-brand-brain-finalize-hardening.mjs` — PASS.
  - Denied completed-brief re-save makes zero provider calls and no partial write.
  - Same fingerprint performs exactly one derive, one rerank, two guarded `ai_operations`, and one memory write.
  - Slow A/newer B persists only B and returns `409` for A.
  - Empty bank persists/returns null recommendation and signal.
  - Incomplete Version 2 remains incomplete and draft-repairable.

Complete Task 6 matrix:

- `node scripts/test-brand-brain-v2-contract.js` — PASS.
- `node scripts/test-brand-signal-recommender.js` — PASS.
- `node scripts/test-brand-brain-extractor.js` — PASS.
- `npm.cmd run test:brand-brain` — PASS.
- `node scripts/test-brand-brain-persistence.js` — PASS.
- `node scripts/test-brand-brain-wizard-api.mjs` — PASS.
- `node scripts/test-my-brands-ui.mjs` — PASS.
- `node scripts/test-signal-preview-ui.mjs` — PASS.
- `node scripts/test-apify-signal-provider.mjs` — PASS.
- `node scripts/test-automatic-discovery-regressions.mjs` — PASS.
- `npm.cmd run test:public-beta` — PASS.
- `npm.cmd run test:i18n-core` — PASS.
- `npm.cmd run test:i18n-provider` — PASS.
- `npm.cmd run test:i18n-components` — PASS.
- `npm.cmd run test:i18n-errors` — PASS.
- `npm.cmd run test:i18n-rendered` — PASS.
- `node --check backend/server.js` — PASS.
- `npm.cmd run build` — PASS with the documented non-blocking chunk-size warning.
- `git diff --check` — PASS; Git emitted only line-ending conversion notices.

## Files

Production:

- `backend/server.js`
- `backend/services/brandBrainExtractor.cjs`
- `backend/services/brandBrainV2.cjs`
- `backend/services/brandSignalRecommender.cjs`
- `src/components/BrandBrainWizard.jsx`
- `src/main.jsx`

Regression coverage:

- `scripts/test-brand-brain-finalize-hardening.mjs`
- `scripts/test-brand-brain-extractor.js`
- `scripts/test-brand-brain-v2-contract.js`
- `scripts/test-brand-signal-recommender.js`
- `scripts/test-my-brands-ui.mjs`
- `scripts/test-public-beta-guards.cjs`

Report:

- `.superpowers/sdd/brand-brain-final-review-fix-report.md`

## Commit and runtime-data hygiene

The authoritative commit is the repository commit with subject `fix: harden Brand Brain finalization`; its hash is returned in the task handoff. A commit cannot embed its own final hash in a tracked file without changing that hash.

`backend/data/db.json` was already modified before this work. It was treated as local runtime data throughout, was not edited by the implementation, and is explicitly excluded from staging and commit. Browser/API regressions copy the fixture into temporary directories and mutate only those temporary databases.
