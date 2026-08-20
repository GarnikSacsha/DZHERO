# DZHERO brainstorm handoff

Last updated: **2026-08-20**

## 1. Purpose and operating model

This is the canonical product handoff between DZHERO brainstorm chats. A new
brainstorm agent must first read the complete route in
[`START-HERE.md`](START-HERE.md), including this document, rather than rely on a
previous chat transcript.

The brainstorm chat is for product discussion, decisions, report analysis, and
self-contained prompts for separate working agents. It does not implement code,
run tests, call providers, spend money, change Git or Railway, or create commits.
Tests, design work, and implementation happen in separate working chats.
The Denys Agent Harness is a shared operating contract, not a repository asset
to copy into DZHERO. The brainstorm/orchestration chat prepares narrow agent
contracts and accepts evidence; it does not silently perform their work.

## 2. Product vision

DZHERO is an AI producer, not a library of saved Reels. The intended loop is:

- the user completes a Brand Brain;
- DZHERO recommends relevant accounts automatically;
- it finds promising videos and rejects empty ones;
- it builds a Verified Signal Bank;
- it explains the strong, transferable elements of each signal;
- it helps adapt a signal to the user's brand;
- over time, one verified signal can be reused across users.

The important difference from Sandcastles is responsibility. Sandcastles leaves
the watchlist, selection, and shortlist to the user. DZHERO should supply
already-verified signals automatically. The user corrects relevance and taste,
but does not manually moderate the entire incoming stream.

### Current MVP inventory decision

For a user-selected free-text Brand Brain, DZHERO must try to deliver 3–5
truthful verified signals into the correct bank. Those are not raw Apify
candidates and not manually inserted records. They require
`decision=accept && admittedToBank=true`.

The Brand Brain's product/topic guides source discovery. Audience is a soft
Brand Match and adaptation context, not a hard requirement that the source
video already name the same audience. When exact retrieval is sparse, widen
topic and transferable-mechanic lanes before considering any admission change.
Never fill the bank with unrelated or unverified videos merely to reach a
count. A bounded run may truthfully return fewer signals with a searching state.

## 3. Canonical architecture

```text
Brand Brain
→ Global Channel Catalog
→ Channel Filter
→ personal relevant channels
→ channel publications
→ metadata normalization/deduplication
→ B-soft ranking
→ one best candidate
→ media download
→ Gemini
→ Signal Filter v3.1
→ Verified Signal Bank
→ Brand Match
→ Collection / Studio
```

Responsibilities must remain separate:

1. **Channel Filter** decides which accounts are worth monitoring.
2. **B-soft** decides which metadata candidate first deserves expensive
   analysis.
3. **Signal Filter v3.1** decides whether a particular video deserves the
   shared bank.
4. **Brand Match** ranks how well an already-verified signal fits a particular
   Brand Brain.

Source quality is not video admission, and video admission is not
brand-specific relevance.

## 4. Data boundaries

Keep these concepts distinct:

- **Global Channel Catalog:** shared source identities known to DZHERO;
- **tracked channels:** accounts selected for a particular user or brand;
- **Hidden Candidate Pool:** normalized, deduplicated publications awaiting or
  failing ranking/analysis, not a user-facing verified bank;
- **Verified Signal Bank:** shared signals that passed final admission;
- **brand-specific ranking:** a user's ordered view over verified signals;
- **audit trail:** run plan, candidates, ranking, media, provider analysis,
  policy decision, and admission outcome.

Channel Explorer may show every publication from a selected author. The
Verified Signal Bank and the new Collection may show only:

```text
decision=accept
AND
admittedToBank=true
```

A public Reel, TikTok, or Short URL may become a shared-bank candidate, and its
author may enter the Global Channel Catalog, but the video still has to pass
Signal Filter. A private/local upload is private by default and must not be
shown to other users without explicit consent.

## 5. Signal Filter v3.1

v2 and v3 were unstable because Gemini could mix content value with a visual
metaphor. v3.1 is evidence-first and returns `accept`, `reject`, or `uncertain`.
The provider's own pass flag is ignored. Numeric scores are ranking signals,
not admission rules. Inferred evidence cannot independently justify `accept`.
A causal result requires an observable before/action/after chain. `uncertain`
is never admitted.

Final golden consistency:

- MindStudio: `accept` and admitted in 3/3 runs;
- Axial: admitted in 0/3 runs (`uncertain`, `reject`, `reject`);
- bank-admission flip rate: `0`;
- false admission: `0`;
- false rejection: `0`;
- uncertain: `1/6`.

This proves only a safe limited-MVP baseline on two golden videos. It is not
universal evidence across niches or formats. The owner froze the v3.1 prompt,
schema, policy, thresholds, and `maxVideoAnalysesPerRun=1`; any change requires
a separate decision supported by a new diverse benchmark.

`@solvexhq` is the known regression/evidence case. Manual review labelled it an
obvious false accept: generic AI promotion without a demonstrated result. Its
stored Signal Filter decision was deliberately not rewritten. Preserve it as
future benchmark evidence rather than silently correcting history.

## 6. Production B-soft v1

```text
protectedIntent =
(4×shares + 3×saves) / max(views, 500)

durationDistance =
distance from inclusive [12,60]

durationPrior =
1 / (1 + durationDistance / 12)

rankingScore =
protectedIntent × durationPrior
```

A missing duration receives the median known duration prior in the
deduplicated eligible batch, or `1` if every duration is missing. Stable
canonical identity breaks equal-score ties.

Hard duration-tier variant B was rejected because boundary, low-view, and
malformed/extreme metadata failures were reproduced. B-soft passed 20/20
engineering invariants. The production pipeline now orders by a separate
`rankingScore`; it did not change UI `score` or Signal Filter `qualityScore`.

The current six-candidate order is:

```text
ChatCut → Programmer → Solvex → Lemyn → Creative → Carol
```

ChatCut is top-1. Solvex remains a residual top-3 risk. Keep full analysis at
one candidate per run and do not raise `maxVideoAnalysesPerRun` above `1`
without a new labelled benchmark.

## 7. Author-relative variant D

```text
authorOutlier =
target views / median previous author views
```

Variant D can be useful only when reliable author history exists. The completed
benchmark found reliable history for only 2 of 6 authors, so production D was
not implemented. The future hypothesis is that B-soft always supplies the base
rank and D may add a boost only when history is reliable. Missing D is not zero,
and D is not a quality gate.

## 8. Limited MVP scope

Initial validation uses three deliberately different Brand Brain profiles:

1. educational AI content for marketing teams;
2. practical fitness/home-training content for beginners and busy people;
3. a local café/restaurant for nearby residents and visitors, with a city in
   the test description while location remains optional globally.

Operating bounds:

- 5–10 seed accounts;
- 20–30 metadata candidates;
- full analysis of only top-1 per run;
- 3–5 accepted/admitted signals visible in the correct profile bank;

Primary user path:

```text
Brand Brain
→ Collection
→ inspect a signal
→ Open Studio
→ understand the signal
→ adapt it
→ save
```

Additional path:

```text
Public Reel / TikTok / Short URL
→ transcript/analysis
→ Signal Filter
→ possible admission to the shared bank
```

Validate with 5–7 target users. Success requires at least 3 users to actually
adapt a signal, at least 2 to return, and at least 2 to actually pay `$15`.
Praise, stated intent, or browsing without adaptation is not validation.

## 9. Financial and provider policy

- inspect metadata before downloading video;
- deduplicate by canonical platform ID/URL;
- reuse one completed analysis across users;
- use `concurrency=1` and `retries=0` for experiments;
- keep `maxVideoAnalysesPerRun=1`;
- require explicit permission, a preflight, and a defined budget for paid work;
- enforce hard per-run and monthly limits and fail closed at the limit;
- do not start mass background scraping before MVP validation.

## 10. Active redesign surface

The only active product UI is:

```text
http://127.0.0.1:5180/?preview=product&tab=discover
```

Do not use or modify the legacy dashboard or the main domain. Port `3000` is
the backend API only, never the product UI.

## 11. Verified MVP integration

The previous blockers are resolved on Railway staging:

1. The redesign Brand Brain persists through the backend.
2. Automatic Discovery receives the active workspace Brand Brain.
3. The redesign exposes bounded manual Refresh Bank.
4. Collection requires `decision=accept && admittedToBank=true`.
5. Metadata guards, B-soft ranking, top-1 selection, targeted download, Gemini,
   Signal Filter v3.1, failure classification, and suppression are connected.
6. PostgreSQL-backed staging completed a real provider E2E on 2026-08-05.
7. One admitted TikTok fitness signal appeared in Collection and opened in
   Studio.

The signal had 318K views, 11K likes, quality 51, and AI Match 42. The owner
accepted the technical outcome but judged the signal weakly useful. This is the
first concrete evidence for the next product question: personal usefulness
after shared-bank admission.

Since the prior Discovery proof, the owner confirmed Product Live adaptation on
Railway staging for YouTube, Instagram/Reels, and TikTok through the bounded
commit sequence ending at `b59958d`. The technical flow is working; TikTok
poster/preview display remains open. This does not establish user usefulness,
retention, payment, broad provider reliability, or automatic Discovery across
the three profiles.

See [`DISCOVERY-VERIFICATION.md`](DISCOVERY-VERIFICATION.md) for the permanent
contract, provider-backed evidence, and regression command.

## 12. Current product frontier

The pipeline-connectivity milestone is complete. The owner selected a bounded
evidence route rather than further architecture work:

1. deterministic provider-free Discovery → admission → correct-bank tests for
   the three Brand Brain profiles;
2. a focused TikTok preview repair with regression evidence;
3. only after those pass, separately approved and budgeted live Apify/Gemini
   runs to populate truthful bank inventory;
4. user-value testing of adaptation, return, and payment.

The exact hypotheses, authority gates, and status are maintained in
[`MVP-TEST-MATRIX.md`](MVP-TEST-MATRIX.md). Do not interpret this as permission
for paid calls, deployment, Signal Filter changes, or a larger Discovery scope.

## 13. Git and deployment direction

- Active branch: `codex/product-live-core`.
- Intended redesign base branch: `codex/redesign-ui`.
- `main` stays unchanged.
- The base branch is the eventual PR target, not an alternative merge source.
- Rebase is not automatically preferable to merge; choose only after
  inspecting divergence and risk.
- Staging currently deploys the redesign branch and uses PostgreSQL.
- Do not use the production environment for this validation.

## 14. Railway staging state

The separate frontend and backend staging services are live and use PostgreSQL.
Provider secrets remain backend-only, staging credentials and budgets remain
separate, Automatic Discovery stays disabled, and manual Refresh is protected
by daily, concurrent-run, per-provider, per-run, and monthly limits.

The public health endpoint does not expose deployed Git SHA. Use Railway
deployment metadata when exact revision proof is required. Do not infer the SHA
from health alone.

## 15. Rejected directions

- The manual Sandcastles model conflicts with DZHERO's automatic verified-signal
  promise.
- Analysing 100–500 unlabelled videos does not measure accuracy.
- Views-only ranking ignores protected intent and is insufficient.
- Hard duration-tier B failed its engineering regression.
- D as the primary rank is premature because author history is sparse.
- Increasing `maxVideoAnalysesPerRun` is premature and expands false-admission
  risk and spend.
- Deploying `main`, legacy UI, or production is outside the redesign MVP route.
- Increasing budget instead of fixing Brand Brain integration was rejected.
- Changing Signal Filter v3.1 in response to one weakly useful personal match
  is rejected; investigate Brand Match and user usefulness separately.

## 16. Open risks and owner gates

- only six real ranking labels exist;
- Solvex is both a residual high-rank risk and a known false accept;
- B-soft is unproven outside the initial AI/vibe-coding reference niche and
  must be measured, not retuned by assumption, for the three validation
  profiles;
- Channel Filter is not implemented or validated;
- author-relative history is insufficient;
- one admitted fitness signal was weakly useful despite topic fit;
- a personal Brand Match/Collection policy is not yet validated;
- Product Live is technically confirmed, but adaptation usefulness and quality
  for real users are not validated separately;
- TikTok preview/poster display is missing on an otherwise working TikTok
  Product Live path;
- three-profile deterministic Discovery → admission → correct-bank validation
  has not yet been executed;
- willingness to pay is unproven.

Do not resolve these by silently widening scope. Signal Filter changes,
additional paid analyses, more than one analysis per run, new provider-backed
staging runs, or production deployment each require the stated owner gate.
