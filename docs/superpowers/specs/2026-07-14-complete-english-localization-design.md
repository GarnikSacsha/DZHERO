# Complete English Localization Design

**Date:** 2026-07-14
**Status:** Approved for implementation
**Scope:** Dzhero frontend UI, system feedback, accessibility copy, and user-facing backend status/error messages

## Problem

Dzhero currently renders most interface copy in Ukrainian and then mutates the committed DOM into English. `src/main.jsx` schedules `applyInterfaceLanguage()` after render at 0, 80, and 250 ms, while `src/i18n.js` also watches the document through a debounced `MutationObserver`.

This produces three user-visible defects:

1. Ukrainian copy can appear before the English replacement, creating a visible language-switching lag.
2. Only exact dictionary and regular-expression matches are translated, so new, dynamic, or slightly changed strings remain Ukrainian.
3. React and the DOM translator compete for ownership of text and attributes, so later component updates can temporarily or permanently restore untranslated copy.

The screenshot supplied with the request demonstrates all three symptoms on the Signals page: English navigation and filters coexist with Ukrainian automation copy and actions.

## Goals

- Render the selected language correctly in the first React commit, with no post-render text replacement.
- Cover every product surface that can display interface-owned copy.
- Translate dynamic system messages, notifications, placeholders, titles, ARIA labels, empty states, loading states, and user-facing errors.
- Keep Ukrainian and English behaviorally identical apart from localized copy and locale-aware formatting.
- Prevent future mixed-language regressions with automated static and rendered audits.
- Preserve user-authored, imported, and AI-generated content in its source or requested language.

## Non-goals

- Translating user-entered brand briefs, notes, workspace names, imported captions, social posts, or external source metadata.
- Automatically translating AI output that is intentionally generated for a Ukrainian audience.
- Refactoring the large `src/main.jsx` beyond boundaries needed for reliable localization.
- Replacing product terminology such as Dzhero, Signals, Studio, Reels, TikTok, YouTube, Direct, Brand Brain, or workspace when the term is intentionally shared between locales.

## Chosen Architecture

### Render-time localization

The application will use a React localization provider and a `useI18n()` hook. The provider owns the current language and exposes:

- `language`
- `setLanguage(language)`
- `t(messageKey, parameters)` for interface copy
- locale-aware number, date, and currency helpers where the current UI needs them

Components obtain translations during render. Static text becomes `t('message.key')`; dynamic text uses named parameters, for example `t('signals.nextCheck', { date })`. The result is part of the React tree before it reaches the DOM.

`applyInterfaceLanguage`, its timers, DOM walking, mutation observer, and regular-expression replacement pipeline will be removed after all product surfaces use render-time localization.

### Catalog structure

Catalogs will contain stable semantic keys with complete Ukrainian and English values. They will be organized by product surface rather than by component implementation detail:

- common navigation and actions
- authentication and Brand Scan
- onboarding tours
- Home
- Signals and automatic discovery
- Studio and remix generation
- Content plan
- Settings, sources, Brand Brain, billing, and account
- Assistant and pipeline states
- public legal/data-deletion UI
- modals, toasts, validation, loading, empty, and error states

Ukrainian remains the default locale. A missing key is treated as a development defect: tests fail instead of silently displaying the key or falling back to a different language.

### State and persistence

The existing `insta-producer-language` local-storage preference remains authoritative across reloads. The initial provider state reads it synchronously so an English user does not receive a Ukrainian first frame. The provider updates `document.documentElement.lang` declaratively when the language changes.

Language switching performs a normal React state update. No arbitrary timeout, reload, component remount, or DOM observer is required.

### Dynamic helpers and server data

Helpers that currently return interface-owned Ukrainian sentences, especially `signalsUiState.mjs`, will accept a translator or locale and return localized copy. Category definitions will store stable IDs; their visible labels will be translated at render time.

Backend APIs should prefer stable machine-readable error/status codes. The frontend maps those codes to localized messages. Existing backend-provided human-readable copy that is directly displayed will either gain a locale-neutral code or be explicitly localized before display. Internal logs, AI prompts, classifiers, and Ukrainian content-generation defaults are not interface copy and remain unchanged.

### Content boundary

Automated audits need a strict boundary between product copy and content:

- Interface-owned copy must match the selected UI language.
- User-authored, imported, workspace-specific, source-specific, and generated content may contain any language.
- Components rendering external/content fields will mark their content containers so rendered audits do not misclassify valid Ukrainian content as a UI regression.

This boundary applies only to audit classification; it does not hide or mutate content.

## Product Surface Coverage

The implementation audit covers:

1. Public legal, privacy, and data-deletion pages.
2. Brand Scan and authentication gates.
3. Sidebar, top bar, account menu, workspace controls, theme controls, and mobile navigation.
4. Product and legacy onboarding tours.
5. Home dashboard and workflow rail.
6. Signals search, filters, source tabs, automatic discovery, imports, tables, previews, loading/error/empty states, and action feedback.
7. Studio empty state, Brand Scan Studio, remix generation, script fields, video tasks, and add-to-plan flows.
8. Content plan calendar, notes, editor modals, drag/drop feedback, and Studio handoff.
9. Settings tabs: sources, Brand Brain/profile, billing, account, and connected-source states.
10. Assistant drawer, creator assistant, agent pipeline, and saved-action feedback.
11. Shared modals, confirmation copy, validation, toasts, placeholders, tooltips, titles, and ARIA labels.

Legacy or currently unreachable components are included in the static audit so re-enabling them cannot reintroduce mixed-language UI.

## Error Handling

- Unknown translation keys fail automated checks and report the exact key and locale.
- Unknown server error codes fall back to a localized generic message, never to raw internal exception text.
- Network and backend failures retain technical details in development logs but show concise localized user copy.
- Unsupported stored language values normalize to Ukrainian.
- Parameter interpolation rejects missing named parameters in tests.

## Testing Strategy

### Unit tests

- Both catalogs expose the same key set.
- Every key resolves to a non-empty value in both locales.
- Named interpolation works and fails clearly when a required parameter is missing.
- Locale selection and invalid-locale fallback behave deterministically.
- Dynamic Signals status/empty-state helpers produce Ukrainian and English variants.
- Category and server-error mappings return localized labels rather than embedded Ukrainian UI copy.

### Static UI-copy audit

The existing `check:i18n-language` command will become a real regression check. It will inspect interface source modules and fail on:

- Cyrillic user-interface literals outside catalogs or explicitly classified content fixtures.
- direct DOM translation, document text walking, language mutation observers, or localization timers.
- untranslated interface attributes and notification strings.
- mismatched locale catalog keys.

The audit will distinguish linguistic classifiers, AI prompts, test data, and content-generation defaults from interface copy instead of globally banning Cyrillic from the repository.

### Rendered browser audit

A Playwright test will start from a clean English preference, enter the demo workspace through supported test setup, and inspect the main product surfaces. It will check visible interface text plus `placeholder`, `title`, and `aria-label` attributes for Cyrillic outside marked content regions.

The test will exercise language switching and assert that the English UI is present immediately after the React update without delayed replacements. It will also open representative modals, settings tabs, assistant UI, and empty/error states that are practical to reach deterministically.

### Regression and build verification

- Run the focused localization unit and rendered tests in their red state before production changes.
- Run them green after each localization slice.
- Run existing affected tests, particularly Signals and content-plan checks.
- Run `npm.cmd run build` after the complete migration.
- Perform a final source audit and rendered English-mode audit before completion is claimed.

## Migration Sequence

1. Add the render-time localization core and failing unit tests.
2. Move global language ownership and shared navigation/authentication copy to the provider.
3. Localize Signals and its helper modules first because it is the reported failure and the densest dynamic surface.
4. Migrate Studio, Content plan, Settings, Assistant, Home, public pages, tours, and shared modals.
5. Localize user-facing server status/error mappings while preserving AI/content-generation language behavior.
6. Add the static and rendered whole-site audits.
7. Remove the DOM translator only when the audits prove no interface surface depends on it.
8. Run the complete verification matrix and inspect the final diff for accidental overlap with pre-existing work.

## Working-tree Safety

The repository already contains user changes in `backend/server.js`, `src/main.jsx`, `src/i18n.js`, `src/contentPlanUtils.mjs`, tests, styles, and runtime data. Implementation must preserve those changes, avoid committing `backend/data/db.json`, and keep localization commits narrowly scoped. Where localization overlaps a modified file, edits will be applied to the current working-tree version rather than replacing it from `HEAD`.

## Acceptance Criteria

The work is complete only when all of the following are proven:

- Selecting English produces no visible Ukrainian-to-English flash.
- No localization timers, text-node walker, or language mutation observer remains.
- Every reachable interface surface listed above renders English UI copy.
- Dynamic notifications, validation, loading, empty, success, and error messages are localized.
- Placeholders, titles, tooltips, and ARIA labels are localized.
- User/imported/generated content remains unchanged.
- Ukrainian mode remains complete and functional.
- Catalog parity, unit localization checks, static UI-copy audit, rendered browser audit, affected regression tests, and production build all pass.
- Pre-existing unrelated working-tree changes and local runtime data remain intact.
