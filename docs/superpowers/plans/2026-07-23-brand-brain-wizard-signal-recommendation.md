# Brand Brain Wizard and Best-Signal Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six-field Brand Brain form with a resumable four-step user-authored wizard and automatically open one real, brand-relevant signal selected by a Gemini-plus-deterministic hybrid.

**Architecture:** A versioned Brand Brain contract separates authored answers, incomplete drafts, AI-derived context, and saved recommendations. A focused backend recommendation service scores every accessible signal deterministically and lets Gemini rerank a bounded shortlist, while a dedicated finalize endpoint validates, derives, recommends, persists, and returns one canonical result. The React root continues to own onboarding gating; a new wizard component owns step UX, while Settings keeps a compact locked card/edit surface.

**Tech Stack:** React 19, Vite 8, Node.js, Express 5, Gemini JSON generation, Playwright, Node `assert`, JSON-document persistence for local and PostgreSQL storage.

## Global Constraints

- Work only on the current `main` branch; never touch `hackathon/openai-build-week`.
- Do not edit, stage, or commit `backend/data/db.json`.
- Authentication is not a wizard step.
- The wizard has exactly four steps: profile/product, audience, niche/market, optional Instagram.
- Required authored answers are exactly `profileDescription`, `audience`, `niche`, and `market`.
- `instagramUrl` is optional and Step 4 always provides Skip.
- Users never author `offer`, `cta`, or `toneOfVoice`.
- AI-derived fields never overwrite authored answers.
- Draft state never unlocks navigation.
- First completion opens one real accessible signal.
- Gemini failure or invalid output falls back to the top deterministic signal.
- Brand Brain has no permanent primary-sidebar entry and remains available only in `Settings -> My Brands` after onboarding.
- Existing complete legacy briefs remain readable and do not force users back through onboarding.
- All authenticated routes remain workspace-scoped.
- Existing public-beta shared-bank and paid-discovery restrictions remain unchanged.
- Use `apply_patch` for source and test edits.
- Every task follows RED -> GREEN -> task review -> commit.

## File structure

- `backend/services/brandBrainV2.cjs`
  - Owns Version 2 normalization, completion, draft, compatibility projection, and answer fingerprinting.
- `backend/services/brandSignalRecommender.cjs`
  - Owns deterministic scoring, stable shortlist generation, Gemini rerank validation, and fallback selection.
- `backend/services/brandBrainFinalizer.cjs`
  - Orchestrates optional Instagram context, safe derived context, recommendation, and canonical Version 2 output through injected dependencies.
- `src/brandBrainWizardState.mjs`
  - Owns browser-side wizard steps, normalization, validation, and draft progress.
- `src/components/BrandBrainWizard.jsx`
  - Owns the four-step first-login UI and draft/finalize requests.
- `src/myBrandsState.mjs`
  - Keeps root completion and Settings compatibility helpers.
- `src/main.jsx`
  - Owns root gating, workspace races, recommendation handoff, Signals preview opening, Settings wiring, and legacy Brand Scan routing.
- `src/styles.css`
  - Owns wizard, locked-card, recommendation, responsive, and focus styles.
- `backend/server.js`
  - Exposes draft/finalize/context routes and accessible-signal resolution.

---

### Task 1: Define the Version 2 authored-answer and draft contract

**Files:**
- Create: `backend/services/brandBrainV2.cjs`
- Create: `src/brandBrainWizardState.mjs`
- Modify: `backend/services/brandBrainPersistence.cjs`
- Modify: `src/myBrandsState.mjs`
- Create: `scripts/test-brand-brain-v2-contract.js`
- Modify: `scripts/test-my-brands-ui.mjs`

**Interfaces:**
- Produces backend:
  - `BRAND_BRAIN_SCHEMA_VERSION: 2`
  - `REQUIRED_BRAND_ANSWER_FIELDS: readonly string[]`
  - `normalizeBrandAnswers(value): BrandAnswers`
  - `getMissingBrandAnswers(value): string[]`
  - `isBrandBrainV2Complete(value): boolean`
  - `normalizeBrandBrainDraft(value): BrandBrainDraft`
  - `projectBrandBrainCompatibility(brief): object`
  - `isBrandContextComplete(brief): boolean`
  - `buildBrandAnswerFingerprint(answers): string`
- Produces frontend:
  - `BRAND_BRAIN_WIZARD_STEPS`
  - `normalizeWizardAnswers(value)`
  - `getMissingWizardAnswers(value)`
  - `validateWizardStep(step, answers)`
  - `normalizeWizardDraft(value)`
- Updates frontend `isBrandProfileComplete(brief)` to recognize Version 2 and grandfather complete Version 1 briefs.

- [ ] **Step 1: Add failing backend contract tests**

Create `scripts/test-brand-brain-v2-contract.js`:

```js
const assert = require('node:assert/strict');
const {
  BRAND_BRAIN_SCHEMA_VERSION,
  REQUIRED_BRAND_ANSWER_FIELDS,
  normalizeBrandAnswers,
  getMissingBrandAnswers,
  isBrandBrainV2Complete,
  normalizeBrandBrainDraft,
  projectBrandBrainCompatibility,
  isBrandContextComplete,
  buildBrandAnswerFingerprint,
} = require('../backend/services/brandBrainV2.cjs');

assert.equal(BRAND_BRAIN_SCHEMA_VERSION, 2);
assert.deepEqual(REQUIRED_BRAND_ANSWER_FIELDS, [
  'profileDescription',
  'audience',
  'niche',
  'market',
]);

const answers = normalizeBrandAnswers({
  profileDescription: '  Coffee and breakfast for busy mornings  ',
  audience: 'Kyiv commuters',
  niche: 'Coffee shop',
  market: 'Kyiv, Ukraine',
  instagramUrl: 'https://instagram.com/northstar',
});
assert.equal(answers.profileDescription, 'Coffee and breakfast for busy mornings');
assert.equal(answers.instagramUrl, 'https://instagram.com/northstar');
assert.deepEqual(getMissingBrandAnswers(answers), []);
assert.equal(isBrandBrainV2Complete({ schemaVersion: 2, answers }), true);
assert.equal(isBrandBrainV2Complete({
  schemaVersion: 2,
  answers: { ...answers, market: '' },
}), false);

const draft = normalizeBrandBrainDraft({
  currentStep: 9,
  answers: { profileDescription: 'Coffee', instagramUrl: 'not-a-url' },
});
assert.equal(draft.currentStep, 4);
assert.equal(draft.answers.instagramUrl, '');
assert.equal(isBrandContextComplete({ brandBrainDraft: draft }), false);

const legacy = {
  businessType: 'Coffee shop',
  product: 'Coffee and breakfast',
  audience: 'Kyiv commuters',
  offer: 'Breakfast set',
  cta: 'Visit before work',
  toneOfVoice: 'Warm',
  location: 'Kyiv',
};
assert.equal(isBrandContextComplete(legacy), true);

const projected = projectBrandBrainCompatibility({
  schemaVersion: 2,
  answers,
  derivedBrief: {
    offer: 'A clear breakfast option',
    cta: 'Visit this morning',
    toneOfVoice: 'Warm and concise',
  },
});
assert.equal(projected.product, answers.profileDescription);
assert.equal(projected.businessType, answers.niche);
assert.equal(projected.location, answers.market);
assert.equal(projected.offer, 'A clear breakfast option');

assert.equal(
  buildBrandAnswerFingerprint(answers),
  buildBrandAnswerFingerprint({ ...answers }),
);
assert.notEqual(
  buildBrandAnswerFingerprint(answers),
  buildBrandAnswerFingerprint({ ...answers, market: 'Lviv, Ukraine' }),
);

console.log('Brand Brain V2 contract tests passed');
```

- [ ] **Step 2: Run the backend contract test and verify RED**

Run:

```powershell
node scripts/test-brand-brain-v2-contract.js
```

Expected: FAIL with `Cannot find module '../backend/services/brandBrainV2.cjs'`.

- [ ] **Step 3: Implement the backend Version 2 contract**

Create `backend/services/brandBrainV2.cjs` with these exact public boundaries:

```js
const { createHash } = require('node:crypto');

const BRAND_BRAIN_SCHEMA_VERSION = 2;
const REQUIRED_BRAND_ANSWER_FIELDS = Object.freeze([
  'profileDescription',
  'audience',
  'niche',
  'market',
]);

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeInstagramUrl(value) {
  const candidate = compactText(value);
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeBrandAnswers(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    profileDescription: compactText(source.profileDescription),
    audience: compactText(source.audience),
    niche: compactText(source.niche),
    market: compactText(source.market),
    instagramUrl: normalizeInstagramUrl(source.instagramUrl),
  };
}

function getMissingBrandAnswers(value = {}) {
  const answers = normalizeBrandAnswers(value.answers || value);
  return REQUIRED_BRAND_ANSWER_FIELDS.filter((field) => !answers[field]);
}

function isBrandBrainV2Complete(value = {}) {
  return Number(value.schemaVersion) === BRAND_BRAIN_SCHEMA_VERSION
    && getMissingBrandAnswers(value.answers).length === 0;
}

function normalizeBrandBrainDraft(value = {}) {
  return {
    currentStep: Math.min(4, Math.max(1, Number(value.currentStep) || 1)),
    answers: normalizeBrandAnswers(value.answers),
    updatedAt: compactText(value.updatedAt),
  };
}

function isLegacyBrandComplete(brief = {}) {
  return ['businessType', 'product', 'audience', 'offer', 'cta', 'toneOfVoice']
    .every((field) => compactText(brief[field]));
}

function isBrandContextComplete(brief = {}) {
  return isBrandBrainV2Complete(brief) || isLegacyBrandComplete(brief);
}

function projectBrandBrainCompatibility(brief = {}) {
  if (!isBrandBrainV2Complete(brief)) return { ...brief };
  const answers = normalizeBrandAnswers(brief.answers);
  const derived = brief.derivedBrief && typeof brief.derivedBrief === 'object'
    ? brief.derivedBrief
    : {};
  return {
    ...brief,
    product: answers.profileDescription,
    audience: answers.audience,
    businessType: answers.niche,
    niche: answers.niche,
    location: answers.market,
    market: answers.market,
    offer: compactText(derived.offer),
    cta: compactText(derived.cta),
    toneOfVoice: compactText(derived.toneOfVoice),
    sourceLinks: answers.instagramUrl ? [answers.instagramUrl] : [],
  };
}

function buildBrandAnswerFingerprint(value = {}) {
  const answers = normalizeBrandAnswers(value);
  return createHash('sha256').update(JSON.stringify(answers)).digest('hex');
}

module.exports = {
  BRAND_BRAIN_SCHEMA_VERSION,
  REQUIRED_BRAND_ANSWER_FIELDS,
  normalizeBrandAnswers,
  getMissingBrandAnswers,
  isBrandBrainV2Complete,
  normalizeBrandBrainDraft,
  projectBrandBrainCompatibility,
  isBrandContextComplete,
  buildBrandAnswerFingerprint,
};
```

- [ ] **Step 4: Teach persistence helpers about Version 2 without weakening Version 1**

Modify `backend/services/brandBrainPersistence.cjs`:

```js
const {
  REQUIRED_BRAND_ANSWER_FIELDS,
  getMissingBrandAnswers,
  isBrandBrainV2Complete,
} = require('./brandBrainV2.cjs');

const BRAND_BRAIN_FIELDS = [
  'schemaVersion',
  'answers',
  'derivedBrief',
  'recommendation',
  'businessType',
  'niche',
  'product',
  'audience',
  'location',
  'toneOfVoice',
  'offer',
  'cta',
  'proof',
  'contentFocus',
  'contentPillars',
  'contentRubrics',
  'keywords',
  'goals',
  'stopTopics',
  'brandName',
  'sourceProfileUrl',
  'rawBrandInput',
];

const LEGACY_REQUIRED_BRAND_FIELDS = [
  'businessType',
  'product',
  'audience',
  'offer',
  'cta',
  'toneOfVoice',
];

function getMissingRequiredBrandFields(brief = {}) {
  if (Number(brief.schemaVersion) === 2) {
    return getMissingBrandAnswers(brief.answers);
  }
  return LEGACY_REQUIRED_BRAND_FIELDS
    .filter((field) => !String(brief[field] || '').trim());
}
```

Export `REQUIRED_BRAND_FIELDS: LEGACY_REQUIRED_BRAND_FIELDS` for existing callers and tests, plus `REQUIRED_BRAND_ANSWER_FIELDS` and `isBrandBrainV2Complete` for new routes.

- [ ] **Step 5: Add the browser-side wizard state contract**

Create `src/brandBrainWizardState.mjs`:

```js
export const REQUIRED_BRAND_ANSWER_FIELDS = Object.freeze([
  'profileDescription',
  'audience',
  'niche',
  'market',
]);

export const BRAND_BRAIN_WIZARD_STEPS = Object.freeze([
  { id: 1, fields: ['profileDescription'] },
  { id: 2, fields: ['audience'] },
  { id: 3, fields: ['niche', 'market'] },
  { id: 4, fields: ['instagramUrl'] },
]);

function compactText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeInstagramUrl(value) {
  const candidate = compactText(value);
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

export function normalizeWizardAnswers(value = {}) {
  return {
    profileDescription: compactText(value.profileDescription),
    audience: compactText(value.audience),
    niche: compactText(value.niche),
    market: compactText(value.market),
    instagramUrl: normalizeInstagramUrl(value.instagramUrl),
  };
}

export function getMissingWizardAnswers(value = {}) {
  const answers = normalizeWizardAnswers(value);
  return REQUIRED_BRAND_ANSWER_FIELDS.filter((field) => !answers[field]);
}

export function validateWizardStep(step, value = {}) {
  const answers = normalizeWizardAnswers(value);
  if (step === 4) {
    const rawInstagram = compactText(value.instagramUrl);
    return rawInstagram && !answers.instagramUrl ? ['instagramUrl'] : [];
  }
  const definition = BRAND_BRAIN_WIZARD_STEPS.find((item) => item.id === step);
  return (definition?.fields || []).filter((field) => !answers[field]);
}

export function normalizeWizardDraft(value = {}) {
  return {
    currentStep: Math.min(4, Math.max(1, Number(value.currentStep) || 1)),
    answers: normalizeWizardAnswers(value.answers || value),
    updatedAt: compactText(value.updatedAt),
  };
}
```

- [ ] **Step 6: Update root completion helpers without breaking legacy briefs**

Modify `src/myBrandsState.mjs`:

```js
import {
  getMissingWizardAnswers,
  normalizeWizardAnswers,
} from './brandBrainWizardState.mjs';

export const REQUIRED_BRAND_FIELDS = Object.freeze([
  'profileDescription',
  'audience',
  'niche',
  'market',
]);

function isLegacyBrandProfileComplete(brief = {}) {
  return ['businessType', 'product', 'audience', 'offer', 'cta', 'toneOfVoice']
    .every((field) => compactText(brief[field]));
}

export function getMissingRequiredBrandFields(brief) {
  const source = brief && typeof brief === 'object' ? brief : {};
  if (Number(source.schemaVersion) === 2) {
    return getMissingWizardAnswers(source.answers);
  }
  return isLegacyBrandProfileComplete(source) ? [] : REQUIRED_BRAND_FIELDS;
}

export function isBrandProfileComplete(brief) {
  return getMissingRequiredBrandFields(brief).length === 0;
}

export function normalizeEditableBrandBrief(brief) {
  const source = brief && typeof brief === 'object' ? brief : {};
  if (Number(source.schemaVersion) === 2) {
    return {
      ...source,
      schemaVersion: 2,
      answers: normalizeWizardAnswers(source.answers),
    };
  }
  return normalizeLegacyEditableBrandBrief(source);
}

function normalizeLegacyEditableBrandBrief(source = {}) {
  const normalized = { ...source };
  for (const field of EDITABLE_TEXT_FIELDS) {
    normalized[field] = compactText(source[field]);
  }
  normalized.sourceLinks = normalizeSourceLinks(source.sourceLinks);
  normalized.stopTopics = compactList(source.stopTopics).join(', ');
  return normalized;
}
```

- [ ] **Step 7: Add frontend state assertions and verify GREEN**

Add to the pure-state section of `scripts/test-my-brands-ui.mjs`:

```js
import {
  BRAND_BRAIN_WIZARD_STEPS,
  getMissingWizardAnswers,
  normalizeWizardDraft,
  validateWizardStep,
} from '../src/brandBrainWizardState.mjs';

assert.equal(BRAND_BRAIN_WIZARD_STEPS.length, 4);
assert.deepEqual(
  getMissingWizardAnswers({
    profileDescription: 'Coffee',
    audience: 'Commuters',
    niche: 'Coffee shop',
    market: 'Kyiv',
  }),
  [],
);
assert.deepEqual(validateWizardStep(4, { instagramUrl: '' }), []);
assert.deepEqual(validateWizardStep(4, { instagramUrl: 'not-a-url' }), ['instagramUrl']);
assert.equal(normalizeWizardDraft({ currentStep: 7 }).currentStep, 4);
```

Run:

```powershell
node scripts/test-brand-brain-v2-contract.js
$env:MY_BRANDS_STATE_ONLY='1'; node scripts/test-my-brands-ui.mjs
```

Expected: both PASS.

- [ ] **Step 8: Commit the Version 2 contract**

```powershell
git add -- backend/services/brandBrainV2.cjs backend/services/brandBrainPersistence.cjs src/brandBrainWizardState.mjs src/myBrandsState.mjs scripts/test-brand-brain-v2-contract.js scripts/test-my-brands-ui.mjs
git commit -m "feat: define Brand Brain wizard contract"
```

---

### Task 2: Build the deterministic-plus-Gemini signal recommender

**Files:**
- Create: `backend/services/brandSignalRecommender.cjs`
- Create: `scripts/test-brand-signal-recommender.js`

**Interfaces:**
- Consumes:
  - normalized Version 2 `answers`
  - `derivedBrief`
  - accessible signal objects
  - optional `geminiClient(prompt): Promise<string | object>`
- Produces:
  - `normalizeSignalCandidate(signal): SignalCandidate`
  - `rankSignalsForBrand({ answers, derivedBrief, signals, limit }): RankedSignal[]`
  - `selectBestSignalForBrand({ answers, derivedBrief, signals, geminiClient, now }): Promise<Recommendation | null>`

- [ ] **Step 1: Write failing deterministic and Gemini fallback tests**

Create `scripts/test-brand-signal-recommender.js` with fixtures:

```js
const assert = require('node:assert/strict');
const {
  rankSignalsForBrand,
  selectBestSignalForBrand,
} = require('../backend/services/brandSignalRecommender.cjs');

const answers = {
  profileDescription: 'Specialty coffee and fast breakfasts',
  audience: 'Busy Kyiv commuters',
  niche: 'Coffee shop',
  market: 'Kyiv, Ukraine',
  instagramUrl: '',
};

const signals = [
  {
    id: 'reel-fashion',
    workspaceId: 'shared',
    title: 'Three summer dress combinations',
    caption: 'Fashion styling',
    market: 'ua',
    score: 96,
    status: ['fashion', 'outfits'],
  },
  {
    id: 'reel-coffee',
    workspaceId: 'shared',
    title: 'Breakfast coffee before the commute',
    caption: 'A quick Kyiv morning ritual',
    market: 'ua',
    score: 88,
    status: ['coffee', 'breakfast', 'local business'],
  },
  {
    id: 'reel-gym',
    workspaceId: 'shared',
    title: 'Gym routine',
    caption: 'Fitness training',
    market: 'global',
    score: 92,
    status: ['fitness'],
  },
];

const ranked = rankSignalsForBrand({ answers, signals, limit: 3 });
assert.equal(ranked[0].signal.id, 'reel-coffee');

const geminiChoice = await selectBestSignalForBrand({
  answers,
  signals,
  geminiClient: async () => JSON.stringify({
    signalId: 'reel-coffee',
    reason: 'Matches breakfast, coffee, commuters, and Kyiv.',
  }),
  now: () => new Date('2026-07-23T12:00:00.000Z'),
});
assert.equal(geminiChoice.signalId, 'reel-coffee');
assert.equal(geminiChoice.selectionMode, 'gemini');

const invalidChoice = await selectBestSignalForBrand({
  answers,
  signals,
  geminiClient: async () => JSON.stringify({
    signalId: 'not-accessible',
    reason: 'Invalid',
  }),
  now: () => new Date('2026-07-23T12:00:00.000Z'),
});
assert.equal(invalidChoice.signalId, 'reel-coffee');
assert.equal(invalidChoice.selectionMode, 'deterministic');

const failedChoice = await selectBestSignalForBrand({
  answers,
  signals,
  geminiClient: async () => { throw new Error('provider_down'); },
  now: () => new Date('2026-07-23T12:00:00.000Z'),
});
assert.equal(failedChoice.signalId, 'reel-coffee');
assert.equal(failedChoice.selectionMode, 'deterministic');

assert.equal(await selectBestSignalForBrand({ answers, signals: [] }), null);

console.log('Brand signal recommender tests passed');
```

- [ ] **Step 2: Run the recommender test and verify RED**

Run:

```powershell
node scripts/test-brand-signal-recommender.js
```

Expected: FAIL because `brandSignalRecommender.cjs` does not exist.

- [ ] **Step 3: Implement stable deterministic ranking**

Create `backend/services/brandSignalRecommender.cjs` with:

```js
const DEFAULT_SHORTLIST_LIMIT = 24;

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  return [...new Set(
    compactText(value)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 3),
  )];
}

function normalizeSignalCandidate(signal = {}) {
  return {
    id: compactText(signal.id),
    title: compactText(signal.title),
    caption: compactText(signal.caption),
    market: compactText(signal.market),
    platform: compactText(signal.platform || signal.source),
    tags: Array.isArray(signal.status)
      ? signal.status.map(compactText).filter(Boolean)
      : [],
    qualityScore: Number.isFinite(Number(signal.score)) ? Number(signal.score) : 0,
  };
}

function scoreTokenOverlap(queryTokens, candidateText) {
  const haystack = new Set(tokenize(candidateText));
  return queryTokens.reduce((score, token) => score + (haystack.has(token) ? 1 : 0), 0);
}

function rankSignalsForBrand({
  answers = {},
  derivedBrief = {},
  signals = [],
  limit = DEFAULT_SHORTLIST_LIMIT,
} = {}) {
  const queryTokens = tokenize([
    answers.profileDescription,
    answers.audience,
    answers.niche,
    answers.market,
    derivedBrief.summary,
  ].filter(Boolean).join(' '));

  return signals
    .map((signal) => {
      const candidate = normalizeSignalCandidate(signal);
      const searchable = [
        candidate.title,
        candidate.caption,
        candidate.market,
        candidate.platform,
        candidate.tags.join(' '),
      ].join(' ');
      const semanticScore = scoreTokenOverlap(queryTokens, searchable) * 12;
      const marketScore = answers.market
        && tokenize(answers.market).some((token) => tokenize(candidate.market).includes(token))
        ? 18
        : 0;
      const qualityScore = Math.max(0, Math.min(100, candidate.qualityScore)) * 0.18;
      return {
        signal,
        candidate,
        deterministicScore: semanticScore + marketScore + qualityScore,
      };
    })
    .filter((entry) => entry.candidate.id)
    .sort((left, right) => (
      right.deterministicScore - left.deterministicScore
      || left.candidate.id.localeCompare(right.candidate.id)
    ))
    .slice(0, Math.max(1, Number(limit) || DEFAULT_SHORTLIST_LIMIT));
}
```

- [ ] **Step 4: Implement bounded Gemini reranking and validation**

Add:

```js
function parseGeminiChoice(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return {};
  }
}

async function selectBestSignalForBrand({
  answers = {},
  derivedBrief = {},
  signals = [],
  geminiClient = null,
  now = () => new Date(),
} = {}) {
  const shortlist = rankSignalsForBrand({ answers, derivedBrief, signals });
  if (!shortlist.length) return null;

  const fallback = {
    signalId: shortlist[0].candidate.id,
    reason: 'Best deterministic match for the saved Brand Brain.',
    selectionMode: 'deterministic',
    createdAt: now().toISOString(),
  };
  if (typeof geminiClient !== 'function') return fallback;

  const prompt = JSON.stringify({
    task: 'Choose exactly one existing signal ID that best matches the brand.',
    brand: { answers, derivedBrief },
    candidates: shortlist.map(({ candidate, deterministicScore }) => ({
      ...candidate,
      deterministicScore,
    })),
    responseSchema: { signalId: 'string', reason: 'string' },
  });

  try {
    const parsed = parseGeminiChoice(await geminiClient(prompt));
    const selected = shortlist.find(({ candidate }) => candidate.id === compactText(parsed.signalId));
    if (!selected) return fallback;
    return {
      signalId: selected.candidate.id,
      reason: compactText(parsed.reason) || fallback.reason,
      selectionMode: 'gemini',
      createdAt: now().toISOString(),
    };
  } catch {
    return fallback;
  }
}

module.exports = {
  normalizeSignalCandidate,
  rankSignalsForBrand,
  selectBestSignalForBrand,
};
```

- [ ] **Step 5: Run recommender tests and commit**

Run:

```powershell
node scripts/test-brand-signal-recommender.js
```

Expected: PASS.

Commit:

```powershell
git add -- backend/services/brandSignalRecommender.cjs scripts/test-brand-signal-recommender.js
git commit -m "feat: rank one signal for Brand Brain"
```

---

### Task 3: Add draft and atomic finalize API boundaries

**Files:**
- Create: `backend/services/brandBrainFinalizer.cjs`
- Modify: `backend/services/brandBrainExtractor.cjs`
- Modify: `backend/services/brandBrainPersistence.cjs`
- Modify: `backend/server.js`
- Create: `scripts/test-brand-brain-wizard-api.mjs`
- Modify: `scripts/test-brand-brain-extractor.js`
- Modify: `scripts/test-brand-brain-persistence.js`
- Modify: `scripts/test-public-beta-guards.cjs`

**Interfaces:**
- Consumes:
  - Task 1 Version 2 contract
  - Task 2 `selectBestSignalForBrand`
  - injected `fetchInstagramMetadata`, `deriveClient`, and `rerankClient`
- Produces:
  - `buildDerivedBrandBrainV2({ answers, instagramMetadata, geminiClient })`
  - `finalizeBrandBrainV2({ answers, signals, instagramMetadata, deriveClient, rerankClient, now })`
  - `PUT /api/workspaces/:workspaceId/agent/context/draft`
  - `POST /api/workspaces/:workspaceId/agent/context/finalize`
  - extended `GET /api/workspaces/:workspaceId/agent/context`

- [ ] **Step 1: Write failing finalizer and API regressions**

Add extractor assertions to `scripts/test-brand-brain-extractor.js`:

```js
const { buildDerivedBrandBrainV2 } = require('../backend/services/brandBrainExtractor.cjs');

const derived = await buildDerivedBrandBrainV2({
  answers: {
    profileDescription: 'Coffee and fast breakfasts',
    audience: 'Busy commuters',
    niche: 'Coffee shop',
    market: 'Kyiv',
    instagramUrl: '',
  },
  instagramMetadata: {},
  geminiClient: async () => JSON.stringify({
    summary: 'Kyiv coffee and breakfast for commuters',
    offer: 'A fast breakfast option',
    cta: 'Visit before work',
    toneOfVoice: 'Warm and concise',
    evidenceByField: {
      summary: ['Coffee and fast breakfasts', 'Busy commuters', 'Kyiv'],
      offer: ['fast breakfasts'],
      cta: [],
      toneOfVoice: [],
    },
  }),
});
assert.equal(derived.summary, 'Kyiv coffee and breakfast for commuters');
assert.equal(derived.offer, 'A fast breakfast option');
assert.equal(derived.cta, '');
assert.equal(derived.toneOfVoice, '');
```

Create `scripts/test-brand-brain-wizard-api.mjs` using the existing temporary `DB_PATH`, backend process, demo login, and request helpers from `scripts/test-brand-brain-persistence.js`. Cover:

```js
const draftResponse = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context/draft`, {
  method: 'PUT',
  cookie,
  body: {
    currentStep: 2,
    answers: {
      profileDescription: 'Coffee and breakfasts',
      audience: '',
      niche: '',
      market: '',
      instagramUrl: '',
    },
  },
});
assert.equal(draftResponse.status, 200);
assert.equal(draftResponse.body.complete, false);

const incomplete = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context/finalize`, {
  method: 'POST',
  cookie,
  body: { answers: draftResponse.body.draft.answers },
});
assert.equal(incomplete.status, 422);
assert.deepEqual(incomplete.body.missingFields, ['audience', 'niche', 'market']);

const completeAnswers = {
  profileDescription: 'Coffee and fast breakfasts',
  audience: 'Busy commuters',
  niche: 'Coffee shop',
  market: 'Kyiv',
  instagramUrl: '',
};
const completed = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context/finalize`, {
  method: 'POST',
  cookie,
  body: { answers: completeAnswers },
});
assert.equal(completed.status, 200);
assert.equal(completed.body.brief.schemaVersion, 2);
assert.deepEqual(completed.body.brief.answers, completeAnswers);
assert.ok(completed.body.recommendation.signalId);
assert.equal(completed.body.signal.id, completed.body.recommendation.signalId);

const resumed = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context`, {
  cookie,
});
assert.equal(resumed.body.complete, true);
assert.equal(resumed.body.draft, null);
```

The temporary DB fixture must include one coffee signal and one unrelated signal for the active workspace. Add a shared-bank fixture and Free Trial entitlement case proving the returned ID belongs to the shared accessible response.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node scripts/test-brand-brain-extractor.js
node scripts/test-brand-brain-wizard-api.mjs
```

Expected:

- extractor FAIL because `buildDerivedBrandBrainV2` is missing;
- API FAIL with `404` for the draft route.

- [ ] **Step 3: Add grounded Version 2 derived-context generation**

In `backend/services/brandBrainExtractor.cjs`, export:

```js
async function buildDerivedBrandBrainV2({
  answers = {},
  instagramMetadata = {},
  geminiClient = null,
} = {}) {
  const authoredEvidence = sanitizeEvidenceSourceText([
    answers.profileDescription,
    answers.audience,
    answers.niche,
    answers.market,
  ].filter(Boolean).join(' '), []);
  const instagramEvidence = buildSourceMaterial({
    input: '',
    metadata: instagramMetadata,
    apifySignals: [],
  });
  const evidenceMaterial = compactText(`${authoredEvidence} ${instagramEvidence}`, 12000);
  const fallback = {
    summary: compactText([
      answers.profileDescription,
      answers.audience,
      answers.niche,
      answers.market,
    ].filter(Boolean).join(' | '), 1600),
    offer: '',
    cta: '',
    toneOfVoice: '',
    evidenceByField: {},
  };
  if (typeof geminiClient !== 'function') return fallback;

  const prompt = JSON.stringify({
    task: 'Derive internal brand strategy without changing authored answers.',
    answers,
    verifiedInstagramMetadata: sanitizePublicMetadataForPrompt(instagramMetadata, ''),
    rules: [
      'Return summary, offer, cta, toneOfVoice, evidenceByField.',
      'Every populated field needs an exact evidence snippet.',
      'Leave unsupported fields empty.',
    ],
  });
  try {
    const parsed = parseJsonObject(await geminiClient(prompt));
    return {
      summary: hasGroundedEvidence('summary', parsed, evidenceMaterial) ? compactText(parsed.summary, 1600) : fallback.summary,
      offer: hasGroundedEvidence('offer', parsed, evidenceMaterial) ? compactText(parsed.offer, 800) : '',
      cta: hasGroundedEvidence('cta', parsed, evidenceMaterial) ? compactText(parsed.cta, 500) : '',
      toneOfVoice: hasGroundedEvidence('toneOfVoice', parsed, evidenceMaterial) ? compactText(parsed.toneOfVoice, 500) : '',
      evidenceByField: parsed.evidenceByField && typeof parsed.evidenceByField === 'object'
        ? parsed.evidenceByField
        : {},
    };
  } catch {
    return fallback;
  }
}
```

Reuse existing sanitizer, JSON recovery, and evidence helpers; do not duplicate weaker variants.

- [ ] **Step 4: Implement finalizer orchestration**

Create `backend/services/brandBrainFinalizer.cjs`:

```js
const {
  BRAND_BRAIN_SCHEMA_VERSION,
  normalizeBrandAnswers,
  getMissingBrandAnswers,
  buildBrandAnswerFingerprint,
  projectBrandBrainCompatibility,
} = require('./brandBrainV2.cjs');
const { buildDerivedBrandBrainV2 } = require('./brandBrainExtractor.cjs');
const { selectBestSignalForBrand } = require('./brandSignalRecommender.cjs');

async function finalizeBrandBrainV2({
  answers: inputAnswers,
  signals = [],
  instagramMetadata = {},
  deriveClient = null,
  rerankClient = null,
  now = () => new Date(),
} = {}) {
  const answers = normalizeBrandAnswers(inputAnswers);
  const missingFields = getMissingBrandAnswers(answers);
  if (missingFields.length) {
    return { ok: false, missingFields };
  }
  const derivedBrief = await buildDerivedBrandBrainV2({
    answers,
    instagramMetadata,
    geminiClient: deriveClient,
  });
  const recommendation = await selectBestSignalForBrand({
    answers,
    derivedBrief,
    signals,
    geminiClient: rerankClient,
    now,
  });
  const brief = {
    schemaVersion: BRAND_BRAIN_SCHEMA_VERSION,
    answers,
    sourceLinks: answers.instagramUrl ? [answers.instagramUrl] : [],
    derivedBrief,
    recommendation: recommendation
      ? {
          ...recommendation,
          briefFingerprint: buildBrandAnswerFingerprint(answers),
        }
      : null,
    updatedAt: now().toISOString(),
  };
  return {
    ok: true,
    brief,
    compatibilityBrief: projectBrandBrainCompatibility(brief),
    recommendation: brief.recommendation,
  };
}

module.exports = { finalizeBrandBrainV2 };
```

- [ ] **Step 5: Add accessible-signal and idempotent API helpers**

In `backend/server.js`, add:

```js
function getAccessibleWorkspaceSignals(db, workspaceId, authUser) {
  const entitlements = buildEntitlements(db, workspaceId, authUser);
  const ownReels = db.reels.filter((item) => item.workspaceId === workspaceId);
  const sharedBank = isSharedSignalBankPlan(entitlements)
    ? buildSharedSignalBankReels(db, {
        targetWorkspaceId: workspaceId,
        workspaceId: SHARED_SIGNAL_BANK_WORKSPACE_ID,
        ownerEmail: SHARED_SIGNAL_BANK_OWNER_EMAIL || Array.from(UNLIMITED_ACCESS_EMAILS)[0] || '',
        limit: SHARED_SIGNAL_BANK_LIMIT,
      })
    : { reels: [] };
  return dedupeWorkspaceReelsForResponse([...ownReels, ...sharedBank.reels]);
}
```

Use this helper in the existing reels GET route and in finalization so access logic cannot diverge.

Extend context GET:

```js
const brief = workspace.brief || {};
const complete = isBrandContextComplete(brief);
res.json({
  workspaceId: workspace.id,
  complete,
  brief,
  brandBrain: normalizeBrandBrain(projectBrandBrainCompatibility(brief)),
  draft: complete ? null : normalizeBrandBrainDraft(workspace.brandBrainDraft),
  recommendation: brief.recommendation || null,
  providers: getAiProviderStatus(),
  memory: db.aiMemory.filter((item) => item.workspaceId === workspace.id).slice(0, 20),
});
```

Add draft PUT:

```js
app.put('/api/workspaces/:workspaceId/agent/context/draft', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  if (isBrandContextComplete(workspace.brief || {})) {
    res.status(409).json({ error: 'brand_brain_already_complete' });
    return;
  }
  workspace.brandBrainDraft = {
    ...normalizeBrandBrainDraft(req.body),
    updatedAt: new Date().toISOString(),
  };
  await writeDb(db);
  res.json({ complete: false, draft: workspace.brandBrainDraft });
});
```

Add finalize POST. Before calling providers:

- normalize answers;
- return `422` for missing fields;
- compute fingerprint;
- return the existing Version 2 brief and referenced signal if the fingerprint matches;
- fetch Instagram metadata only when `instagramUrl` is non-empty;
- resolve accessible signals once;
- call `finalizeBrandBrainV2`;
- verify the returned signal ID exists in the accessible array;
- persist brief, compatibility memory, usage, and clear `brandBrainDraft`.

The provider clients are:

```js
const deriveClient = GEMINI_API_KEY
  ? (prompt) => generateGeminiJsonText(prompt, {
      maxOutputTokens: 1600,
      temperature: 0.2,
      operation: 'brand_brain_derive_v2',
    })
  : null;
const rerankClient = GEMINI_API_KEY
  ? (prompt) => generateGeminiJsonText(prompt, {
      maxOutputTokens: 500,
      temperature: 0.1,
      operation: 'brand_signal_rerank',
    })
  : null;
```

For Version 2 briefs, make legacy `PUT /agent/context` and `PUT /brief` return:

```js
res.status(409).json({ error: 'brand_brain_v2_finalize_required' });
```

Legacy Version 1 workspaces retain the current PUT behavior until upgraded.

- [ ] **Step 6: Verify API, compatibility, and public-beta behavior**

Run:

```powershell
node scripts/test-brand-brain-v2-contract.js
node scripts/test-brand-signal-recommender.js
node scripts/test-brand-brain-extractor.js
node scripts/test-brand-brain-persistence.js
node scripts/test-brand-brain-wizard-api.mjs
npm.cmd run test:public-beta
node --check backend/server.js
```

Expected: all PASS.

- [ ] **Step 7: Commit the API boundary**

```powershell
git add -- backend/services/brandBrainFinalizer.cjs backend/services/brandBrainExtractor.cjs backend/services/brandBrainPersistence.cjs backend/server.js scripts/test-brand-brain-wizard-api.mjs scripts/test-brand-brain-extractor.js scripts/test-brand-brain-persistence.js scripts/test-public-beta-guards.cjs
git commit -m "feat: finalize Brand Brain with one signal"
```

---

### Task 4: Build the four-step onboarding wizard and root recommendation handoff

**Files:**
- Create: `src/components/BrandBrainWizard.jsx`
- Modify: `src/main.jsx`
- Modify: `src/styles.css`
- Modify: `scripts/test-my-brands-ui.mjs`
- Modify: `scripts/test-i18n-rendered.js`

**Interfaces:**
- Consumes:
  - Task 1 wizard state
  - Task 3 draft/finalize endpoints
- Produces:
  - `BrandBrainWizard({ workspaceId, language, initialDraft, onComplete, notify })`
  - root `recommendedSignalId: string`
  - `ViralBank.initialPreviewSignalId`
  - `ViralBank.onInitialPreviewOpened`

- [ ] **Step 1: Replace the browser fixture expectations with the four-step contract**

In `scripts/test-my-brands-ui.mjs`, update the incomplete-workspace scenario to assert:

```js
await expectVisible(page.getByRole('heading', { name: /describe your profile|опиши профіль/i }));
assert.equal(await page.getByText(/1 of 4|1 з 4/i).count(), 1);
assert.equal(await page.locator('[data-tour="sidebar-transcript"]').isDisabled(), true);

await page.getByLabel(/profile and product|профіль та продукт/i).fill('Specialty coffee and fast breakfasts');
await page.getByRole('button', { name: /continue|продовжити/i }).click();
await page.getByLabel(/target audience|цільова аудиторія/i).fill('Busy Kyiv commuters');
await page.getByRole('button', { name: /continue|продовжити/i }).click();
await page.getByLabel(/niche|ніша/i).fill('Coffee shop');
await page.getByLabel(/market|ринок/i).fill('Kyiv, Ukraine');
await page.getByRole('button', { name: /continue|продовжити/i }).click();
assert.equal(await page.getByRole('button', { name: /skip instagram|пропустити instagram/i }).count(), 1);
```

Add a refresh-resume scenario after Step 2. Add a finalization route interceptor returning:

```js
{
  complete: true,
  brief: {
    schemaVersion: 2,
    answers: {
      profileDescription: 'Specialty coffee and fast breakfasts',
      audience: 'Busy Kyiv commuters',
      niche: 'Coffee shop',
      market: 'Kyiv, Ukraine',
      instagramUrl: '',
    },
    derivedBrief: {},
    recommendation: {
      signalId: 'reel_coffee_fixture',
      reason: 'Best fit',
      selectionMode: 'deterministic',
    },
  },
  recommendation: {
    signalId: 'reel_coffee_fixture',
    reason: 'Best fit',
    selectionMode: 'deterministic',
  },
  signal: {
    id: 'reel_coffee_fixture',
    title: 'Breakfast coffee before the commute',
    sourceUrl: 'https://www.tiktok.com/@coffee/video/123',
  },
}
```

Assert Finish unlocks Signals and opens exactly that preview.

- [ ] **Step 2: Run the browser test and verify RED**

Run:

```powershell
node scripts/test-my-brands-ui.mjs
```

Expected: FAIL because the old all-fields form is rendered instead of Step 1.

- [ ] **Step 3: Implement the wizard component**

Create `src/components/BrandBrainWizard.jsx`. Its public component must:

- initialize from `normalizeWizardDraft(initialDraft)`;
- save the canonical draft before moving forward;
- validate only the current step;
- let Step 4 skip with an empty `instagramUrl`;
- POST normalized answers to finalize;
- keep the Finish button idempotently disabled while submitting;
- call `onComplete(payload)` only for a complete response.

Use this request boundary:

```jsx
async function putDraft(nextDraft) {
  const response = await authFetch(
    `${API_BASE}/workspaces/${workspaceId}/agent/context/draft`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextDraft),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'brand_brain_draft_save_failed');
  return normalizeWizardDraft(payload.draft);
}

async function finalize(answerOverride = draft.answers) {
  const normalizedAnswers = normalizeWizardAnswers(answerOverride);
  const missing = getMissingWizardAnswers(normalizedAnswers);
  if (missing.length) {
    setErrors(missing);
    return;
  }
  setStatus('finalizing');
  const response = await authFetch(
    `${API_BASE}/workspaces/${workspaceId}/agent/context/finalize`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: normalizedAnswers }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    setErrors(payload.missingFields || []);
    setStatus('error');
    return;
  }
  onComplete(payload);
  setStatus('ready');
}
```

Render Step 3 with separate `niche` and `market` inputs. Render Step 4 with:

```jsx
<button
  type="button"
  onClick={() => {
    const skippedAnswers = { ...draft.answers, instagramUrl: '' };
    setDraft((current) => ({
      ...current,
      answers: skippedAnswers,
    }));
    void finalize(skippedAnswers);
  }}
  disabled={status === 'finalizing'}
>
  {copy.skipInstagram}
</button>
```

Keep errors in a `role="alert"` and focus the first invalid control.

- [ ] **Step 4: Integrate root context, page gating, and recommendation state**

In `src/main.jsx`:

```js
const [brandDraft, setBrandDraft] = useState(null);
const [recommendedSignalId, setRecommendedSignalId] = useState('');
```

When loading context:

```js
const isComplete = Boolean(payload?.complete ?? isBrandProfileComplete(brief));
setBrandContext(brief);
setBrandDraft(payload?.draft || null);
setBrandContextStatus(isComplete ? 'saved' : 'onboarding');
```

Replace incomplete `BrandBrainStartPage` rendering with:

```jsx
<BrandBrainWizard
  workspaceId={workspaceId}
  language={language}
  initialDraft={brandDraft}
  notify={notify}
  onComplete={(payload) => {
    const savedBrief = payload?.brief || {};
    handleBrandContextSaved(workspaceId, savedBrief);
    setBrandDraft(null);
    setRecommendedSignalId(payload?.recommendation?.signalId || '');
    setPage('viral');
  }}
/>
```

Add recommendation props:

```jsx
<ViralBank
  reels={workspaceScopedSignalsReels}
  initialPreviewSignalId={recommendedSignalId}
  onInitialPreviewOpened={() => setRecommendedSignalId('')}
/>
```

Add these three props to the existing `ViralBank` call without removing its current props. In `ViralBank`:

```js
useEffect(() => {
  if (!initialPreviewSignalId) return;
  const recommended = reels.find((reel) => reel.id === initialPreviewSignalId);
  if (!recommended) return;
  openPreview(recommended);
  onInitialPreviewOpened?.(recommended);
}, [initialPreviewSignalId, reels]);
```

Keep the existing preview media recovery unchanged.

- [ ] **Step 5: Route sparse Brand Scan into the draft endpoint**

Add root state for a completed-workspace edit suggestion:

```js
const [brandEditSuggestion, setBrandEditSuggestion] = useState(null);
```

Replace the current in-memory legacy route in `saveBrandScanToBrain`:

```js
const grounded = buildBrandBrainFromScanReel(reel, language);
const draft = {
  currentStep: 1,
  answers: {
    profileDescription: grounded.product || '',
    audience: '',
    niche: grounded.businessType || '',
    market: grounded.location || '',
    instagramUrl: normalizeSourceLinks(grounded.sourceLinks)[0] || '',
  },
};
if (brandContextStatus === 'saved') {
  setBrandEditSuggestion({
    id: `${workspaceId}:${Date.now()}`,
    answers: draft.answers,
  });
  window.localStorage.setItem(SOURCES_TAB_KEY, 'profile');
  setSourcesTab('profile');
  setPage('settings');
  return true;
}
const response = await authFetch(
  `${API_BASE}/workspaces/${workspaceId}/agent/context/draft`,
  {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  },
);
const payload = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(payload.error || 'brand_brain_draft_save_failed');
setBrandDraft(payload.draft);
setBrandContextStatus('onboarding');
setPage('home');
```

This route performs no finalize request and cannot unlock navigation.
For completed workspaces it also performs no draft write: Task 5 consumes the
transient suggestion in Settings, and Cancel leaves the saved Version 2 brief
unchanged.

- [ ] **Step 6: Add wizard and responsive styles**

Add to `src/styles.css`:

```css
.brand-wizard {
  width: min(760px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 24px;
}

.brand-wizard-progress {
  display: grid;
  gap: 8px;
}

.brand-wizard-progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-soft);
}

.brand-wizard-progress-value {
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 180ms ease;
}

.brand-wizard-fields {
  display: grid;
  gap: 16px;
}

.brand-wizard-fields textarea {
  min-height: 150px;
}

.brand-wizard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.brand-wizard-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 700px) {
  .brand-wizard-grid {
    grid-template-columns: 1fr;
  }

  .brand-wizard-actions {
    align-items: stretch;
    flex-direction: column-reverse;
  }
}
```

- [ ] **Step 7: Verify onboarding and commit**

Run:

```powershell
node scripts/test-my-brands-ui.mjs
node scripts/test-signal-preview-ui.mjs
npm.cmd run test:i18n-rendered
npm.cmd run test:i18n-core
npm.cmd run test:public-beta
npm.cmd run build
```

Expected: all PASS.

Commit:

```powershell
git add -- src/components/BrandBrainWizard.jsx src/main.jsx src/styles.css scripts/test-my-brands-ui.mjs scripts/test-i18n-rendered.js
git commit -m "feat: add four-step Brand Brain onboarding"
```

---

### Task 5: Simplify Settings My Brands and refresh recommendations after edits

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/styles.css`
- Modify: `scripts/test-my-brands-ui.mjs`
- Modify: `scripts/test-i18n-rendered.js`

**Interfaces:**
- Consumes:
  - Version 2 `brief.answers`
  - finalize endpoint
  - root `onBrandSaved`
  - root `onOpenRecommendedSignal`
  - root `brandEditSuggestion`
- Produces:
  - locked Version 2 My Brands card
  - compact authored-answer edit mode
  - `Open recommended signal` action

- [ ] **Step 1: Add failing Settings browser assertions**

Extend the completed Version 2 fixture in `scripts/test-my-brands-ui.mjs`:

```js
await page.locator('[data-tour="sidebar-settings"]').click();
await page.getByRole('button', { name: /my brands|brand memory/i }).click();
await page.waitForSelector('.brand-brain');

assert.equal(await page.locator('.brand-brain textarea').count(), 0);
await expectVisible(page.getByText('Specialty coffee and fast breakfasts'));
await expectVisible(page.getByText('Busy Kyiv commuters'));
await expectVisible(page.getByText('Coffee shop'));
await expectVisible(page.getByText('Kyiv, Ukraine'));
assert.equal(await page.getByText(/offer|cta|tone of voice/i).count(), 0);

await page.getByRole('button', { name: /edit brand/i }).click();
assert.equal(await page.locator('.brand-brain textarea').count(), 2);
assert.equal(await page.locator('.brand-brain input').count(), 3);
assert.equal(await page.getByLabel(/offer|cta|tone of voice/i).count(), 0);
```

Intercept Settings finalize, return a new recommendation, and assert:

- Save returns to zero-input card;
- edited market persists after reload;
- current page remains Settings;
- `Open recommended signal` navigates to Signals and opens the returned signal.

Add a completed-workspace sparse Brand Scan scenario. Drive the existing
Settings source scan -> Studio -> Save to Brand Brain user path and assert:

```js
assert.equal(finalizeRequestCount, 0);
await expectVisible(page.getByRole('heading', { name: /my brands/i }));
assert.equal(
  await page.getByLabel(/profile and product|профіль та продукт/i).inputValue(),
  'Specialty coffee and fast breakfasts',
);
assert.match(
  await page.getByLabel(/instagram/i).inputValue(),
  /instagram\.com\/car_finder_/,
);
assert.equal(await page.locator('[data-tour="sidebar-transcript"]').isDisabled(), false);
```

Cancel the suggestion and assert the original locked card values return.

- [ ] **Step 2: Run Settings test and verify RED**

Run:

```powershell
node scripts/test-my-brands-ui.mjs
```

Expected: FAIL because the legacy six-field card still shows offer, CTA, and tone fields.

- [ ] **Step 3: Replace legacy Settings fields with authored answers**

In `BrandBrain`, branch explicitly:

```js
const isV2 = Number(initialBrief?.schemaVersion) === 2;
const initialAnswers = normalizeWizardAnswers(initialBrief?.answers || {});
```

For Version 2 card mode, render only:

```jsx
const authoredCardFields = [
  ['profileDescription', copy.profileDescription],
  ['audience', copy.audience],
  ['niche', copy.niche],
  ['market', copy.market],
];

<dl className="brand-facts brand-facts-v2">
  {authoredCardFields.map(([field, label]) => (
    <div key={field}>
      <dt>{label}</dt>
      <dd>{savedAnswers[field]}</dd>
    </div>
  ))}
</dl>
```

Render optional Instagram as a normalized external link only when present.

For Version 2 edit mode:

- `profileDescription` and `audience` are textareas;
- `niche`, `market`, and `instagramUrl` are inputs;
- no offer, CTA, tone, proof, stop topics, or source-link textarea is rendered.

Legacy Version 1 cards remain readable. Starting edit projects the legacy values into Version 2 answers and requires any missing Version 2 field before upgrade.

Consume a sparse Brand Scan suggestion without overwriting saved values with
empty strings:

```js
useEffect(() => {
  if (!brandEditSuggestion?.id) return;
  const suggested = normalizeWizardAnswers(brandEditSuggestion.answers);
  setEditAnswers((current) => Object.fromEntries(
    Object.entries(current).map(([field, value]) => [
      field,
      suggested[field] || value,
    ]),
  ));
  setMode('editing');
  onBrandEditSuggestionConsumed?.(brandEditSuggestion.id);
}, [brandEditSuggestion?.id]);
```

Thread `brandEditSuggestion` and `onBrandEditSuggestionConsumed` from the root
through Settings to the My Brands component. The consumed callback clears the
root suggestion only after the component has copied its values.

- [ ] **Step 4: Save edits through finalize without leaving Settings**

Use:

```js
const saveVersion2 = async () => {
  const normalizedAnswers = normalizeWizardAnswers(editAnswers);
  const missingFields = getMissingWizardAnswers(normalizedAnswers);
  if (missingFields.length) {
    setMissingFields(missingFields);
    return;
  }
  const response = await authFetch(
    `${API_BASE}/workspaces/${workspaceId}/agent/context/finalize`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: normalizedAnswers }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    setMissingFields(payload.missingFields || []);
    return;
  }
  setSavedSnapshot(payload.brief);
  setMode('card');
  onSaved?.(payload.brief);
  onRecommendationChanged?.(payload.recommendation || null);
};
```

Do not call `setPage` from this save path.

Add card action:

```jsx
{savedSnapshot.recommendation?.signalId && (
  <button
    type="button"
    className="dark"
    onClick={() => onOpenRecommendedSignal?.(savedSnapshot.recommendation.signalId)}
  >
    <Play size={16} />
    {copy.openRecommendedSignal}
  </button>
)}
```

Root callback:

```js
const openRecommendedSignal = (signalId) => {
  setRecommendedSignalId(signalId);
  setPage('viral');
};
```

- [ ] **Step 5: Remove obsolete public form copy and assertions**

Update `scripts/test-i18n-rendered.js` so rendered Settings asserts localized labels for:

- profile and product;
- target audience;
- niche;
- market;
- optional Instagram;
- open recommended signal.

Remove assertions that require offer, CTA, or tone fields in Settings. Do not remove unrelated Cyrillic or English coverage.

- [ ] **Step 6: Verify Settings and commit**

Run:

```powershell
node scripts/test-my-brands-ui.mjs
npm.cmd run test:i18n-rendered
npm.cmd run test:i18n-core
npm.cmd run test:i18n-components
npm.cmd run test:i18n-errors
npm.cmd run build
```

Expected: all PASS.

Commit:

```powershell
git add -- src/main.jsx src/styles.css scripts/test-my-brands-ui.mjs scripts/test-i18n-rendered.js
git commit -m "feat: simplify My Brands settings"
```

---

### Task 6: Verify the complete wizard and recommendation flow

**Files:**
- Verify: `backend/services/brandBrainV2.cjs`
- Verify: `backend/services/brandSignalRecommender.cjs`
- Verify: `backend/services/brandBrainFinalizer.cjs`
- Verify: `backend/services/brandBrainExtractor.cjs`
- Verify: `backend/server.js`
- Verify: `src/brandBrainWizardState.mjs`
- Verify: `src/components/BrandBrainWizard.jsx`
- Verify: `src/myBrandsState.mjs`
- Verify: `src/main.jsx`
- Verify: `src/styles.css`

**Interfaces:**
- Consumes all previous task outputs.
- Produces a verified, production-ready Version 2 onboarding and recommendation flow.

- [ ] **Step 1: Run the focused contract and recommendation suites**

```powershell
node scripts/test-brand-brain-v2-contract.js
node scripts/test-brand-signal-recommender.js
node scripts/test-brand-brain-extractor.js
npm.cmd run test:brand-brain
node scripts/test-brand-brain-persistence.js
node scripts/test-brand-brain-wizard-api.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run browser and signal regressions**

```powershell
node scripts/test-my-brands-ui.mjs
node scripts/test-signal-preview-ui.mjs
node scripts/test-apify-signal-provider.mjs
node scripts/test-automatic-discovery-regressions.mjs
npm.cmd run test:public-beta
```

Expected: all PASS.

- [ ] **Step 3: Run localization, syntax, and production checks**

```powershell
npm.cmd run test:i18n-core
npm.cmd run test:i18n-provider
npm.cmd run test:i18n-components
npm.cmd run test:i18n-errors
npm.cmd run test:i18n-rendered
node --check backend/server.js
npm.cmd run build
git diff --check
```

Expected:

- all commands exit `0`;
- Vite may retain the existing non-blocking chunk-size warning.

- [ ] **Step 4: Inspect scope and runtime-data hygiene**

```powershell
git status --short --branch
git diff --stat 9a4c629..HEAD
git log --oneline 9a4c629..HEAD
```

Expected:

- `backend/data/db.json` remains unstaged and uncommitted;
- every implementation task is a focused commit;
- no hackathon worktree or branch is modified.

- [ ] **Step 5: Request final whole-branch review**

Review the complete range from `9a4c629` to final HEAD against:

- `docs/superpowers/specs/2026-07-23-brand-brain-wizard-signal-recommendation-design.md`;
- this implementation plan;
- fresh verification evidence.

Fix every Critical and Important issue, rerun affected suites, and require a final `Ready to merge: Yes` verdict.
