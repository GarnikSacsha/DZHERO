# Studio Generation Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Studio produce useful source-aware scripts with or without Brand Brain, expose provider failures in server diagnostics, and prevent Jeryk from covering content-plan cards.

**Architecture:** Add a focused quality gate around provider output. Gemini gets one corrective retry when its JSON is incomplete, generic, or copies source text; only then does generation fall back to a deterministic source-aware draft. Provider/model/fallback metadata is logged server-side without secrets. Calendar-specific CSS keeps the closed assistant control compact and aligned to the viewport edge.

**Tech Stack:** Node.js, Express, Gemini REST API, React, CSS, Playwright, Node assertion scripts.

## Global Constraints

- Brand Brain is optional for both demo and authenticated generation.
- Never expose API keys in responses or logs.
- Do not present copied source captions, hashtags, or titles as an adaptation.
- Preserve `backend/data/db.json` as uncommitted runtime data.

---

### Task 1: Generation quality gate and provider retry

**Files:**
- Create: `backend/services/remixQuality.cjs`
- Modify: `backend/services/remixEngine.js`
- Create: `scripts/test-remix-provider-quality.mjs`

**Interfaces:**
- Consumes: Gemini/OpenAI JSON output plus `globalInsight` and normalized business brief.
- Produces: `assessRemixQuality(result, context)` and a validated remix response with non-secret `_generation` metadata.

- [ ] Write a failing test proving copied captions, hashtags, missing scene detail, and generic CTA are rejected.
- [ ] Run `node scripts/test-remix-provider-quality.mjs` and confirm the quality API is missing or fails the assertions.
- [ ] Implement normalization, quality scoring, one provider retry, and fallback metadata.
- [ ] Run the test again and confirm it passes.

### Task 2: Source-aware no-Brand-Brain fallback

**Files:**
- Modify: `backend/services/remixEngine.js`
- Modify: `scripts/test-remix-quality.mjs`

**Interfaces:**
- Consumes: source mechanic, transcript/caption, visual intelligence, and optional Brand Brain.
- Produces: three shootable Ukrainian variants that remain useful in consultant/demo mode.

- [ ] Add a failing case with an empty business brief and the Instagram source shown in the report.
- [ ] Confirm it fails because the result copies source text or lacks concrete scenes.
- [ ] Implement source-mechanic extraction and consultant-mode scenario generation without invented brand facts.
- [ ] Run both remix test scripts and confirm they pass.

### Task 3: Content-plan assistant placement

**Files:**
- Modify: `src/styles.css`
- Modify: `scripts/check-calendar-overflow.js`

**Interfaces:**
- Consumes: `.page-content-plan` presence and the closed `.jeryk-idle-card` control.
- Produces: a compact fixed control inside the right viewport gutter with no intersection against planned-post cards.

- [ ] Extend the Playwright check to fail when Jeryk intersects `.plan-post`/planned-post cards or leaves the viewport.
- [ ] Run `npm run check:calendar-overflow` and confirm the current layout fails.
- [ ] Add calendar-specific compact positioning and spacing.
- [ ] Re-run the Playwright check at desktop and mobile widths.

### Task 4: Full verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes: all changes above.
- Produces: test, syntax, build, and screenshot evidence.

- [ ] Run all remix, Brand Brain, and calendar regression scripts.
- [ ] Run Node syntax checks for changed backend modules.
- [ ] Run `npm.cmd run build`.
- [ ] Inspect a Playwright screenshot of Studio and Content Plan.
