# Performance Report

## Измерения

Production build:

- JS: 622.49 kB, gzip 193.16 kB
- CSS: 316.04 kB, gzip 53.26 kB
- build: успешно

## Риски

1. `src/main.jsx` и `backend/server.js` являются крупными монолитами, увеличивают стоимость изменений и препятствуют точечному code splitting.
2. Основной frontend bundle превышает 500 kB до gzip warning threshold и содержит много экранов сразу.
3. Whole-state JSONB read/modify/write масштабируется с размером всего tenant state, а не одной записи.
4. Внешние AI/Apify/YouTube вызовы формируют latency tail; нужны timeout, retry budget и telemetry по provider.

## Рекомендации

- Lazy routes для Agent Studio, Brand Brain, settings и analytics.
- Разделить shared vendor chunk и тяжёлые feature chunks.
- Перевести часто изменяемые коллекции в отдельные таблицы.
- В CI фиксировать bundle budgets.
- Добавить p50/p95/p99 для API/provider и Lighthouse CI после появления доступного runner.

Lighthouse локально недоступен; synthetic score не выдумывался.
