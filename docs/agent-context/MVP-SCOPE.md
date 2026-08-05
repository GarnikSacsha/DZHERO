# DZHERO limited MVP scope

Last updated: **2026-07-31**

## MVP goal

Prove that DZHERO helps a user find and adapt a useful content idea for which
they are willing to pay `$15` per month.

## Initial niche

AI / vibe coding / AI agents.

## Limited content scope

- 5–10 seed accounts;
- 20–30 metadata candidates;
- full analysis only for top-1 per run;
- 10–20 verified signals;
- no mass scraping or universal discovery across every niche.

## Primary MVP flow

```text
Brand Brain
→ Collection
→ inspect a signal
→ Open Studio
→ understand the strongest elements
→ adapt
→ save
```

## Additional public-URL flow

```text
public Reel / TikTok / Short URL
→ transcription and analysis
→ Signal Filter
→ possible admission to the shared bank
```

## Data rules

- A public URL may become a candidate for the shared bank.
- A locally uploaded file is private by default.
- An account added by a user enters the shared source catalog but does not
  automatically become recommended to everyone.
- Channel Explorer may show every publication from a source.
- Verified Signal Bank shows only signals that passed admission.
- A Signal Filter decision is stored separately from `admittedToBank`.
- Only `decision=accept` and `admittedToBank=true` may admit a signal.
- `uncertain` never enters the bank.

## Financial constraints

- Inspect metadata before downloading media.
- Download only the best candidates.
- Deduplicate by canonical URL.
- Reuse one analysis across users.
- Use `concurrency=1` and `retries=0` for experiments.
- Enforce hard budgets per run and per month.
- Fail closed when a limit is reached.
- Keep `maxVideoAnalysesPerRun=1` until the owner makes a separate decision.
- Require explicit permission, a preflight, and a defined budget before any
  paid Gemini or Apify call.
- Do not start mass background scraping before MVP validation.

## Product-validation criteria

Across 5–7 target users:

- at least 3 actually adapt a signal;
- at least 2 return;
- at least 2 actually pay `$15`.

## Red flags

- Users only praise the design.
- Users do not adapt anything.
- Users see no difference from saved Reels.
- Users do not return.
- Users are unwilling to pay.

## Evidence boundary

Signal Filter v3.1 is a frozen, safe baseline for this limited MVP based on two
reference videos. It is not proof of quality across all niches and formats.
Broader filter work requires a benchmark of diverse real videos.
