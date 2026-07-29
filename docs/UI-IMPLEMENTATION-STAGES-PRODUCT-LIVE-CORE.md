# DZHERO UI implementation stages — `codex/product-live-core`

Source of truth: `docs/UI-AUDIT-PRODUCT-LIVE-CORE.md`.

The work is deliberately split into small accepted slices. Each stage is reviewed in the browser, checked in English and Ukrainian, and committed separately before the next stage begins.

## Stage 0 — close the walkthrough and freeze the baseline

### Scope

- Review the remaining Signals card actions: overflow menu, save, insight, creator, trend, and activity controls.
- Review Content Plan calendar behavior: create, open, edit, move, delete, status, and export.
- Review the main product flow at mobile width.
- Capture the current accepted desktop baseline.
- Confirm the existing checks and keep `backend/data/db.json` outside commits.

### Done when

- No unresolved `Decide` items remain for the UI implementation.
- Every visible control is marked as keep, change, or remove.
- The baseline builds and the existing checks pass.

## Stage 1 — shared shell and dead-control cleanup

This stage contains only low-risk UI cleanup and does not change product data.

### Scope

- Remove the preview-only `X` from the signed-in product shell.
- Remove the duplicate settings gear from the user card.
- Remove `Create Signal` and the redundant sliders control from the Signals top bar.
- Remove `AI Engine: DZ-Alpha V2` badges from customer-facing UI.
- Remove Content Plan header search, `Agent Studio`, and the permanent `Plan generated` badge.
- Remove the unrelated `Export` action and decorative header search from Settings.
- Remove non-functional interface density settings.
- Remove `AI rendering hours`.
- Preserve notifications, language switching, theme switching, navigation, and existing working actions.

### Done when

- No decorative control remains in the reviewed areas.
- Desktop and mobile navigation still work.
- EN and UK layouts contain no raw translation keys.

## Stage 2 — Signals core interface

### Scope

- Keep the global top bar focused on direct-video URL search and notifications.
- Add the shared labelled `Filters` and `Sort` controls inside the Signals page.
- Implement reliable filters only: platform, niche, AI Match, supported metrics, date, creator, and workflow status.
- Display active filters as removable chips with `Clear all`.
- Implement a real grid/list switch or remove the inactive list option.
- Keep `Open Studio` and saving behavior working.

### Done when

- Every visible filter changes the result set.
- Sorting is separate from filtering.
- Missing metrics are treated as unknown, not zero.
- The page has useful empty, loading, and error states.

## Stage 3 — Signals intelligence and right rail

This stage depends on trustworthy collected metrics and repeated snapshots.

### Scope

- Replace the mock score with explainable `Signal Strength`.
- Keep `AI Match` as a separate Brand Brain relevance score.
- Normalize Signal Strength against creator or comparable cohort medians.
- Populate tracked accounts from real monitored channels.
- Rename `Hot trends` to `Набирає популярність` / `Rising now`.
- Calculate rising patterns only from the collected bank.
- Show low-confidence or insufficient-data states instead of invented numbers.
- Connect notifications only to real product events.

### Done when

- No score, trend volume, account, or activity entry is fabricated.
- Score inputs and confidence can be explained to the user.
- Platform and video-age normalization have focused tests.

## Stage 4 — Channels

### Scope

- Apply the shared Filters/Sort control pattern.
- Keep quick filters for platform, niche, AI Match, and average views.
- Remove country, language, and follower-count quick filters.
- Rename Category to Niche and use one shared niche taxonomy.
- Connect tracking and favorites to persistent state.
- Build Recommended from real collected channel IDs and the active Brand Brain.
- Use deterministic shortlisting before optional Gemini reranking and explanation.

### Done when

- Recommended never invents a channel.
- AI Match includes a short understandable reason.
- Low-data recommendations show an honest pending or low-confidence state.

## Stage 5 — Studio end-to-end

### Scope

- Add separate `Open profile` and `Open original` actions.
- Wire the Transcript tab to real transcript data and timestamped segments.
- Add generating, available, and unavailable transcript states.
- Distinguish spoken transcript from on-screen text when both exist.
- Verify the existing analysis, adaptation, and script workflow with a real signal.
- Verify adding the adapted result to Content Plan.

### Done when

- One real source completes `Signal → Studio → Adaptation → Content Plan`.
- No demo transcript or invented analysis appears as real data.
- Missing source/profile links fail honestly and independently.

## Stage 6 — Content Plan

### Scope

- Keep the simplified header from Stage 1.
- Make calendar month, week, and schedule views purposeful or remove unfinished views.
- Implement new, open, edit, reschedule, status change, and delete behavior.
- Persist entries under the correct active brand.
- Make export reflect real calendar data.
- Keep future automatic plan generation out until it has a defined preview and confirmation flow.

### Done when

- Calendar changes survive reload.
- A Studio adaptation lands in the correct brand calendar.
- Export contains the same real entries and dates shown in the UI.

## Stage 7 — Settings, multi-brand, and credits

### Scope

- Keep English and Ukrainian as launch languages.
- Make `Create brand` launch the full Brand Brain onboarding.
- Store a separate Brand Brain for every brand and allow editing saved answers.
- Add a clear active-brand switch without creating another Settings entry.
- Use credits as the single AI-usage unit.
- Define and display credit costs before paid operations.
- Add transparent credit usage history.
- Keep referrals inactive until the reward model is approved; prefer credits or subscription discounts over cash.
- Never expose mock invoices, earnings, referrals, or limits as real account data.

### Done when

- Brand data cannot leak between active brand contexts.
- Credit deductions are deterministic, visible, and tested.
- Settings show only persisted and operational controls.

## Stage 8 — final product QA and staging

### Scope

- Run the full desktop and mobile journey in EN and UK.
- Check responsive layout, keyboard navigation, focus states, contrast, loading, empty, error, and long-copy behavior.
- Fix raw translation keys and mismatched EN/UK keys.
- Run the existing lint, test, and build checks.
- Review the staged diff and exclude runtime data and secrets.
- Deploy the branch to staging and smoke-test Google auth callbacks and the complete user journey.

### Done when

- A new user can complete onboarding and reach real Signals.
- A signal can complete the full Studio and Content Plan path.
- Existing backend, routing, authentication, language switching, and production data remain intact.
- Every stage has its own reviewed commit and the branch is ready for a controlled merge into `main`.

## Working rule for every stage

1. Implement only the named stage.
2. Run focused checks.
3. Open the result in the browser.
4. Let the product owner review it.
5. Fix only issues found in that stage.
6. Commit the accepted slice.
7. Continue to the next stage.
