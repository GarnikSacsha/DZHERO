# DZHERO MVP test matrix

Last updated: **2026-08-20**

This is the canonical MVP test inventory. It links existing regression suites
to the current product hypotheses and records planned work without presenting it
as completed. It does not replace the frozen Discovery baseline in
[`DISCOVERY-VERIFICATION.md`](DISCOVERY-VERIFICATION.md) or the broader test
strategy in root `TDD.md`, which is comparison material rather than the active
MVP source of truth.

## Non-negotiable test contract

- The active product UI is the redesign only.
- Signal Filter v3.1, its schema/policy/thresholds, and
  `maxVideoAnalysesPerRun=1` are frozen.
- Only `decision=accept && admittedToBank=true` may enter the Verified Signal
  Bank. `reject` and `uncertain` are not filler.
- Every provider-free test must make zero Gemini, Apify, Railway, or other
  network/provider calls.
- A live test requires a separate preflight, explicit owner approval, a hard
  budget, and recorded run evidence. This document grants none of those.
- Technical provider success, bank admission, and user usefulness are separate
  outcomes.

## Brand Brain profiles

| ID | Brand Brain input | Retrieval rule | Bank target |
| --- | --- | --- | --- |
| BB-AI | Educational AI content for marketing teams | AI topic is required; marketing-team fit is soft ranking/adaptation context. | 3–5 truthful accepted/admitted signals. |
| BB-FIT | Practical fitness/home-training content for beginners and busy people | Fitness/home-training topic is required; exact audience wording is not. | 3–5 truthful accepted/admitted signals. |
| BB-CAFÉ | Local café/restaurant for nearby residents and visitors; include city in the test description | Food/local-business topic is required; city may guide retrieval but location stays optional globally. | 3–5 truthful accepted/admitted signals. |

If exact-source retrieval is sparse, widen topic and transferable-mechanic
lanes before any admission rule. A bounded run may return fewer than three
signals honestly; unrelated candidates must not be promoted to meet the target.

## Existing regression inventory

The entries below name real checked-in paths/commands. `Historical pass` means
the cited documentation records a previous successful run; this synchronization
did not rerun it. `Not rerun` is deliberately not a pass claim.

| ID | Layer / input | Hypothesis and expected result | Provider authority | Status | Actual evidence and decision |
| --- | --- | --- | --- | --- | --- |
| D-01 | Discovery / frozen fixtures | Ranking, normalization, one-analysis bound, failure classification, storage/API, Brand Brain integration, and admission guard remain deterministic. | None; command must stay provider-free. | PASS locally on 2026-08-20. | [`DISCOVERY-VERIFICATION.md`](DISCOVERY-VERIFICATION.md) records the canonical command: `npm.cmd run test:discovery-regression` (exit 0 in N3). |
| D-02 | Discovery / known fitness false-accept fixture | An ungrounded `process_demo` is rejected while grounded positive control remains accepted. | None. | Historical pass; not rerun here. | [`scripts/test-signal-quality-fitness-false-accept.cjs`](../../scripts/test-signal-quality-fitness-false-accept.cjs); result recorded in `DISCOVERY-VERIFICATION.md`. |
| D-03 | Brand Brain / persisted and wizard contracts | Product/audience context persists and remains available to Discovery without changing the admission rule. | None. | Existing; not rerun here. | [`scripts/test-brand-brain-wizard-api.mjs`](../../scripts/test-brand-brain-wizard-api.mjs), [`scripts/test-product-brand-brain-api.mjs`](../../scripts/test-product-brand-brain-api.mjs), [`scripts/test-brand-brain-persistence.js`](../../scripts/test-brand-brain-persistence.js). |
| PL-01 | Product Live / grounded source and budget | YouTube direct URL skips unsupported multimodal `countTokens` but retains duration, request-size, output, and usage guards. | None; fixtures/mocks only. | Existing regression; not rerun here. | `7e82b2a`; `scripts/test-public-video-grounding.mjs` exists at target baseline `b59958d` but is absent from this worktree checkout, plus [`scripts/test-product-live-remix-core.cjs`](../../scripts/test-product-live-remix-core.cjs). |
| PL-02 | Product Live / Brand Brain projection | Generation requires complete `product + audience`; `niche` and `market` remain optional and are never invented. | None. | Existing regression; not rerun here. | `c985fcc`, `ecc85ec`; [`scripts/test-product-live-remix-core.cjs`](../../scripts/test-product-live-remix-core.cjs). |
| PL-03 | Product Live / corrective generation | Attempt 1 semantic failure gets one corrective retry; attempt 2 schema-valid non-empty output can return `accepted_with_warnings`; invalid schema and safety/content/budget/provider errors remain hard failures. | None. | Existing regression; not rerun here. | `e026337`, `b59958d`; [`scripts/test-remix-provider-quality.mjs`](../../scripts/test-remix-provider-quality.mjs), [`scripts/test-remix-provider-errors.mjs`](../../scripts/test-remix-provider-errors.mjs). |
| PL-04 | Product Live / persistence and Studio lifecycle | Adaptation and source context are saved, reloaded, and presented through the supported lifecycle. | None. | PASS locally on 2026-08-20 for the adjacent personal-URL lifecycle; no staging retest. | [`scripts/test-product-saved-url-adaptation-lifecycle.mjs`](../../scripts/test-product-saved-url-adaptation-lifecycle.mjs), [`scripts/test-product-adaptation-lifecycle.mjs`](../../scripts/test-product-adaptation-lifecycle.mjs); N2 ran `npm.cmd run test:personal-url-adaptation` (exit 0). |
| PL-05 | Product Live / cross-platform staging | YouTube, Instagram/Reels, and TikTok complete the adaptation flow. TikTok preview is separately assessed. | Staging evidence already observed; no new call authorized. | User-confirmed staging success; preview defect remains open pending integration/deploy. | Owner confirmation on 2026-08-20; implementation chain `85fba56` through `b59958d`. The local N2 preview fix is not committed, deployed, or staging-reverified. |

## Required deterministic work before new provider calls

| ID | Layer / input | Hypothesis and expected result | Provider authority | Status | Evidence required to accept |
| --- | --- | --- | --- | --- | --- |
| N-01 | BB-AI / fixture candidate pool | AI topic lanes preserve topic relevance, use audience as soft context, and admit only through the real frozen v3.1 policy. | None. | PASS locally on 2026-08-20. | `node scripts/test-three-profile-discovery-bank-lifecycle.mjs` in N3 (exit 0): exactly 3 accepted/admitted AI signals in one shared state; zero network tripwire calls. |
| N-02 | BB-FIT / fixture candidate pool | Fitness lanes can widen without changing Signal Filter v3.1; ungrounded fitness mechanics remain rejected. | None. | PASS locally on 2026-08-20. | Same lifecycle evidence: exactly 3 accepted/admitted fitness signals; `npm.cmd run test:discovery-regression` (exit 0) retains the false-accept regression. |
| N-03 | BB-CAFÉ / fixture candidate pool | Local-business/city context guides retrieval without making location globally required; only truthful admitted fixtures appear in the profile bank. | None. | PASS locally on 2026-08-20. | Same lifecycle evidence: exactly 3 accepted/admitted café signals in the shared state, with cross-profile isolation and zero network tripwire calls. |
| N-04 | Discovery → Bank / repeated fixture run | Canonical identity deduplication and repeated requests do not create duplicate analysis, charge representation, or bank admission. | None. | PASS locally on 2026-08-20. | `scripts/test-three-profile-discovery-bank-lifecycle.mjs` (N3, exit 0) covers dedupe, suppression, replay/idempotency, classified fixture errors, correct-bank isolation, and `maxVideoAnalysesPerRun=1`. |
| N-05 | Provider-failure fixtures | Timeout, rate-limit, empty response, invalid JSON, safety/content, and budget errors are classified; only allowed corrective retry occurs. | None. | Partly covered locally; broader Product Live error suite not rerun in this graph. | Lifecycle classified-error assertions passed in N3. Existing Product Live cases remain in [`scripts/test-remix-provider-errors.mjs`](../../scripts/test-remix-provider-errors.mjs) and were not rerun here. |
| N-06 | TikTok preview / fixture or media mapping | A successful TikTok source package renders its resolved poster/preview while preserving the existing evidence and UI contracts. | None. | PASS locally on 2026-08-20; staging remains open. | N2 RED→GREEN: `npm.cmd run test:studio-view`, `npm.cmd run test:personal-url-adaptation`, and `npm.cmd run build` all exit 0. The patch is not committed, deployed, or staging-reverified. |
| N-07 | Discovery query planning / three profiles | Product/content-focus drives a compact provider query; audience is excluded; generic bootstrap appears only with no topic context. | None. | PASS locally on 2026-08-20. | N3/N4 proof: a 758-character description planned as 114 characters / 13 words, within the enforced whole-word maximum of 120 characters / 16 words; generic/cross-profile/non-allowlisted queries returned no candidates. |

## Controlled live validation — not yet authorized

| ID | Layer / input | Hypothesis and expected result | Provider authority | Status | Evidence required to accept |
| --- | --- | --- | --- | --- | --- |
| L-01 | BB-AI / bounded Discovery | A controlled run finds candidates, analyses no more than one video, and may add truthful admitted signals to the correct bank. | Separate Apify/Gemini preflight, explicit approval, hard budget. | Blocked pending authority. | Run ID, configured bounds, provider attempts/cost, classification, and bank delta. |
| L-02 | BB-FIT / bounded Discovery | Same as L-01; compare relevance without changing Signal Filter. | Separate preflight, approval, hard budget. | Blocked pending authority. | Same as L-01 plus preservation of false-accept guard. |
| L-03 | BB-CAFÉ / bounded Discovery | Same as L-01; verify city-aware retrieval without inventing global location. | Separate preflight, approval, hard budget. | Blocked pending authority. | Same as L-01 plus evidence of the city input. |
| L-04 | Product Live smoke / three platforms | Confirm the already observed YouTube, Instagram/Reels, and TikTok adaptation path after a code deployment; TikTok poster is expected to be fixed first. | Separate staging/deploy and provider authority. | Blocked pending authority. | Railway deployment identity, one controlled result per platform, sanitized diagnostics, and no unapproved spend. |

## User-value validation — not yet authorized

| ID | Layer / input | Hypothesis and expected result | Authority | Status | Evidence required to accept |
| --- | --- | --- | --- | --- | --- |
| U-01 | 5–7 target users / 3 profiles | At least 3 users actually adapt a signal, at least 2 return, and at least 2 pay `$15`. | Owner recruits users and approves any payment flow. | Planned. | Consent-appropriate observation, actual adaptation/return/payment events, and a conclusion separate from provider success. |

## Review rule

After every completed deterministic or live test, update this matrix with the
exact command or run identifier, result, cost where applicable, and the
decision it supports. Do not convert a planned row into a pass because an
adjacent suite is green.
