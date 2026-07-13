# Studio AI Scenario in Content Plan Design

## Problem

When a user generates an AI adaptation in Studio and adds it to the content plan, the event currently inherits the source reel title. The generated adaptation is not passed into the content-plan flow, and the persisted calendar post has no field for the full scenario. As a result, the calendar cannot identify or recover the adapted content.

## User Experience

- One click on `Додати в контент-план` creates one calendar event for the currently displayed AI adaptation.
- The calendar card title is the AI-generated adaptation title (`remix.title`).
- If the AI response has no usable title, the app derives a short fallback from the adaptation hook. It never falls back to the source reel title while an AI adaptation exists.
- Opening the event shows the full adapted scenario: hook, timed shots, on-screen text, voiceover, and CTA.
- The original reel title and URL remain source metadata only, so the user can trace where the idea came from without confusing the source with the adapted deliverable.

## Data Model

Content-plan posts gain an optional `body` string containing the formatted production scenario. Existing posts without `body` remain valid and continue to use `title` as their editable text.

An AI adaptation post contains:

- `title`: short AI-generated adaptation title, limited by the existing title normalization.
- `body`: multiline production scenario assembled from the selected remix.
- `format`: `Reels` unless an existing explicit format is available.
- Existing scheduling fields: `day`, `time`, and `done`.
- Existing source metadata: `sourceKey`, `sourceReelId`, `sourceTitle`, `sourceUrl`, and `sourceHandle`.
- `source`: a Studio-specific value so this path can be distinguished from a generic Brand Scan plan.

The backend persists `body` with a bounded length and returns it unchanged through the content-plan API.

## Data Flow

1. Studio keeps the latest generated result in `generatedRemix` and composes `effectiveReel`.
2. `Додати в контент-план` passes `effectiveReel`, not the original source reel.
3. A focused content-plan utility selects the first displayed remix, chooses its title with a hook fallback, and formats its full scenario into `body`.
4. The existing content-plan save flow merges the new post and sends it to the API.
5. The event editor displays the compact `title` as its heading and the full `body` in the `Текст / тема` editor.
6. Reopening a calendar event in Studio uses `body` as adaptation context while retaining the source metadata.

## Scenario Formatting

The persisted body is readable plain text so it works in the existing editor and survives API storage without introducing a new rich-text format. It follows this order:

1. `Хук: ...`
2. One block per timed shot containing timeframe, action, on-screen text, and voiceover when present.
3. `CTA: ...`

Empty fields are omitted. The formatter must not insert `undefined`, empty labels, or the original source title into the scenario.

## Compatibility and Error Handling

- Existing calendar posts without `body` keep their current behavior.
- Imported reels without an AI remix continue through the existing Brand Scan plan path.
- If a remix has no title and no hook, the app uses a neutral localized fallback such as `AI-адаптація для Reels`.
- If the scenario has no structured shots, `body` still includes any available hook and CTA.
- Saving failures keep the existing notification and do not navigate away from Studio.

## Testing

- Unit-test title selection: AI title wins; hook is the fallback; source title is not used for an AI adaptation.
- Unit-test scenario formatting with timed shots, on-screen text, voiceover, and CTA.
- Unit-test calendar-to-Studio recovery using `body` while preserving compatibility with title-only posts.
- Run the existing content-plan utility tests, backend syntax check, and production build.

## Out of Scope

- Creating three calendar events for all generated variants.
- Adding a second AI request only to name the event.
- Redesigning the calendar modal or adding rich-text editing.
- Migrating existing title-only calendar data.
