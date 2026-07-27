# DZHERO work3 — target architecture

Status: proposed Phase 0 architecture for approval.

## 1. Decision

Use a progressive normalized PostgreSQL architecture alongside the existing `app_state` JSONB compatibility layer.

Rejected alternatives:

- Extending only `app_state` is fast initially but makes ingestion history, concurrent workers, versioning, telemetry, and multi-replica writes increasingly unsafe.
- A full service/event rewrite creates unnecessary migration risk for stable authentication, Brand Brain, generation, and planning flows.

The chosen design isolates new append-heavy domains while allowing existing APIs and production behavior to continue during shadow mode and rollback.

## 2. Logical flow

```text
Authenticated source CRUD
        |
        v
Durable ingestion job -- budget reservation / kill switch
        |
        v
Apify run telemetry -- bounded raw result retention
        |
        v
Normalize + global identity + exact/near duplicate cluster
        |
        v
Hard filters -> deterministic features -> AI analysis -> approval
        |
        v
Global signal (one original)
        |
        +--> Brand Brain match per workspace/user
                 |
                 v
              Today
                 |
       save/dismiss/adapt feedback
                 |
                 v
      versioned adaptation -> Content Plan
```

## 3. Persistence model

Names are provisional but responsibilities are fixed.

| Entity | Responsibility |
|---|---|
| `schema_migrations` | ordered, checksum-verified migration history |
| `sources` | canonical source definition, validation, ownership, status |
| `source_sync_state` | incremental cursor, backoff, health, yield |
| `ingestion_jobs` | durable job status, lease, attempt, reservation, idempotency |
| `apify_runs` | one provider run, IDs, timestamps, status, exact cost/usage |
| `raw_content` | bounded normalized provider evidence and retention state |
| `content_identities` | canonical URL/platform ID/fingerprints/duplicate cluster |
| `signal_analyses` | deterministic and AI features with model/prompt/schema versions |
| `global_signals` | approved original signal and lifecycle state |
| `brand_profiles` | immutable/versioned recommendation inputs derived from Brand Brain |
| `user_signal_matches` | match score, reason, rank features, impression state |
| `signal_feedback_events` | append-only save/dismiss/not-relevant/view/use/adapt events |
| `adaptations` | ownership and link to signal/Brand Brain |
| `adaptation_versions` | immutable inputs/outputs/critique/usage for each revision |
| `usage_costs` | AI/Apify cost ledger with provenance and micro-USD precision |
| `ranking_configs` | versioned weights, thresholds, diversity policy |
| `admin_audit_log` | actor and before/after evidence for operational decisions |

All rows include stable IDs, timestamps, and workspace/user scope where appropriate. Global originals contain no private Brand Brain data. Raw payload retention is separate and access-controlled.

### Source contract

`sources` retains the complete operational definition requested by the product: `id`, `platform`, canonical `username`/`profile_url`, `external_profile_id`, `source_type`, nullable `owner_user_id`/`workspace_id`, `niche`, `language`, `country`, `priority`, `active`, `scrape_frequency`, `posts_per_run_limit`, `last_scraped_at`, `next_scrape_at`, `last_success_at`, `consecutive_failures`, `average_items_per_run`, `average_cost_per_run`, and audit timestamps.

Fast-changing cursors, leases, backoff, and health live in `source_sync_state` so routine worker updates do not rewrite the source definition. System sources have null personal ownership; personal sources never become globally manageable merely because their content can dedupe to a global original.

### Global signal contract

A signal retains source/content identity, safe original/media references, caption/transcript derivatives, language/country/niche/topic, format/hook/mechanic/value, difficulty/resources, normalized performance and author baseline, quality dimensions, lifecycle/trend stage, evidence confidence, moderation status/reason, analysis versions, freshness/expiry, and audit timestamps.

Raw provider JSON, personal scores/actions, and adaptation output are deliberately excluded from the normal global-signal row.

## 4. One original, personal state

One external item maps to one `content_identity` and at most one active `global_signal`. Workspace relevance, save/dismiss state, explanations, and adaptations live in separate records.

Identity tiers:

1. exact provider platform/stable ID;
2. canonical original URL;
3. normalized author + publish time + caption fingerprint;
4. media/thumbnail perceptual fingerprint;
5. caption/transcript similarity;
6. explicit cross-platform repost cluster.

Lower-confidence near matches are clustered for review, not automatically destroyed. Superseding a signal is a reversible lifecycle transition.

## 5. Ingestion funnel

### Stage A — source and job admission

- validate and canonicalize source;
- enforce role/entitlement;
- apply kill switch, schedule/backoff, allowlist, concurrency, and budget;
- calculate a dated dry-run estimate;
- reserve the upper bound;
- enqueue an idempotent job and return `202`.

### Stage B — provider collection

- use a dedicated worker;
- use authorization headers;
- bounded start/poll/fetch with provider IDs retained;
- store exact provider usage/cost;
- collect metadata first; fetch heavy media only for winners.

### Stage C — normalization and identity

- allowlisted fields only;
- language/platform/author/source normalization;
- incremental cursor update only after safe persistence;
- exact identity upsert;
- near-duplicate cluster candidate.

### Stage D — signal qualification

1. hard reject: invalid media/evidence, unsupported language/market, stale beyond policy, unsafe content, inaccessible original;
2. deterministic quality: source-relative velocity, engagement quality, freshness, evidence completeness, format detectability, adaptability, originality;
3. structured AI analysis for ambiguous semantic fields only;
4. policy threshold and optional review;
5. approved global signal.

Every rejection carries machine-readable reason and evidence.

## 6. Quality and ranking

Global quality and personal relevance are separate:

`eligible = approved && not_expired && evidence_complete && policy_safe`

The initial configurable formula contains the requested dimensions:

```text
today_score =
  brand_match_weight * brand_match_score
+ adaptability_weight * adaptability_score
+ viewer_value_weight * viewer_value_score
+ outlier_weight * outlier_score
+ hook_weight * hook_score
+ reproducibility_weight * reproducibility_score
+ freshness_weight * freshness_score
+ preferred_source_weight * preferred_source_score
+ novelty_weight * novelty_score
- language_mismatch_penalty
- production_mismatch_penalty
- already_seen_penalty
- duplicate_penalty
- creator_dependency_penalty
- low_information_penalty
```

The exact formula lives in a versioned `ranking_configs` record. Hard policy thresholds are checked before weights.

Diversity is applied after scoring:

- author cap;
- platform cap/floor;
- format and signal-type cap;
- near-duplicate cluster cap;
- exploration slots for high-quality low-history sources.

When fewer items qualify, Today shows fewer items. It never fills quota with below-threshold content.

## 7. Brand Brain matching

Brand matching uses a versioned recommendation profile derived from the existing Brand Brain without exposing raw private answers to external providers.

Features include:

- niche/topic affinity;
- audience fit;
- market/language fit;
- creator positioning and tone;
- feasible format/duration/platform;
- novelty relative to prior impressions and feedback;
- negative signals from dismiss/not-relevant events.

The stored explanation cites matched features and signal evidence. AI may verbalize a deterministic evidence set; it may not invent the match basis.

## 8. AI analysis stages

Use small, explicit schemas:

- content understanding: topic, format, hook, structure, language;
- trend evidence: why it is moving, evidence confidence, lifecycle;
- adaptability: reusable mechanism, copying risk, production difficulty;
- Brand match explanation;
- adaptation generation and critic.

Each call records provider, model, prompt version, schema version, input hash, output status, token/usage/cost, and correlation IDs. Imported captions/transcripts are untrusted data, never instructions. Parse failures, low confidence, and policy failures stop promotion.

No AI is used for fields that deterministic normalization can establish.

## 9. Durable jobs

`ingestion_jobs` is a PostgreSQL queue in Phase 1:

- workers claim with `FOR UPDATE SKIP LOCKED`;
- leases and heartbeats recover crashed jobs;
- idempotency key prevents duplicate source-window work;
- attempt caps and classified retries;
- exponential backoff with jitter;
- provider/platform concurrency;
- reservation and actual-cost reconciliation;
- cancellation and global kill switch;
- dead-letter state with admin retry.

The worker is a separate Railway service/command. The API process never waits for paid collection.

## 10. API boundaries

Proposed authenticated APIs:

- `GET /api/workspaces/:workspaceId/today`
- `POST /api/workspaces/:workspaceId/signals/:signalId/events`
- `GET /api/workspaces/:workspaceId/saved-signals`
- `GET|POST /api/workspaces/:workspaceId/sources`
- `PATCH|DELETE /api/workspaces/:workspaceId/sources/:sourceId`
- `POST /api/workspaces/:workspaceId/sources/:sourceId/dry-run`
- `POST /api/workspaces/:workspaceId/sources/:sourceId/refresh`
- `GET /api/workspaces/:workspaceId/ingestion-jobs/:jobId`
- `POST /api/workspaces/:workspaceId/adaptations`
- `GET /api/workspaces/:workspaceId/adaptations/:adaptationId`
- `POST /api/workspaces/:workspaceId/adaptations/:adaptationId/revisions`
- `POST /api/workspaces/:workspaceId/adaptations/:adaptationId/plan`
- owner/admin operational endpoints for candidates, runs, costs, config, and audit.

All mutations require authentication, workspace access, role where needed, CSRF/session protections already used by the application, input schemas, idempotency, and rate limits. Normal responses never include raw provider payloads, secrets, or private infrastructure IDs.

## 11. Today response contract

Each item returns:

- global signal ID, original URL, safe media, platform, author;
- published time and normalized metrics;
- signal type/stage and evidence summary;
- global quality score/version;
- personal match score/version and “why for you” evidence;
- adaptation angle;
- current personal event state;
- expiration and freshness metadata.

Cursor pagination must bind to ranking-config and Brand-profile versions so a page does not reorder mid-session. Impression creation is idempotent.

## 12. Adaptation model

An `adaptation` owns an ordered set of immutable `adaptation_versions`. Settings are schema-validated and duration is bounded to 10–90 seconds in the initial design. A revision never overwrites prior output.

Content Plan stores the selected version reference. Generation uses the approved global signal, current or explicitly selected Brand profile version, and user settings. The existing Remix and Agent Studio paths are adapters into one versioned domain, not discarded systems.

## 13. Compatibility and migration

1. Add migrations and new tables without changing legacy reads.
2. Dual-write only where required and verify with reconciliation metrics.
3. Import legacy reels into global identity/signals idempotently.
4. Shadow-compute ranking and compare to the legacy feed.
5. Enable Today/Sources for pilot workspaces.
6. project approved globals into legacy `/reels` where compatibility is needed.
7. switch navigation defaults only after acceptance.
8. retain rollback through feature flags and legacy read path.

No migration reads or writes `backend/data/db.json` as production truth.

## 14. Backfill of the 219 existing signals

Before mutation, export a read-only manifest with count, IDs, canonical URLs, platform IDs, workspace ownership, timestamps, metrics, media references, and import metadata. The local work3 seed does not contain 219 items, so production/shared-bank access is required to verify this set.

Backfill rules:

- append/upsert, never delete;
- preserve legacy ID as external/compatibility identity;
- deterministic dry run emits creates/updates/no-ops/conflicts;
- checksum and count gates;
- checkpointed batches;
- no Actor or AI calls unless separately estimated and approved;
- unresolved near duplicates enter review;
- reversible mapping table;
- before/after reconciliation report.

## 15. Security and operations

- server-only provider credentials;
- authorization headers, sanitized logs, and correlation IDs;
- SSRF-safe media fetch with DNS/IP validation on every redirect, content-type and byte caps;
- encrypted/limited raw evidence with retention expiry;
- separate owner/admin role and audited overrides;
- webhook signature/replay controls before adding webhooks;
- daily/monthly/max-run budgets and an emergency kill switch;
- no full Brand Brain or raw caption passed into logs;
- migration backup, transaction boundaries, and rollback scripts;
- health/readiness endpoints for web and worker;
- metrics for queue depth, lease age, provider errors, yield, rejection, cost, and ranking coverage.

## 16. Architecture acceptance criteria

- exact duplicate ingestion is idempotent across workers and workspaces;
- one original supports multiple personal matches and adaptations;
- paid work is never executed synchronously by an API request;
- a killed or retried worker does not lose or double-charge application state;
- costs are attributable to provider run and ingestion job with sub-cent precision;
- every Today item is approved, explainable, diverse, and feedback-aware;
- all adaptation revisions are recoverable;
- legacy behavior remains available behind rollback flags;
- backfill reconciliation proves all 219 records are preserved.
