# Apify Signal Bank Design

## Goal

Ship a night-ready Signal Bank MVP that imports Instagram Reels and TikTok videos through Apify, caches them in Dzhero, shows them in the existing Signals screen, and lets users adapt them through the current remix flow.

## Product Scope

The MVP uses the existing `reels` storage as the Signal Bank backing model. It does not introduce a separate database schema yet. Imported Apify results are normalized into the existing reel shape with provider metadata preserved under `importedMetadata`.

Users can import:

- Instagram profile or reel/post URLs through `apify/instagram-scraper`.
- TikTok hashtag/search/profile/video inputs through `clockworks/tiktok-scraper`.

The UI keeps cache economics clear:

- Existing signal found in Dzhero bank: no import usage is charged.
- New external signal saved from Apify: one `reelImports` usage is charged.
- Failed Apify run: no usage is charged.
- AI adaptation remains separate from provider import usage.

## Data Flow

1. User opens Signals and chooses `Додати сигнал`.
2. User selects platform, input type, input value, limit, and optional TikTok video download.
3. Frontend posts to `/api/workspaces/:workspaceId/signals/apify/import`.
4. Backend checks `APIFY_TOKEN`, usage allowance, and existing cached reels.
5. Backend runs the selected Apify actor with a small bounded limit.
6. Backend maps results into `db.reels`, deduplicating by stable platform IDs.
7. Backend returns both new and reused reels plus import counts.
8. Frontend prepends returned reels and switches to the selected platform tab.

## Provider Mapping

Instagram result fields:

- Stable ID: `shortCode` first, then `id`.
- URL: `url`.
- Caption/title: `caption`.
- Thumbnail: `displayUrl` or `images[0]`.
- Player URL: `videoUrl`.
- Views: `videoPlayCount`.
- Likes: `likesCount`.
- Comments: `commentsCount`.
- Published date: `timestamp`.
- Author: `ownerUsername`, `ownerFullName`.
- Duration: `videoDuration`.

TikTok result fields:

- Stable ID: video ID parsed from `webVideoUrl`.
- URL: `webVideoUrl`.
- Caption/title: `text`.
- Thumbnail/avatar fallback: `videoMeta.coverUrl`, `covers[0]`, then `authorMeta.avatar`.
- Player URL: `mediaUrls[0]` when video download is enabled.
- Views: `playCount`.
- Likes: `diggCount`.
- Comments: `commentCount`.
- Shares: `shareCount`.
- Saves/bookmarks: `collectCount`.
- Published date: `createTimeISO`.
- Author: `authorMeta.name`.
- Duration: `videoMeta.duration`.

## UI

The existing Signals screen remains the first surface. Changes are:

- Add a provider import modal from `Додати сигнал`.
- Add platform, input type, limit, and TikTok download controls.
- Expand sort options to views, likes, comments, newest, and score.
- Show a preview/player modal when `videoUrl` or `mediaUrls[0]` exists.
- Fallback to `Watch original` when no playable media is available.

## Error Handling

- Missing `APIFY_TOKEN` returns `apify_not_configured`.
- Unsupported platform/input returns `unsupported_apify_import`.
- Apify run failure returns a readable provider error and does not charge usage.
- Empty provider result returns `importedCount: 0` and `reusedCount: 0`.
- Duplicate provider results reuse cached reels and do not charge usage.

## Testing

Verification must include:

- Unit-like Node script for provider mapping and dedupe helpers.
- Backend syntax check.
- Vite build.
- Manual import smoke test with known Instagram and TikTok sample data or live Apify token.

## Deferred

- Separate `signals`, `channels`, and `metric_snapshots` storage.
- Scheduled trend scout.
- Channel median and outlier score.
- TikTok video download on-demand after initial metadata-only import.
- Persistent media mirroring outside Apify storage.
