# QA Report

## Итог

Критические сценарии после исправлений проходят. Тестовая база широкая, но нет одного обязательного CI entrypoint и часть standalone тестов устарела относительно UI/contracts.

## Новые regression tests

- `scripts/test-meta-oauth-state.mjs`
- `scripts/test-agent-studio-demo-isolation.mjs`
- `scripts/test-content-plan-save-ui.mjs`

Все три прошли red-to-green.

## Успешные наборы

- `npm run test:agent-studio`
- `npm run test:public-beta`
- `npm run test:free-trial-ai`
- `npm run build`
- auth session upgrade и launch guards
- Content Plan utils/body
- local launch, rendered i18n, signal preview
- TikTok thumbnail API
- Google-only auth
- owner/tester API
- Brand Brain persistence

## Известные несовпадения тестов

- `test-my-brands-ui.mjs`: устаревший sidebar locator.
- `test-google-auth-empty-workspace.mjs`: case-sensitive ожидание не совпадает с локализованным заголовком.
- `check-calendar-overflow.js`: требует заранее запущенный порт 5180.
- `test-mutating-api-concurrency.mjs`: fixture не удовлетворяет актуальной Brand Brain validation.
- `test-agent-paid-attempt-hook.js`: ожидает сырой provider message вместо актуального безопасного `ai_provider_failed`.

## Рекомендации

Создать `test:ci`, включить три новых regression-теста, убрать fixed timeouts в пользу response/event waits и добавить Firefox/WebKit smoke для auth/calendar.
