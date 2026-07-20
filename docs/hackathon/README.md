# OpenAI Build Week judge package

Last updated: **2026-07-20**

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
- Production API health: HTTP 200, `storage: postgres` on 2026-07-20.
- Fresh-signal discovery: deployed; scheduled worker enabled.
- Agent Studio: provider-backed reference flow, Hybrid, approval, and seven-day write verified.
- Public source coverage: owner manually verified YouTube and TikTok on 2026-07-17.
- Pre-polish implementation baseline: `3529d80`.
- Current verified code tip: `a22a955` on `hackathon/openai-build-week`.
- July 20 frontend deployment comparison: exact match after normalizing the Railway API URL and Windows/Linux SVG line endings.

Final UI, English-output, tests, and documentation integration is recorded in `be3ab33`. Later source/evidence fixes culminate in `a22a955`. Use the final committed branch tip as the judge checkout; confirm the exact backend revision in the Railway dashboard before submission.

## Official submission requirements

The final operator must recheck the current [Build Week FAQ](https://openai.devpost.com/details/faqs) and [official dates](https://openai.devpost.com/details/dates) on submission day. The currently confirmed requirements are:

- meaningful use of both Codex and GPT-5.6;
- a public repository, or a private repository shared with `testing@devpost.com` and `build-week-event@openai.com`;
- README setup, sample/test instructions, and important Codex-assisted decisions;
- a public YouTube demo no longer than three minutes, with voiceover explaining the product, Codex collaboration, and GPT-5.6 use;
- the `/feedback` Session ID from the primary build task;
- submission by **July 21, 2026 at 5:00 PM Pacific Time**.

The official pages were rechecked on July 20. The submission deadline is **July 21 at 5:00 PM PDT**, which is **July 22 at 3:00 AM EEST in Kyiv**.

## Technical records

- [Implemented design](../superpowers/specs/2026-07-14-dzhero-agent-studio-build-week-design.md)
- [Implementation record](../superpowers/plans/2026-07-14-dzhero-agent-studio-build-week.md)
- [Repository README](../../README.md)
- [License](../../LICENSE)

## Remaining user-owned fields

- exact Railway backend deployment commit confirmation;
- public repository URL or confirmed private judge access;
- demo account instructions;
- public YouTube video URL;
- Codex `/feedback` Session ID;
- Devpost submission URL and confirmation evidence.
