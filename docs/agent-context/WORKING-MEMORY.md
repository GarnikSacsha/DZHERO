# Working Memory

## Current user assessment

The user considers the core Agent Studio MVP strong: adaptation quality, shot-by-shot production, Hybrid generation, and the seven-day package are all working well. The immediate product priority is a safe public beta from `main`: let trial users adapt a large existing Signals bank, prevent accidental paid discovery spend, keep Agent Studio available for the separate hackathon deployment but locked on the public product, and prevent purchases until billing intentionally launches.

## Current priorities

1. Integrate the tested Build Week code into `main` without committing local runtime data.
2. Configure the production shared-bank workspace and rehearse the public Free Trial flow.
3. Keep the repository understandable to judges and future maintainers.
4. Confirm the final UI/documentation commit in Railway, then finish the public video, `/feedback`, and Devpost.

## Product decisions

- DZHERO is an AI producer, not a generic dashboard or blank chat.
- Agent Studio is an additive beta inside the existing workspace.
- “Find fresh signals” adds new discovery results to Signals; “Choose from my Signals” selects from the existing workspace bank inside Agent Studio.
- “Adapt a Reel” is the primary complete judge story.
- Gemini is the video-evidence specialist; OpenAI agents reason, produce, critique, plan, and manage.
- The first two seconds, concrete scenes, and production notes are mandatory quality elements.
- Two compact alternatives become useful through Hybrid; they are not fake full scripts.
- Only a full hero or Hybrid can be approved.
- Approval must write exactly seven distinct content items once.
- Provider usage should be visible but private payloads must remain hidden.
- Public Free Trial reads shared Signals without copying them and cannot start paid discovery.
- Public pricing is visible but non-purchasable until billing is explicitly enabled.
- Agent Studio is enabled for the Build Week deployment and **Coming soon** on the public product.

## Submission and ownership decisions

- Entrant: Denis Efimenko.
- GitHub usernames and no-reply emails are technical handles and need not match a legal name.
- Use a direct ownership/authorization statement instead of speculative identity matching.
- Keep the repository source-available for evaluation and judging; do not accidentally grant an MIT-style unrestricted license.

## Verified reference run

- Run: `agent_run_mrn6q619_dtjfy1`
- Completed and approved Hybrid.
- Seven Content Plan items written.
- Quality scores: 85–93.
- Usage: 11 OpenAI, 1 Gemini, 1 Apify call.
- Estimated provider cost: approximately USD 0.492015.

## Git hygiene

`backend/data/db.json` often changes during local runs and must not be staged unless explicitly requested.

## 2026-07-20 operational state

- Production health: HTTP 200 with `storage: postgres`, rechecked July 20.
- Fresh-signal discovery is deployed and the Railway worker is enabled.
- YouTube and TikTok Agent Studio source flows were manually verified.
- Baseline commit before final UI/docs: `3529d80`; current verified code tip: `a22a955`.
- The final submission commit, repository access, demo video, `/feedback` ID, and Devpost URL remain user-owned completion fields.
- All nine deterministic Agent Studio suites and the production build passed on July 20 without external provider calls.
- The deployed frontend matched the branch-tip build after normalizing the production API URL and Windows/Linux SVG line endings.

## 2026-07-24 Free Trial AI behavior on `main`

- Free Trial remains three days. Each Kyiv calendar day allows 5 successful Studio adaptations and 100 successful Jeryk replies; the reset is at 00:00 `Europe/Kyiv`.
- Failed provider calls and internal retries do not consume the 5/100 product outcomes. Provider attempts have a separate 250/day safety ceiling.
- Brand Brain does not consume Studio or Jeryk quotas. Its required answers remain exact user input when AI is unavailable.
- Studio and Jeryk use real Gemini output only. Missing or failed provider calls return typed errors; any local structure is explicitly labelled as a non-AI draft.
- Owner and tester access remain unlimited. Finite daily counters are visible in Studio and Jeryk; unlimited accounts do not show numeric caps.
- Canonical focused verification: `npm.cmd run test:free-trial-ai`.
