# Architecture Report

## Текущее устройство

React/Vite SPA обращается к Express backend. Backend объединяет auth, billing/quota, discovery, Brand Brain, Content Plan, integrations и Agent Studio. Состояние хранится либо в локальном JSON, либо как единый JSONB application state в PostgreSQL.

## Сильные стороны

- Доменные helpers и `.cjs` сервисы постепенно вынесены из server.
- Agent Studio имеет schema, state machine, orchestrator и usage collector.
- Есть абстракция storage transaction для automatic discovery.
- Документация product flow и Postgres storage присутствует.

## Основные проблемы

1. `backend/server.js` — большой composition root и набор бизнес-операций одновременно.
2. `src/main.jsx` — большой UI root со связанными feature state/effects.
3. Single-row JSONB создаёт глобальный contention и lost-update risk.
4. Контракты API определяются вручную и частично дублируются между UI и backend.

## Целевая последовательность

1. Ввести versioned repository interface и optimistic concurrency.
2. Перенести sessions, users, workspaces, usage counters, jobs/runs в таблицы.
3. Разделить Express routers по bounded context.
4. Вынести frontend routes/features и query/mutation layer.
5. Добавить OpenAPI/Zod shared contracts.

Полная микросервисная декомпозиция сейчас не нужна; сначала требуется корректная транзакционная модель.
