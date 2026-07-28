# Security Report

## Итог

Critical не найдено. Главный доказанный authorization defect (`SEC-001`) исправлен. Открытый security blocker — runtime DB в Git и необходимость ротации исторических session-like значений.

## Контроли

| Контроль | Состояние |
|---|---|
| Session cookie | HttpOnly, SameSite=Lax, Secure в production |
| CORS | Allowlist + тест отказа |
| Security headers | Helmet |
| Rate limiting | Общий, register, expensive routes |
| Tenant guards | `requireWorkspace`/`canAccessWorkspace` |
| SSRF | `safePublicFetch` и regression-тесты |
| Upload ownership | workspace + user + expiry |
| Password hashing | PBKDF2 + random salt |

## Findings

- `SEC-001` High, fixed: общий public Agent Studio tenant.
- `SEC-002` High, open: tracked runtime DB и исторические session-like значения.
- `ARCH-001` Medium, open: multi-replica lost updates могут повредить auth/quota/job state.
- `AI-001` Medium, open: credential в query URL.
- `AUTH-002` Low, open: неоднозначный logout при сетевом отказе.

## Adversarial review

Проверялись: горизонтальный доступ к workspace/run/upload, повторное использование demo session, legacy sessions, forged OAuth state, expired state, quota races, SSRF через URL import, oversized/unsupported uploads, unauthenticated workspace routes и отказ CORS.

Не обнаружено доказанного SQL injection: пользовательские SQL-значения передаются параметризованно. Не обнаружено прямого `eval`/shell execution на пользовательском вводе.

## Обязательные действия

1. Ротация и очистка Git history.
2. Одна backend-реплика до внедрения DB concurrency control.
3. PR secret scan и security test gate.
4. Унификация Gemini auth headers.
