# DevOps Report

## Существующее

- CodeQL workflow на push, schedule и manual run.
- Dependabot npm weekly.
- `/api/health`.
- `package-lock.json` и воспроизводимый `npm ci` возможны.

## Пробелы

- Нет обязательного `pull_request` build/test workflow.
- Нет единого `test:ci`.
- Не зафиксирована версия Node.
- Нет Dockerfile, Railway config или Procfile в репозитории.
- Нет документированного migration/rollback процесса.
- Нет CI secret scanner и dependency policy gate.
- CodeQL не запускается непосредственно на pull request.

## Минимальный release gate

1. Checkout + pinned Node.
2. `npm ci`.
3. Secret scan.
4. `npm audit` с согласованным allowlist.
5. Regression + Agent Studio + public beta + free trial suites.
6. `npm run build`.
7. CodeQL/SAST.
8. Deploy только из защищённой ветки после зелёных checks.

## Runtime

До исправления `ARCH-001` использовать одну backend replica. Health endpoint дополнить readiness-проверкой Postgres и доступностью обязательной конфигурации без раскрытия значений.
