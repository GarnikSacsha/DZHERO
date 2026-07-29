# DZHERO UI audit — `codex/product-live-core`

This document records decisions from the visual walkthrough. Implementation is intentionally deferred to a separate pass.

Staged implementation plan: `docs/UI-IMPLEMENTATION-STAGES-PRODUCT-LIVE-CORE.md`.

## Walkthrough status — 2026-07-29

| Product area | Status | Result |
| --- | --- | --- |
| Landing | Accepted earlier | Keep the current visual direction |
| Get Started / Brand Brain | Accepted | Flow is clear and visually approved |
| Signals overview | Reviewed in Stage 0 | Card and right-rail actions are classified below; owner acceptance is pending |
| Channels | Accepted with changes | Overall layout accepted; simplify the quick filters |
| Studio | Accepted with changes | Overall flow accepted; transcript data, source links, and engine-badge corrections are recorded below |
| Content Plan | Reviewed in Stage 0 | Calendar behavior and launch contract are classified below; owner acceptance is pending |
| Settings | Accepted with changes | Overall structure accepted; launch-scope corrections are recorded below |
| Mobile product flow | Reviewed in Stage 0 | Main route works without page overflow; targeted corrections are recorded below |

## Locked decisions from the walkthrough

- Do not continue polishing accepted screens without a concrete issue.
- Remove decorative controls that have no product behavior.
- Remove internal AI engine/model badges from the customer-facing interface.
- Keep only one Settings entry in the left navigation.
- Keep notifications, but only for real product events.
- Signals come from the curated/collected bank; normal users do not manually create signals.
- Search may accept a direct Reel, Short, or TikTok URL.
- Move Signals filters out of the global top bar and into the Signals content toolbar.
- Use the Channels funnel icon and labelled `Filters` button as the shared filter trigger across product list screens.
- Replace shallow filters with real metric, niche, source, and status filtering.
- Separate filtering, sorting, and grid/list presentation.
- Replace invented global trend numbers with trends derived from the collected bank.
- Rename `Hot trends`; current leading label is `Набирає популярність` / `Rising now`.
- Separate source performance (`Signal Strength`) from brand relevance (`AI Match`).
- Base Signal Strength on normalized lift versus creator or cohort medians, not raw views alone.

## Status labels

- **Keep** — accepted as-is.
- **Change** — agreed correction.
- **Decide** — behavior must be clarified before implementation.

## Signals — overview

### Keep

- Overall Signals layout and card direction.
- `Open Studio` interaction and transition.
- Keep notifications in the top bar. Notifications must represent concrete product events, such as:
  - a new signal from a tracked account;
  - completed signal analysis;
  - a completed adaptation ready for review.

### Change

- Remove `Create Signal` from the user-facing top bar. It is currently a decorative button without an action, and users should receive signals from the curated bank rather than create them manually.
- Remove the sliders icon from the top bar. It is currently labelled as signal sorting rather than Settings, but it duplicates the visible filter controls and has no implemented action.
- The grid/list controls currently do not change the presentation. Either implement a real grid/list switch or remove the list control; do not leave a decorative toggle.

### Stage 0 action decisions

- Keep the top search field only as a direct Instagram Reel, YouTube Short, or TikTok URL entry point, backed by the existing import/open flow. Do not use it as another platform/country search surface.
- Remove the card overflow control until it has at least one distinct, implemented action that is not already visible on the card.
- Keep `Save`, but make it a persistent workspace-scoped toggle with visible saved/unsaved feedback and a corresponding workflow filter.
- Keep `Open Studio` as the primary analysis/adaptation action. Remove the duplicate preview-only insight action until it can open a real, explainable analysis derived from the selected signal.
- Creator/account actions must open a real collected channel or profile. Hide the action when no trustworthy destination exists.
- Trend controls may become clickable filters only when the trend is derived from the collected bank. In a low-data state they remain informative and non-interactive.
- Remove `Recent activity` until a real event feed exists. When restored, every event must open the referenced signal, adaptation, or calendar item.
- `Tracked accounts` may remain only when populated from real monitored channels; `See all` must open the corresponding tracked/following Channels view.

## Signals — filtering and sorting

### Current implementation

- The redesign preview only shows decorative controls for platform, country, and AI Match.
- The existing live Signals implementation can:
  - search by text or accept a direct TikTok, Instagram Reels, or YouTube Shorts URL;
  - select a source: all, YouTube, Instagram, or TikTok;
  - sort by score, views, likes, comments, or newest;
  - select a YouTube region and category during a YouTube pull.
- The existing metric controls only sort results. They cannot filter by a minimum/maximum value.
- There is no complete niche filter.

### Change

- Replace the three shallow preview controls with a useful filter system.
- Remove filters from the global top bar. Keep only the search field and notifications there.
- Place the Signals filter toolbar inside the page content, below the Signals heading and directly above the cards.
- Keep the most-used filters visible:
  - platform;
  - AI Match range;
  - niche;
  - `More filters`.
- Show active filter values as removable chips and provide one `Clear all` action.
- Put detailed filters inside `More filters`:
  - country/market;
  - content language;
  - views range;
  - likes range;
  - comments range;
  - engagement rate when the source data is reliable;
  - publication period;
  - tracked creator/channel;
  - workflow status such as new, saved, opened in Studio, or adapted.
- Keep sorting separate from filtering:
  - best AI Match;
  - trending;
  - most viewed;
  - most engaging;
  - newest.
- Keep sorting and the grid/list view control on the right side of the Signals toolbar, separate from the filter chips.
- Show only filters backed by reliable collected data. Do not expose saves, retention, engagement rate, or other metrics until the ingestion pipeline provides them consistently.

## Shared list-toolbar pattern

### Keep

- Reuse the Channels visual treatment for list controls:
  - funnel icon + `Фільтри` / `Filters`;
  - up/down arrows + `Сортувати` / `Sort`.

### Change

- Use the same icons, labels, size, radius, spacing, hover, active, and selected-count treatment on every product screen that contains a filterable list.
- The filter button opens the current page's contextual filter panel; it does not navigate to global Settings.
- Keep the actual filter options inside the page content rather than spreading multiple filter dropdowns across the global top bar.
- Do not keep the old unlabeled sliders icon after the shared labelled control is introduced.
- Apply this shared pattern to Signals and Channels first, then reuse it only on Studio, Content Plan, or other screens where filtering/sorting is genuinely useful.

## Channels

### Keep

- Overall Channels page layout.
- Search and the shared labelled filter/sort controls.
- Channel tabs and card direction.
- Keep the `Рекомендовані` / `Recommended` tab, but connect it to real Brand Brain ranking.
- Quick filters:
  - platform;
  - niche;
  - AI Match;
  - average views.

### Change

- Remove these quick filters from Channels:
  - country;
  - language;
  - follower count.
- Rename `Категорія` / `Category` to `Ніша` / `Niche`.
- Use the same inferred niche taxonomy in the filter and on channel cards.

## Channels — Brand Brain recommendations

### Current implementation

- Recommended channels and their AI Match values are static preview data.
- Brand Brain recommendation currently selects an individual accessible signal, not a channel.

### Change

- Build the Recommended tab from channels that DZHERO has actually collected and analyzed.
- Use Brand Brain fields such as:
  - niche and offer;
  - target audience;
  - market and language;
  - content goals;
  - tone and brand constraints.
- Analyze each candidate channel into the same comparable taxonomy:
  - primary and secondary niches;
  - recurring topics and content mechanics;
  - likely audience;
  - language and market;
  - consistency and recent signal quality.
- Create a deterministic shortlist first, then optionally use Gemini to rerank and explain the best matches.
- Do not let Gemini invent accounts; it may only choose from collected channel IDs.
- AI Match must be explainable. Show a short reason such as `Strong niche overlap`, `Audience match`, or `Useful content mechanics`.
- Keep source performance separate from Brand Brain relevance:
  - channel quality/consistency describes the source;
  - AI Match describes relevance to the current brand.
- When there is insufficient channel data, show an honest pending/low-confidence state rather than a fabricated percentage.

## Studio

### Change

- Remove the `AI Engine: DZ-Alpha V2` / `AI-рушій: DZ-Alpha V2` badge.
- Do not show internal engine, provider, or model names elsewhere in the customer-facing product UI.
- Keep model/provider details only in internal diagnostics, logs, or a future admin/debug surface where they are operationally useful.
- Replace the ambiguous external-link icon in the source card with two distinct actions:
  - `Відкрити профіль` / `Open profile` — opens the creator/channel account;
  - `Відкрити оригінал` / `Open original` — opens the exact source video.
- Do not rely on one icon-only control for both destinations.
- Open external platform destinations in a new tab with safe external-link handling.
- If a source URL or profile URL is unavailable, hide or disable only the corresponding action and explain why.
- Keep the `Транскрипт` / `Transcript` tab: it represents transcript functionality that already exists in the Studio data flow.
- Replace the preview-only static transcript segments with real signal data from `reel.transcript` or `videoIntelligence.transcript.segments`.
- Use existing timestamped YouTube captions when available. For Instagram and TikTok, show a transcript only when the scraper or video/audio analysis has actually produced one.
- Add honest transcript states: generating, available, and unavailable. Never fill a missing transcript with invented demo text.
- When both types are available, distinguish spoken transcript from on-screen text instead of combining them without explanation.

## Signals — right utility rail

### Keep with real data

- `Tracked accounts` is feasible and useful.
- Populate it only from channels/accounts that DZHERO actually monitors.
- A tracked account can surface:
  - newly collected videos;
  - the strongest new signal;
  - last successful scan;
  - notification state.

### Change

- Do not present invented global trend volumes such as `12.5K signals today`.
- Rename generic `Hot trends`. Leading label:
  - UK: `Набирає популярність`;
  - EN: `Rising now`.
- Alternative if the source scope needs to be explicit: UK `Зростає у вашому банку`, EN `Rising in your bank`.
- Derive trends only from collected signals using:
  - repeated topics, hooks, hashtags, audio, or content mechanics;
  - publication recency;
  - view and engagement velocity across repeated snapshots;
  - the number of distinct creators showing the same pattern;
  - relevance to the active Brand Brain.
- Until enough historical snapshots exist, show an honest low-data state instead of a trend score.

## Signals — card score

### Current implementation

- The `9.8` value shown next to the trend icon in the redesign preview is static mock data.
- It is not connected to the real backend score.
- The backend currently contains two different legacy score formulas:
  - one uses absolute views, weighted engagement, freshness, and source quality;
  - another also mixes market fit, hook length, and Brand Brain availability.
- These formulas are not yet a single trustworthy product contract.

### Change

- Replace the unexplained mock number with an explainable `Signal Strength`.
- Keep `AI Match` separate:
  - `Signal Strength` measures how strongly the source video performs;
  - `AI Match` measures how relevant its mechanic is to the active Brand Brain.
- Do not calculate a median across views, likes, comments, shares, and saves because they use different units.
- Calculate a baseline median for each metric across the creator's recent comparable videos, then measure the current video's lift:
  - views versus the creator's median views;
  - engagement rate versus the creator's median engagement rate;
  - comments versus the creator's median comments;
  - shares versus the creator's median shares;
  - saves versus the creator's median saves;
  - view velocity versus videos of a similar age.
- Give higher importance to stronger intent:
  - shares and saves;
  - comments;
  - likes;
  - raw views.
- Normalize by platform and video age. Do not compare raw TikTok, Instagram, and YouTube metrics as if they were identical.
- If a creator does not yet have enough history, use the median for a comparable platform/niche cohort and show lower score confidence.
- Treat an unavailable metric as `unknown`, not zero.
- Add a tooltip or details view explaining the score breakdown instead of showing an unexplained number.

### Candidate score structure

- 35% engagement lift versus creator median.
- 30% view velocity versus creator median at the same video age.
- 20% reach lift versus creator median.
- 15% freshness and data confidence.

The exact weights remain a product hypothesis and must be calibrated on real collected snapshots before becoming a quality gate.

## Content Plan

### Change

- Remove the global `Пошук проектів...` / `Search projects...` field from the Content Plan header. There is no defined project entity or useful searchable scope on this screen.
- Remove the `Agent Studio` action from the Content Plan header. Agent Studio is not part of the current user flow and should not appear as a decorative or unavailable entry point.
- Remove the persistent `План згенеровано` / `Plan generated` badge. It is static status noise and does not explain what was generated, when it happened, or what the user should do next.
- If plan generation becomes a real feature later, expose it as an explicit contextual action with a clear preview/confirmation flow and show completion feedback only temporarily.
- Keep the header focused on working actions such as export. Keep post creation inside the calendar with `Новий пост` / `New post`.

### Stage 0 calendar decisions

- Keep Month as the primary desktop view.
- Keep Week only with navigation tied to the selected week and with events rendered against their actual dates.
- Keep Schedule as the mobile default and as the compact chronological view.
- New, open, edit, and delete must persist under the active brand and survive reload.
- Rescheduling must be available through editable date/time controls on every device. Desktop drag-and-drop may be added as a convenience, but never as the only move mechanism.
- Deletion requires confirmation. Removing a calendar entry must not delete its originating signal or Studio draft.
- Use the existing two-state launch contract: `Scheduled` and `Completed`. Do not add a broader status taxonomy without a separate workflow decision.
- Export must download real calendar data and match the visible title, date, time, format, status, and source. An empty calendar exports an empty dataset with headers, not sample entries.
- Month, Week, and Schedule must all render a truthful empty state. No preview event may appear as user data.

## Mobile product flow

### Keep

- The mobile sidebar and the main route through Signals, Channels, Studio, Content Plan, and Settings.
- Horizontally scrollable tab rows where all labels cannot fit without truncation.

### Change

- Default Content Plan to Schedule at mobile width. Month remains available as an explicitly scrollable calendar view.
- Add a visible affordance for horizontally scrollable tab and toolbar rows; do not leave the final option looking accidentally clipped.
- Remove the unrelated Settings header `Export` action and any Settings header search that has no implemented scope.
- Preserve zero global page overflow. Wide calendar content may scroll only inside its calendar container.
- After Stage 1 removes `Create Signal`, keep notifications as the real mobile top-bar action.

## Settings

### Interface

- Keep English and Ukrainian as the only launch languages.
- Do not add another language until there is validated audience demand and the whole product, onboarding, system messages, emails, help content, and support flow can be maintained in that language.
- `Щільність інтерфейсу` / `Interface density` is intended to control spacing, table-row height, card padding, and how much content fits on screen.
- In the current preview it only changes the selected option in local component state; it does not alter the interface and is not persisted.
- Remove interface density from the launch settings. Reintroduce it only after relaxed, standard, and compact modes affect the entire product consistently and are persisted per user.

### My brands

- Creating a new brand must launch the same Brand Brain onboarding used for the user's first brand.
- Scope the onboarding to the new brand and save a separate Brand Brain record for it.
- Do not create a placeholder brand from only a name and generic default values.
- After completion, make the new brand available as a distinct workspace context. Editing an existing brand should reopen the same Brand Brain fields with its saved values.

### Plans and limits

- Use credits as the primary usage unit.
- Define a clear credit cost for each paid operation, such as source ingestion, transcript creation, signal analysis, adaptation, or script generation.
- Show the credit cost before an operation and record deductions in a transparent usage history.
- Remove `Години AI-рендерингу` / `AI rendering hours`. The current value is static mock data and DZHERO does not currently render video, so the label does not represent a real product resource.
- Do not combine credits with a second vague AI-hours quota. Keep only independent limits that users can understand, such as workspace seats, connected brands, or tracked channels.

### Referrals

- Keep the referrals tab visually unchanged for now; its current metrics and payouts are preview data, not a launch-ready financial program.
- Revisit the reward model before activation. Prefer product credits or subscription discounts over direct cash payouts unless DZHERO deliberately builds the accounting, fraud prevention, payout, tax, and legal flows required for a cash affiliate program.
- Do not expose fabricated earnings, pending payouts, conversions, or referral history to real users.

### Keep

- The remaining Settings information architecture and visual direction are accepted.

## Shared product shell

### Change

- Remove the `X` control beside the theme switch from the production product shell. It is a preview-only `Exit preview` action and has no place in the signed-in DZHERO navigation.
- Remove the settings gear from the user card at the bottom of the sidebar. It currently has no separate behavior and duplicates the existing `Налаштування` / `Settings` navigation item.
- Keep the user identity visible. If an account menu is introduced later, limit it to genuinely account-level actions such as switching brand/workspace or signing out; do not create a second settings surface.
