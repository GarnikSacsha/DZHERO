# OpenAI Build Week submission draft

## Project title

**DZHERO — From one grounded signal to one week of content**

## One-line description

DZHERO is an accountable multi-agent AI producer that turns a real short-form signal into a brand-specific, shoot-ready Reel and a seven-day content plan for small businesses.

## Track

**Work and Productivity**

## Inspiration

Small business owners do not lack AI tools; they lack confident decisions. A blank chatbot still asks the owner to become the trend researcher, strategist, scriptwriter, critic, and planner.

DZHERO starts where the owner actually gets stuck: deciding which content mechanic is worth adapting, how it should fit the brand, and what can realistically be shot this week.

## What it does

Agent Studio has two entry modes:

- **Find from my Signals** selects a relevant item from the current workspace’s existing Signals.
- **Adapt a Reel** starts from a saved signal or a supported public video URL.

Both enter the same bounded workflow. Trend Analyst selects the transferable mechanic. Gemini Video Analyst extracts grounded evidence. Brand Strategist maps the mechanic to Brand Brain. Creative Producer creates a complete Reel and two distinct directions. Critic evaluates grounding and production quality with at most one revision. Content Planner turns the accepted strategy into seven distinct days. Jeryk Manager presents the package for explicit human approval.

The owner can select two directions and run **Hybrid Producer**. This is a real additional OpenAI pass, not client-side text mixing. The resulting full script is evaluated again, receives a new seven-day plan, and returns to Jeryk.

Compact alternatives cannot be approved as if they were finished production scripts. The owner must approve a full hero or Hybrid package. Approval idempotently adds exactly seven normalized items to the existing DZHERO Content Plan.

## Grounding and honest failure

- YouTube can be analyzed from its native public URL.
- Instagram and TikTok media use a narrow source-resolution layer before temporary Gemini Files analysis.
- Evidence distinguishes video observations, audio observations, on-screen text, metadata, and user notes.
- Temporary Gemini files are deleted after analysis.
- If reliable evidence is missing, the run enters `needs_context` or reports a classified source error instead of inventing scenes.
- The primary Build Week UI is URL-first. Authenticated backend source-file recovery exists for controlled recovery and tests, but is not presented as the main judge flow.

## Production quality

The producer is required to deliver:

- a pattern interrupt in the first two seconds;
- a clear hook, tension, development, proof, and CTA;
- at least three concrete, shootable scenes;
- evidence and Brand Brain references;
- practical production notes;
- language and claims that survive Critic review.

Critic issues use stable requirement identifiers so a revision cannot silently drop unresolved problems. Final issues are classified as unresolved requirements, newly discovered critical issues, or non-blocking suggestions.

## How we built it

- React 19 and Vite for the DZHERO product surface.
- Express with authenticated, workspace-scoped Agent Studio APIs.
- OpenAI Agents SDK and GPT-5.6 for reasoning, creative production, critique, planning, Hybrid production, and manager review.
- Zod structured-output contracts between specialist stages.
- Gemini video understanding as a dedicated evidence tool.
- Apify-backed public social source resolution where required.
- A persisted, bounded server-side state machine with explicit terminal states.
- A safe public trace that excludes prompts, chain-of-thought, tokens, credentials, and raw provider payloads.
- Idempotent approval into the existing Content Plan.
- Deduplicated per-run provider usage and estimated cost telemetry for OpenAI, Gemini, and Apify.

## Why multi-agent

The roles have different failure modes. A creative writer should not approve its own unsupported commercial claim, and a planner should not expand an idea that has not passed critique. Separate schemas and state transitions make those responsibilities enforceable rather than decorative.

Agents have no direct shell, database, publishing, or arbitrary network access. The backend owns tools, limits, persistence, policy, and workspace writes.

## What was built during Build Week

DZHERO existed before the event with Signals, Gemini Studio, Brand Brain, Jeryk, Content Plan, authentication, billing, and localization.

The Build Week extension adds:

- the isolated Agent Studio Beta surface;
- OpenAI multi-agent orchestration and structured contracts;
- grounded video-evidence handoff;
- the quality playbook and bounded Critic revision;
- Hybrid Producer;
- explicit approval rules and seven-item Content Plan handoff;
- safe agent activity trace;
- provider usage telemetry;
- focused contract, orchestration, UI, source, usage, and API verification.

## Codex collaboration

Codex was used to inspect the existing architecture, implement and review the isolated workflow, run focused verification, diagnose provider and approval failures, strengthen quality contracts, and prepare the repository and judge documentation.

The human owner made the product decisions: target user, coffee-shop demo story, visual direction, role boundaries, acceptable quality, approval policy, business positioning, and final submission choices.

## Accomplishments

- A real provider-backed run completed the full workflow, Hybrid pass, approval, and seven-day write.
- The accepted run scored 85 or higher across all recorded quality dimensions.
- Provider telemetry captured 11 OpenAI calls, 1 Gemini call, and 1 Apify call without exposing sensitive payloads.
- Hybrid failure is recoverable without losing the original useful package.
- Existing DZHERO surfaces remain separate from the feature-flagged beta.

## Challenges and lessons

The difficult part was not adding more agents. It was keeping the workflow bounded, evidence-aware, recoverable, and honest about source access. Structured outputs became the product contract that makes critique, revision, persistence, approval, and observability dependable.

We also learned that the strongest hybrid-model architecture gives each provider one accountable role: OpenAI agents reason and produce, Gemini observes video, source providers resolve public media, and the backend enforces policy.

## What is next

- Automatically restore the latest run after a full page refresh.
- Move long-running work to a durable queue.
- Add team approval roles and version comparison.
- Use post-performance feedback to improve future signal selection.
- Tune model routing after collecting more real per-agent telemetry.

The Signals workspace now includes a separately labelled **Find fresh signals** action and a scheduled discovery path. Both use a budget-bounded mix of accounts, keywords, hashtags, and trend searches across Instagram and TikTok.

## Demo story

A Kyiv coffee shop wants more weekday morning visits. DZHERO adapts a real short-form mechanic into a low-budget morning-reset story, grounds it in observed evidence, produces three creative directions, combines two through Hybrid Producer, expands the result into a varied seven-day plan, and writes it to Content Plan only after the owner approves.

## Built with

OpenAI Agents SDK, GPT-5.6, Codex, Zod, Gemini video analysis, Apify, React, Vite, Node.js, Express, and the existing DZHERO workspace infrastructure.
