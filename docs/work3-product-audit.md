# DZHERO work3 — product audit

Status: Phase 0 design document. No production data, Apify Actor, or paid AI call was used to prepare it.

## 1. Executive finding

DZHERO already contains the difficult foundations of a useful creator product: authentication and workspace isolation, Brand Brain onboarding, a signal bank with media previews, structured remix generation, a content plan, and a stronger multi-agent generation path in Agent Studio. The central product problem is not a missing generator. It is that the current signal bank is a mostly global, weakly filtered feed whose ordering is not meaningfully personalized to a creator's Brand Brain.

The redesign should therefore preserve the existing product spine and replace the path between ingestion and recommendation:

`sources -> raw content -> normalized candidate -> quality gate -> global signal -> Brand Brain match -> Today -> adaptation -> plan`

## 2. Current system architecture

- Frontend: React 19 and Vite, with most application routing and state orchestration in `src/main.jsx`.
- Backend: Express 5 monolith in `backend/server.js`, supported by focused services in `backend/services`.
- Production persistence: PostgreSQL with the application state stored as one `app_state` JSONB row.
- Local persistence: `backend/data/db.json`; it is runtime data and must not be used as a migration source or committed as part of work3.
- AI: Gemini-backed Brand Brain/remix paths plus the stronger OpenAI/Gemini Agent Studio runtime with schema validation and critic/revision stages.
- External collection: four Apify Actors used directly from the web process.
- Background work: in-process timers and `setImmediate`; no separate durable worker or queue.

The single JSONB document is acceptable as a compatibility boundary, but append-heavy ingestion, event history, cost telemetry, matching, and adaptation versions should move to normalized PostgreSQL tables. Rewriting all stable product state at once would add risk without adding user value.

### Current data and deployment details

`normalizeDbShape` establishes the effective JSON collections at runtime, but there is no ordered migration framework. Most mutations read and rewrite the whole application state. Automatic discovery has PostgreSQL locking; other write serialization is largely process-local, so multiple Railway web replicas can still create lost-update risk.

Railway deployment relies on package auto-detection and `npm start`. The repository contains no dedicated worker service manifest, Dockerfile, Procfile, Nixpacks configuration, or Railway cron configuration. Deployment notes say automatic discovery is enabled, but the exact deployed backend revision can only be confirmed from Railway.

### Current background jobs

Automatic discovery is an in-process scheduler: an interval wakes in the web process, decides which workspace/lane is due, and performs paid work there. `syncJobs` and discovery-run records provide partial status, but there is no durable queue, lease, dead-letter state, or worker isolation. Forced discovery and manual imports can hold an HTTP request while an Actor runs.

### Current AI paths

- Brand Brain uses structured inputs and derives a compact brief plus a single recommendation.
- the ordinary remix route has structured JSON/quality checks but is effectively optimized around 15 seconds and does not persist immutable generation versions;
- Agent Studio is the strongest reusable runtime: OpenAI GPT-5.6 structured specialist outputs, Zod validation, Gemini evidence/video analysis, hybrid synthesis, a critic, and usage tracking;
- deterministic analysis endpoints should be labeled as deterministic rather than presented as a model provider result;
- imported captions/transcripts are not yet consistently isolated as untrusted prompt data across a staged analysis pipeline.

## 3. Current DZHERO flow

1. A user authenticates and enters a workspace.
2. Brand Brain requires profile description, audience, niche, and market; Instagram is optional.
3. Finalization derives a brief and selects one recommendation.
4. The completed onboarding currently sends the user to the full Signals bank.
5. A signal can be previewed and sent to Remix Studio.
6. Remix produces an adaptation that is effectively hard-coded around 15 seconds.
7. The result can be placed in Content Plan.
8. Agent Studio, when enabled, can produce a more robust hero concept, alternatives, hybrid synthesis, critic feedback, and a seven-day approval path.

## 4. What works and must be preserved

- Authentication, session handling, workspace membership checks, rate limits, Helmet, CORS, and the 1 MB JSON limit.
- Brand Brain v2 answers, derived brief, onboarding completion, and existing generation entry points.
- Existing signal media preview, thumbnail behavior, focus trapping, themes, localization, and signal state helpers.
- Remix and Agent Studio structured outputs and validation, especially Agent Studio specialists, critic, provenance, usage telemetry, and approval workflow.
- Content Plan data model and calendar utilities.
- Existing source/discovery API behavior during the compatibility period.
- Existing 219 production signals: no destructive cleanup, bulk overwrite, or assumption that the local seed represents them.
- Railway deployment and the current PostgreSQL application-state path until a staged cutover is verified.

## 5. Why current signals feel irrelevant

The current scoring formula emphasizes absolute views, engagement, freshness, and media availability. Its score floor and fallback threshold allow weak candidates to enter the bank. Exact URL/platform-ID dedupe exists, but there is no near-duplicate detection, repost classification, source-specific baseline, language fit, adaptability gate, or cross-platform identity.

Most importantly, `/reels` returns workspace records ordered by global metrics rather than a persistent per-user match. Brand Brain matching is limited to token overlap, market hints, quality, and an optional one-item Gemini choice at onboarding. The feed does not consistently answer:

- Why this signal is relevant to this creator.
- What evidence made it a trend rather than merely a popular post.
- How the format can be adapted without copying.
- Whether the same author or format is crowding out diversity.
- Whether the user saved, dismissed, used, or already saw it.

The result is a large bank that can look impressive but behaves more like a generic inspiration feed than a daily creative decision tool.

## 6. Navigation and surface gaps

Current primary navigation is Home, Signals, Remix, Agent Studio, Plan, and Settings. The target product needs:

- Today as the default daily decision surface after onboarding.
- Sources as an authenticated management surface, not only the public Brand Scan preview.
- Saved as a persistent server-backed collection.
- Brand as a first-class destination for Brand Brain review.
- A signal operations/CMS surface restricted to owner/admin roles.

The full Signals bank can remain available as an exploration surface, but it should no longer be the default post-onboarding destination.

## 7. Target Today experience

Today should return a small, diverse, explainable set of approved signals. A card must contain:

- the original post and normalized author/source;
- platform and evidence metrics;
- signal type and lifecycle stage;
- quality and personal match;
- a short “why for you” explanation grounded in Brand Brain fields;
- a non-copying adaptation angle;
- Save, Dismiss, Not relevant, Adapt, and Open original actions.

The backend, not the browser, must decide eligibility, ranking, diversity, impression tracking, and pagination. Empty, loading, stale, partial, and failed states must be explicit.

The default response should contain 3–5 signals only when 3–5 pass the threshold. It may contain fewer; it must not dilute quality to fill the page.

## 8. Sources experience

Sources should support platform, source type, handle/URL/query, market, language, status, last successful sync, next eligible sync, recent yield, and cost. Create/update validation and canonical dedupe must be server-side.

Refresh should enqueue a bounded job and return `202`; it must not wait for an Actor. Each source must expose a dry-run estimate before any paid collection and show why a run is blocked by kill switch, entitlement, concurrency, daily/monthly budget, maximum-run budget, or backoff.

## 9. Saved and feedback

Saved, dismissed, not-relevant, used, viewed, and adapted are personal events linked to a global signal. They must not duplicate the original content. Events should be idempotent where applicable and retain actor, workspace, user, timestamp, and context.

Feedback changes future ranking only through a versioned, observable feature pipeline. It must not silently mutate global quality or delete the signal for other users.

## 10. Adaptation workspace

Adaptation settings should support a bounded target duration rather than a fixed 15 seconds. Phase 1 proposes 10–90 seconds, with a product default selected from the source format. Settings include tone, hook style, structure, CTA, language, platform, constraints, and optional creator notes.

Every generation and revision produces an immutable version containing:

- structured input snapshot;
- referenced global signal and Brand Brain version;
- model/prompt/schema versions;
- generated script/shot plan/caption;
- quality/critic output;
- usage and cost;
- creation actor and timestamp.

Users can compare versions, revise with instructions, restore a prior version by creating a new version, and add a selected version to Content Plan.

The settings schema must include the product-specified duration modes/presets, original-duration option, destination platform, content goal, production format, complexity, creative direction, and additional instruction. A 15-second and 60-second output must differ structurally, not by padding or truncation.

## 11. Content Plan integration

Adding an adaptation to Content Plan should be a server-confirmed transition. The UI must not report success before checking `response.ok`. The plan item should retain `adaptation_id`, `adaptation_version_id`, source signal, and a compact provenance snapshot.

## 12. Admin/CMS

An authenticated owner/admin surface is required for:

- candidates awaiting review;
- approved, rejected, quarantined, and superseded signals;
- quality and matching evidence;
- duplicate clusters;
- source health and yield;
- job/run errors;
- actual and estimated cost;
- ranking/config versions;
- audit logs for manual overrides.

Manual approval or rejection must be reversible through a new audited state transition, not destructive deletion.

## 13. Known baseline defects to integrate deliberately

The separate work3 baseline predates uncommitted fixes currently visible in the user's main working copy. Work3 must either integrate those fixes after they become an explicit commit or reproduce them through tests without copying unrelated dirty state:

- Meta OAuth callback provider lookup mismatch.
- Shared public Agent Studio demo identity/workspace.
- optimistic Content Plan success on failed writes.
- deterministic client logout even when server logout fails.

These are compatibility and correctness tasks, not reasons to merge the dirty main worktree.

## 14. Product success criteria

Pilot metrics must be defined before collection:

- approved signals / raw items and / USD;
- percent of Today impressions with a meaningful action;
- save, dismiss, not-relevant, adapt, and plan-add rates;
- time from Today impression to an accepted adaptation;
- diversity by author, platform, format, and signal type;
- duplicate rate and false-positive review rate;
- recommendation explanation coverage;
- adaptation revision and plan-add success rate;
- job latency, retry rate, and budget-block rate.

No metric should reward filling Today with low-confidence items.

## 15. Phase 0 product decision

Adopt a progressive redesign:

1. Keep stable authentication, Brand Brain, generation, and plan capabilities.
2. Normalize new ingestion, telemetry, global signals, matches, feedback, and adaptations.
3. Introduce Today and Sources behind workspace feature flags.
4. Import the 219 existing signals additively and idempotently after a read-only inventory.
5. Compare new and legacy ranking in shadow mode.
6. Promote Today only after pilot thresholds are met.
