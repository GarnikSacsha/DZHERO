# DZHERO UI Stage 0 baseline — `codex/product-live-core`

Date: 2026-07-29

This report records the Stage 0 walkthrough and existing-check baseline. It does not introduce product UI behavior. Product decisions remain sourced from `docs/UI-AUDIT-PRODUCT-LIVE-CORE.md`.

## Reviewed surface

- Signals card actions: view switch, overflow, save, insight, creator/account, trends, activity, and `Open Studio`.
- Content Plan: Month, Week, Schedule, create, open, edit, move, delete, status, export, persistence, and empty state.
- Main mobile route at 390 x 844: Signals, Channels, Studio, Content Plan, Settings, and the mobile sidebar.
- Desktop/laptop/mobile automated layout audit.

## Observed baseline

### Signals preview

- `Open Studio` changes the product page and opens Studio.
- Grid/list, card overflow, save, insight, creator `See all`, and trend controls do not change URL or visible state.
- The activity block has no actionable controls.
- Three signal cards, three trend items, tracked accounts, scores, and activity content are preview data and must not be treated as live workspace data.

### Content Plan preview

- Create, edit, and delete update preview component state.
- Reload restores the preview dataset; changes are not persisted.
- Export does not download a file.
- There is no reschedule control, draggable event, editable event date, or status control.
- Navigating from July to August changes the heading but leaves July events on the same day numbers.
- Week remains fixed to July 27–August 2, and Schedule continues to show July entries after month navigation.
- The real demo workspace correctly renders Month, Week, and Schedule with zero events and no page overflow.

### Mobile route

- Signals, Channels, Studio, Content Plan, Settings, and the mobile sidebar are reachable.
- No reviewed page causes global horizontal page overflow.
- Signals and Channels cards stack within the viewport.
- Studio and Settings use horizontally scrollable tab rows.
- Content Plan keeps the 700 px month grid inside its own horizontal scroller; its format toolbar also scrolls.
- The mobile month view leaves the `New post` action visually clipped at the right edge.
- Settings incorrectly inherits the shared header `Export` action.

### Automated UI audit

- Desktop: 1440 x 1000.
- Laptop: 1180 x 780.
- Mobile: 390 x 844.
- Global body overflow: zero on every audited product page.
- Existing findings:
  - the sidebar collapse control is 30 x 30 px on desktop/laptop;
  - opening the assistant can compress the Content Plan month title and previous/next controls;
  - unauthenticated demo startup logs one expected-but-noisy `/api/auth/me` 401 per viewport.

## Existing checks

| Check | Result | Notes |
| --- | --- | --- |
| `npm run build` | Pass | Existing Vite chunk-size warning remains |
| i18n language/core/provider/components/render/rendered/errors | Pass | EN/UK checks pass |
| `npm run test:theme-preferences` | Pass |  |
| `npm run test:brand-brain` | Pass |  |
| `npm run check:calendar-overflow` | Pass | Updated to accept a truthful empty calendar |
| `npm run audit:ui` | Pass | Findings listed above |
| `npm run test:public-beta` | Pass |  |
| Free Trial quota/API/errors/UI checks | Pass | UI entry helper updated for the current login/demo route |
| `npm run test:agent-studio` | Fail | API assertion expects 34 `trial_provider_attempts_daily` reservations but reads 0; all preceding Agent Studio suites pass |

The Agent Studio failure is outside this UI stage and requires a separate decision: fix the test fixture if its trial entitlement is stale, or fix provider-attempt persistence if the fixture is current. No backend change is authorized in Stage 0.

## Stage 0 acceptance gate

- All previously unresolved UI controls now have proposed keep/change/remove decisions in the UI audit.
- Product UI has not been changed.
- Stage 1 can begin after the product owner accepts the Stage 0 action decisions and decides whether the existing Agent Studio API failure blocks UI implementation.
- `backend/data/db.json` remains local runtime data and must stay outside the Stage 0 commit.
