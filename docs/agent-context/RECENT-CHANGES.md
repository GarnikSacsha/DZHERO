# Recent changes

Last updated: **2026-07-20**

## Public beta integration

- Free Trial now reads a shared, read-only signal bank instead of launching paid discovery.
- Trial discovery settings, manual discovery runs, and advanced provider imports are blocked server-side.
- Public Brand Scan no longer expands through the optional paid source provider unless explicitly enabled.
- Agent Studio remains usable on the Build Week deployment but is disabled with **Coming soon** on the public deployment.
- The pricing grid remains visible while checkout and plan selection are disabled by default.
- Added public-beta API/UI regression coverage and re-ran the complete Agent Studio suite and production build.

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

Latest verified branch-tip fixes:

- `a22a955 fix: remove rejected Gemini schema limits`
- `43469e9 fix: enforce structured Gemini video evidence`
- `0997b9c fix: localize Agent Studio quality errors`
- `498032c fix: fall back to Instagram media URL`

Use `git log --oneline -20` as the authoritative history. `3529d80` is the pre-polish baseline; final UI, English-output, tests, and documentation integration is `be3ab33`; later source/evidence fixes culminate in `a22a955` before the July 20 documentation refresh.

## Preserve these decisions

- Existing DZHERO and Build Week work remain clearly separated.
- **Find fresh signals** discovers new signal-bank items; **Choose from my Signals** selects from that workspace bank inside Agent Studio.
- Compact alternatives are not directly approvable.
- Hybrid is a real OpenAI generation and Critic pass.
- Human approval is required before Content Plan writes.
- Provider usage is implemented, not roadmap copy.
- Production uses Railway/PostgreSQL; JSON is only the local fallback/seed.
- GitHub handles do not need to match the entrant's legal name.
