# Recent Changes

## OpenAI Build Week branch

Newest verified implementation commits:

- `9d13e02 feat: track Agent Studio provider usage`
  - bounded/deduplicated OpenAI, Gemini, and Apify usage;
  - safe public aggregates and UI summary.
- `fc6cb47 fix: make Agent Studio approval handoff honest`
  - only full hero/Hybrid approval;
  - exactly seven normalized posts;
  - selected script and production notes preserved.
- `c43de1e fix: harden Agent Studio revision contracts`
  - stable revision requirement ids;
  - unresolved/new-critical/suggestion issue classes.
- `eee9cf6 feat: enforce Agent Studio creative quality`
  - stronger hook, narrative spine, scenes, references, and production rules.
- `05fa209 ui: remove manual video upload from Agent Studio`
  - URL-first primary flow.
- `0bbc975 fix: automate blocked social video resolution`
  - source resolution and retry behavior.
- `21d2a51 feat: accept video from any source`
  - backend source-file recovery primitives.
- `8944c4a feat: bridge social Reels into Gemini video analysis`
  - resolved social video to evidence pipeline.

The current documentation pass updates README, license, judge package, ownership, verification, implemented design, and session handoff. Use `git log --oneline -20` for the authoritative history after it is committed.

## Preserve these decisions

- Existing DZHERO and Build Week work must remain clearly separated.
- “Find from my Signals” currently searches existing Signals, not the entire internet.
- Compact alternatives are not directly approvable.
- Hybrid is a real OpenAI generation and Critic pass.
- Human approval is required before Content Plan writes.
- Provider usage is implemented, not a future roadmap item.
- GitHub handles do not need to match the entrant’s legal name.
