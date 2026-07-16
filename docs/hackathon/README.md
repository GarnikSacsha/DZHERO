# OpenAI Build Week judge package

Last updated: **2026-07-17**

This folder contains the submission-facing documentation for DZHERO Agent Studio.

## Start here

1. [Judge guide](openai-build-week-judge-guide.md) — fastest path to understand and run the project.
2. [Demo script](openai-build-week-demo-script.md) — final sub-three-minute recording plan.
3. [Submission draft](openai-build-week-submission.md) — English Devpost copy.
4. [Verification record](openai-build-week-verification.md) — commands, measured reference run, deployment evidence, and final fields.
5. [Ownership statement](openai-build-week-ownership.md) — entrant, rights, handles, and third-party services.
6. [Submission checklist](openai-build-week-submission-checklist.md) — remaining publishing actions.

## Current delivery state

- Railway deployment: [openaibuildweek.up.railway.app](https://openaibuildweek.up.railway.app)
- Production API health: HTTP 200, `storage: postgres` on 2026-07-17.
- Fresh-signal discovery: deployed; scheduled worker enabled.
- Agent Studio: provider-backed reference flow, Hybrid, approval, and seven-day write verified.
- Public source coverage: owner manually verified YouTube and TikTok on 2026-07-17.
- Pre-polish implementation baseline: `3529d80`.

The final UI/documentation commit must replace the baseline in the verification record after Railway deploys it.

## Official submission requirements

The final operator must recheck the current [Build Week FAQ](https://openai.devpost.com/details/faqs) and [official dates](https://openai.devpost.com/details/dates) on submission day. The currently confirmed requirements are:

- meaningful use of both Codex and GPT-5.6;
- a public repository, or a private repository shared with `testing@devpost.com` and `build-week-event@openai.com`;
- README setup, sample/test instructions, and important Codex-assisted decisions;
- a public YouTube demo no longer than three minutes, with voiceover explaining the product, Codex collaboration, and GPT-5.6 use;
- the `/feedback` Session ID from the primary build task;
- submission by **July 21, 2026 at 5:00 PM Pacific Time**.

## Technical records

- [Implemented design](../superpowers/specs/2026-07-14-dzhero-agent-studio-build-week-design.md)
- [Implementation record](../superpowers/plans/2026-07-14-dzhero-agent-studio-build-week.md)
- [Repository README](../../README.md)
- [License](../../LICENSE)

## Remaining user-owned fields

- final deployed commit hash;
- public repository URL or confirmed private judge access;
- demo account instructions;
- public YouTube video URL;
- Codex `/feedback` Session ID;
- Devpost submission URL and confirmation evidence.
