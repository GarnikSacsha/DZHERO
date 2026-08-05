# Discovery verification record

Last updated: **2026-08-05**

## Status

The limited redesign Discovery loop is now proven end to end on Railway
staging:

```text
Brand Brain
→ manual Refresh Bank
→ metadata discovery
→ normalization, identity guards, and deduplication
→ B-soft ranking
→ one top candidate
→ targeted media download
→ Gemini analysis
→ Signal Filter v3.1
→ admission guard
→ Verified Signal Bank / Collection
→ Studio
```

This is a real provider-backed flow, not a mock or frontend-only fallback.
Production was not touched.

## Staging coordinates and safety state

- frontend: `https://frontend-staging-c899.up.railway.app/`;
- backend: `https://backend-staging-470a.up.railway.app`;
- health: `https://backend-staging-470a.up.railway.app/api/health`;
- workspace: `ws_msdpym2e_05l1zp`;
- authenticated discovery status:
  `https://backend-staging-470a.up.railway.app/api/workspaces/ws_msdpym2e_05l1zp/signals/discovery`;
- authenticated tester plan: `tester_pro`;
- storage: PostgreSQL;
- `AUTOMATIC_DISCOVERY_ENABLED=false`;
- manual metadata Apify cap: `$0.50`;
- manual targeted-download Apify cap: `$0.50`;
- Gemini cap: `$0.15`;
- manual per-run hard cap: `$1.15`;
- monthly staging cap: `$11.50`;
- `generation_config.max_output_tokens=8192`;
- one active run and at most one budgeted run per UTC day.

The status field `dailyBudgetUsd: 0.4` is the base automatic Tester Pro budget,
not the manual Refresh hard cap. Do not change either budget merely to make a
test run.

## Successful staging E2E on 2026-08-05

The owner manually triggered one approved Refresh Bank run after the new UTC
day began. The redesign displayed the success state and one newly admitted
TikTok signal in Collection. Opening the signal loaded the same real video in
Studio with its author, metrics, recommendation, analysis notes, and evidence.

Observed signal:

- author: `@_PETR_ZELENIN_`;
- tags: `#fyp #fitnesschallenge #bodywave #sports`;
- views: `318K`;
- likes: `11K`;
- Collection quality score: `51`;
- AI Match: `42`;
- the signal was visible in Collection and opened successfully in Studio.

The run therefore proved the required write/read contract: a provider-backed
candidate reached Collection only after admission, and the admitted record was
usable by the redesign Studio. The earlier Gemini error
`Unknown parameter 'max_output_tokens'` did not recur.

The exact run ID and final provider cost were not captured in the repository
during this browser session. Do not invent them. Retrieve them from the
authenticated staging discovery status or Railway/PostgreSQL trace if a later
audit needs exact values.

## Product interpretation

The E2E mechanism works, but this one admitted fitness signal was only weakly
useful to the owner despite its topic and engagement. That does not invalidate
the pipeline proof. It exposes the next product question: how Collection should
rank, downrank, or hide weak personal matches after a signal has passed the
shared-bank quality gate.

Do not solve this observation by silently changing Signal Filter v3.1. Signal
Filter and Brand Match are separate decisions:

- Signal Filter asks whether a video contains a sufficiently evidenced,
  transferable signal for the shared bank.
- Brand Match asks whether an admitted signal is useful for a particular Brand
  Brain.

The owner accepted the current run as the intended limited-MVP technical
outcome. Any new relevance threshold, Collection cutoff, or feedback policy is
a separate product decision.

## Fitness false-accept regression on 2026-08-05

The admitted fitness signal also exposed a shared-bank quality defect after
the owner reviewed the actual video: the clip only repeated a body-wave motion
in a plank and did not demonstrate a meaningful process outcome. The original
production policy returned `accept`, `admissionMode=process_demo`, and
`admittedToBank=true` for the captured assessment. This is the preserved RED
case.

The root cause was narrower than general visual-semantic understanding. The
policy validated distinct, ordered before/action/after evidence, but did not
require the `process_demo` content mechanic itself to cite the claimed after
state. A terminal pose could therefore satisfy the structural chain even when
it was not evidence for the transferable content mechanic.

The permanent invariant is now:

```text
For process_demo, afterEvidenceId MUST appear in
derivedClaims.contentMechanic.evidenceIds.
```

If it does not, the chain records
`content_mechanic_outcome_not_grounded`, the mode does not pass, and this case
resolves to `decision=reject`, `admissionMode=null`, and
`admittedToBank=false`. A synthetic positive control in which incorrect plank
technique is visibly corrected still resolves to
`accept` / `process_demo` / `true`. The same regression therefore proves both
the false-accept rejection and preservation of a grounded process demo.

Free verification commands:

```powershell
node scripts/test-signal-quality-fitness-false-accept.cjs
node scripts/test-signal-quality-gate.cjs
node scripts/test-signal-quality-policy-v3-regression.cjs
npm.cmd run test:discovery-regression
npm.cmd run build
```

All checks passed with provider credentials cleared. Provider calls and
network attempts were `0`. The SHA-256 of `backend/data/db.json` was unchanged
before and after verification:
`E0755CAEB092748EAF9A01F6E01DC8B15CAB1E5FF63F492838047FEF908193AE`.

This is intentionally a narrow `process_demo` policy fix. Broader semantic
detection of cyclic movement and a diverse video benchmark remain separate
evidence tasks; this regression does not claim to solve them.

## Earlier provider-backed evidence

### Signal Filter v3.1 paid consistency

- MindStudio: `accept` / `accept` / `accept`, admitted 3/3.
- Axial: `uncertain` / `reject` / `reject`, admitted 0/3.
- bank-admission flip rate: `0`;
- false admission: `0`;
- false rejection: `0`;
- schema failures: `0`;
- Gemini interactions: `6`;
- Apify runs: `2`;
- downloads: `2`;
- conservative total cost: about `$0.305654` of the `$0.40` limit.

### TikTok metadata audit

- audit ID: `metadata_audit_1785539862647_d5f3d44ba5bc`;
- five candidates normalized and deduplicated;
- top-1: TikTok candidate `7668237339872759053` from `@chatcutapp`;
- shares, saves, views, and duration were available;
- metadata-only audit, with no download, Gemini analysis, or Bank write;
- actual Apify cost: about `$0.016`.

### First targeted Signal Filter audit

- execution ID: `signal_filter_audit_1785754165248_6dbe23814775`;
- candidate: `7668237339872759053`;
- exactly one targeted download and one Gemini analysis;
- decision: `uncertain`;
- reasons: `no_qualifying_evidence_mode` and
  `ambiguous_or_invalid_evidence_chain`;
- `admittedToBank=false`;
- Bank and Collection delta: `0`;
- total provider cost: about `$0.035379`.

### Technical-failure classification run

- run ID: `automatic_discovery_msehzdvo_b4oo97`;
- metadata returned six candidates and selected one top candidate;
- Gemini rejected the old request shape with
  `Unknown parameter 'max_output_tokens'`;
- no content decision or Bank write occurred;
- commit `749fe8817e78f530ac64904be1a466fc97173e08` moved the setting to
  `generation_config.max_output_tokens`, classified quality-gate provider
  errors as failures, and prevented the frontend from presenting them as
  content rejection or an honest empty run.

## Frozen production contract

These conditions are regression requirements, not suggestions:

1. Signal Filter v3.1 prompt, schema, policy, and thresholds stay frozen until
   a separate owner decision supported by a diverse benchmark.
2. `maxVideoAnalysesPerRun=1`.
3. Metadata is inspected before targeted media download.
4. Candidate identity is normalized, scoped, and deduplicated before ranking.
5. Missing ranking metadata remains unavailable; it is never converted to a
   fabricated zero.
6. A fully unavailable/zero batch has no top-1 and makes no downstream call.
7. B-soft v1 ranks eligible candidates; stable immutable identity breaks ties.
8. Test runs use `concurrency=1`, retries `0`, and fallbacks `0`.
9. Provider/network/schema/runtime errors remain technical failures. They never
   become `accept`, `reject`, or `uncertain`.
10. Decisions are persisted separately from `admittedToBank`.
11. Only `decision=accept && admittedToBank=true` may write to or appear in the
    Verified Signal Bank.
12. `reject` and `uncertain` are suppressed for 30 days by workspace,
    immutable candidate identity, and policy version. Technical failures do not
    create suppression.
13. Manual Refresh allows only one active run and one budgeted run per UTC day.
14. Paid Gemini or Apify calls require explicit owner permission, a preflight,
    and a defined hard budget.
15. `backend/data/db.json`, downloaded videos, evidence frames, temporary
    outputs, and credentials are never committed.

## Permanent offline verification

The canonical free regression command is:

```powershell
npm.cmd run test:discovery-regression
```

It must not make Gemini or Apify calls. It covers the frozen Signal Filter
contract and immutable paid fixture, B-soft ordering and all 720 permutations,
metadata/scope guards, suppression and failure classification, storage/API
behavior, Refresh safety, redesign client behavior, Brand Brain integration,
and the one-analysis MVP path.

The immutable paid fixture contains provider results and cost/accounting data,
not credentials, downloaded video, or evidence-frame files. Raw local output
directories remain intentionally untracked.

## Implementation history

- `232c1c3` — connect redesign Discovery pipeline.
- `d395d48` — add staging metadata audit.
- `e0d08d3` — fail closed on insufficient discovery metadata.
- `91c7bcd` — align audit cap with Apify minimum.
- `f2566f2` — targeted media download gate.
- `1ae5958` — suppression for repeated uncertain candidates.
- `9b41b0b` — harden manual Refresh Bank execution.
- `0a07705` — bridge audit decisions into discovery suppression memory.
- `1184544` — two-step Brand Brain wizard.
- `b489866` — redesign logout and auth routing.
- `b84c7e2` — TikTok keyword planning and unsupported Instagram guard.
- `749fe88` — Gemini request contract and technical-failure classification.
