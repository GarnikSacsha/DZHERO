# Interface settings and TikTok thumbnail recovery

**Date:** 2026-07-24
**Status:** Approved design

## Goal

Clean up duplicated navigation and header controls, make the automatic theme schedule reliable, label Ukrainian correctly as `UA`, and recover TikTok thumbnails after stored CDN links expire.

## Scope

This change covers:

- the authenticated top bar;
- the authenticated sidebar;
- a new Interface tab inside Settings;
- the language label on the signed-out Brand Scan screen;
- theme preference initialization and scheduling;
- TikTok thumbnails in the Signals table;
- authenticated backend recovery of expired TikTok thumbnail URLs.

It does not change signal discovery, paid Apify usage, video playback, account language persistence, or other Settings tabs.

## Interface controls

### Authenticated top bar

The top bar keeps:

- the current page-specific quick action;
- one Settings gear button.

The top-bar language switch and theme button are removed.

### Sidebar

The Settings navigation item is removed from the authenticated sidebar. The top-bar gear is the single authenticated entry point to Settings.

Any product-tour step or rendered UI test that targets the removed sidebar item must target the top-bar Settings gear instead.

### Settings

Settings gets a dedicated `Interface` / `Інтерфейс` tab containing two clearly labelled controls:

- interface language: `UA` and `EN`;
- theme: `Auto`, `Light`, and `Dark` with Ukrainian equivalents.

Changing either option applies immediately and persists in browser storage. The controls expose an accessible selected state.

The existing Sources, My Brands, Plan and limits, Email preferences, and authorized Testers tabs remain unchanged.

### Signed-out screen

The signed-out Brand Scan screen retains language and theme controls because authenticated Settings is unavailable there. The Ukrainian language button is labelled `UA`, never `UK`.

## Theme behavior

`Auto` is the default theme mode for a fresh browser and for the one-time migration from the existing theme storage keys.

The automatic schedule uses the browser's local time:

- `07:00:00` through `20:59:59`: light theme;
- `21:00:00` through `06:59:59`: dark theme.

The current theme is recalculated immediately when Auto is selected and at least once per minute while Auto remains selected.

Manual Light and Dark modes override the schedule until the user selects Auto again.

The implementation introduces a new versioned theme-mode storage key. Existing `v1` mode and legacy effective-theme values are not promoted into a permanent manual mode because the old migration cannot distinguish an intentional selection from an automatically saved night theme. On first use of the new key, the mode becomes Auto.

## TikTok thumbnail recovery

### Root cause

TikTok signals currently persist direct TikTok CDN cover or avatar URLs returned by Apify. Those URLs are signed and expire. The Signals table renders them as CSS backgrounds, so the application cannot observe an image load error and recover.

### Frontend behavior

Each signal thumbnail uses a real image element when a preview URL exists. The image:

1. attempts the stored preview URL;
2. reports one load failure for that reel;
3. requests a refreshed thumbnail from the authenticated backend;
4. replaces the failed source when recovery succeeds;
5. shows a stable TikTok-branded fallback when recovery fails.

Recovery is attempted at most once per reel per mounted table view. It does not loop when the refreshed image is also unavailable.

YouTube and Instagram thumbnail behavior remains unchanged except for sharing the safe image-error rendering path where appropriate.

### Backend behavior

Add an authenticated, workspace-scoped thumbnail refresh endpoint for a reel.

The endpoint:

- resolves an owned reel or a projected shared-bank reel without exposing another workspace;
- accepts recovery only for a validated TikTok video URL;
- calls TikTok's fixed official oEmbed endpoint rather than fetching an arbitrary user-controlled host;
- reads `thumbnail_url` from the successful oEmbed response;
- updates the source reel's `image` and `importedMetadata.image` fields;
- returns the refreshed URL to the requesting workspace;
- returns a typed unavailable response when TikTok does not return a usable thumbnail.

The endpoint does not consume AI, trial outcome, or paid discovery quota.

For shared-bank projections, persistence updates the source bank reel referenced by `sharedSourceId`; the response remains scoped to the requesting workspace.

## Error handling and security

- Validate TikTok hosts and `/video/<id>` structure before calling oEmbed.
- Call the fixed TikTok oEmbed origin with a 10-second abort timeout and JSON response-size validation.
- Never forward arbitrary URLs to a generic server-side fetch.
- Do not expose Apify tokens, raw provider payloads, or source workspace identifiers.
- Failed recovery leaves the Signals table usable and displays the branded fallback.

## Testing

Add focused regression coverage for:

- Auto resolving to light at 18:27 and dark at 21:00;
- the new storage version defaulting old theme state to Auto;
- manual Light and Dark overrides;
- `UA`, not `UK`, in authenticated Settings and the signed-out screen;
- no language/theme controls in the authenticated top bar;
- no Settings item in the authenticated sidebar;
- the top-bar gear opening Settings;
- an expired TikTok thumbnail triggering one refresh and rendering the replacement;
- refresh failure rendering the fallback without retry loops;
- shared-bank thumbnail refresh updating only the source reel;
- rejection of non-TikTok and inaccessible-workspace refresh attempts.

Run the focused tests, the existing rendered i18n and signal preview coverage, and `npm.cmd run build`.

## Acceptance criteria

- At 18:27 in Auto mode, the application is light.
- At and after 21:00 in Auto mode, the application is dark until 07:00.
- Users can explicitly select Auto, Light, or Dark in Settings.
- Ukrainian is labelled `UA` everywhere a compact language code is shown.
- Settings appears once in authenticated navigation: the top-bar gear.
- TikTok rows recover a real thumbnail when TikTok oEmbed can provide one.
- Unrecoverable TikTok rows show an intentional fallback instead of an empty black tile.
- `backend/data/db.json` is not edited or committed as part of the implementation.
