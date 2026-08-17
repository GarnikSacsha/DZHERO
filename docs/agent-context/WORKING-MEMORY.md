# Working Memory

Last updated: **2026-08-17**

## Current direction

DZHERO is an AI producer, not a generic dashboard, blank chat, or saved-Reels
gallery. Current work happens only in the redesign at
`http://127.0.0.1:5180/?preview=product&tab=discover`.

The redesign Discovery pipeline is now connected and verified end to end on
Railway staging. One approved manual Refresh found, analysed, admitted, and
displayed a real TikTok fitness signal, which then opened in Studio.

The owner considers this the intended limited-MVP technical outcome. The
result's usefulness was weak despite topic fit and engagement; this is new
evidence for Brand Match/Collection ranking, not permission to change the
frozen Signal Filter v3.1 baseline. Full evidence and regression rules are in
[`DISCOVERY-VERIFICATION.md`](DISCOVERY-VERIFICATION.md).

## Latest owner decisions

- Stop further MindStudio/Axial consistency runs.
- Do not develop v3.2 without new, diverse evidence.
- Do not tighten the v3.1 prompt yet.
- Consider prompt changes only after building a benchmark from different real
  videos.
- Keep Signal Filter v3.1 frozen as the limited-MVP baseline.
- Keep `maxVideoAnalysesPerRun=1`.
- Reject hard duration-tier ranking B for production: its offline regression
  reproduced boundary, low-view, and malformed/extreme-metadata failures.
- Use B-soft v1 for automatic-discovery metadata ranking. Its production
  regression passed the six-candidate benchmark, all 720 permutations, and the
  registered engineering invariants without changing Signal Filter v3.1.
- Defer author-relative variant D until reliable author history exists; any
  future use is an optional boost requiring a separate owner decision.
- Run an MVP readiness audit before investing in more filter refinement.
- Treat the completed readiness preflight as the input to the MVP Discovery
  Integration Patch. It stopped before provider execution and spent `$0`.
- Use this chat for brainstorming and task definition.
- Use separate working agents for implementation and tests.

Paid Gemini or Apify work always requires explicit permission, a preflight, and
an established budget.

## 2026-08-12 authentication and Studio decisions

- Keep deployed browser authentication same-origin through the staging
  frontend `/api` proxy. `CLIENT_URL` is the frontend origin only; the Google
  redirect URI is the full frontend callback.
- The owner manually verified logout, repeat login, and iPhone login after the
  staging configuration correction. Do not undo this separation.
- Treat ordinary accessible public YouTube videos, including conversational
  videos, as analyzable through Gemini's official public URL capability.
- Parse current Interactions responses from `steps[]` and request structured
  evidence. Never manufacture transcript, observations, scenes, or analysis
  from title/description metadata.
- Use one shared platform capability contract for YouTube, TikTok, and
  Instagram/Reels. YouTube is supported today; TikTok/Instagram arbitrary
  public pages fail closed until an approved compliant audiovisual path exists.
- The fallback is a user-owned upload or owner-authorized captions. Do not add
  a downloader or scraper without a separate legal/provider decision.
- Preserve the existing three adaptation variants. Script Editor must receive
  a genuinely adapted, shootable structured scenario, not an idea list.
- Preserve old adaptations when a refresh fails and show the safe diagnostic
  even while retained content remains available.
- One public-video attempt means one video-analysis invocation, retries=0, and
  at most one remix only after grounding succeeds.
- A reversible staging-only tester grant was used for acceptance. It does not
  change production or public billing semantics.

Live acceptance on 2026-08-12 confirmed a real YouTube signal populated
Overview, verified evidence, spoken Transcript, and Deep Analysis. Deterministic
tests confirm all three adaptations and the structured Script Editor contract;
do not broaden the live claim beyond that recorded evidence.

## 2026-08-15 offline integration decisions

- The integration source base is
  `0e4252c70f112a61213eed4deaa681a31ed4f9ca`; the integrated state is not a
  commit or deployment.
- Saved URL analysis language is explicit `uk` / `en`, defaults to `uk`, and is
  part of server reuse, persistence, single-flight, and frontend response
  identity. Missing legacy language continues to mean `uk`.
- Original `spokenText`, transcript segments, `spokenContent`, `onScreenText`,
  and on-screen observation `text` remain unchanged evidence. Translation is
  optional and stored only in `localizedText` or `localizedOnScreenText`.
- Studio Source Evidence owns original speech/OCR presentation. Localized Deep
  Analysis must not duplicate direct transcript, spoken-scene, or OCR content.
- New remix fields are additive. New generation must cover
  `visible_source_conflict`, `mechanism_walkthrough`, and `viewer_decision`
  exactly once, but old stored results without those fields must still open in
  Studio and Content Plan.
- Deterministic integration proves Saved URL → Studio → three angles → selected
  production script → content-plan draft. The semantic benchmark proves 5/5
  synthetic packages and rejects the collapsed generic-AI fixture; it does not
  prove live provider quality.
- Real remix requests now receive the workspace language and a prompt boundary
  against copying foreign-language speech/OCR into the adaptation. This remains
  offline contract evidence until a separately budgeted live audit exists.
- A separately approved `$0.75` Instagram-plus-TikTok run now has a tested
  run-local hard-cap configuration. Its conservative maximum is `$0.718600`,
  including both platform actor caps, a double-counted video-input reserve,
  and explicit Gemini output/request bounds. The controls are additive and do
  not change defaults when their environment is absent.
- The user-driven fallback accidentally opened legacy root `/`. Its Instagram
  import made one Gemini thumbnail call and two Gemini remix calls; both remix
  outputs were rejected. Apify and video-analysis calls were zero, no Saved URL
  or Reel persisted, and actual Gemini cost is unknown because legacy telemetry
  did not record tokens/cost. The preserved ignored local store reports four
  total AI operations including one earlier Brand Brain derivation. Services
  are stopped.
- Future controlled acceptance must set both
  `PERSONAL_URL_STRICT_LIVE_RUN=true` and
  `VITE_PERSONAL_URL_CONTROLLED_PRODUCT_ENTRY=true`. The backend flag permits
  only the budgeted redesign Saved URL scope; the frontend flag makes root `/`
  enter Product Discover. Neither changes normal defaults when absent.
- For a credentialless local readiness session, additionally set
  `PERSONAL_URL_CREDENTIALLESS_PREFLIGHT=true`. This default-off flag is
  recognized before `.env` loading, requires strict mode plus the complete cap
  configuration, blocks even `personal_saved_url` with structured
  `provider_not_configured`, and suppresses deferred CRM, Discovery, and
  provider cleanup work. Removing it returns to strict paid-run behavior,
  including the requirement for real provider credentials.

## Product architecture

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

## Decision boundaries

1. **Channel Filter** decides which sources to monitor.
2. **Signal Filter** decides whether a specific video deserves the shared bank.
3. **Brand Match** decides how well a verified video fits a specific Brand
   Brain.

These stages must not be collapsed. Source quality is not video admission, and
video admission is not user-specific relevance.

Signal Filter persists `accept`, `reject`, or `uncertain` separately from
`admittedToBank`. Only `decision=accept` plus `admittedToBank=true` can write to
the Verified Signal Bank. `uncertain` always stays out.

## Evidence status

Signal Filter progressed through v2, v3, and v3.1. The final v3.1 consistency
run had stable bank admission across three MindStudio and three Axial
evaluations, with no false admission, false rejection, schema failure, or
missing/duplicate evidence IDs.

This evidence establishes a safe limited-MVP baseline on two reference videos,
not general quality across niches or formats. The missing diverse benchmark is
an input to future filter work, not a reason to repeat the same two-video run.

## Completed integration scope

- redesign Brand Brain persists through the backend;
- the active Brand Brain reaches Automatic Discovery;
- redesign Refresh Bank runs under manual safety limits;
- Collection requires `decision=accept && admittedToBank=true`;
- B-soft, Gemini, Signal Filter, and classified failure traces are preserved;
- the discovery path analyses at most one video per run;
- one real admitted staging signal reached Collection and Studio.

The next route begins with a product decision about usefulness and adaptation,
then a small set of real signals and 5–7 target-user tests. Do not resume paid
discovery merely to accumulate volume before deciding what user behavior the
next experiment must measure.

Staging is separate from production. Start with a Railway-generated domain and
backend-only secrets. A Volume is acceptable for early JSON persistence;
PostgreSQL is preferred before production.

## Data and repository hygiene

- The redesign is the only active product surface; do not modify the legacy
  dashboard or main domain.
- Port `3000` is backend API only.
- `backend/data/db.json` is local runtime data and must not be edited or staged
  unless explicitly requested.
- Do not commit benchmark downloads, evidence frames, temporary outputs,
  credentials, or provider payloads.
- Production data was not changed during the Signal Filter experiments.

## Historical context

The earlier Build Week Agent Studio and Free Trial decisions remain historical
implementation context in the repository. They do not override the current
redesign-only product direction or the limited MVP scope.

## Owner-only shared-bank moderation

The limited MVP supports one product-owner action in the redesign Collection:

- `POST /api/owner/signals/:signalId/exclude`;
- backend authorization uses the existing owner/unlimited-access gate, so the
  frontend visibility check is only a usability layer;
- the action is global and currently supports only owner moderation, not user
  feedback or personal hiding;
- exclusion changes only `importedMetadata.qualityGate.admittedToBank` to
  `false`; the original `decision`, assessment, observations, evidence chains,
  and filter results remain unchanged;
- the record is retained with an extensible `ownerModeration.global` audit
  object containing `scope`, `reasonCode`, `excludedAt`, actor identity,
  `previousState`, and an audit history. This supports a future restore action
  without deleting the signal or losing its provenance;
- repeated exclusion is idempotent and does not append a second audit event;
- future user-facing “Не підходить” feedback must be personal (`scope=user`)
  and must not alter the global bank or Signal Filter decisions automatically.
