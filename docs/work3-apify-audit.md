# DZHERO work3 — Apify and ingestion audit

Status: Phase 0 read-only audit. No Actor was started. Current public pricing must be rechecked immediately before a paid pilot.

## 1. Actor inventory

| Actor | Current use | Current bounds | Pricing evidence in DZHERO |
|---|---|---|---|
| `apify/instagram-reel-scraper` | Instagram URL/profile manual import, account discovery, Agent Studio primary resolution | 1–30 results; profiles use a three-month window; optional video download | application estimate only: USD 0.03/result |
| `apify/instagram-hashtag-scraper` | Instagram hashtag and search discovery/import | 1–30 reels | application estimate only: USD 0.03/result |
| `clockworks/tiktok-scraper` | TikTok profile, hashtag, URL, and search | bounded `resultsPerPage`/`maxItems`; subtitles/comments disabled | application estimate only: USD 0.04 metadata or USD 0.06 with download |
| `apify/instagram-scraper` | Agent Studio Instagram fallback | one direct URL result | no local estimate specific to this Actor |

Actor identifiers are literals in source code. There are no configured Apify Tasks, Apify Schedules, or webhook endpoints.

## 2. Current provider lifecycle

All integrations perform this lifecycle synchronously:

1. start Actor;
2. poll every 2.5 seconds for up to three minutes;
3. read `defaultDatasetId`;
4. download the complete dataset response;
5. map results;
6. discard provider run and dataset identity.

The token is currently sent in query strings for start, status, and dataset calls. It must move to an authorization header. Dataset retrieval needs item and byte limits, pagination, timeouts, and schema validation.

## 3. Integration entry points

### Automatic discovery

- Accounts are scheduled every six hours; keywords, hashtags, and trends every twelve hours.
- A web-process timer checks workspaces every 60 seconds.
- Normal policy can make four metadata calls of five results; forced/tester policies are narrower.
- TikTok can make a second call to download one selected winner.
- Source rotation, budget reservations, stale-run recovery, retry backoff, exact dedupe, and aggregate counters exist.

### Manual advanced import

The authenticated route runs the Actor inside the HTTP request and can download video for every result. Entitlement limits the result count, but actual provider cost is discarded.

### Agent Studio

It resolves one URL, can download video, and uses a fallback Instagram Actor. It captures provider label/status/`usageTotalUsd` into aggregate micro-USD telemetry, but not provider run ID, dataset ID, item count, duration, or Compute Units.

### Public Brand Scan

It is disabled by default. When enabled it requests eight Instagram profile results and records an attempt, not Apify run/cost telemetry.

## 4. Dataset and field mapping

Instagram mapping includes caption, optional transcript, thumbnail, video, views, likes, comments, shares, duration, publication time, and optional audio URL. TikTok mapping includes caption, cover/avatar, video, views, likes, comments, shares, saves, duration, and publication time; transcript is empty.

Full Actor items are stored under `importedMetadata.apify` and can flow back through reel APIs. Raw provider payloads should instead have bounded, encrypted/controlled retention and must not be exposed in normal product responses.

## 5. Incrementality and dedupe

Existing controls:

- source-rotation checkpoints;
- exact platform/stable-ID and canonical-URL dedupe within a workspace;
- metric refresh for exact duplicates;
- local mutex and PostgreSQL advisory transaction locks;
- retry backoff from 30 minutes to six hours.

Missing controls:

- per-source newest external ID or `published_at` cursor;
- stop-at-known-item behavior;
- global content identity shared across workspaces;
- media/thumbnail fingerprints;
- normalized caption/transcript similarity;
- repost and cross-platform duplicate clusters;
- raw/candidate/approved lifecycle separation.

The current design rotates which source is queried first, but still pays to refetch bounded windows that can contain already-known items.

## 6. Current cost evidence

Evidence must be separated into four classes:

1. **Provider-reported actual:** `run.usageTotalUsd` is available in the low-level client.
2. **Application estimate:** hardcoded USD 0.03/0.04/0.06 per result.
3. **Historical local telemetry:** limited and incomplete.
4. **Current public Actor pricing:** plan-dependent information from Actor pages, not proof of DZHERO's historical bill.

The committed work3 seed has no useful discovery or Agent Studio cost history. A separate local runtime snapshot contains only a few completed discovery runs: known-cost completed runs total 45 returned, 36 accepted, and USD 0.02 reported. One other completed run has null cost. Because discovery rounds to two decimals, sub-cent actuals become USD 0.00, so these values cannot produce a defensible average.

README records one real Apify call at approximately USD 0.001, without enough Actor/run metadata to attribute it. This proves that two-decimal storage is inadequate; it does not establish a price model.

Accordingly, current production cost per raw item, new item, approved signal, source, and Actor is **unknown** until read-only history is collected. Unknown values must remain null rather than be converted to zero.

## 7. Current public pricing snapshot

As checked during Phase 0:

- [Instagram Reel Scraper](https://apify.com/apify/instagram-reel-scraper) and [Instagram Hashtag Scraper](https://apify.com/apify/instagram-hashtag-scraper) are pay-per-event; their pages show plan-dependent rates, including USD 2.60/1,000 on Free and USD 2.30/1,000 on Starter, with lower headline rates possible.
- the [Clockworks TikTok Scraper](https://apify.com/clockworks/tiktok-scraper) page is pay-per-event and advertises a headline rate from USD 1.70/1,000 results;
- the fallback [Instagram Scraper](https://apify.com/apify/instagram-scraper) page shows plan-dependent rates from USD 2.70/1,000 on Free to USD 1.50/1,000 on Business.

These published rates may exclude add-on events such as video, transcript, or sharing and are not a substitute for `usageTotalUsd`. A dated pricing snapshot and Actor pricing model must be stored with every dry-run estimate.

## 8. Cost observability gaps

- discovery rounds actual USD to two decimals;
- failed calls look for cost on a different error field than the low-level client supplies;
- manual import and Brand Scan ignore actual cost;
- no provider run/dataset/task IDs or Actor/source attribution;
- no item count, duration, Compute Units, or pricing-model snapshot;
- no daily/monthly/max-run actual limits shared by all Apify entry points;
- no cost per raw/new/approved item or source-yield dashboard;
- no complete emergency switch covering scheduled, manual, Agent Studio, and Brand Scan collection.

All monetary storage should use integer micro-USD or fixed-precision decimal.

## 9. Security findings

### High

- Apify secrets in query strings can leak to proxy/APM logs.
- Agent Studio follows provider-returned media URLs without DNS/private-IP/redirect validation, creating SSRF risk.
- full dataset responses are read into memory without explicit byte bounds.
- full raw provider items are persisted and exposed.
- no global `APIFY_INGESTION_ENABLED` kill switch exists.

### Medium

- slow paid work runs in HTTP/web processes and can delay unrelated writes;
- manual input type is not allowlisted and input value lacks a dedicated bound;
- source/provider error details can retain inputs and reach operational responses;
- webhook authentication, signatures, replay protection, and event allowlists do not exist because webhooks do not yet exist.

## 10. Required cost-control envelope

Before any pilot:

- backend-only `APIFY_INGESTION_ENABLED`, default false outside explicit environments;
- allowlisted Actors and input schemas;
- per-source, per-Actor, per-platform, and global concurrency;
- maximum results and estimated cost per run;
- daily and monthly estimated/actual budget;
- reservation before enqueue and reconciliation after completion;
- metadata-first collection, winner-only media download;
- circuit breaker for elevated error/cost/duplicate rates;
- retry/backoff that never retries terminal billing/input failures;
- admin-visible block reason and auditable override;
- no frontend secrets or tokenized URLs.

## 11. Safe statistics collector

Create a backend-only read-only collector; it must never start an Actor.

Default behavior:

- seven-day window, maximum 50–100 runs, bounded pagination, timeout, and low concurrency;
- authorization header and four-Actor allowlist;
- completed and failed run metadata plus dataset metadata/item count, not full datasets;
- idempotent upsert by provider run ID;
- Actor/task/run/dataset identity, timestamps, duration, status, item count, provider usage/cost, Compute Units only when returned, and cost provenance;
- sanitized error code only;
- no tokens, tokenized URLs, provider payloads, Brand Brain, or full provider error bodies.

Accepted, rejected, duplicate, and new counts require DZHERO job correlation. For historical runs without that link, those fields remain null.

Running this collector against production requires explicit approval and read-only Apify credentials after its dry-run output and bounds are reviewed.

## 12. Pilot cost report

Every pilot batch must produce:

- Actor/source/job IDs;
- estimated upper bound and actual provider cost;
- raw, new, duplicate, rejected, approved, and recommended counts;
- cost per raw/new/approved item where denominators are known;
- duration, retries, errors, and circuit-breaker events;
- completeness flags that prevent misleading aggregates.

No large-scale backfill or recurring collection begins until the report is accepted.
