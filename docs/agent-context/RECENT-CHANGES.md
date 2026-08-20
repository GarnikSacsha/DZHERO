# Recent changes

Last updated: **2026-08-20**

## Product Live Remix rollout and staging confirmation

- `85fba56` unified the Product Live remix pipeline.
- `7e82b2a` allows YouTube direct-URL analysis to continue when Gemini cannot
  count that multimodal input; duration, request-size, output, and provider
  usage guards remain active.
- `c985fcc` and `ecc85ec` preserve Product Brand Brain through generation and
  require `product + audience` while keeping `niche`/`market` optional.
- `e026337` aligns the personal-URL remix budget with one corrective retry:
  attempt 1 plus at most one attempt 2.
- `b59958d` degrades only schema-valid second-attempt semantic-anchor failures
  to `accepted_with_warnings`; safety/content/budget, schema, empty-output,
  provider, and transport failures remain hard failures.
- The owner confirmed a working Railway-staging adaptation flow for YouTube,
  Instagram/Reels, and TikTok. TikTok poster/preview display remains a known
  defect; it is not evidence that the analysis/adaptation path failed.
- No Railway variables, Signal Filter v3.1 rules, source-evidence contract,
  `maxVideoAnalysesPerRun=1`, or `backend/data/db.json` were changed by this
  documentation entry.

## Offline MVP graph evidence — unintegrated

- A provider-free TikTok preview candidate completed RED→GREEN and passed
  `test:studio-view`, `test:personal-url-adaptation`, and production build.
  It is not committed, deployed, or staging-reverified; the staging preview
  defect therefore remains open.
- A provider-free three-profile lifecycle passed AI, fitness, and café in one
  shared state using the real frozen Signal Filter v3.1 policy over raw
  fixtures. Each workspace finished with exactly three accepted/admitted bank
  signals; max-one analysis, dedupe, suppression, replay, isolation, classified
  errors, and zero-network tripwires were checked.
- Query planning now has local evidence that it prefers content focus/product,
  excludes audience, compacts free text at a word boundary to at most 120
  characters/16 words, and reserves generic bootstrap for missing topic context.
- `npm.cmd run test:discovery-regression`, workspace Brand Match, relevant
  syntax checks, and production build passed locally. N4 independently verified
  the final revised offline obligations.
- No commit, push, integration, deployment, Railway mutation, provider call,
  or `backend/data/db.json` change occurred in this graph evidence.

## Redesign Discovery integration and staging proof

- `232c1c3` connected redesign Brand Brain, Refresh Bank, Collection admission,
  and the bounded Automatic Discovery path.
- Subsequent commits added metadata audits, fail-closed normalization and
  ranking guards, targeted download, suppression memory, manual budget/run
  safety, the two-step Brand Brain, and redesign auth/logout routing.
- `b84c7e2` blocked unsupported Instagram search inputs before reservation and
  selected a valid TikTok keyword plan when both platforms were available.
- `749fe88` fixed Gemini `generation_config.max_output_tokens` and made
  quality-gate provider errors honest retryable failures rather than content
  rejection or an empty successful run.
- On 2026-08-05 an owner-approved staging Refresh admitted a real TikTok fitness
  signal, displayed it in Collection, and opened it in Studio. This completed
  the limited redesign Discovery E2E proof.
- The permanent contract and regression inventory are in
  [`DISCOVERY-VERIFICATION.md`](DISCOVERY-VERIFICATION.md).

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
