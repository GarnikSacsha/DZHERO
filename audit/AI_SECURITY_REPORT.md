# AI Security Report

## Проверено

- Валидация Agent Studio input.
- Isolation run/upload по workspace и user.
- Upload expiry и MIME/size handling.
- Provider timeout/retry/cleanup paths.
- Prompt composition и передача пользовательского контекста.
- AI quota/cost reservation.
- URL source resolving и SSRF boundary.
- Ошибки provider без выдачи сырого внутреннего ответа клиенту.

## Findings

- `SEC-001` High, fixed: shared demo context раскрывал чужой input.
- `AI-001` Medium, open: Gemini key в query string у части вызовов.
- Provider files требуют гарантированной уборки; для удаляемых demo uploads добавлен cleanup.
- Prompt injection из внешнего контента остаётся inherent risk: источник должен считаться данными, а не инструкцией.

## Рекомендации

1. Явно оборачивать external content в недоверенный data envelope.
2. Запрещать tool decisions, основанные только на тексте внешнего источника.
3. Structured output validation оставить обязательной.
4. Логировать model/provider/latency/tokens/error class без prompt, key и PII.
5. Ввести retention policy для prompts, uploads, traces и runs.
6. Добавить corpus prompt-injection тестов и тест cost amplification.

Реальные provider smoke tests не запускались, чтобы не расходовать ключи и бюджет пользователя.
