# Full Audit Report

## Executive Summary

Приложение имеет хорошую базовую защиту: HttpOnly session cookie, CORS allowlist, Helmet, rate limits, workspace authorization, SSRF-safe fetch и лимиты AI-расходов. Главные проблемы сосредоточены в изоляции runtime-данных, конкурентной записи состояния и отсутствии release gates. Три воспроизводимых дефекта исправлены в рамках аудита.

## Матрица рисков

| ID | Severity | Статус | Компонент |
|---|---|---|---|
| SEC-001 | High | Fixed | Agent Studio demo isolation |
| AUTH-001 | High | Fixed | Meta OAuth |
| SEC-002 | High | Open | Git/runtime secrets |
| UX-001 | Medium | Fixed | Content Plan |
| ARCH-001 | Medium | Open, production blocker | Storage/concurrency |
| DEV-001 | Medium | Open | CI/CD |
| DEP-001 | Medium | Open | Dependencies |
| AI-001 | Medium | Open | Gemini credential transport |
| FE-001 | Medium | Open | Agent Studio UI state |
| FE-002 | Medium | Open | Brand Context error handling |
| AUTH-002 | Low | Open | Logout UX |
| QA-001 | Low | Open | Test reliability |

## [SEC-001] Общий публичный Agent Studio tenant

### Компонент

Backend / multi-tenant authorization.

### Расположение

`backend/server.js`, `/api/auth/demo`, Agent Studio `runs/latest`.

### Описание

Каждый публичный посетитель получал общий user/workspace. Последний run содержал пользовательские поля, включая `userNotes`, и мог быть прочитан следующим посетителем.

### Доказательство и воспроизведение

`node scripts/test-agent-studio-demo-isolation.mjs` до исправления возвращал visitor B данные visitor A.

### Ожидаемый / фактический результат

Ожидалось отдельное пространство на посетителя; фактически использовался `ws_demo_agent_studio_coffee`.

### Влияние и вероятность

Межпользовательское раскрытие текста и результатов. Вероятность высокая для публичного демо.

### Исправление

Уникальные маркированные user/workspace, 24-часовой TTL, повторное использование действующей сессии, уборка истёкших tenants и удаление legacy shared tenant.

### Regression test / проверка

`scripts/test-agent-studio-demo-isolation.mjs` — green. Проверяет двух посетителей, reuse той же сессии и удаление legacy tenant.

## [AUTH-001] Несовпадение provider у Meta OAuth state

### Компонент

Backend OAuth.

### Расположение

`backend/server.js`, Meta start/callback.

### Описание

Start сохранял state с provider `meta`, callback искал `instagram`.

### Доказательство и воспроизведение

`node scripts/test-meta-oauth-state.mjs` до исправления получал HTTP 400 вместо redirect.

### Влияние и вероятность

Meta login был функционально сломан для корректного callback. Вероятность высокая при каждом таком входе.

### Исправление и проверка

Callback ищет `meta`; regression-тест green.

## [SEC-002] Runtime database и session-like значения в Git

### Компонент

Secrets / source control.

### Расположение

`backend/data/db.json`, история Git.

### Описание

Runtime DB отслеживается Git и имеет длинную историю изменений. Исторически в ней присутствовали session-like значения. Значения в отчёт намеренно не копировались.

### Доказательство

`git ls-files backend/data/db.json` возвращает файл; `git log --all -- backend/data/db.json` показывает множество коммитов.

### Влияние и вероятность

Если хотя бы один токен ещё действителен или история доступна третьим лицам, возможен захват сессии и раскрытие локальных данных. Вероятность зависит от срока жизни и распространения репозитория.

### Рекомендация

Отозвать все сессии, ротировать внешние ключи при сомнении, удалить blob из всей истории через `git filter-repo`, добавить runtime DB в `.gitignore`, хранить только безопасный seed fixture.

### Regression test / проверка

CI secret scan по полной истории и отрицательная проверка `git ls-files backend/data/db.json`.

## [UX-001] Ложный успех Content Plan при отказе API

### Компонент

Frontend persistence.

### Расположение

`src/main.jsx`, `ContentPlan`.

### Описание

UI игнорировал `response.ok`, сразу обновлял состояние и показывал success toast даже при HTTP 402/5xx.

### Доказательство и воспроизведение

`scripts/test-content-plan-save-ui.mjs` перехватывает PUT и возвращает 402. До исправления событие оставалось в календаре.

### Исправление

Проверка статуса, typed error, commit UI только после ответа, канонический `payload.posts`, lock от параллельных мутаций.

### Проверка

Playwright regression-тест green.

## [ARCH-001] Single-row JSONB state и lost updates

### Компонент

Backend persistence.

### Расположение

`backend/server.js`, `readDb`/`writeDb`; `backend/services/automaticDiscoveryStorage.js`.

### Описание

Большая часть состояния читается и перезаписывается целиком. Локальная очередь защищает только один Node-процесс; несколько Railway-реплик могут перетереть изменения друг друга.

### Влияние и вероятность

Потеря пользовательских обновлений, квот или job-state под конкурентной нагрузкой. Вероятность средняя на одной реплике и высокая после горизонтального масштабирования.

### Рекомендация

Нормализованные таблицы либо версионированная optimistic concurrency (`version` + compare-and-swap) для всех мутаций. До этого закрепить одну реплику.

### Regression test

Двухпроцессный тест одновременных записей с подтверждением отсутствия lost update.

## [DEV-001] Нет обязательного release gate

### Компонент

GitHub Actions / deploy.

### Доказательство

Есть CodeQL на push/schedule и Dependabot, но нет `pull_request` workflow с install, tests и build. Не обнаружены `.nvmrc`, `.node-version`, Dockerfile или Railway config.

### Рекомендация

Добавить PR workflow, `npm ci`, ключевые тесты, build, audit policy и secret scan; зафиксировать Node 24 либо реально поддерживаемую LTS-версию; добавить health/readiness и rollback-инструкцию.

## [DEP-001] Dependency advisories

### Доказательство

`npm audit --omit=dev --json`: 0 critical, 1 high, 6 moderate. High относится к PostCSS; moderate цепочка проходит через `@openai/agents` → MCP SDK → Hono.

### Оценка применимости

PostCSS используется главным образом на build path; Hono `serve-static` не найден в runtime приложения. Риск ниже формального CVSS, но supply-chain debt остаётся.

### Рекомендация

Не применять слепой `npm audit fix`: предложенный путь может откатить `@openai/agents`. Проверить совместимые обновления в отдельной ветке и прогнать Agent Studio suite.

## [AI-001] Gemini API key в query string

### Расположение

`backend/services/agentEngine.js`, `backend/services/remixEngine.js`, отдельные вызовы в `backend/server.js`.

### Описание

Часть запросов использует `?key=...`; URL чаще попадает в proxy/error telemetry, чем headers.

### Рекомендация

Использовать `x-goog-api-key` везде, где endpoint поддерживает header; редактировать URL в логах и APM.

## [FE-001] Устаревший Agent Studio response

При смене workspace/source старый async response может обновить новый экран. Добавить AbortController/request generation token и тест быстрого переключения.

## [FE-002] 5xx Brand Context маскируется под onboarding

Ошибки backend могут выглядеть как отсутствие контекста, направляя пользователя в onboarding. Разделить 404/empty и 5xx/network error.

## [AUTH-002] Logout fail-open в интерфейсе

При сетевом отказе серверная сессия может остаться действующей, хотя локальный UI уже выглядит вышедшим. Показывать предупреждение и предлагать повтор; для sensitive logout использовать server-side revoke с idempotency.

## [QA-001] Несколько тестов зависят от устаревшего UI/окружения

`test-my-brands-ui.mjs`, `test-google-auth-empty-workspace.mjs` и `check-calendar-overflow.js` требуют обновления locator/регистра/запуска сервера. Два старых теста расходятся с актуальными validation/error contracts.

## Положительные результаты

- Workspace authorization применяется к основным workspace routes.
- CORS возвращает отказ, Helmet включён.
- Отдельные rate limits для регистрации/API/дорогих запросов.
- SSRF-защита и тесты Brand Scan присутствуют.
- AI usage/quota reservation проверяется тестами.
- Agent Studio input проходит schema normalization; upload ownership и expiry проверяются.

## Неохваченные области

- Активное тестирование production/Railway не проводилось.
- Реальные OAuth/AI/Apify credentials и платёжные операции не использовались.
- Browser matrix ограничен Chromium.
- DAST, CodeQL CLI, Semgrep, Snyk, gitleaks, trufflehog, Lighthouse и Docker недоступны локально.
- Полный нагрузочный тест внешних провайдеров не запускался, чтобы не создавать расходы.
