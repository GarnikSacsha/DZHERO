# DZHERO product context

Last updated: **2026-07-17**

## Product vision

DZHERO is an AI producer for small businesses, creators, SMM specialists, and multi-brand teams. It helps an owner move from real short-form market signals to a brand-specific production decision, a shoot-ready script, and an actionable content plan.

The product chain is:

```text
business brief
-> sources and fresh signals
-> evidence and transferable mechanics
-> brand adaptation
-> production-ready creative
-> human approval
-> content plan
-> leads and performance feedback
```

DZHERO is not positioned as another blank chatbot or technical analytics dashboard. The product should make a grounded recommendation, explain why it fits the brand, and leave the owner with work that can be shot and scheduled.

## Evidence and strategy

A personal social feed can provide inspiration, but it is not the source of truth for brand strategy. DZHERO combines:

- the workspace business brief and Brand Brain;
- target audience, offer, geography, tone, goals, and stop topics;
- saved and automatically discovered signals;
- connected accounts, competitors, keywords, hashtags, and trend lanes;
- allowed public metadata and observed video evidence;
- explicit human objectives and approval.

Metadata, user notes, and observed video evidence must remain distinguishable. If reliable evidence cannot be obtained, the system pauses or fails honestly instead of inventing scenes.

## Markets

Ukraine is the primary adaptation market. Discovery can use broader sources from Ukraine, Europe, the United States, and global English-language niches. Final creative should be localized to the workspace language, audience, and cultural context rather than copied from the source.

## OpenAI Build Week extension

The existing DZHERO product already included Signals, Studio, Brand Brain, Jeryk, Content Plan, authentication, billing, and localization.

The Build Week branch adds Agent Studio Beta:

- a persisted, bounded specialist workflow built with OpenAI Agents SDK and GPT-5.6;
- Gemini video observation and Apify-backed source resolution;
- strict structured contracts and safe public agent activity;
- Creative Producer, independent Critic, and one bounded revision;
- owner-directed Hybrid Producer;
- a connected seven-day plan;
- explicit human approval before Content Plan writes;
- provider usage telemetry;
- fresh-signal discovery with manual and scheduled execution.

## Design direction

- dark-first AI command center with a complete light theme;
- cyan/green accents and restrained status color;
- product language focused on outcomes, not internal infrastructure;
- responsive layouts with no overlapping, clipped, or mixed-language content;
- English and Ukrainian interfaces that remain complete and internally consistent.

## Current delivery state

The Build Week MVP is deployed on Railway with PostgreSQL-backed state. YouTube and TikTok Agent Studio paths have been manually verified. The final phase is UI polish, judge-facing documentation, one signed-out English production rehearsal, video recording, repository access, `/feedback`, and Devpost submission.

## Explicitly out of scope for submission

- autonomous publishing;
- fully autonomous Brand Brain changes;
- a durable distributed job queue;
- cross-device discovery of the latest workspace run; the current browser already restores its remembered run after refresh;
- team approval roles and version comparison;
- closed-loop performance learning.
