# Working Memory

Last updated: **2026-08-20**

## Current direction

DZHERO is an AI producer, not a generic dashboard, blank chat, or saved-Reels
gallery. Current work happens only in the redesign at
`http://127.0.0.1:5180/?preview=product&tab=discover`.

The redesign Discovery pipeline is now connected and verified end to end on
Railway staging. One approved manual Refresh found, analysed, admitted, and
displayed a real TikTok fitness signal, which then opened in Studio.

Since that earlier proof, the owner also confirmed the Product Live adaptation
path on Railway staging for YouTube, Instagram/Reels, and TikTok. The work is
the commit sequence `85fba56` → `7e82b2a` → `c985fcc` → `ecc85ec` →
`e026337` → `b59958d`: unified grounded remix, safe YouTube budget handling,
Brand Brain preservation, two bounded remix attempts, and second-attempt
semantic warnings. This proves technical flow only. TikTok preview/poster
rendering remains open.

The owner considers this the intended limited-MVP technical outcome. The
result's usefulness was weak despite topic fit and engagement; this is new
evidence for Brand Match/Collection ranking, not permission to change the
frozen Signal Filter v3.1 baseline. Full evidence and regression rules are in
[`DISCOVERY-VERIFICATION.md`](DISCOVERY-VERIFICATION.md).

## Latest owner decisions

- Stop further MindStudio/Axial consistency runs.
- Do not develop v3.2 without new, diverse evidence.
- Do not tighten the v3.1 prompt yet.
- Consider prompt changes only after building a benchmark from different real
  videos.
- Keep Signal Filter v3.1 frozen as the limited-MVP baseline.
- Keep `maxVideoAnalysesPerRun=1`.
- Reject hard duration-tier ranking B for production: its offline regression
  reproduced boundary, low-view, and malformed/extreme-metadata failures.
- Use B-soft v1 for automatic-discovery metadata ranking. Its production
  regression passed the six-candidate benchmark, all 720 permutations, and the
  registered engineering invariants without changing Signal Filter v3.1.
- Defer author-relative variant D until reliable author history exists; any
  future use is an optional boost requiring a separate owner decision.
- Run an MVP readiness audit before investing in more filter refinement.
- Treat the completed readiness preflight as the input to the MVP Discovery
  Integration Patch. It stopped before provider execution and spent `$0`.
- Use this chat for brainstorming and task definition.
- Use separate working agents for implementation and tests.
- Use deterministic provider-free tests before any new live Discovery run.
- Test three onboarding Brand Brain profiles: educational AI for marketing
  teams, practical fitness/home training, and a local café/restaurant.
- The readiness target is 3–5 truthful accepted/admitted signals in each
  profile's bank. Broaden topic retrieval before relaxing source-quality or
  admission rules; audience is a soft Brand Match/adaptation signal, not a
  hard source filter.
- Do not vendor the Denys Agent Harness into this repository; use it as the
  common operating contract for task definition and acceptance.

## Offline graph evidence — 2026-08-20

- The TikTok preview candidate is locally RED→GREEN: the persisted TikTok
  poster now reaches Studio view state while Instagram, YouTube, and honest
  no-preview fallback behavior stay covered. `test:studio-view`,
  `test:personal-url-adaptation`, and the production build passed locally.
  The patch is not committed, integrated, deployed, or staging-reverified.
- The three-profile provider-free lifecycle passed with one shared state and
  the real frozen v3.1 policy over raw fixtures: exactly three
  `accept + admittedToBank` signals per AI, fitness, and café workspace;
  `maxVideoAnalysesPerRun=1`, isolation, dedupe, suppression, replay, and
  classified-error assertions remained intact. Network tripwires recorded zero
  calls.
- Discovery planning now uses content focus/product topic rather than audience.
  A 758-character free-text description was planned as a 114-character,
  13-word whole-word query under the 120-character/16-word cap. Generic
  bootstrap is reserved for missing topic context.
- `test:discovery-regression`, workspace Brand Match, relevant syntax checks,
  and the production build passed locally. N4 independently accepted the final
  revised obligations. None of this authorizes providers, a deploy, or a live
  relevance claim.

Paid Gemini or Apify work always requires explicit permission, a preflight, and
an established budget.

## Product architecture

```text
Brand Brain
→ search in the shared source catalog
→ Channel Filter
→ recommended channels
→ channel publication grid
→ metadata/outlier prefilter
→ Gemini analysis of the best candidates
→ Signal Filter
→ Verified Signal Bank
→ Brand Match
```

## Decision boundaries

1. **Channel Filter** decides which sources to monitor.
2. **Signal Filter** decides whether a specific video deserves the shared bank.
3. **Brand Match** decides how well a verified video fits a specific Brand
   Brain.

These stages must not be collapsed. Source quality is not video admission, and
video admission is not user-specific relevance.

Signal Filter persists `accept`, `reject`, or `uncertain` separately from
`admittedToBank`. Only `decision=accept` plus `admittedToBank=true` can write to
the Verified Signal Bank. `uncertain` always stays out.

## Evidence status

Signal Filter progressed through v2, v3, and v3.1. The final v3.1 consistency
run had stable bank admission across three MindStudio and three Axial
evaluations, with no false admission, false rejection, schema failure, or
missing/duplicate evidence IDs.

This evidence establishes a safe limited-MVP baseline on two reference videos,
not general quality across niches or formats. The missing diverse benchmark is
an input to future filter work, not a reason to repeat the same two-video run.

## Completed integration scope

- redesign Brand Brain persists through the backend;
- the active Brand Brain reaches Automatic Discovery;
- redesign Refresh Bank runs under manual safety limits;
- Collection requires `decision=accept && admittedToBank=true`;
- B-soft, Gemini, Signal Filter, and classified failure traces are preserved;
- the discovery path analyses at most one video per run;
- one real admitted staging signal reached Collection and Studio.

The owner has now chosen the next experiment: deterministic Discovery →
admission → correct-bank validation for the three Brand Brain profiles, followed
only then by separately authorized bounded live runs and user-value testing.
Do not resume paid discovery merely to accumulate volume; every live run must
state which matrix hypothesis it measures.

Staging is separate from production. Start with a Railway-generated domain and
backend-only secrets. A Volume is acceptable for early JSON persistence;
PostgreSQL is preferred before production.

## Data and repository hygiene

- The redesign is the only active product surface; do not modify the legacy
  dashboard or main domain.
- Port `3000` is backend API only.
- `backend/data/db.json` is local runtime data and must not be edited or staged
  unless explicitly requested.
- Do not commit benchmark downloads, evidence frames, temporary outputs,
  credentials, or provider payloads.
- Production data was not changed during the Signal Filter experiments.

## Historical context

The earlier Build Week Agent Studio and Free Trial decisions remain historical
implementation context in the repository. They do not override the current
redesign-only product direction or the limited MVP scope.

## Owner-only shared-bank moderation

The limited MVP supports one product-owner action in the redesign Collection:

- `POST /api/owner/signals/:signalId/exclude`;
- backend authorization uses the existing owner/unlimited-access gate, so the
  frontend visibility check is only a usability layer;
- the action is global and currently supports only owner moderation, not user
  feedback or personal hiding;
- exclusion changes only `importedMetadata.qualityGate.admittedToBank` to
  `false`; the original `decision`, assessment, observations, evidence chains,
  and filter results remain unchanged;
- the record is retained with an extensible `ownerModeration.global` audit
  object containing `scope`, `reasonCode`, `excludedAt`, actor identity,
  `previousState`, and an audit history. This supports a future restore action
  without deleting the signal or losing its provenance;
- repeated exclusion is idempotent and does not append a second audit event;
- future user-facing “Не підходить” feedback must be personal (`scope=user`)
  and must not alter the global bank or Signal Filter decisions automatically.
