# Remediation Plan

## P0 — до production

| Действие | Владелец | Проверка |
|---|---|---|
| Отозвать sessions и ротировать потенциально раскрытые credentials | Security/Owner | Старые токены дают 401 |
| Удалить `backend/data/db.json` из Git history и tracking | DevOps | secret scan всех refs |
| Ограничить backend одной репликой либо внедрить version/CAS | Backend | двухпроцессный concurrency test |
| Добавить обязательный PR build/test gate | DevOps | protected branch не принимает красный PR |

## P1 — ближайший спринт

- Совместимо обновить PostCSS/OpenAI Agents dependency chain.
- Перенести Gemini auth из query в header.
- Исправить stale Agent Studio request и Brand Context 5xx UX.
- Включить три новых regression-теста в `test:ci`.
- Добавить retention job для demo/upload/run данных.
- Исправить пять устаревших standalone тестов.

## P2

- Нормализовать PostgreSQL storage.
- Разделить backend routes и frontend feature bundles.
- OpenAPI/shared schemas.
- Lighthouse/bundle budgets и browser matrix.
- DAST на staging и periodic secret/history scan.

## Уже выполнено

- Meta OAuth provider mismatch.
- Public demo tenant isolation, TTL/reuse/legacy cleanup.
- Content Plan error handling, canonical state и mutation lock.
- Regression-тесты и повторный production build.

## Критерий снятия HOLD

Все P0 выполнены, regression suites зелёные в CI, staging smoke не раскрывает cross-tenant данные, rollback проверен.
