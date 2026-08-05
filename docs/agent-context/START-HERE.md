# Dzhero Agent Context

This folder is the handoff pack for future Codex/agent sessions. Start here when the user opens a new chat and says "Dzhero", "Jero", "Djero", or "the app".

## Read order

1. `PROJECT-SNAPSHOT.md` - current product, architecture, commands, key files.
2. `WORKING-MEMORY.md` - recent decisions, fixes, and why they happened.
3. `OPEN-ISSUES.md` - known risks and next problems to investigate.
4. `DISCOVERY-VERIFICATION.md` - required for Discovery, Signal Filter,
   Signal Bank, Brand Match, Refresh Bank, and staging regression work.
5. `MVP-SCOPE.md` - required for any task involving product direction,
   discovery, Signal Bank, Brand Brain, or MVP.
6. `BRAINSTORM-HANDOFF.md` - required for product brainstorming, MVP planning,
   Discovery, Brand Brain, Channel Filter, Signal Bank, or Railway staging. It
   contains the canonical product decisions, blockers, and handoff route.
7. `FILE-MAP.md` - where the important code and legacy docs live.
8. `RECENT-CHANGES.md` - latest commits and what they mean.

For a brainstorm chat, read the complete route above before discussion. That
chat defines product decisions and prepares self-contained prompts; code,
design implementation, and tests belong in separate working chats.

## Current repo

Main workspace:

```text
C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work
```

The historical Build Week worktree is:

```text
C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\openai-build-week
```

Current branch: `codex/product-live-core`.

## Ground rules for this repo

- All current product work targets the redesign at
  `http://127.0.0.1:5180/?preview=product&tab=discover`; the legacy dashboard
  and main domain are not current product surfaces.
- Port `3000` is the backend API, not a product UI.
- Do not commit `backend/data/db.json` unless the user explicitly asks. It often contains local runtime/demo data.
- For Build Week submission context, read `docs/hackathon/README.md`.
- Prefer small focused fixes over large rewrites. The app is a large full-stack
  MVP with a large `src/main.jsx`; deployment of the current branch is not
  verified.
- Keep UI copy clean in Ukrainian and English. The user is very sensitive to mixed-language screens.
- After behavior changes, run the smallest relevant checks, then `npm.cmd run build` when feasible.
- If a YouTube/Gemini flow looks instant, fake, duplicated, or generic, verify that the frontend is calling the backend AI route and not only rendering fallback data.

## Fast verification commands

```powershell
npm.cmd run build
npm.cmd run test:agent-studio
node scripts/test-source-context.js
node scripts/test-usage-limits.js
node scripts/test-youtube-popular-fallback.js
node --check backend/server.js
```

