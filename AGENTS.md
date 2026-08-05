# Dzhero Agent Start

Before changing code, read:

1. `docs/agent-context/START-HERE.md`
2. `docs/agent-context/PROJECT-SNAPSHOT.md`
3. `docs/agent-context/WORKING-MEMORY.md`
4. `docs/agent-context/OPEN-ISSUES.md`

For Discovery, Signal Filter, Signal Bank, Brand Match, or Refresh Bank work,
also read `docs/agent-context/DISCOVERY-VERIFICATION.md`. Its frozen contract is
the permanent regression baseline for the verified staging pipeline.

For product brainstorming, MVP planning, Discovery, Brand Brain, Channel
Filter, Signal Bank, or Railway staging, also read
`docs/agent-context/BRAINSTORM-HANDOFF.md`.

## Mandatory product rules

- All product work happens exclusively in the new redesign at
  `http://127.0.0.1:5180/?preview=product&tab=discover`.
- Do not change the legacy dashboard or the main domain yet.
- Port `3000` is backend API only, never the product UI.
- Treat `backend/data/db.json` as local runtime data. Do not edit or commit it
  unless the user explicitly asks.
- Signal Filter v3.1 is the frozen MVP baseline. Do not change its prompt,
  schema, policy, or thresholds without a separate owner decision.
- Keep `maxVideoAnalysesPerRun=1` until a separate owner decision changes it.
- Do not make paid Gemini or Apify calls without explicit permission, a
  preflight, and an established budget.
- Do not commit downloaded benchmark videos, evidence frames, temporary
  outputs, or credentials.
- Persist `accept` / `reject` / `uncertain` decisions separately from
  `admittedToBank`.
- Only `decision=accept` together with `admittedToBank=true` may add a video to
  the Verified Signal Bank.
