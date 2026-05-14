# State

## Git

Initial local git repo has been created.

Main branch:

```text
main
```

Initial commit:

```text
67bba41 Initial InstaProducer prototype
```

## Remote

GitHub repository:

```text
https://github.com/GarnikSacsha/insta-producer-.git
```

## Local setup

Project path:

```text
C:\Users\Денис\Desktop\Всякое вайбкодинг\Инстаграм продюссер
```

Install:

```bash
npm install
```

Run:

```bash
npm run dev -- --port 5173
```

Build:

```bash
npm run build
```

## Architecture status

Current implementation is a single-page React prototype. It is intentionally frontend-only for now.

Next architecture step:

1. choose backend;
2. create database schema;
3. replace mocks with persisted entities;
4. add auth/workspaces;
5. test Meta permissions;
6. implement sync queue;
7. integrate AI.

## Suggested backend entities

- users
- workspaces
- instagram_accounts
- competitors
- reels
- ideas
- remixes
- content_plan_items
- leads
- crm_tags
- ai_memory
- sync_jobs

