# DZHERO work3 — implementation plan

Status: Phase 0 plan for approval. Implementation, paid pilots, AI analysis, and the 219-signal backfill are intentionally not started.

## Delivery rules

- Work only on branch `work3` in `.worktrees/work3`; do not modify or merge `main`.
- Do not edit or commit `backend/data/db.json`.
- Use test-first changes for every behavior change.
- Preserve authentication, Brand Brain, adaptation, Content Plan, visual style, Railway, PostgreSQL compatibility, Apify integrations, and all existing signals.
- Keep commits phase-scoped and reversible.
- Before any paid AI/Apify action, show dry-run inputs, maximum calls/results, current price evidence, maximum cost, stop conditions, and obtain explicit approval.
- No phase passes its exit gate on a code-complete claim alone: focused tests, full relevant regression suites, build, and a reconciliation/report are required.

## Baseline gate

Already verified in the isolated worktree:

- `npm.cmd install`
- `npm.cmd run test:agent-studio`
- `npm.cmd run test:public-beta`
- `npm.cmd run test:free-trial-ai`
- `npm.cmd run build`

The build passes with the existing large-chunk warning. Dependency audit findings from installation should be triaged separately instead of being silently mixed into this redesign.

## Phase 0 — audit, no product mutation

Deliver:

- `docs/work3-product-audit.md`
- `docs/work3-apify-audit.md`
- `docs/work3-architecture.md`
- `docs/work3-implementation-plan.md`

Exit gate: the user approves architecture, migration strategy, phases, pilot budget envelope, and blocker resolution. No production mutation, Actor run, or paid AI call occurs in this phase.

Suggested commit:

1. `docs(work3): add audited target design and plan`

## Phase 1 — observability and cost control

### Scope

- ordered, checksum-verified PostgreSQL migrations;
- `apify_runs`, `usage_costs`, budget reservations, and operations stats;
- precise micro-USD/fixed-decimal storage;
- actor/run/task/dataset IDs, item counts, duration, Compute Units when supplied, source/job correlation, and cost provenance;
- `APIFY_INGESTION_ENABLED`, daily/monthly/max-run/max-results/max-runs-per-day limits;
- authorization-header Apify client;
- bounded dataset retrieval and SSRF-safe provider media;
- durable `ingestion_jobs` boundary and separate worker command;
- bounded read-only Apify history collector, not executed without approval.

Modify:

- `.env.example`
- `package.json`
- `backend/server.js`
- `backend/services/apifySignalProvider.js`
- `backend/services/automaticSignalDiscovery.js`
- `backend/services/automaticDiscoveryStorage.js`
- `backend/services/agentStudioSourceResolver.cjs`
- `backend/services/agentStudioVideoTool.cjs`
- `docs/BACKEND.md`
- `docs/POSTGRES_STORAGE.md`

Create:

- `backend/db/migrations/001_work3_observability.sql`
- `backend/db/runMigrations.js`
- `backend/services/ingestionJobStore.js`
- `backend/services/ingestionWorker.js`
- `backend/services/apifyRunTelemetry.js`
- `backend/services/apifyCostControl.js`
- `backend/services/apifyStatsCollector.js`
- `scripts/collect-apify-run-stats.mjs`
- `scripts/test-work3-migrations.mjs`
- `scripts/test-apify-client-lifecycle.mjs`
- `scripts/test-apify-run-telemetry.mjs`
- `scripts/test-apify-cost-control.mjs`
- `scripts/test-apify-stats-collector.mjs`
- `scripts/test-apify-media-security.mjs`
- `scripts/test-ingestion-job-store.mjs`

Acceptance:

- repeat migration is a no-op and legacy JSON state remains readable;
- the global switch blocks scheduled, manual, Agent Studio, and public Brand Scan collection;
- no secret appears in URLs/logs;
- sub-cent and failed-run costs survive;
- budget reservation/reconciliation is idempotent;
- refresh enqueues and returns `202`; a worker completes only mocked provider work in tests;
- lease recovery and concurrent claims do not duplicate jobs;
- private IP, redirect, content-type, item, and byte-limit tests pass;
- owner/admin stats expose sanitized aggregate data only.

Suggested commits:

2. `test(work3): define observability and provider safety contracts`
3. `feat(work3): add migrations, run telemetry, and cost controls`
4. `feat(work3): add durable ingestion job boundary`
5. `fix(work3): secure Apify and provider media access`

## Phase 2 — source management

### Scope

Add system and user/workspace sources for:

`system_curated`, `direct_competitor`, `indirect_competitor`, `creator`, `format_reference`, `style_reference`, `niche_reference`, `user_favorite`, `hashtag`, `keyword`, and `manually_added_url`.

Persist platform, canonical username/profile/external ID, ownership, niche/language/country, priority, active state, cadence, per-run limit, scrape cursors/timestamps, failure count, and yield/cost aggregates.

Create:

- source/source-sync migration;
- source validation, canonicalization, permission, schedule, and health services;
- authenticated CRUD, dry-run, limited refresh, job-status APIs;
- focused source duplicate/permission/rate-limit/scheduling tests;
- `src/SourcesPage.jsx` and its API/state tests.

Acceptance:

- unsupported types, unsafe URLs, duplicates, oversized input, and cross-workspace access are rejected;
- users can add, classify, prioritize, disable, delete, refresh, and inspect their sources;
- system sources require owner/admin;
- refresh is rate-limited, budget-gated, asynchronous, and shows found-new count;
- incremental cursor advances only after durable persistence;
- no global scrape is created per user.

Suggested commits:

6. `test(work3): define source lifecycle and permission contracts`
7. `feat(work3): add managed system and personal sources`

## Phase 3 — ingestion funnel

### Scope

- normalized `raw_content`, `content_identities`, duplicate clusters, analyses, and `global_signals`;
- bounded raw retention;
- exact ID/URL and near/cross-platform duplicate evidence;
- hard filters for age, language, evidence, accessibility, duration/policy, and minimum metrics;
- cheap normalized metadata scoring relative to author/source baseline;
- structured MetadataFilter, SignalClassifier, AdaptabilityEvaluator, ViewerValueEvaluator, and PerformanceEvaluator;
- deep VisualSignalAnalyst only for top candidates within daily limit;
- moderation states and machine-readable rejection reasons;
- compatibility projection for current reel/signal APIs.

Create or modify:

- migrations and services under `backend/db/**` and `backend/services/**`;
- provider allowlisted normalization;
- ingestion/identity/quality/moderation routes in `backend/server.js`;
- unit, integration, concurrency, retention, prompt-injection, and idempotent-retry tests.

Acceptance:

- raw content never enters recommendations directly;
- one external original is stored once globally;
- repeat ingestion is a no-op or metrics refresh;
- near matches enter a review cluster rather than being deleted;
- deterministic gates precede AI;
- deep analysis limit is enforced across workers;
- structured outputs record prompt/model/schema/cost and reject invalid output;
- imported text is always untrusted data;
- low-quality candidates cannot fill an approval quota;
- legacy Signals and adaptation entry points continue to work.

Suggested commits:

8. `test(work3): define ingestion and signal quality contracts`
9. `feat(work3): add normalized content identity and retention`
10. `feat(work3): add staged qualification and moderation`

## Phase 4 — bounded pilot

Target scope from the product specification:

- 10 approved Instagram sources;
- 10 approved TikTok sources;
- limited metadata-first collection;
- no default video/transcript download;
- configured per-source result caps and a total maximum cost;
- explicit stop on budget, max-run cost, excessive duplicate/error rate, or security failure.

Before execution, present for separate approval:

- exact sources, Actors, inputs, and run count;
- current official pricing snapshot and estimate provenance;
- maximum results/media downloads/AI calls;
- maximum reserved USD;
- dry-run schedule and stop conditions.

After execution, deliver:

- actor/source/job IDs and actual provider cost;
- raw/new/duplicate/rejected/candidate/approved counts;
- cost per raw/new/approved signal where denominators are known;
- duration, retries, errors, language/niche distribution, duplicate rate, acceptance rate;
- reviewed false-positive/false-negative sample;
- recommendation on scale, thresholds, and source quality.

No mass fill proceeds before the report is accepted.

Suggested commit:

11. `docs(work3): add bounded ingestion pilot report`

## Phase 5 — existing 219 signals

Prerequisites:

- access to the production/shared-bank set that actually contains 219 signals;
- authorized read-only export and a verified backup/restore path.

Create:

- `scripts/inventory-legacy-signals.mjs`
- `scripts/backfill-work3-signals.mjs`
- dry-run, identity, classification, batching, resume, rollback, and reconciliation tests.

Dry run reports:

- immutable source count/checksum and all legacy IDs;
- create/update/no-op/conflict totals;
- exact and possible-near duplicates;
- quality classification as approve/reject/archive/review;
- estimated DB work plus explicit AI/Apify call count and cost;
- zero deletions.

Execution occurs only after separate approval:

- checkpointed, idempotent batches;
- preserve legacy ID through a mapping;
- no Actor call;
- AI only if separately priced and approved;
- stop on deletion, checksum/count drift, unplanned cost, or conflict threshold;
- after every batch reconcile all originals.

Exit gate: every one of the 219 signals is accounted for and recoverable; no original is deleted.

Suggested commits:

12. `test(work3): define legacy signal backfill safety`
13. `feat(work3): add reversible legacy signal importer`

Production exports and runtime data are never committed.

## Phase 6 — Brand matching and feedback

### Scope

- versioned Brand Recommendation Profile derived from the existing Brand Brain;
- one `user_signal_match` per eligible personal context;
- centralized configurable score weights and penalties;
- evidence-backed BrandMatcher and RecommendationExplainer;
- diversity and impression history;
- append-only impression/view/open/save/adaptation/revision/plan/dismiss/not-relevant/published events;
- initial rule-based feedback adjustments, not a premature ML recommender.

Acceptance:

- global quality and personal relevance remain separate;
- matching covers niche, audience, language/market, tone, feasibility, format/platform, novelty, and negative feedback;
- every explanation cites stored evidence;
- scores/config/prompt/model versions are reproducible;
- author/format/cluster diversity is enforced;
- one signal supports multiple users without physical duplication;
- feedback cannot mutate global quality or expose another user's state.

Suggested commits:

14. `test(work3): define Brand matching, ranking, and feedback`
15. `feat(work3): add explainable personal recommendation engine`

## Phase 7 — Today page

Create:

- `src/TodayPage.jsx`
- `src/SavedSignalsPage.jsx`
- `src/components/SignalRecommendationCard.jsx`
- `src/components/AsyncState.jsx`
- `src/work3Api.mjs`
- `src/signalPresentation.mjs`
- focused UI/API/accessibility tests.

Modify:

- `src/main.jsx`
- `src/styles.css`
- `src/locales/en.mjs`
- `src/locales/uk.mjs`

Acceptance:

- flagged completed-onboarding users land on Today;
- Today returns 3–5 approved signals when enough qualify, otherwise fewer;
- cards show why it works, why it fits, transferable mechanic, difficulty, and adaptation direction;
- loading, empty, partial, stale, error, keyboard, focus, and mobile states work;
- Save/Dismiss/Not relevant/Open/Adapt are server-backed;
- Saved persists across sessions;
- primary navigation is Today, All signals, Sources, Saved, Content plan, Brand Brain, Settings;
- legacy All signals and feature-flag rollback remain available.

Suggested commits:

16. `test(work3): define Today and Saved experience`
17. `feat(work3): add Today recommendations and navigation`

## Phase 8 — adaptation settings and versions

Preserve current Remix and Agent Studio, but place them behind a common versioned adaptation domain.

Settings:

- `same_as_original`, `custom`, `short`, `medium`, `long`;
- configuration-bounded custom duration and presets through 60–90 seconds;
- Instagram Reels, TikTok, YouTube Shorts, or universal;
- reach, engagement, trust, expertise, sales, or lead generation;
- talking head, voice-over, demo, screen recording, text, UGC, mixed, or automatic;
- simple/medium/advanced/automatic complexity;
- creative direction and bounded free-text instruction.

Create:

- adaptation/version migrations and backend services/routes;
- `src/components/AdaptationSettingsForm.jsx`
- `src/components/AdaptationVersionHistory.jsx`
- `src/adaptationSettings.mjs`
- version/duration/revision/plan tests.

Modify:

- `src/main.jsx`
- `src/AgentStudioPage.jsx`
- `src/agentStudioUi.mjs`
- `src/contentPlanUtils.mjs`
- related styles and locales.

Acceptance:

- script structure and volume genuinely change with duration;
- output contains the required mechanism, anti-copy guidance, branded idea, objective, duration, hook, timed shots, dialogue/VO, on-screen text, actions, edit/B-roll/CTA/caption/materials/difficulty/Brand fit, and independent review;
- generation uses Brand Brain, original signal, transferable mechanic, all settings, and user instruction;
- revisions create immutable versions and support shorter/longer/hook/tone/production/sales/CTA/custom changes;
- add-to-plan waits for server success and stores signal/adaptation/version provenance;
- known plan/session/demo/OAuth baseline defects receive regression tests rather than importing unrelated dirty main changes.

Suggested commits:

18. `test(work3): define adaptation settings and version contracts`
19. `feat(work3): add configurable versioned adaptations`
20. `fix(work3): harden plan and session transitions`

## Phase 9 — admin/CMS

Create `src/AdminSignalCmsPage.jsx`, server owner/admin authorization, and operational APIs for:

- sources and source performance;
- queued/running/failed/cancelled Apify jobs and provider runs;
- costs, daily/monthly budgets, and maximums;
- raw content under restricted/redacted access;
- candidate/approved/rejected/archive/superseded signals;
- errors, acceptance/duplicate rate, user delivery/save/adaptation aggregates;
- approve/reject/reclassify/reanalyze/merge/retry/cancel;
- ranking weights and budget limits;
- immutable audit history.

Acceptance:

- members cannot access CMS or other workspaces;
- every mutation is authorized, schema-validated, rate-limited, and audited;
- raw provider data is redacted and retention-controlled;
- overrides are reversible state transitions;
- emergency switch and budget blocks are visible without breaking end-user pages.

Suggested commits:

21. `test(work3): define admin authorization and audit contracts`
22. `feat(work3): add signal operations CMS`

## Phase 10 — testing, hardening, and staging

Required backend coverage:

- source create/duplicate/permissions;
- limited ingestion and budget rejection;
- bounded dataset lifecycle and optional webhook signature/replay if webhooks are introduced;
- exact/near dedupe, hard filters, cheap/deep analysis limit, approval;
- Brand matching/ranking/feedback;
- custom and same-as-original duration;
- adaptation versioning and Content Plan;
- dry-run backfill and idempotent retry.

Required frontend coverage:

- Brand Brain completion and Today redirect;
- loading/empty/error/card/explanation;
- favorite account and processing status;
- save/dismiss;
- adaptation settings/custom duration/revision;
- Content Plan integration.

E2E acceptance follows the full specified path from Brand Brain through a favorite source, queued import, rejection/approval, Today, a 45–60 second adaptation, hook revision, and plan add.

Also run:

- all existing relevant script suites;
- `npm.cmd run test:agent-studio`
- `npm.cmd run test:public-beta`
- `npm.cmd run test:free-trial-ai`
- all new work3 suites;
- `npm.cmd run build`;
- migration clean/repeat/failure/concurrency tests;
- desktop/mobile keyboard visual verification;
- staging smoke tests with provider switches off before any separately approved live pilot.

Exit gate: MVP acceptance has evidence for all 25 criteria in the specification, `main` is unchanged, and all deliverables remain in `work3`.

Suggested commits:

23. `test(work3): add end-to-end recommendation journey`
24. `chore(work3): harden staging and rollout controls`

## Genuine blockers requiring input

1. The isolated repository does not contain the production/shared set of 219 signals. A read-only export or authorized production query is required before a truthful inventory/backfill dry run.
2. Historical Apify telemetry is incomplete and discovery costs are rounded too coarsely for actual cost-per-item analysis. Executing the proposed bounded read-only collector requires explicit approval and read-only Apify access.
3. Owner/admin authorization is not modeled today. The implementation can add `owner/admin/member`, but existing production workspace ownership must be identified before enabling CMS mutations.

These blockers do not prevent no-cost Phase 1 implementation and mocked verification after Phase 0 approval.

## Exact expected file scope

Planned touched areas:

- root: `.env.example`, `package.json`;
- backend: `backend/server.js`, `backend/db/**`, selected `backend/services/**`;
- frontend: `src/main.jsx`, `src/styles.css`, locales, Agent Studio and plan utilities, and the new Today/Sources/Saved/CMS/adaptation components;
- scripts/tests: existing focused suites plus `test-work3-*`, collector, inventory, and backfill scripts;
- docs: `docs/BACKEND.md`, `docs/POSTGRES_STORAGE.md`, operational references, and these four work3 documents.

Any file outside this scope needs an explicit implementation reason. `backend/data/db.json` is excluded.
