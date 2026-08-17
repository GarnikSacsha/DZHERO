# Open issues

Last updated: **2026-08-17**

## Verified integration and remaining evidence gap

- The redesign Brand Brain → manual Refresh Bank → Collection → Studio
  path is verified on PostgreSQL-backed Railway staging.
- The first admitted fitness signal had strong engagement but only AI Match 42
  and was judged weakly useful by the owner.
- Decide whether weak personal matches should be downranked, hidden below a
  threshold, or improved through explicit user feedback. This belongs to Brand
  Match/Collection, not the shared-bank admission contract.
- The exact 2026-08-05 staging run ID and provider cost were not captured in
  the repository. Retrieve them from authenticated staging state only if a
  later audit requires exact accounting.

## Discovery and source quality

- Full Channel Discovery is not implemented.
- Channel Filter has not been designed or validated.
- Author-relative variant D is deferred until reliable author history exists;
  if revisited, it may only be an optional boost under a separate decision.
- The B-soft evidence contains only six real ranking labels in the initial AI /
  vibe-coding niche and does not establish ranking quality in other niches.
- `@solvexhq` remains a residual top-3 risk: it is third in the baseline B-soft
  order and can become second in coefficient sensitivity checks.
- Before increasing `maxVideoAnalysesPerRun` above `1`, run a new labeled
  benchmark and reassess the risk of lower-ranked candidates reaching Gemini.
- Adding Instagram, TikTok, and YouTube channel URLs must be verified
  end-to-end.
- Public social media may block retrieval or make media unavailable; source
  failures must remain honest and classified.

## Signal Filter evidence gaps

- There is no benchmark of 30 diverse real videos.
- v3.1 has not been validated on fitness, food, coffee, comedy, story, or
  visual-product content.
- The current evidence covers only MindStudio and Axial reference videos.
- Do not start v3.2 or change the v3.1 prompt, schema, policy, or thresholds
  until diverse evidence justifies a separate owner decision.

## Adaptation and end-to-end product

- Grounded manual YouTube acquisition now has one live staging acceptance for
  Overview, verified evidence, spoken Transcript, and Deep Analysis.
- Deterministic coverage proves the three retained adaptations and structured
  shootable Script Editor; live Script Editor usability still needs a focused
  user audit across more than one signal.
- Brand Brain → Collection → Studio is verified; the next unproven step is
  whether users repeatedly turn signals into useful adaptations and return.
- The product must prove that users can distinguish DZHERO from a collection of
  saved Reels by actually adapting useful ideas.
- The 2026-08-15 offline lifecycle proves Saved URL → Studio → three bounded
  semantic angles → three-scene production script → content-plan draft, but it
  is deterministic contract evidence rather than live-provider/user evidence.
- The synthetic semantic benchmark passes all five packages and rejects the
  collapsed generic AI-marketing fixture, but it does not measure diverse live
  provider output quality.
- The deterministic semantic fallback can still embed English synthetic source
  descriptions inside otherwise Ukrainian-visible hooks/scenes. Production
  provider prompts now receive `uk/en` and explicitly prohibit this copying,
  but language purity needs a dedicated offline assertion and later budgeted
  live-provider audit before it can be claimed.
- The OCR UI contract is covered by state and static component tests; responsive
  browser rendering has not received a separate visual QA pass.

## Public-video acquisition backlog

- Wire a user-owned video upload into the redesign fallback.
- Add owner-authorized captions only when permission and provenance can be
  verified.
- TikTok and Instagram/Reels arbitrary public-page URLs must remain
  `public_url_analysis_unsupported` unless an official compliant audiovisual
  path is approved. Do not add a downloader or generic scraping dependency.
- Expand live acceptance to a small diverse set of public YouTube formats and
  record safe reason codes for private/login/age/region/provider rejection.
- Capture usage/token/cost evidence in a later explicitly budgeted audit if
  exact accounting is required; it was not persisted in the 2026-08-12 owner
  acceptance record.

## Data boundaries

- Public URLs and private uploaded files must be represented separately.
- User uploads must not enter the shared bank automatically.
- A public URL may become a shared-bank candidate, but admission still requires
  `decision=accept` and `admittedToBank=true`.
- A user-added account may enter the shared source catalog, but must not become
  globally recommended automatically.
- Channel Explorer may show all source publications; Verified Signal Bank must
  show only admitted signals.

## Cost and operational safety

- Personal Instagram/TikTok Saved URL runs now have optional fail-closed,
  run-local controls for aggregate Apify exposure/actor starts, verified media
  duration, and Gemini input/request/output bounds. The approved two-source
  configuration is conservatively capped at `$0.718600` under `$0.75`.
- The broader MVP still requires persisted hard spending controls per run and
  per month; the new personal-URL guard is process-local configuration, not a
  replacement for account-level provider budgets or billing alerts.
- Metadata filtering, canonical-URL deduplication, and bounded top-1 download
  are verified. Cross-user analysis reuse still needs end-to-end verification.
- Keep `maxVideoAnalysesPerRun=1` until a separate owner decision.
- No paid Gemini or Apify call is allowed without explicit permission,
  preflight, and an established budget.
- The 2026-08-15 user-driven fallback exposed a legacy-root safety bypass:
  Instagram import made one Gemini thumbnail and two Gemini remix operations.
  Apify and video analysis stayed at zero; outputs were rejected and nothing
  persisted. Exact Gemini cost is unknown. The services are stopped and the
  ignored local runtime store is preserved as evidence with `ai_operations=4`
  including one earlier Brand Brain derivation.
- A new opt-in strict backend scope blocks every unrelated paid-AI guard and
  known direct server provider entry point, while a separate opt-in frontend
  flag redirects root to Product Discover and preserves that route on auth
  failure. A route-level isolated-backend regression now dynamically verifies
  the full blocked-route matrix, background suppression, parallel isolation,
  Saved URL single-flight behavior, exact fake-provider attempt counts, and
  zero external network attempts.
- A separate default-off credentialless preflight now permits local strict-mode
  startup without provider keys only when the full cap is enabled. It skips
  `.env` before parsing, blocks the intended Saved URL scope before any
  provider/network access, and disables deferred CRM, Discovery, and provider
  cleanup work. A sentinel `.env` plus parallel route-level regression proves
  zero credential import and zero outbound/provider attempts. This is a UI/API
  readiness mode only; live acceptance remains unfinished.

## Railway staging

- Separate frontend and backend staging services are live and use PostgreSQL.
- Frontend, direct backend health, and frontend-proxied health returned HTTP 200
  on 2026-08-12 for commit `0093e4f`.
- Same-origin logout, repeat login, and iPhone login are manually accepted.
- The public health endpoint does not expose deployed Git SHA; exact revision
  checks still require Railway deployment metadata.
- Keep secrets in backend environment variables only, with separate staging
  credentials and budgets.
- Keep Automatic Discovery disabled until a separate owner decision; manual
  Refresh remains the bounded staging path.
- Production remains untouched.
- A reversible tester grant exists only for the staging acceptance workspace;
  do not treat it as production billing configuration or general access.

## MVP validation

- Run a readiness test with 5–7 target users in the initial AI / vibe coding /
  AI agents niche.
- Measure real adaptation, return usage, and payment rather than design praise.
- Willingness to pay is confirmed by an actual `$15` payment, not stated
  intent.
- The target thresholds and red flags are defined in
  [`MVP-SCOPE.md`](MVP-SCOPE.md).

## Repository hygiene

- `backend/data/db.json` is local runtime state and must not be edited or
  committed without an explicit request.
- Do not commit downloaded benchmark videos, evidence frames, temporary
  outputs, or credentials.
- Do not change the legacy dashboard or main domain while product work remains
  redesign-only.
