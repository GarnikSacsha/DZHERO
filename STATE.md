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

Run backend:

```bash
npm run dev:backend
```

Backend API:

```text
http://127.0.0.1:3000
```

Build:

```bash
npm run build
```

## Architecture status

Current implementation is a single-page React prototype plus a first Express backend skeleton with local MVP auth.

Backend storage is temporary JSON:

```text
backend/data/db.json
```

Next architecture step:

1. replace JSON storage with real database;
2. split backend routes into modules;
3. replace local auth/session JSON with production auth and role-based workspaces;
4. test Meta permissions;
5. implement sync queue;
6. integrate AI.

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
