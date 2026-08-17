# Recent changes

Last updated: **2026-08-17**

## Run-local paid acceptance guard

- Added default-compatible personal-URL controls for per-platform aggregate
  Apify charge, exact actor starts, disabling Instagram fallback, verified
  downloaded-video duration, and bounded Gemini request/input/output size.
- Added focused offline tests for fail-closed duration and token counting,
  fallback/actor caps, pricing expiry and unknown models, and video/remix
  generation-config forwarding.
- The approved one-Instagram plus one-TikTok configuration has a conservative
  `$0.718600` maximum under the `$0.75` owner ceiling. The estimate reserves
  `$0.55` for Apify and `$0.168600` for Gemini video/remix work.
- The user-driven fallback accidentally used legacy root `/`. The Instagram
  action made three Gemini operations (one thumbnail, two remix), both remix
  outputs were rejected, and no Saved URL or Reel persisted. Apify and video
  analysis remained zero. Actual Gemini cost is unknown, not `$0`; the ignored
  runtime evidence store records four total AI operations including one earlier
  Brand Brain derivation. Both services were stopped.
- Added `PERSONAL_URL_STRICT_LIVE_RUN` provider-scope isolation so only the
  redesign Saved URL guard can reach paid providers during a controlled run.
  Added `VITE_PERSONAL_URL_CONTROLLED_PRODUCT_ENTRY` so root enters Product
  Discover for that run; the `/auth/me` failure branch preserves the same
  Product Discover URL instead of stripping its query. Both are explicit
  opt-ins and preserve ordinary behavior by default.
- Added an isolated route-level backend harness with fake providers, a fresh
  temporary database, disabled `.env` loading, and an outbound-network trap.
  It dynamically proves the complete forbidden-route matrix stays at zero
  provider calls under parallel load; the only allowed Saved URL flight uses
  one primary Instagram actor, one video analysis, one remix, no fallback, and
  the configured duration/token/request limits. Parallel duplicate/different
  Saved URL requests remain inside single-flight/workspace budget bounds.
- Added `PERSONAL_URL_CREDENTIALLESS_PREFLIGHT` for default-off, zero-spend
  local readiness. It is read before local `.env` loading, requires strict mode
  and the verified cap, blocks all provider-capable requests (including
  `personal_saved_url`) before network access, and disables deferred CRM,
  Discovery, and provider cleanup. A dynamic sentinel-credential test proves
  `.env` is skipped and startup plus parallel requests make zero provider or
  outbound calls. Strict paid-run startup still requires real credentials.

## Offline poster, language, OCR, and semantic adaptation integration

- Integrated scoped P/L/A artifacts from base
  `0e4252c70f112a61213eed4deaa681a31ed4f9ca` without merge, cherry-pick,
  commit, deployment, provider calls, or `backend/data/db.json` changes.
- Saved URL analysis and reuse are now language-scoped (`uk` / `en`, default
  `uk`); old language-less records remain Ukrainian-readable and stale UI
  results from another language are filtered out.
- Resolved Instagram/TikTok title, handle, and poster survive grounding into
  the Saved URL Studio signal. Original speech/OCR fields remain evidence;
  optional localized OCR is separate and Studio renders scene, time, original,
  and distinct translation.
- New generation adds exactly three semantic angles plus source/brand/
  production reasoning fields. The tracked offline benchmark passes 5/5
  packages and rejects the tracked collapsed fixture 5/5.
- Deterministic lifecycle coverage now links Saved URL, all three angles, a
  selected three-scene production script, and a content-plan draft. Existing
  stored results remain readable because the new fields are additive.
- Evidence is offline only. It does not establish diverse live-provider quality
  or output-language purity; the last accepted live evidence remains the single
  2026-08-12 YouTube run.

## Same-origin auth and grounded manual-video Studio

- `99be0a6` added the staging frontend `/api` proxy and same-origin Google OAuth
  session flow. Staging keeps the frontend origin and Google callback URI as
  separate configuration concepts.
- After the staging origin correction, CORS preflight returned 204 and the
  owner manually verified logout, repeat login, and iPhone login.
- `95b95a7`, `83adfea`, and `ac12fa6` established grounded personal-URL
  requirements, a deterministic backend/browser harness, actionable retry, and
  structured Studio script rendering.
- `0093e4f` added `backend/services/publicVideoGrounding.cjs`, current Gemini
  Interactions `steps[]` parsing and response schema, normalized grounded
  evidence, three-platform capability diagnostics, retained adaptations, and
  Script Editor regression coverage.
- Railway reported frontend and backend staging `Success` for `0093e4f`.
  Frontend, direct backend health, and frontend-proxied health returned 200.
- The owner then accepted one real YouTube flow with grounded Overview,
  verified evidence, spoken Transcript, and Deep Analysis. Deterministic tests
  separately prove the retained three variants and structured shootable script.
- TikTok and Instagram/Reels arbitrary public-page analysis intentionally fails
  closed with a user-owned upload / owner-authorized captions fallback. No
  downloader or new provider dependency was added.
- Signal Filter v3.1, `maxVideoAnalysesPerRun=1`, production, legacy UI,
  `backend/data/db.json`, and package lock were unchanged.

## Redesign Discovery integration and staging proof

- `232c1c3` connected redesign Brand Brain, Refresh Bank, Collection admission,
  and the bounded Automatic Discovery path.
- Subsequent commits added metadata audits, fail-closed normalization and
  ranking guards, targeted download, suppression memory, manual budget/run
  safety, the two-step Brand Brain, and redesign auth/logout routing.
- `b84c7e2` blocked unsupported Instagram search inputs before reservation and
  selected a valid TikTok keyword plan when both platforms were available.
- `749fe88` fixed Gemini `generation_config.max_output_tokens` and made
  quality-gate provider errors honest retryable failures rather than content
  rejection or an empty successful run.
- On 2026-08-05 an owner-approved staging Refresh admitted a real TikTok fitness
  signal, displayed it in Collection, and opened it in Studio. This completed
  the limited redesign Discovery E2E proof.
- The permanent contract and regression inventory are in
  [`DISCOVERY-VERIFICATION.md`](DISCOVERY-VERIFICATION.md).

## Public beta integration

- Free Trial now reads a shared, read-only signal bank instead of launching paid discovery.
- Trial discovery settings, manual discovery runs, and advanced provider imports are blocked server-side.
- Public Brand Scan no longer expands through the optional paid source provider unless explicitly enabled.
- Agent Studio remains usable on the Build Week deployment but is disabled with **Coming soon** on the public deployment.
- The pricing grid remains visible while checkout and plan selection are disabled by default.
- Added public-beta API/UI regression coverage and re-ran the complete Agent Studio suite and production build.

## Latest Build Week commits

- `3529d80 fix: authenticate Apify TikTok media downloads`
  - downloads protected Apify media with server-side authorization;
  - uploads the media to Gemini Files rather than exposing a protected URL;
  - keeps failure classified if protected transfer still fails.
- `d48a719 feat: add Agent Studio new run action`
  - resets a completed/approval-state run for another source test.
- `81b8338 chore: deploy fresh signal discovery`
  - deployment marker for the fresh-signal flow.
- `2325d9d feat: add fresh signal discovery flow`
  - manual and scheduled discovery;
  - budget-aware mixed lanes, persisted run state, and UI status.
- `cd45ea2 feat: rebuild content calendar experience`
  - month/week/schedule calendar and post interaction improvements.
- `2361d1d fix: polish Build Week product experience`
  - judge-facing product/UI refinements.
- `2c199c3 docs: prepare Build Week judge package`
  - initial README, judge guide, demo, verification, ownership, and checklist package.
- `9d13e02 feat: track Agent Studio provider usage`
  - bounded OpenAI, Gemini, and Apify usage aggregates.

Latest verified branch-tip fixes:

- `a22a955 fix: remove rejected Gemini schema limits`
- `43469e9 fix: enforce structured Gemini video evidence`
- `0997b9c fix: localize Agent Studio quality errors`
- `498032c fix: fall back to Instagram media URL`

Use `git log --oneline -20` as the authoritative history. `3529d80` is the pre-polish baseline; final UI, English-output, tests, and documentation integration is `be3ab33`; later source/evidence fixes culminate in `a22a955` before the July 20 documentation refresh.

## Preserve these decisions

- Existing DZHERO and Build Week work remain clearly separated.
- **Find fresh signals** discovers new signal-bank items; **Choose from my Signals** selects from that workspace bank inside Agent Studio.
- Compact alternatives are not directly approvable.
- Hybrid is a real OpenAI generation and Critic pass.
- Human approval is required before Content Plan writes.
- Provider usage is implemented, not roadmap copy.
- Production uses Railway/PostgreSQL; JSON is only the local fallback/seed.
- GitHub handles do not need to match the entrant's legal name.
