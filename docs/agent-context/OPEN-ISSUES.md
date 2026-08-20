# Open issues

Last updated: **2026-08-20**

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
- The newly confirmed Product Live personal-URL adaptation path covers YouTube,
  Instagram/Reels, and TikTok at the staging-flow level. This does not prove
  arbitrary channel-URL discovery, durable source availability, or broad
  provider quality.
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

- Product Live adaptation is technically confirmed on staging for YouTube,
  Instagram/Reels, and TikTok after `b59958d`. A TikTok source can reach the
  analysis/adaptation path even though its poster/preview is currently missing.
- A provider-free TikTok preview fix is locally RED→GREEN, but it is not
  committed, integrated, deployed, or staging-reverified. Keep the staging
  preview defect open until the deployed Product Live path renders it.
- The second attempt may return `qualityStatus=accepted_with_warnings` only
  after schema-valid non-empty output; invalid schema, safety/content/budget,
  provider, and transport errors remain hard failures. Live usefulness and
  language-quality evidence remain unproven.
- Brand Brain → Collection → Studio is verified; the next unproven step is
  whether users repeatedly receive useful enough signals and turn them into
  useful adaptations.
- The product must prove that users can distinguish DZHERO from a collection of
  saved Reels by actually adapting useful ideas.

## Three-profile signal-bank validation

- Provider-free AI, fitness, and café lifecycle validation now passes locally:
  one shared state, real frozen v3.1 policy, exactly three accepted/admitted
  signals per workspace, max-one analysis, isolation, dedupe/suppression/replay,
  classified errors, and zero-network tripwires.
- For every profile, target 3–5 truthful signals visible in the correct bank.
  They must be results of `decision=accept && admittedToBank=true`, not raw
  candidates, manual insertion, or unrelated filler.
- Exact audience wording is not a source-retrieval gate. Compact product/topic
  planning is now covered locally; a 758-character description becomes a
  114-character/13-word whole-word query beneath the 120-character/16-word
  cap. Generic bootstrap remains only for missing topic context.
- Future live Apify/Gemini runs require a separate preflight, hard budget,
  explicit owner approval, and recorded evidence. They are not authorized by
  this documentation update.

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

- The MVP requires hard spending controls per run and per month.
- Spending limits must fail closed.
- Metadata filtering, canonical-URL deduplication, and bounded top-1 download
  are verified. Cross-user analysis reuse still needs end-to-end verification.
- Keep `maxVideoAnalysesPerRun=1` until a separate owner decision.
- No paid Gemini or Apify call is allowed without explicit permission,
  preflight, and an established budget.

## Railway staging

- Separate frontend and backend staging services are live and use PostgreSQL.
- Earlier health evidence from 2026-08-05 is historical. The `b59958d`
  documentation records frontend, direct backend, and frontend-proxied health
  HTTP 200 on 2026-08-12 for `0093e4f`; the later 2026-08-20 confirmation did
  not record an exact deployed SHA.
- The public health endpoint does not expose deployed Git SHA; exact revision
  checks still require Railway deployment metadata.
- Keep secrets in backend environment variables only, with separate staging
  credentials and budgets.
- Keep Automatic Discovery disabled until a separate owner decision; manual
  Refresh remains the bounded staging path.
- Production remains untouched.

## MVP validation

- Run a readiness test with 5–7 target users across the three approved Brand
  Brain profiles after each profile has truthful bank inventory.
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
