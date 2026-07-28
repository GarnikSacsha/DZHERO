# Test Coverage Report

## Выполненные команды

| Команда | Результат |
|---|---|
| `node scripts/test-meta-oauth-state.mjs` | Pass |
| `node scripts/test-agent-studio-demo-isolation.mjs` | Pass |
| `node scripts/test-content-plan-save-ui.mjs` | Pass |
| `npm run test:agent-studio` | Pass |
| `npm run test:public-beta` | Pass |
| `npm run test:free-trial-ai` | Pass |
| `npm run build` | Pass |
| Auth/launch/content-plan focused tests | Pass |
| Local launch/i18n/signal/TikTok/Brand Brain focused tests | Pass |

## Покрытые контракты

- OAuth state validity и provider binding.
- Demo cross-tenant confidentiality.
- Session reuse и legacy tenant revocation.
- Content Plan rejected mutation.
- Agent Studio schema/state/orchestration/video/source/usage/API.
- Free Trial quota reservation, failure rollback и UI errors.
- Public beta guards и automatic discovery.

## Пробелы

- Нет coverage percentage instrumentation.
- Нет multi-process storage race test.
- Нет Firefox/WebKit critical-path suite.
- Нет staging DAST.
- Новые regression-тесты пока не подключены к package script/CI.
- Несколько старых UI tests имеют stale locator/expectation.

## Рекомендованный `test:ci`

Новые три regression-теста → Agent Studio → public beta → free trial AI → focused auth/Brand Brain/Content Plan → build. Параллелить только тесты с уникальными temp DB/ports.
