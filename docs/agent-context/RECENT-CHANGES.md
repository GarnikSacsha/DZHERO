# Recent changes

Last updated: **2026-07-17**

## Latest Build Week commits

- `3529d80 fix: authenticate Apify TikTok media downloads`
  - downloads protected Apify media with server-side authorization;
  - uploads the media to Gemini Files rather than exposing a protected URL;
  - keeps failure classified if protected transfer still fails.
- `d48a719 feat: add Agent Studio new run action`
  - resets a completed/approval-state run for another source test.
- `81b8338 chore: deploy fresh signal discovery`
  - deployment marker for the fresh-signal flow.
- `2325d9d feat: add fresh signal discovery flow`
  - manual and scheduled discovery;
  - budget-aware mixed lanes, persisted run state, and UI status.
- `cd45ea2 feat: rebuild content calendar experience`
  - month/week/schedule calendar and post interaction improvements.
- `2361d1d fix: polish Build Week product experience`
  - judge-facing product/UI refinements.
- `2c199c3 docs: prepare Build Week judge package`
  - initial README, judge guide, demo, verification, ownership, and checklist package.
- `9d13e02 feat: track Agent Studio provider usage`
  - bounded OpenAI, Gemini, and Apify usage aggregates.

Use `git log --oneline -20` as the authoritative history. `3529d80` is the baseline before the final UI/documentation pass, not the final submission commit.

## Preserve these decisions

- Existing DZHERO and Build Week work remain clearly separated.
- **Find fresh signals** discovers new signal-bank items; **Choose from my Signals** selects from that workspace bank inside Agent Studio.
- Compact alternatives are not directly approvable.
- Hybrid is a real OpenAI generation and Critic pass.
- Human approval is required before Content Plan writes.
- Provider usage is implemented, not roadmap copy.
- Production uses Railway/PostgreSQL; JSON is only the local fallback/seed.
- GitHub handles do not need to match the entrant's legal name.
