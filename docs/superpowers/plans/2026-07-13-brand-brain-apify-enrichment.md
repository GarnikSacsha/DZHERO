# Brand Brain Apify Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Brand Brain preview use Apify profile signals and Gemini structured extraction so the saved brief becomes the product's central source of truth.

**Architecture:** Add a focused backend service that converts public metadata plus Apify signal snapshots into a normalized Brand Brain draft. The existing `/api/brand-scan/preview` route enriches Instagram profile URLs with Apify when configured, then asks Gemini for structured fields with a heuristic fallback.

**Tech Stack:** Node.js CommonJS backend services, existing Apify signal provider, Gemini `generateContent`, script-based Node tests.

## Global Constraints

- Do not edit or commit `backend/data/db.json`.
- Keep user-facing Ukrainian copy clean.
- Avoid pretending private Instagram data was read; mark Apify/Gemini confidence and missing fields.
- Keep changes scoped to Brand Brain scan, not the entire Studio/remix pipeline.

---

### Task 1: Brand Brain Extraction Service

**Files:**
- Create: `backend/services/brandBrainExtractor.cjs`
- Create: `scripts/test-brand-brain-extractor.js`

**Interfaces:**
- Produces: `buildBrandBrainEnrichment({ input, metadata, apifySignals, geminiClient }) -> Promise<{ brief, evidence, sourceStatus, confidence, missingFields }>`
- Produces: `buildGeminiBrandBrainPrompt({ input, metadata, apifySignals }) -> string`

- [ ] **Step 1: Write failing service tests**

Run: `node scripts/test-brand-brain-extractor.js`
Expected before implementation: `MODULE_NOT_FOUND` for `brandBrainExtractor.cjs`.

- [ ] **Step 2: Implement service**

The service must summarize Apify captions/stats, accept a mocked Gemini client, parse strict JSON, and fall back to deterministic extraction when Gemini is missing or returns invalid JSON.

- [ ] **Step 3: Run service test**

Run: `node scripts/test-brand-brain-extractor.js`
Expected: `brand brain extractor tests passed`.

### Task 2: Wire Preview Route to Apify and Gemini

**Files:**
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: `fetchApifySignals(options)` from `backend/services/apifySignalProvider.js`
- Consumes: `buildBrandBrainEnrichment(args)` from `backend/services/brandBrainExtractor.cjs`
- Produces response fields: `brandBrainDraft`, `brandBrainEvidence`, `capabilities.brandBrain`

- [ ] **Step 1: Write route integration regression test**

Extend `scripts/test-brand-brain-extractor.js` with a test for `shouldUseApifyForBrandScan(input, metadata)` and response-shape helpers.

- [ ] **Step 2: Implement route wiring**

For Instagram profile sources, call Apify with `platform: 'instagram'`, `inputType: 'profile'`, `limit: 8`, then pass the returned signals into the extractor. Continue gracefully if Apify or Gemini fails.

- [ ] **Step 3: Run route-adjacent tests**

Run: `node scripts/test-brand-brain-extractor.js`.

### Task 3: Frontend Uses Structured Draft

**Files:**
- Modify: `src/main.jsx`

**Interfaces:**
- Consumes: `payload.brandBrainDraft` from `/api/brand-scan/preview`
- Falls back to existing `buildBrandBrainFromScanReel(...)`

- [ ] **Step 1: Add frontend behavior through existing Brand Brain flow**

When `brandBrainDraft` exists, merge it into the form instead of re-deriving from metadata only.

- [ ] **Step 2: Run existing Brand Brain tests**

Run: `node scripts/test-brand-brain.mjs`.

### Task 4: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run targeted tests**

Run:
`node scripts/test-brand-brain-extractor.js`
`node scripts/test-brand-brain.mjs`
`node scripts/test-apify-signal-provider.mjs`

- [ ] **Step 2: Run build**

Run: `npm.cmd run build`
Expected: Vite production build succeeds.
