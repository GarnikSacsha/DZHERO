# API Report

## Общая оценка

Основные workspace API используют server-side tenant checks. Публичные и дорогие маршруты имеют rate limits или quota controls. Доказанная IDOR-подобная проблема public demo исправлена.

## Проверенные области

- auth register/login/logout/me/demo;
- OAuth state start/callback;
- workspace ownership;
- Agent Studio config/upload/run/latest/context;
- Content Plan GET/PUT;
- Brand Brain;
- automatic discovery;
- AI chat/remix usage limits;
- TikTok thumbnail и URL imports.

## Findings

| ID | Риск | Статус |
|---|---|---|
| SEC-001 | Чужой Agent Studio run через shared demo tenant | Fixed |
| AUTH-001 | Корректный Meta callback отклонялся | Fixed |
| ARCH-001 | Lost update между процессами | Open |
| AUTH-002 | Logout может остаться действующим на сервере | Open |

## Abuse cases

- Cross-workspace ID substitution: guards присутствуют.
- Повторный demo login: теперь переиспользует изолированный tenant.
- Expired upload/reuse upload другого пользователя: отклоняется.
- AI budget bypass: reservation/rollback покрыты тестами.
- Excess Content Plan items: API возвращает 402; UI теперь корректно обрабатывает.
- SSRF: публичные URL проходят safe fetch policy.

## Рекомендации

Добавить единый route inventory с явным `public/auth/admin` классом, OpenAPI contract, idempotency для всех expensive mutations и multi-process concurrency tests.
