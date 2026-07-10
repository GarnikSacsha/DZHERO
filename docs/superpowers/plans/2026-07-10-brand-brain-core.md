# Brand Brain Core MMVP

## Goal

Make Brand Brain the persistent brand memory for each workspace. Dzhero should use it for chat, remix/adaptation, scripts, and future signal filtering. If Brand Brain is empty, Dzhero can still act as a general consultant, but must not pretend that default demo values are real brand facts.

## Scope

1. Add one backend Brand Brain context helper.
2. Normalize workspace `brief` into a readiness-aware context.
3. Wire the context into Dzhero assistant prompts and fallback replies.
4. Wire the context into Remix Studio prompts and fallback generation.
5. Return `brandBrain` metadata from `/agent/context` so the UI can later show readiness.
6. Add a focused regression test for ready vs empty Brand Brain behavior.

## Rules

- Brand Brain belongs to a workspace, not to a browser session.
- Logout/login must not clear it.
- Workspace switching changes the active Brand Brain.
- Empty Brand Brain means consultant mode.
- Ready Brand Brain means brand mode: generated scripts and answers must prioritize the stored product, audience, offer, tone, CTA, location, and stop topics.

## Out Of Scope For This Patch

- New UI for multi-brand creation.
- Instagram account analysis.
- Plan-specific paid Apify quota rules.
- Full signal ranking by Brand Brain category.
