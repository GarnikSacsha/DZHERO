# OpenAI Build Week submission draft

## Project title

**DZHERO — From one verified signal to one week of content**

## One-line description

DZHERO is an accountable multi-agent AI producer that turns a real short-form trend or Reel into a grounded, brand-specific production script and a seven-day content plan for small businesses.

## Inspiration

Small business owners rarely suffer from a total lack of AI tools. They suffer from a lack of decisions. A blank chatbot still asks the owner to become the strategist, trend researcher, scriptwriter, critic, and content planner.

We built DZHERO for the owner who sees hundreds of Reels but cannot reliably answer three questions: which mechanic is worth adapting, how should it fit the brand, and what should the team shoot this week?

## What it does

DZHERO Agent Studio offers two entry points:

- **Find a trend for me:** select one suitable signal from DZHERO’s existing signal bank.
- **Adapt a Reel:** start from a specific imported signal, public URL, or a clearly labelled user description.

Both modes enter the same bounded pipeline. A Trend Analyst selects the mechanic, Gemini extracts video evidence, a Brand Strategist maps it to Brand Brain, a Creative Producer writes one complete Reel and two alternatives, a Critic checks quality and grounding, a Content Planner expands the accepted strategy into seven distinct days, and Jeryk presents the final manager review.

The owner can also select any two directions and ask **Hybrid Producer** to synthesize a stronger concept. This is a real additional OpenAI agent pass, not client-side text mixing: the hybrid is checked again by Critic, receives a fresh seven-day plan, and returns to Jeryk for human approval. If the hybrid pass fails, DZHERO restores the original package instead of losing useful work.

The user sees real backend stages, evidence references, and a safe public agent trace. If video evidence is unavailable, DZHERO pauses for context rather than inventing what happened. The final workspace write remains behind explicit human approval.

## How we built it

- React 19 and Vite for the existing DZHERO product surface.
- Express with authenticated, workspace-scoped Agent Studio endpoints.
- OpenAI Agents SDK with `gpt-5.6` for Trend Analyst, Brand Strategist, Creative Producer, Hybrid Producer, Critic, Content Planner, and Jeryk Manager.
- Zod structured outputs between every specialist stage.
- A deterministic server-side state machine with bounded turns, one malformed-output repair, and at most one Critic revision.
- Gemini as a narrow video-evidence specialist, with explicit evidence types for video observation, audio observation, on-screen text, metadata, and user notes.
- Polling of persisted backend run state, not simulated frontend progress.
- Idempotent human approval that adds exactly seven normalized posts to the existing DZHERO Content Plan.

The Agent Studio path is additive and feature-flagged. It does not replace the existing Gemini-powered Studio, Signals, Jeryk assistant, Brand Brain, or Content Plan.

## Why multi-agent here

The roles have different failure modes and deliverables. A trend researcher should not silently approve its own creative claims; a creative writer should not decide whether its unsupported commercial claim is acceptable; a planner should only expand a concept after it passes critique.

Our backend keeps that separation real through strict schemas and permitted state transitions. The agents do not receive database, shell, publishing, or arbitrary network access.

## Responsible AI and safety

- Source captions, pages, metadata, transcripts, video frames, and user notes are treated as untrusted data, never instructions.
- Creative scenes cite evidence ids; product choices cite Brand Brain fields.
- Metadata is never presented as something observed in the video.
- Missing evidence triggers `needs_context`.
- Raw prompts, hidden reasoning, credentials, tokens, and provider payloads are excluded from the public trace.
- Provider, quota, timeout, validation, and quality errors are classified rather than hidden behind generic content.
- No content is written to the workspace before human approval.

## Challenges

The hardest part was not creating more agents. It was preventing the system from becoming an expensive, opaque loop. We had to make every transition bounded, validate every artifact before the next stage, keep evidence provenance intact, and preserve honest behavior when a public video could not be fetched.

We also needed to add the hackathon experience without destabilizing a DZHERO build that was already ready for user testing. Agent Studio therefore lives behind an isolated feature flag, API namespace, persistence model, and UI page.

## Accomplishments

- One real signal becomes one complete Reel, two alternatives, and exactly seven connected content days.
- Two owner-selected directions can become a newly synthesized, re-criticized hybrid package.
- The Critic can visibly catch and correct a meaningful unsupported claim.
- Both entry modes converge on the same auditable workflow.
- A context pause can resume without paying the Trend Analyst twice.
- Approval is idempotent and writes to the product’s existing Content Plan exactly once.
- The live personal OpenAI Build Week project successfully returned a validated structured output through the Agents SDK using `gpt-5.6`.
- Existing auth, workspace isolation, billing, remix, content-plan, and localization paths remain regression-tested.

## What we learned

Multi-agent UX becomes useful when users can see responsibility, evidence, and decision boundaries—not just animated agent names. Structured outputs are not only an implementation convenience; they are the contract that makes critique, recovery, persistence, and human approval dependable.

We also learned that hybrid model architecture is strongest when each model has a narrow accountable role. OpenAI agents own reasoning and production stages; Gemini supplies grounded video evidence; the backend owns policy, state, limits, and writes.

## What is next

- Provider usage and cost telemetry per run.
- Uploaded-video support for sources that cannot be fetched publicly.
- A durable job queue and explicit retry after infrastructure interruption.
- Team approval roles and version comparison.
- Measured post-performance feedback into future trend selection, without rewriting Brand Brain automatically.

## Demo story

A Kyiv coffee shop wants more weekday morning visits. DZHERO adapts a calm-setup/fast-reveal Reel mechanic, grounds the observed beats, maps it to a realistic five-minute morning reset, removes an unsupported “best coffee in Kyiv” claim, produces three creative directions, expands the accepted idea into seven varied days, and adds the package to Content Plan only after the owner approves it.

## Built with

OpenAI Agents SDK, GPT-5.6, Zod, Gemini video analysis, React, Vite, Node.js, Express, and the existing DZHERO workspace/content-plan infrastructure.
