# Working Memory

## Current user assessment

The user considers the core Agent Studio MVP strong: adaptation quality, shot-by-shot production, Hybrid generation, and the seven-day package are all working well. The immediate priority is repository/documentation readiness before deployment.

## Current priorities

1. Keep the repository understandable to judges and future maintainers.
2. Document exactly what existed before Build Week and what was added.
3. Keep the demo honest about source acquisition and provider fallbacks.
4. Finish deployment, judge account, public video, `/feedback`, and Devpost only after the repo package is stable.

## Product decisions

- DZHERO is an AI producer, not a generic dashboard or blank chat.
- Agent Studio is an additive beta inside the existing workspace.
- “Find from my Signals” selects from existing workspace Signals in the MVP.
- “Adapt a Reel” is the primary complete judge story.
- Gemini is the video-evidence specialist; OpenAI agents reason, produce, critique, plan, and manage.
- The first two seconds, concrete scenes, and production notes are mandatory quality elements.
- Two compact alternatives become useful through Hybrid; they are not fake full scripts.
- Only a full hero or Hybrid can be approved.
- Approval must write exactly seven distinct content items once.
- Provider usage should be visible but private payloads must remain hidden.

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
