# My Brands Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-editable Brand Brain form with factual one-time My Brands onboarding, workspace-level navigation gating, and a locked card inside Settings.

**Architecture:** A small pure state module defines required fields, source-link normalization, and completion. The App root loads workspace brand context and owns the onboarding route guard. The existing BrandBrain component becomes a controlled onboarding/card/edit surface, while the backend extractor emits only source-backed facts.

**Tech Stack:** React 19, Vite 8, Node.js, Express 5, Playwright, Node `assert`.

## Global Constraints

- Work only on `main`; do not modify `hackathon/openai-build-week`.
- Do not edit or stage `backend/data/db.json`.
- Keep the existing “Start here once” onboarding hint.
- The permanent location is `Settings -> My Brands`; no permanent sidebar item.
- Required fields are `businessType`, `product`, `audience`, `offer`, `cta`, and `toneOfVoice`.
- Unknown facts stay empty and appear in `missingFields`.
- Existing saved workspace briefs remain readable without a migration.

---

### Task 1: Define My Brands state and completion

**Files:**
- Create: `src/myBrandsState.mjs`
- Test: `scripts/test-my-brands-ui.mjs`

**Interfaces:**
- Produces: `REQUIRED_BRAND_FIELDS: readonly string[]`
- Produces: `normalizeSourceLinks(value: unknown): string[]`
- Produces: `getMissingRequiredBrandFields(brief: object): string[]`
- Produces: `isBrandProfileComplete(brief: object): boolean`
- Produces: `normalizeEditableBrandBrief(brief: object): object`

- [ ] **Step 1: Add pure-state assertions to the approved UI test**

Add imports and assertions at the top of `scripts/test-my-brands-ui.mjs`:

```js
import {
  getMissingRequiredBrandFields,
  isBrandProfileComplete,
  normalizeSourceLinks,
} from '../src/myBrandsState.mjs';

assert.deepEqual(normalizeSourceLinks([
  ' https://www.instagram.com/example/ ',
  'https://www.instagram.com/example/',
  'not-a-url',
  'https://www.tiktok.com/@example',
]), [
  'https://www.instagram.com/example/',
  'https://www.tiktok.com/@example',
]);
assert.deepEqual(
  getMissingRequiredBrandFields({ businessType: 'Cafe', product: 'Coffee' }),
  ['audience', 'offer', 'cta', 'toneOfVoice'],
);
assert.equal(isBrandProfileComplete({
  businessType: 'Cafe',
  product: 'Coffee',
  audience: 'Morning commuters',
  offer: 'Coffee and pastry',
  cta: 'Visit before work',
  toneOfVoice: 'Warm and concise',
}), true);
```

- [ ] **Step 2: Run the state test and verify RED**

Run:

```powershell
node scripts/test-my-brands-ui.mjs
```

Expected: FAIL because `src/myBrandsState.mjs` does not exist.

- [ ] **Step 3: Implement the state module**

Create `src/myBrandsState.mjs`:

```js
export const REQUIRED_BRAND_FIELDS = Object.freeze([
  'businessType',
  'product',
  'audience',
  'offer',
  'cta',
  'toneOfVoice',
]);

const TEXT_FIELDS = Object.freeze([
  'brandName',
  ...REQUIRED_BRAND_FIELDS,
  'location',
  'proof',
  'contentFocus',
]);

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeSourceLinks(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || '').split(/[\s,\n]+/);
  const seen = new Set();
  const result = [];
  for (const candidate of values) {
    try {
      const url = new URL(compactText(candidate));
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      const normalized = url.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    } catch {
      // Non-URL niche copy stays in the intake text and is not persisted as a link.
    }
  }
  return result;
}

export function getMissingRequiredBrandFields(brief = {}) {
  return REQUIRED_BRAND_FIELDS.filter((field) => !compactText(brief?.[field]));
}

export function isBrandProfileComplete(brief = {}) {
  return getMissingRequiredBrandFields(brief).length === 0;
}

export function normalizeEditableBrandBrief(brief = {}) {
  const normalized = Object.fromEntries(
    TEXT_FIELDS.map((field) => [field, compactText(brief?.[field])]),
  );
  return {
    ...normalized,
    sourceLinks: normalizeSourceLinks(brief?.sourceLinks),
    stopTopics: Array.isArray(brief?.stopTopics)
      ? brief.stopTopics.map(compactText).filter(Boolean).join(', ')
      : compactText(brief?.stopTopics),
  };
}
```

- [ ] **Step 4: Run the state assertions**

Run:

```powershell
node scripts/test-my-brands-ui.mjs
```

Expected: the pure assertions pass, then the browser scenario remains RED because navigation is not gated.

- [ ] **Step 5: Commit the state boundary**

```powershell
git add -- src/myBrandsState.mjs scripts/test-my-brands-ui.mjs
git commit -m "test: define My Brands completion contract"
```

### Task 2: Make extraction evidence-first

**Files:**
- Modify: `backend/services/brandBrainExtractor.cjs:1-280`
- Modify: `backend/services/brandBrainContext.cjs:1-165`
- Modify: `src/brandBrain.mjs:1-190`
- Test: `scripts/test-brand-brain-extractor.js`
- Test: `scripts/test-brand-brain.mjs`

**Interfaces:**
- Consumes: stored `sourceLinks: string[]`
- Produces: `buildBrandBrainEnrichment(...).brief` with unsupported fields empty
- Produces: normalized Brand Brain context with `sourceLinks`

- [ ] **Step 1: Extend the extractor regression with generic metadata and source evidence**

Keep the approved sparse-profile assertion and add:

```js
assert.deepEqual(result.brief.sourceLinks, [
  'https://www.instagram.com/car_finder_/',
]);
assert.deepEqual(
  result.missingFields.filter((field) => [
    'businessType',
    'product',
    'audience',
    'offer',
    'cta',
    'toneOfVoice',
  ].includes(field)),
  ['businessType', 'product', 'audience', 'offer', 'cta', 'toneOfVoice'],
);
```

- [ ] **Step 2: Run extractor tests and verify RED**

Run:

```powershell
node scripts/test-brand-brain-extractor.js
```

Expected: FAIL because the current fallback returns `локальний бізнес` and fabricated commercial fields.

- [ ] **Step 3: Replace generic fallback values with grounded values**

In `backend/services/brandBrainExtractor.cjs`:

- make `inferBusinessType` return an empty string when no dictionary match exists;
- derive `product` only from matched source keywords or clean metadata text;
- set `audience`, `offer`, and `toneOfVoice` to empty unless a direct source phrase supports them;
- set `cta` only when the source contains an explicit Direct, booking, order, or purchase instruction;
- keep follower/post/view numbers only in `proof`;
- add `sourceLinks: normalizeSourceLinks([input])`;
- compute `missingFields` from the normalized final brief rather than a fixed list.

Use:

```js
const REQUIRED_FACT_FIELDS = [
  'businessType',
  'product',
  'audience',
  'offer',
  'cta',
  'toneOfVoice',
];

function buildMissingFields(brief = {}) {
  return REQUIRED_FACT_FIELDS.filter((field) => !compactText(brief[field]));
}
```

For Gemini results, require an `evidenceByField` object in the prompt. Validate every evidence snippet with a case-insensitive lookup in the combined source text and accept a populated field only when at least one submitted snippet is present:

```js
function hasGroundedEvidence(field, parsed = {}, sourceText = '') {
  const evidence = normalizeArray(parsed.evidenceByField?.[field], 6);
  const haystack = compactText(sourceText, 12000).toLowerCase();
  return evidence.some((snippet) => haystack.includes(snippet.toLowerCase()));
}
```

Always preserve `sourceLinks`, verified proof statistics, and a verified handle even when Gemini output is rejected.

- [ ] **Step 4: Remove client-side invented fallback copy**

In `src/brandBrain.mjs`, keep metadata cleanup but make generic audience, offer, and CTA builders return an empty string unless their trigger is explicitly present in cleaned source text.

In the `BrandBrain.analyzeSeed` catch path in `src/main.jsx`, preserve the current brief and seed instead of assigning generic audience, offer, and tone values.

When analysis succeeds, preserve the submitted sources explicitly:

```js
const submittedSourceLinks = normalizeSourceLinks(cleanSeed);
setBrief((current) => ({
  ...current,
  ...nextBrief,
  sourceLinks: normalizeSourceLinks([
    ...(current.sourceLinks || []),
    ...(nextBrief.sourceLinks || []),
    ...submittedSourceLinks,
  ]),
}));
```

- [ ] **Step 5: Normalize source links in agent context**

In `backend/services/brandBrainContext.cjs`, add:

```js
function compactUrls(value) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map(compactText).filter(Boolean))];
}
```

Add `sourceLinks: compactUrls(brief.sourceLinks)` to `normalizeBrandBrain`, include it in `buildBrandBrainPromptBlock`, and return it from `buildBusinessBriefFromBrandBrain`.

- [ ] **Step 6: Run factual extraction tests**

Run:

```powershell
node scripts/test-brand-brain-extractor.js
npm.cmd run test:brand-brain
node scripts/test-brand-brain-persistence.js
```

Expected: all PASS and no populated field contains Instagram boilerplate.

- [ ] **Step 7: Commit factual extraction**

```powershell
git add -- backend/services/brandBrainExtractor.cjs backend/services/brandBrainContext.cjs src/brandBrain.mjs src/main.jsx scripts/test-brand-brain-extractor.js scripts/test-brand-brain.mjs
git commit -m "fix: keep My Brands memory source-grounded"
```

### Task 3: Add root onboarding guard

**Files:**
- Modify: `src/main.jsx:379-710`
- Modify: `src/main.jsx:1267-1330`
- Modify: `src/main.jsx:2909-2975`
- Test: `scripts/test-my-brands-ui.mjs`

**Interfaces:**
- Consumes: `isBrandProfileComplete(brief)`
- Produces: root `brandContextStatus: 'loading' | 'onboarding' | 'saved'`
- Produces: `navigationLocked: boolean`
- Produces: `handleBrandContextSaved(brief: object): void`

- [ ] **Step 1: Verify the approved browser test is RED**

Run:

```powershell
node scripts/test-my-brands-ui.mjs
```

Expected: FAIL with `Signals must stay locked until My Brands onboarding is saved`.

- [ ] **Step 2: Load active workspace brand context at the root**

Import the state helpers in `src/main.jsx` and add:

```js
const [brandContext, setBrandContext] = useState(null);
const [brandContextStatus, setBrandContextStatus] = useState('loading');

useEffect(() => {
  if (!currentUser || !workspaceId) {
    setBrandContext(null);
    setBrandContextStatus('loading');
    return undefined;
  }
  let active = true;
  setBrandContextStatus('loading');
  authFetch(`${API_BASE}/workspaces/${workspaceId}/agent/context`)
    .then(async (response) => {
      if (!response.ok) throw new Error('brand_context_load_failed');
      return response.json();
    })
    .then((payload) => {
      if (!active) return;
      const brief = payload?.brief || {};
      setBrandContext(brief);
      setBrandContextStatus(isBrandProfileComplete(brief) ? 'saved' : 'onboarding');
    })
    .catch(() => {
      if (!active) return;
      setBrandContext({});
      setBrandContextStatus('onboarding');
    });
  return () => { active = false; };
}, [currentUser, workspaceId]);
```

- [ ] **Step 3: Guard navigation and initial routing**

Change `setMvpPage` so any destination other than `home` is rejected while `brandContextStatus !== 'saved'`.

Add an effect that keeps incomplete workspaces on `home` and redirects complete workspaces from `home` to `viral`:

```js
useEffect(() => {
  if (brandContextStatus === 'onboarding' && page !== 'home') setPage('home');
  if (brandContextStatus === 'saved' && page === 'home') setPage('viral');
}, [brandContextStatus, page]);
```

Pass `navigationLocked={brandContextStatus !== 'saved'}` to `CleanSidebar` and disable all product navigation buttons while locked. Do not render a permanent `home` item in `primaryItems`.

- [ ] **Step 4: Update root rendering**

Pass these props to `BrandBrainStartPage`:

```jsx
<BrandBrainStartPage
  brief={brandContext || {}}
  notify={notify}
  workspaceId={workspaceId}
  language={language}
  setPage={setMvpPage}
  onSaved={(savedBrief) => {
    setBrandContext(savedBrief);
    setBrandContextStatus('saved');
  }}
/>
```

While `brandContextStatus === 'loading'`, render the existing loading screen rather than flashing product navigation.

- [ ] **Step 5: Run the browser test**

Run:

```powershell
node scripts/test-my-brands-ui.mjs
```

Expected: empty onboarding assertions pass; saved-card assertions remain RED until Task 4.

- [ ] **Step 6: Commit navigation gating**

```powershell
git add -- src/main.jsx scripts/test-my-brands-ui.mjs
git commit -m "feat: gate first login on My Brands"
```

### Task 4: Render locked cards and move My Brands into Settings

**Files:**
- Modify: `src/main.jsx:5719-5945`
- Modify: `src/main.jsx:7504-7751`
- Modify: `src/styles.css`
- Modify: `scripts/test-i18n-rendered.js`
- Test: `scripts/test-my-brands-ui.mjs`

**Interfaces:**
- Consumes: `brief`, `onSaved`, and `onCompletionChange`
- Produces: onboarding, locked-card, and edit modes

- [ ] **Step 1: Confirm saved-card RED**

Run:

```powershell
node scripts/test-my-brands-ui.mjs
```

Expected: FAIL because saved BrandBrain still contains textareas.

- [ ] **Step 2: Convert BrandBrain into explicit modes**

Change the component signature:

```jsx
function BrandBrain({
  notify,
  workspaceId,
  language = 'uk',
  initialBrief = {},
  onboarding = false,
  onSaved,
}) {
```

Add `mode` state initialized to `onboarding || !isBrandProfileComplete(initialBrief) ? 'onboarding' : 'card'`.

When `mode === 'card'`, render:

```jsx
<section className="brand-brain my-brands-card" aria-label="My Brands">
  <header className="my-brands-card-head">
    <div>
      <small>My Brands</small>
      <h3>{brief.brandName || brief.businessType}</h3>
    </div>
    <button
      className="icon"
      type="button"
      aria-label="Edit brand"
      onClick={() => setMode('editing')}
    >
      <Pencil size={16} />
    </button>
  </header>
  <div className="my-brands-facts">
    {cardFields.map(([field, label]) => (
      <article key={field}>
        <small>{label}</small>
        <p>{brief[field] || 'Not specified'}</p>
      </article>
    ))}
  </div>
  {brief.sourceLinks?.length > 0 && (
    <div className="my-brands-sources">
      {brief.sourceLinks.map((sourceUrl) => (
        <a href={sourceUrl} target="_blank" rel="noreferrer" key={sourceUrl}>
          {new URL(sourceUrl).hostname}
        </a>
      ))}
    </div>
  )}
</section>
```

The card contains no `input` or `textarea`.

- [ ] **Step 3: Add edit save and cancel**

Store a snapshot when entering edit mode. `Cancel` restores the snapshot and returns to card mode.

After a successful PUT:

```js
const savedPayload = await response.json();
const savedBrief = savedPayload.brief || payload;
setBrief(normalizeEditableBrandBrief(savedBrief));
setMode('card');
onSaved?.(savedBrief);
```

Disable save and show the names returned by `getMissingRequiredBrandFields(payload)` until all six required fields are present.

- [ ] **Step 4: Keep onboarding hint and next step**

`BrandBrainStartPage` keeps its existing subtitle. Its BrandBrain instance uses `onboarding` until the first successful save, then shows the card and the existing `Continue to Signals` action.

- [ ] **Step 5: Rename and relocate the permanent entry**

In Settings tabs, change `profile` label to `My Brands` for both languages and render the locked-card BrandBrain there.

Remove the `home` entry from `CleanSidebar.primaryItems`. Update `scripts/test-i18n-rendered.js` to assert that Settings contains a `My Brands` tab instead of asserting a `sidebar-home` label.

- [ ] **Step 6: Add card and edit styles**

In `src/styles.css`, add focused selectors:

```css
.my-brands-card {
  display: grid;
  gap: 18px;
}

.my-brands-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.my-brands-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.my-brands-facts article {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-soft);
}

@media (max-width: 760px) {
  .my-brands-facts {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Run My Brands and i18n tests**

Run:

```powershell
node scripts/test-my-brands-ui.mjs
npm.cmd run test:i18n-rendered
npm.cmd run test:i18n-core
```

Expected: all PASS.

- [ ] **Step 8: Commit the completed My Brands UI**

```powershell
git add -- src/main.jsx src/styles.css scripts/test-my-brands-ui.mjs scripts/test-i18n-rendered.js
git commit -m "feat: add locked My Brands cards"
```

### Task 5: Verify My Brands end to end

**Files:**
- Verify: `backend/services/brandBrainExtractor.cjs`
- Verify: `backend/services/brandBrainContext.cjs`
- Verify: `src/myBrandsState.mjs`
- Verify: `src/brandBrain.mjs`
- Verify: `src/main.jsx`
- Verify: `src/styles.css`

**Interfaces:**
- Consumes: all prior task outputs
- Produces: verified My Brands workflow

- [ ] **Step 1: Run targeted suites**

```powershell
node scripts/test-brand-brain-extractor.js
npm.cmd run test:brand-brain
node scripts/test-brand-brain-persistence.js
node scripts/test-my-brands-ui.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run broader checks**

```powershell
npm.cmd run test:public-beta
npm.cmd run test:i18n-core
npm.cmd run test:i18n-provider
npm.cmd run test:i18n-components
npm.cmd run test:i18n-errors
node --check backend/server.js
npm.cmd run build
```

Expected: all PASS; Vite may retain the existing non-blocking bundle-size warning.

- [ ] **Step 3: Inspect the final diff**

```powershell
git diff --check
git status --short
git diff --stat origin/main...HEAD
```

Expected: no whitespace errors; `backend/data/db.json` remains unstaged.
