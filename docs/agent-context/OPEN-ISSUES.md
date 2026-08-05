# Open issues

Last updated: **2026-08-05**

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

- Adaptation-generation quality has not been validated separately.
- Brand Brain → Collection → Studio is verified; the next unproven step is
  whether users can turn admitted signals into genuinely useful adaptations.
- The product must prove that users can distinguish DZHERO from a collection of
  saved Reels by actually adapting useful ideas.

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
- Backend and frontend health returned HTTP 200 on 2026-08-05.
- The public health endpoint does not expose deployed Git SHA; exact revision
  checks still require Railway deployment metadata.
- Keep secrets in backend environment variables only, with separate staging
  credentials and budgets.
- Keep Automatic Discovery disabled until a separate owner decision; manual
  Refresh remains the bounded staging path.
- Production remains untouched.

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
