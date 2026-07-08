# Automatic Apify Signal Discovery

## Goal

Dzhero automatically fills the signal bank from Instagram and TikTok without requiring users to paste profiles, hashtags, or video URLs for every import.

The collector covers three discovery sources:

1. Accounts and competitors saved in the workspace.
2. Workspace keywords and hashtags.
3. General trend queries relevant to the workspace niche and markets.

Manual Apify import remains available as an advanced fallback.

## Operating Mode

The initial production mode is balanced:

- Account sources are checked every 6 hours.
- Keyword, hashtag, and general trend discovery run every 12 hours.
- Discovery fetches metadata first.
- Video files are downloaded only for candidates that pass the viral threshold.
- The automatic Apify budget is capped at USD 0.80 per workspace per UTC day.
- Runs stop before starting when the remaining daily budget is insufficient.

The schedule is evaluated by a backend worker loop so the first version does not depend on a separate Railway cron service. Only one process may claim a due job at a time.

## Source Configuration

Each workspace gets an automatic discovery configuration:

- `enabled`
- `dailyBudgetUsd`, initially `0.80`
- `viralScoreThreshold`, initially `70`
- account interval, initially 6 hours
- discovery interval, initially 12 hours
- selected platforms
- keywords and hashtags
- general trend queries
- last and next run timestamps

Existing workspace competitors and sources provide account inputs. Keywords are derived from the workspace brief, market, niche, and explicitly saved terms. A small maintained set of broad trend queries supplements them.

## Collection Flow

1. The scheduler finds due workspaces with automatic discovery enabled.
2. It checks the daily internal spend ledger and reserves an estimated run budget.
3. It builds bounded inputs for Instagram and TikTok.
4. Apify returns recent metadata and engagement metrics.
5. Dzhero normalizes platform payloads into the existing signal model.
6. Existing platform IDs and canonical URLs are removed before further processing.
7. Dzhero calculates a comparable viral score using views, likes, comments, shares, recency, and source baseline where available.
8. Candidates below the threshold are discarded.
9. Winning TikTok candidates are fetched with downloadable media enabled. Instagram uses the returned video URL when available.
10. Signals are saved, ranked, and immediately available in the internal player.
11. Actual and estimated costs, result counts, errors, and timestamps are recorded.

## Budget Protection

Dzhero enforces its own budget independently of Apify account limits:

- Default automatic limit: USD 0.80 per workspace per UTC day.
- Manual imports are reported separately and remain subject to product usage limits.
- Each run has a bounded result limit.
- Metadata discovery uses a conservative cost estimate before launch.
- Video downloads are limited to shortlisted candidates.
- Failed and partially completed runs record their status and do not retry continuously.
- The worker will not start another run after the daily cap is reached.

Apify Billing Limits should remain at the subscription amount unless the owner intentionally enables pay-as-you-go overage.

## Interface

The Signals page displays a compact automation status control:

- Automatic discovery toggle.
- Status: running, scheduled, paused, budget reached, or error.
- Last successful collection.
- Next scheduled collection.
- Daily budget consumed.
- A `Run now` command for an immediate bounded collection.

The current manual import form moves behind an `Advanced import` action. Ordinary users should not need to choose Actor-specific options.

## Persistence

The initial implementation uses the existing database state model and adds:

- workspace discovery settings
- discovery runs
- daily spend ledger entries
- source checkpoints

Run records store platform, source type, requested limit, returned count, accepted count, duplicate count, estimated cost, status, and timestamps. Tokens and raw authorization headers are never persisted.

## Error Handling

- Apify timeouts produce a failed run with a readable status.
- A single platform failure does not block the other platform.
- Invalid or removed profiles are skipped and recorded.
- Expired media URLs do not remove the signal; the original post URL remains available.
- Duplicate imports update metrics when the new snapshot is fresher.
- Scheduler errors use bounded backoff and cannot create a tight retry loop.

## Verification

Automated tests cover:

- source input construction
- scheduling and job claiming
- daily budget enforcement
- deduplication
- scoring threshold behavior
- metadata-only discovery followed by winner download
- partial platform failures

Production verification confirms:

- a workspace can enable automatic collection
- `Run now` imports at least one qualifying test signal
- a second run does not duplicate it
- the signal opens in the internal player
- daily spend and run status are visible
- a budget-exhausted workspace does not start another Apify run

## Deferred

- Machine-learned personalization of discovery queries
- Cross-workspace shared acquisition costs
- Historical velocity snapshots across multiple days
- Separate queue infrastructure
- Automatic publishing or adaptation generation
