# Dzhero Agent Context

This folder is the handoff pack for future Codex/agent sessions. Start here when the user opens a new chat and says "Dzhero", "Jero", "Djero", or "the app".

## Read order

1. `PROJECT-SNAPSHOT.md` - current product, architecture, commands, key files.
2. `WORKING-MEMORY.md` - recent decisions, fixes, and why they happened.
3. `OPEN-ISSUES.md` - known risks and next problems to investigate.
4. `FILE-MAP.md` - where the important code and legacy docs live.
5. `RECENT-CHANGES.md` - latest commits and what they mean.

## Current repo

Main workspace:

```text
C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work
```

Branch is normally `main`. The user usually wants practical fixes, commits, and pushes when a production-ready change is done.

## Ground rules for this repo

- Do not commit `backend/data/db.json` unless the user explicitly asks. It often contains local runtime/demo data.
- Prefer small focused fixes over large rewrites. The app is still a compact MVP/prototype with a large `src/main.jsx`.
- Keep UI copy clean in Ukrainian and English. The user is very sensitive to mixed-language screens.
- After behavior changes, run the smallest relevant checks, then `npm.cmd run build` when feasible.
- If a YouTube/Gemini flow looks instant, fake, duplicated, or generic, verify that the frontend is calling the backend AI route and not only rendering fallback data.

## Fast verification commands

```powershell
npm.cmd run build
node scripts/test-source-context.js
node scripts/test-usage-limits.js
node scripts/test-youtube-popular-fallback.js
node --check backend/server.js
```

