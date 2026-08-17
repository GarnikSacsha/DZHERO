# Project snapshot

Last updated: **2026-08-17**

## Active product

DZHERO is an AI producer for finding, understanding, and adapting short-form
content signals. The new redesign is the only active product version:

```text
Frontend: http://127.0.0.1:5180/?preview=product&tab=discover
Backend:  http://127.0.0.1:3000/
```

Port `3000` is backend API only. Do not use it as product UI. The legacy
dashboard and the main domain remain in the repository but are out of scope for
current product work and must not be changed yet.

The limited MVP direction is defined in [`MVP-SCOPE.md`](MVP-SCOPE.md).

## Verified current state

- The redesign is the sole active product surface.
- The frontend runs locally on port `5180`; the backend API runs separately.
- The Apify integration can retrieve and download real videos.
- One real video has already been displayed in the redesign Collection UI.
- Signal Filter evolved from v2 to v3 and then v3.1.
- v3.1 passed offline verification and a final paid consistency run.
- Production data was not changed during the filter experiments.
- Automatic discovery admits a video to the Verified Signal Bank only when
  `decision=accept` and `admittedToBank=true`.
- Automatic discovery uses metadata ranking `b_soft_v1` after normalization,
  canonical deduplication, and basic eligibility filtering. It stores
  `rankingScore` separately from the existing UI-facing `score` and Signal
  Filter `qualityScore`.
- Railway staging uses PostgreSQL and has completed a real redesign
  Brand Brain → Refresh Bank → admitted Collection signal → Studio flow.
- The successful 2026-08-05 run displayed one admitted TikTok fitness signal
  with 318K views, 11K likes, quality 51, and AI Match 42.
- Staging authentication is same-origin through the frontend `/api` proxy.
  Logout, repeat Google login, and iPhone login were manually accepted on
  2026-08-12 after separating the frontend origin from the Google callback URI.
- Personal saved YouTube URLs now use Gemini's official public URL input and
  current Interactions `steps[]` structured-output parsing.
- On 2026-08-12 the owner accepted one real YouTube run with grounded Overview,
  verified source evidence, spoken Transcript, and Deep Analysis. Deterministic
  regressions cover all three adaptations and the structured shootable Script
  Editor contract.
- An offline integration on base
  `0e4252c70f112a61213eed4deaa681a31ed4f9ca` now preserves resolved
  Instagram/TikTok title, handle, and poster through grounding into Saved URL
  Studio. Personal URL analysis is explicitly `uk` or `en` (default `uk`), and
  adaptation lookup, single-flight work, persistence, and UI request identity
  are language-scoped. Old records without a language remain readable as `uk`.
- Original speech and OCR remain immutable source evidence. Optional
  `localizedText` and `localizedOnScreenText` are separate fields; Studio shows
  scene/time/original OCR plus a distinct translation only when it differs.
  Localized Deep Analysis excludes direct transcript, spoken-scene, and OCR
  fields.
- New adaptation results add exactly three bounded semantic angles:
  `visible_source_conflict`, `mechanism_walkthrough`, and `viewer_decision`,
  with source-conflict, preserved-mechanic, Brand Brain, production-proof, and
  adaptation-logic fields. Existing persisted results remain readable.
- The synthetic offline benchmark passes 5/5 source packages, 15/15 faithful
  variants, 3/3 bounded angles per package, and 5/5 unique visible packages;
  the collapsed generic AI-marketing fixture is rejected 5/5. A deterministic
  Saved URL lifecycle separately proves Studio selection, a three-scene
  production script, and content-plan draft creation.
- TikTok and Instagram/Reels personal URLs use the shared platform capability
  contract but fail closed before legacy page acquisition while no compliant
  arbitrary-public audiovisual path exists. The authorized fallback is a
  user-owned upload or owner-authorized captions.

`backend/data/db.json` is local runtime state, not a product source of truth.
Do not edit or commit it without an explicit user request.

### 2026-08-15 evidence boundary

The poster/language/OCR/semantic integration above is deterministic and
offline. Provider keys were forced empty except in tests that install their own
fake keys and fetch mocks; the harnesses report zero real provider/network
calls. It is not deployed and does not prove diverse live-provider output
quality or language purity. The last live-provider claim remains the single
owner-accepted YouTube run from 2026-08-12.

### 2026-08-15 capped live-run preflight

The integrated worktree now has additive run-local controls for total Apify
charge and actor-start count per platform, Instagram fallback disabling,
downloaded-MP4 duration verification, Gemini input/request/output bounds, and
one-attempt generation forwarding. Defaults preserve the prior behavior when
the cap environment is absent. Focused regressions fail closed for unknown or
overlong media, actor/fallback oversubscription, uncountable or oversized
Gemini requests, and an expired or unknown model-pricing table.

For the approved one-Instagram plus one-TikTok acceptance, the configured
worst-case exposure was `$0.718600` of a `$0.75` ceiling: `$0.55` Apify,
`$0.075` reserved video input, `$0.01152` video output, `$0.036` remix input,
and `$0.04608` remix output. That cap applies only to the redesign Saved URL
route.

During the user-driven fallback, root `/` opened the legacy Signals surface.
Its Instagram import bypassed the Saved URL guard and made three Gemini
operations: one thumbnail analysis and two remix generations. Apify operations
were `0`, Gemini video-analysis operations were `0`, both remix outputs were
rejected, and no Saved URL or Reel was persisted. Exact Gemini cost was not
recorded and is **unknown**; do not report `$0` actual cost. The local evidence
store is the ignored `backend/data/db.json`: its `ai_operations=4` also includes
one earlier Brand Brain derivation. Both services were stopped and the evidence
store was preserved.

`PERSONAL_URL_STRICT_LIVE_RUN=true` now blocks legacy Signals, Brand Brain,
public Brand Scan, legacy Apify, Agent Studio, Discovery, and other unrelated
paid-provider scopes before their provider attempt. Only the redesign Saved URL
provider guard may pass, and only inside the `$0.718600` budget envelope. The
separate frontend flag `VITE_PERSONAL_URL_CONTROLLED_PRODUCT_ENTRY=true` maps
root `/` to `/?preview=product&tab=discover`; both flags are opt-in and ordinary
defaults remain unchanged. An isolated route-level integration harness starts a
temporary backend with local fake providers and an outbound-network trap: all
forbidden routes remain at zero provider attempts, while parallel Saved URL
requests produce exactly one primary Apify actor, one video analysis, and one
remix, with the configured duration/token/request bounds and no Instagram
fallback. The harness loads neither the repository `.env` nor real credentials.

On 2026-08-17, the default-off
`PERSONAL_URL_CREDENTIALLESS_PREFLIGHT=true` mode was added for a zero-spend
local readiness session. It is valid only with strict mode and the complete
personal-URL cap configuration. The flag is recognized before local `.env`
loading, so that file is not read at all; every provider-capable Saved URL
request returns structured `provider_not_configured` / `controlled_preflight`
before provider or network access, while unrelated scopes remain
`controlled_live_run_scope_blocked`. A dynamic isolated-backend regression
uses a sentinel credential file and proves the sentinel is absent, parallel
requests stay at zero provider calls, and deferred CRM, Discovery, and Gemini
cleanup make zero outbound attempts. Strict paid mode remains unchanged and
still refuses startup without its required real credential/configuration.

## Signal Filter v3.1 baseline

Signal Filter v3.1 is frozen as the MVP baseline. Its prompt, schema, policy,
thresholds, and `maxVideoAnalysesPerRun=1` remain unchanged until the owner makes
a separate decision.

### Final paid consistency run

| Reference video | Decisions | `admittedToBank=true` | Mode |
| --- | --- | ---: | --- |
| MindStudio | `accept` / `accept` / `accept` | 3/3 | `knowledge_explainer` |
| Axial | `uncertain` / `reject` / `reject` | 0/3 | — |

Aggregate results:

- bank-admission flip rate: `0`;
- false admission rate: `0`;
- false rejection rate: `0`;
- uncertain rate: `1/6`;
- schema failures: `0`;
- missing or duplicate evidence IDs: `0`;
- Gemini interactions: `6`;
- Apify runs: `2`;
- downloads: `2`;
- conservative total cost: `$0.305654` of the `$0.40` limit.

### Evidence boundary

v3.1 is proven only as a safe baseline for a limited MVP on two reference
videos. This is not evidence of quality across all niches and content formats.

No further MindStudio/Axial consistency runs are planned. New prompt or v3.2
work requires a diverse real-video benchmark first.

## Automatic discovery metadata ranking

Production ranking uses the preregistered B-soft v1 formula: protected
share/save intent with a 500-view denominator floor, multiplied by a continuous
duration prior around the inclusive 12–60 second interval. Missing duration
uses the median known prior in the deduplicated eligible batch, or `1` when all
durations are missing. Equal scores use stable canonical identity as the final
tie-break.

The six-candidate benchmark order is `chatcut`, `programmer`, `solvex`,
`lemyn`, `creative`, `carol`. Offline production regression covers all 720
input permutations, duplicate and Map-order invariance, numeric extremes,
duration boundaries, and the one-download/one-analysis integration path.
Signal Filter v3.1 and `maxVideoAnalysesPerRun=1` were not changed.

## MVP integration status

The redesign Discovery integration is complete and verified on Railway
staging. Brand Brain persists through the backend, manual Refresh Bank launches
the bounded discovery path, Collection enforces the two-part admission guard,
and an admitted signal opens in Studio.

The next product question is no longer basic pipeline connectivity. It is
whether users repeatedly receive useful enough adaptations and shootable
scripts to return and pay. The first fitness result had only AI Match 42 and was
judged weakly useful by the owner. Treat this as Brand Match/Collection evidence;
do not silently change the frozen Signal Filter v3.1 baseline.

See [`DISCOVERY-VERIFICATION.md`](DISCOVERY-VERIFICATION.md) for the permanent
contract, run evidence, and free regression suite.

## Current pipeline

```text
Brand Brain
→ search in the shared source catalog
→ Channel Filter
→ recommended channels
→ channel publication grid
→ metadata/outlier prefilter
→ Gemini analysis of the best candidates
→ Signal Filter
→ Verified Signal Bank
→ Brand Match
```

The three decisions are intentionally separate:

1. Channel Filter chooses which sources are worth monitoring.
2. Signal Filter decides whether a specific video deserves admission to the
   shared bank.
3. Brand Match ranks how well an already verified video fits a specific Brand
   Brain.

## Stack and storage

- Frontend: React 19, Vite 8, lucide-react, custom CSS.
- Backend: Node.js, Express 5, helmet, cors, express-rate-limit.
- Video evidence: Gemini.
- Social retrieval and discovery: Apify-backed services.
- Production storage: PostgreSQL `app_state` JSONB document.
- Local fallback/runtime data: `backend/data/db.json`.

## Git and staging state

- Active branch: `codex/product-live-core`.
- Intended redesign base/PR target: `codex/redesign-ui`; `main` remains
  unchanged.
- The current branch has a persistent Railway staging frontend and backend.
- Staging storage is PostgreSQL.
- Current URLs are `https://frontend-staging-c899.up.railway.app/` and
  `https://backend-staging-470a.up.railway.app`.
- Backend, frontend, and frontend-proxied backend health returned HTTP 200 on
  2026-08-12 for deployed commit `0093e4f`.
- Production remains untouched.
- The health endpoint does not expose deployed Git SHA; use Railway deployment
  metadata when exact revision proof is required.

## Historical context

The repository still contains the previous dashboard, Build Week Agent Studio,
and public-beta work. Read `docs/hackathon/README.md` only for that historical
submission context; do not treat those surfaces as the current product
direction.

## Security and provider controls

- Never commit `.env`, credentials, downloaded benchmark videos, evidence
  frames, or temporary provider outputs.
- Keep provider keys server-side.
- Never make paid Gemini or Apify calls without explicit permission, a
  preflight, and a defined budget.
- A reversible tester grant exists only for the staging acceptance workspace.
  It is non-production operational access, not public plan or subscription
  semantics.
- Keep decisions (`accept`, `reject`, `uncertain`) separate from
  `admittedToBank`.
