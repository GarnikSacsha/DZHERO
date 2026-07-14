# Complete English Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Dzhero's delayed DOM translation with complete render-time Ukrainian/English localization across every interface surface.

**Architecture:** A React `I18nProvider` owns the persisted locale and exposes a strict `t(key, params)` translator backed by parity-checked semantic catalogs. UI components and dynamic UI helpers resolve copy during render; external/user/generated content is explicitly marked and never translated. Static and Playwright audits prevent untranslated UI, catalog drift, and any return of DOM mutation localization.

**Tech Stack:** React 19, Vite 8, Node.js assertion scripts, Playwright 1.60, existing Express backend error codes

## Global Constraints

- Preserve all pre-existing working-tree changes; implement against the current files, not `HEAD` snapshots.
- Never stage or commit `backend/data/db.json`.
- Before every commit, run `git diff --cached --check` and inspect `git diff --cached --name-only`.
- Stage `src/main.jsx`, `src/i18n.js`, and other already-modified files by hunk; exclude every hunk that existed before this plan unless the localization change directly replaces it with equivalent behavior.
- Ukrainian is the default locale; only `uk` and `en` are valid stored values.
- Interface-owned text must use semantic translation keys. User-authored, imported, workspace-specific, source-specific, and AI-generated content must remain unchanged.
- Unknown translation keys and missing interpolation parameters are test failures.
- Unknown backend errors display a localized generic message and never raw internal exception text.
- Keep product terms such as Dzhero, Signals, Studio, Reels, TikTok, YouTube, Direct, Brand Brain, and workspace unchanged when intended in both locales.
- Do not refactor unrelated product logic or restructure `src/main.jsx` beyond localization boundaries.
- The nine uncommitted additions currently present in `src/i18n.js` must survive as semantic catalog entries before the legacy file is removed.

---

### Task 1: Strict translation core and parity-checked catalogs

**Files:**
- Create: `src/locales/uk.mjs`
- Create: `src/locales/en.mjs`
- Create: `src/i18nCore.mjs`
- Create: `scripts/test-i18n-core.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeLanguage(value): 'uk' | 'en'`
- Produces: `getLocaleTag(language): 'uk-UA' | 'en-US'`
- Produces: `interpolateMessage(template, parameters): string`
- Produces: `createTranslator(language): (key, parameters?) => string`
- Produces: `assertCatalogParity(): true`
- Produces: flat catalogs keyed by semantic names such as `common.cancel`

- [ ] **Step 1: Write the failing core test**

Create `scripts/test-i18n-core.mjs`:

```js
import assert from 'node:assert/strict';
import { en } from '../src/locales/en.mjs';
import { uk } from '../src/locales/uk.mjs';
import {
  assertCatalogParity,
  createTranslator,
  getLocaleTag,
  interpolateMessage,
  normalizeLanguage,
} from '../src/i18nCore.mjs';

assert.equal(normalizeLanguage('en'), 'en');
assert.equal(normalizeLanguage('uk'), 'uk');
assert.equal(normalizeLanguage('de'), 'uk');
assert.equal(normalizeLanguage(null), 'uk');
assert.equal(getLocaleTag('en'), 'en-US');
assert.equal(getLocaleTag('uk'), 'uk-UA');
assert.equal(assertCatalogParity(), true);
assert.deepEqual(Object.keys(en).sort(), Object.keys(uk).sort());

const enT = createTranslator('en');
const ukT = createTranslator('uk');
assert.equal(enT('common.cancel'), 'Cancel');
assert.equal(ukT('common.cancel'), 'Скасувати');
assert.equal(enT('common.itemsCount', { count: 3 }), '3 items');
assert.equal(interpolateMessage('{count} items', { count: 0 }), '0 items');
assert.throws(() => enT('missing.key'), /Missing translation key: missing\.key \(en\)/);
assert.throws(() => enT('common.itemsCount'), /Missing translation parameter: count/);

for (const [key, value] of Object.entries(en)) {
  assert.equal(typeof value, 'string', `English value must be a string: ${key}`);
  assert.ok(value.trim(), `English value must not be empty: ${key}`);
}
for (const [key, value] of Object.entries(uk)) {
  assert.equal(typeof value, 'string', `Ukrainian value must be a string: ${key}`);
  assert.ok(value.trim(), `Ukrainian value must not be empty: ${key}`);
}

console.log('i18n core tests passed');
```

- [ ] **Step 2: Run the test and verify the expected red state**

Run: `node scripts/test-i18n-core.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/locales/en.mjs` or `src/i18nCore.mjs`.

- [ ] **Step 3: Create the initial matching catalogs**

Create `src/locales/uk.mjs`:

```js
export const uk = Object.freeze({
  'common.cancel': 'Скасувати',
  'common.close': 'Закрити',
  'common.save': 'Зберегти',
  'common.retry': 'Спробувати ще раз',
  'common.loading': 'Завантаження',
  'common.error': 'Помилка',
  'common.itemsCount': '{count} елементів',
  'language.interface': 'Мова інтерфейсу',
});
```

Create `src/locales/en.mjs`:

```js
export const en = Object.freeze({
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.retry': 'Try again',
  'common.loading': 'Loading',
  'common.error': 'Error',
  'common.itemsCount': '{count} items',
  'language.interface': 'Interface language',
});
```

- [ ] **Step 4: Implement the strict pure translation API**

Create `src/i18nCore.mjs`:

```js
import { en } from './locales/en.mjs';
import { uk } from './locales/uk.mjs';

export const SUPPORTED_LANGUAGES = Object.freeze(['uk', 'en']);
export const catalogs = Object.freeze({ uk, en });

export function normalizeLanguage(value) {
  return value === 'en' ? 'en' : 'uk';
}

export function getLocaleTag(language) {
  return normalizeLanguage(language) === 'en' ? 'en-US' : 'uk-UA';
}

export function interpolateMessage(template, parameters = {}) {
  return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_, name) => {
    if (!Object.prototype.hasOwnProperty.call(parameters, name)) {
      throw new Error(`Missing translation parameter: ${name}`);
    }
    return String(parameters[name]);
  });
}

export function createTranslator(language) {
  const normalized = normalizeLanguage(language);
  const catalog = catalogs[normalized];
  return (key, parameters) => {
    if (!Object.prototype.hasOwnProperty.call(catalog, key)) {
      throw new Error(`Missing translation key: ${key} (${normalized})`);
    }
    return interpolateMessage(catalog[key], parameters);
  };
}

export function assertCatalogParity() {
  const ukKeys = Object.keys(uk).sort();
  const enKeys = Object.keys(en).sort();
  if (ukKeys.length !== enKeys.length || ukKeys.some((key, index) => key !== enKeys[index])) {
    const onlyUk = ukKeys.filter((key) => !Object.hasOwn(en, key));
    const onlyEn = enKeys.filter((key) => !Object.hasOwn(uk, key));
    throw new Error(`Catalog key mismatch. onlyUk=${onlyUk.join(',')} onlyEn=${onlyEn.join(',')}`);
  }
  return true;
}
```

- [ ] **Step 5: Add the package command and run green verification**

Add to `package.json` scripts:

```json
"test:i18n-core": "node scripts/test-i18n-core.mjs"
```

Run: `npm.cmd run test:i18n-core`

Expected: `i18n core tests passed` and exit code 0.

- [ ] **Step 6: Commit only the core files**

```powershell
git add package.json src/i18nCore.mjs src/locales/uk.mjs src/locales/en.mjs scripts/test-i18n-core.mjs
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: add strict render-time translation core"
```

### Task 2: React provider, persistence, and initial render ownership

**Files:**
- Create: `src/i18nProvider.mjs`
- Create: `scripts/test-i18n-provider.mjs`
- Modify: `src/main.jsx:1-65,380-550,7560-end`
- Modify: `src/locales/uk.mjs`
- Modify: `src/locales/en.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createTranslator`, `normalizeLanguage`, `getLocaleTag`
- Produces: `I18nProvider({ children, initialLanguage? })`
- Produces: `useI18n(): { language, setLanguage, t, locale, formatNumber, formatDate }`
- Preserves: the existing `language` and `setLanguage` variables inside `App` so child migration can proceed incrementally

- [ ] **Step 1: Write the failing provider test**

Create `scripts/test-i18n-provider.mjs`:

```js
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider, useI18n } from '../src/i18nProvider.mjs';

function Probe() {
  const { language, locale, t, formatNumber } = useI18n();
  return React.createElement('output', null, `${language}|${locale}|${t('common.cancel')}|${formatNumber(1200)}`);
}

function MissingProviderProbe() {
  useI18n();
  return React.createElement('output');
}

const english = renderToStaticMarkup(
  React.createElement(I18nProvider, { initialLanguage: 'en' }, React.createElement(Probe)),
);
const invalid = renderToStaticMarkup(
  React.createElement(I18nProvider, { initialLanguage: 'pl' }, React.createElement(Probe)),
);

assert.match(english, /en\|en-US\|Cancel\|1,200/);
assert.match(invalid, /uk\|uk-UA\|Скасувати\|1(?: | )200/);
assert.throws(
  () => renderToStaticMarkup(React.createElement(MissingProviderProbe)),
  /useI18n must be used inside I18nProvider/,
);

console.log('i18n provider tests passed');
```

- [ ] **Step 2: Run the provider test and verify red**

Run: `node scripts/test-i18n-provider.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/i18nProvider.mjs`.

- [ ] **Step 3: Implement the provider without JSX so Node can test it**

Create `src/i18nProvider.mjs`:

```js
import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { createTranslator, getLocaleTag, normalizeLanguage } from './i18nCore.mjs';

export const LANGUAGE_STORAGE_KEY = 'insta-producer-language';
const I18nContext = createContext(null);

function readInitialLanguage(explicitLanguage) {
  if (explicitLanguage !== undefined) return normalizeLanguage(explicitLanguage);
  if (typeof window === 'undefined') return 'uk';
  return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

export function I18nProvider({ children, initialLanguage }) {
  const [language, setLanguageState] = useState(() => readInitialLanguage(initialLanguage));
  const setLanguage = useCallback((value) => setLanguageState(normalizeLanguage(value)), []);
  const locale = getLocaleTag(language);
  const t = useMemo(() => createTranslator(language), [language]);

  useLayoutEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = language;
    if (typeof window !== 'undefined') window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    locale,
    t,
    formatNumber: (number, options) => new Intl.NumberFormat(locale, options).format(number),
    formatDate: (date, options) => new Intl.DateTimeFormat(locale, options).format(date),
  }), [language, locale, setLanguage, t]);

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
```

- [ ] **Step 4: Move App language ownership into the provider**

In `src/main.jsx`:

```jsx
import { I18nProvider, useI18n } from './i18nProvider.mjs';

function App() {
  const { language, setLanguage } = useI18n();
  // keep the rest of App state and behavior unchanged
}

createRoot(document.getElementById('root')).render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
```

Delete the local `useState` declaration for `language` and its local-storage `useEffect`. Keep the legacy `applyInterfaceLanguage` effect temporarily; Task 9 removes it only after every surface has migrated.

- [ ] **Step 5: Add the provider command and verify**

Add to `package.json`:

```json
"test:i18n-provider": "node scripts/test-i18n-provider.mjs"
```

Run:

```powershell
npm.cmd run test:i18n-core
npm.cmd run test:i18n-provider
npm.cmd run build
```

Expected: both test messages pass and Vite exits 0.

- [ ] **Step 6: Commit provider files and only the provider integration hunks**

```powershell
git add package.json src/i18nProvider.mjs scripts/test-i18n-provider.mjs src/locales/uk.mjs src/locales/en.mjs
git add -p src/main.jsx
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: move language state into i18n provider"
```

### Task 3: Public pages, authentication, navigation, tours, and Home

**Files:**
- Modify: `src/main.jsx:195-3461`
- Modify: `src/locales/uk.mjs`
- Modify: `src/locales/en.mjs`
- Create: `scripts/test-i18n-component-coverage.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `useI18n()` and semantic catalog keys
- Produces: render-time localized public/auth/shell/Home components
- Produces: `data-i18n-content` markers on workspace names, handles, user email, and imported Brand Scan previews

- [ ] **Step 1: Write the failing component-coverage test**

Create `scripts/test-i18n-component-coverage.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/main.jsx', 'utf8');
const functions = [...source.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)];

function functionSource(name) {
  const index = functions.findIndex((entry) => entry[1] === name);
  assert.notEqual(index, -1, `Missing component: ${name}`);
  const start = functions[index].index;
  const end = functions[index + 1]?.index ?? source.length;
  return source.slice(start, end);
}

const renderTimeLocalized = [
  'JerykLoading',
  'PublicLegalPage',
  'MobilePreviewFrame',
  'ProductTour',
  'LegacyProductTour',
  'BrandScanGate',
  'AuthGate',
  'Sidebar',
  'CleanSidebar',
  'Topbar',
  'MarketFilter',
  'WorkflowRail',
  'StudioEmptyState',
  'HomeDashboard',
  'ProductRoadmap',
  'TikTokSignalsDemo',
];

for (const name of renderTimeLocalized) {
  const body = functionSource(name);
  assert.match(body, /\buseI18n\(\)/, `${name} must use render-time localization`);
}

const forbiddenDirectUi = [
  /notify\(\s*['"`]([^'"`]*[А-Яа-яІіЇїЄєҐґ][^'"`]*)['"`]\s*\)/,
  /(?:placeholder|title|aria-label)="[^"]*[А-Яа-яІіЇїЄєҐґ][^"]*"/,
  /<PageTitle[^>]+(?:title|subtitle)="[^"]*[А-Яа-яІіЇїЄєҐґ][^"]*"/,
];
for (const name of renderTimeLocalized) {
  const body = functionSource(name);
  for (const pattern of forbiddenDirectUi) {
    assert.doesNotMatch(body, pattern, `${name} still contains direct interface literal: ${pattern}`);
  }
}

console.log('i18n component coverage tests passed');
```

- [ ] **Step 2: Run coverage and verify red**

Run: `node scripts/test-i18n-component-coverage.mjs`

Expected: FAIL first on `JerykLoading must use render-time localization` and then on direct UI literal patterns as migration progresses.

- [ ] **Step 3: Add exact catalog namespaces for these surfaces**

Add matching keys to both locale files under these prefixes:

```js
// public.*: legal page titles/body/actions and data-deletion form states
// auth.*: Brand Scan, Google, email, Instagram, demo, privacy, validation, and errors
// tour.*: every ProductTour and LegacyProductTour title, body, progress label, skip/back/next/done button
// nav.*: sidebar labels, account menu, workspace controls, logout, mobile close, topbar actions
// home.*: dashboard, workflow rail, roadmap, demo, playbook, and strategy copy
// theme.*: light, dark, automatic mode titles
```

Use named parameters for all dynamic values. For example:

```js
// uk.mjs
'nav.switchedWorkspace': 'Перемкнено на {workspace}',
'tour.stepProgress': 'Крок {current} з {total}',

// en.mjs
'nav.switchedWorkspace': 'Switched to {workspace}',
'tour.stepProgress': 'Step {current} of {total}',
```

Before leaving this step, migrate the current working-tree-only Brand Scan phrases from `src/i18n.js` to these exact semantic keys in both catalogs:

```text
auth.brandScan.addBusiness
auth.brandScan.addSources
auth.brandScan.publicContext
auth.brandScan.examplePlaceholder
auth.brandScan.instagramHint
auth.brandScan.tiktokHint
auth.brandScan.youtubeHint
auth.brandScan.startingBusinessHint
settings.sources.noConnectedSources
```

- [ ] **Step 4: Convert each listed component to `useI18n()`**

Use this exact render pattern and remove local bilingual copy objects after their keys are in the catalogs:

```jsx
function Topbar({ themeMode, setThemeMode, setPage, page, onOpenMenu, onCloseMenu }) {
  const { language, setLanguage, t } = useI18n();
  const ctaTarget = page === 'settings' ? 'home' : 'plan';
  const ctaLabel = t(page === 'settings' ? 'nav.backToHub' : 'nav.generatePlan');
  // existing handlers and markup stay unchanged
}
```

Apply the same pattern to every component in `renderTimeLocalized`. Pass translated strings into Shepherd tour configuration when the tour is constructed, and include `t` in the relevant effect dependency list. Wrap dynamic user/workspace/scan values in elements carrying `data-i18n-content`, for example:

```jsx
<strong data-i18n-content>{activeWorkspace?.name || accountName}</strong>
<span data-i18n-content>{currentUser?.email}</span>
```

- [ ] **Step 5: Add the package command and run green checks**

Add:

```json
"test:i18n-components": "node scripts/test-i18n-component-coverage.mjs"
```

Run:

```powershell
npm.cmd run test:i18n-core
npm.cmd run test:i18n-provider
npm.cmd run test:i18n-components
npm.cmd run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the catalog, test, and selected component hunks**

```powershell
git add package.json scripts/test-i18n-component-coverage.mjs src/locales/uk.mjs src/locales/en.mjs
git add -p src/main.jsx
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: localize public shell and home at render time"
```

### Task 4: Signals and automatic discovery localization

**Files:**
- Modify: `src/signalsUiState.mjs`
- Modify: `src/youtubeCategories.mjs`
- Modify: `src/main.jsx:3462-4243`
- Modify: `src/locales/uk.mjs`
- Modify: `src/locales/en.mjs`
- Modify: `scripts/test-signals-ui-state.mjs`
- Modify: `scripts/test-youtube-categories.mjs`
- Modify: `scripts/test-i18n-component-coverage.mjs`

**Interfaces:**
- Produces: `deriveDiscoveryRunNotice({ ..., language })`
- Produces: `deriveDiscoveryToolbarStatus(discovery, { language })`
- Produces: `deriveDiscoveryRunNowLabel(discovery, { busy, language })`
- Produces: `deriveSignalsEmptyState({ ..., language })`
- Produces: categories shaped as `{ id, labelKey, categoryId }`

- [ ] **Step 1: Extend Signals tests for English output**

Append to `scripts/test-signals-ui-state.mjs`:

```js
const englishToolbar = deriveDiscoveryToolbarStatus(null, { language: 'en' });
assert.equal(englishToolbar.label, 'Loading');
assert.equal(englishToolbar.detail, 'Loading automation status for Signals.');

const englishEmpty = deriveSignalsEmptyState({
  reelsCount: 0,
  filteredReelsCount: 0,
  hasActiveFilters: false,
  automationEnabled: true,
  canRunAutomation: true,
  language: 'en',
});
assert.equal(englishEmpty.title, 'Automatic discovery has not filled the signal bank yet');
assert.equal(englishEmpty.primaryAction.label, 'Run now');
assert.equal(englishEmpty.secondaryAction.label, 'Advanced import');

const englishNotice = deriveDiscoveryRunNotice({
  run: { status: 'completed', acceptedCount: 2, updatedCount: 1 },
  language: 'en',
});
assert.match(englishNotice.message, /2 signals/);
assert.doesNotMatch(englishNotice.message, /[А-Яа-яІіЇїЄєҐґ]/);

assert.equal(deriveDiscoveryRunNowLabel(null, { language: 'en' }), 'Run now');
```

Update `scripts/test-youtube-categories.mjs` to assert:

```js
assert.deepEqual(YOUTUBE_POPULAR_CATEGORIES[0], {
  id: 'all',
  labelKey: 'signals.youtube.category.all',
  categoryId: '',
});
assert.equal(YOUTUBE_POPULAR_CATEGORIES.every((item) => item.labelKey.startsWith('signals.youtube.category.')), true);
```

- [ ] **Step 2: Run focused tests and verify red**

Run:

```powershell
node scripts/test-signals-ui-state.mjs
npm.cmd run test:youtube-categories
```

Expected: FAIL because helpers ignore `language` and categories still expose Ukrainian `label` values.

- [ ] **Step 3: Localize helper output at the source**

Import `createTranslator` and `getLocaleTag` into `signalsUiState.mjs`. At every exported UI-producing function, create `const t = createTranslator(language)` and replace embedded UI sentences with semantic keys under:

```text
signals.discovery.status.*
signals.discovery.notice.*
signals.discovery.error.*
signals.discovery.lane.*
signals.empty.*
signals.actions.*
```

Change timestamp formatting to:

```js
function formatDiscoveryTimestamp(value, language = 'uk') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(getLocaleTag(language), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date).replace(',', '');
}
```

Do not expose provider error text directly. Map configured, budget, worker, provider, and unknown cases to localized keys.

- [ ] **Step 4: Convert category labels to semantic keys**

Change each entry in `src/youtubeCategories.mjs` from `label` to `labelKey`. Add matching `signals.youtube.category.*` keys for all 13 categories in both catalogs. In `ViralBank`, render `t(category.labelKey)`.

- [ ] **Step 5: Localize the complete Signals component group**

Add `useI18n()` to and catalog coverage for:

```text
ViralBank
ApifySignalImportModal
BusinessPlaybooks
StrategyBrain
ReelsTable
SignalsReelsTable
Competitors
```

Pass `language` into every Signals helper call. Translate PageTitle copy, automation labels, metrics, search/filter options, source tabs, YouTube panel, import modal, table headers, previews, empty/error/loading states, actions, notifications, placeholders, titles, and ARIA labels. Mark reel titles, author names, imported captions, descriptions, URLs, source metadata, and external statistics containers with `data-i18n-content`.

- [ ] **Step 6: Run Signals and catalog verification**

```powershell
node scripts/test-signals-ui-state.mjs
npm.cmd run test:youtube-categories
npm.cmd run test:i18n-core
npm.cmd run test:i18n-components
node scripts/test-automatic-discovery-regressions.mjs
npm.cmd run build
```

Expected: every command exits 0; English helper assertions contain no Cyrillic.

- [ ] **Step 7: Commit Signals localization hunks**

```powershell
git add src/signalsUiState.mjs src/youtubeCategories.mjs src/locales/uk.mjs src/locales/en.mjs scripts/test-signals-ui-state.mjs scripts/test-youtube-categories.mjs scripts/test-i18n-component-coverage.mjs
git add -p src/main.jsx
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: localize signals and discovery states"
```

### Task 5: Studio, Assistant, Brand Brain, and pipeline localization

**Files:**
- Modify: `src/main.jsx:4244-5952`
- Modify: `src/locales/uk.mjs`
- Modify: `src/locales/en.mjs`
- Modify: `scripts/test-i18n-component-coverage.mjs`

**Interfaces:**
- Consumes: `useI18n()` and `data-i18n-content`
- Produces: render-time localized Studio and assistant system UI
- Preserves: source-language transcripts, scripts, generated remix output, brand data, and assistant-generated content

- [ ] **Step 1: Extend the coverage manifest and verify red**

Add these names to `renderTimeLocalized` in `scripts/test-i18n-component-coverage.mjs`:

```js
'AssistantDrawer',
'BrandScanStudioPanel',
'RemixStudio',
'IdeasBoard',
'AgentPipeline',
'BrandBrain',
'VideoTaskQueue',
'CreatorAssistant',
```

Run: `npm.cmd run test:i18n-components`

Expected: FAIL first on `AssistantDrawer must use render-time localization` or the first component not yet migrated.

- [ ] **Step 2: Add matching Studio and Assistant catalog keys**

Populate both catalogs under:

```text
assistant.drawer.*
assistant.creator.*
assistant.actions.*
assistant.pipeline.*
studio.empty.*
studio.brandScan.*
studio.remix.*
studio.videoTask.*
studio.ideas.*
brandBrain.*
```

Use named parameters for counts, source titles, quality labels, timestamps, and error fallbacks. Keep generated script labels separate from generated script values.

- [ ] **Step 3: Replace bilingual objects and hardcoded UI with `t()`**

Add `const { language, t, formatNumber } = useI18n()` to every listed component. Remove `drawerCopy`, `pipelineCopy`, and local `language === 'en'` UI objects after their values exist in catalogs. Preserve existing API payloads and generation language parameters.

Translate interface labels including loading copy, tabs, buttons, field labels, status chips, copy/save feedback, generation progress, empty states, and errors. Mark these as content:

```jsx
<div data-i18n-content>{message.text}</div>
<div data-i18n-content>{effectiveScenario.hook}</div>
<div data-i18n-content>{step.actionDescription}</div>
<div data-i18n-content>{brandBrainValue}</div>
```

Do not mark surrounding buttons, headings, field labels, or status text as content.

- [ ] **Step 4: Verify both locales and existing focused behavior**

```powershell
npm.cmd run test:i18n-core
npm.cmd run test:i18n-components
npm.cmd run test:brand-brain
node scripts/test-remix-auto-generation.mjs
node scripts/test-remix-quality.mjs
npm.cmd run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit only Studio/Assistant localization hunks**

```powershell
git add src/locales/uk.mjs src/locales/en.mjs scripts/test-i18n-component-coverage.mjs
git add -p src/main.jsx
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: localize studio and assistant interfaces"
```

### Task 6: Content plan, Settings, billing, and all remaining product surfaces

**Files:**
- Modify: `src/main.jsx:5953-end`
- Modify: `src/locales/uk.mjs`
- Modify: `src/locales/en.mjs`
- Modify: `scripts/test-i18n-component-coverage.mjs`
- Modify: `scripts/test-content-plan-utils.mjs`
- Modify: `src/contentPlanUtils.mjs`

**Interfaces:**
- Produces: full render-time localization coverage for every remaining UI component
- Preserves: calendar post titles/bodies, notes, saved scenarios, plan names, account data, source data, and billing identifiers as content
- Produces: optional `language` parameter for UI-owned fallback labels created by `contentPlanUtils.mjs`

- [ ] **Step 1: Expand the component manifest and content-plan tests**

Add to `renderTimeLocalized`:

```js
'LaunchRoadmap',
'ContentPlan',
'Analytics',
'SalesDirect',
'AnalysisSetup',
'BillingSettings',
'DataSources',
'LegalSafe',
'BudgetCalculator',
'TeamHub',
'QuickModal',
'ManualReelModal',
```

Append English fallback assertions to `scripts/test-content-plan-utils.mjs` using the existing exported builders:

```js
const englishCalendarReel = buildReelForCalendarPost({
  id: 'post_en',
  title: '',
  body: '',
  format: 'Reels',
}, [], { language: 'en' });
assert.equal(englishCalendarReel.title, 'Content plan draft');
assert.match(englishCalendarReel.quality, /Content plan/);
assert.doesNotMatch(englishCalendarReel.quality, /[А-Яа-яІіЇїЄєҐґ]/);
```

- [ ] **Step 2: Run focused checks and verify red**

```powershell
npm.cmd run test:i18n-components
node scripts/test-content-plan-utils.mjs
```

Expected: component coverage and new English fallback assertions fail.

- [ ] **Step 3: Add remaining catalog namespaces**

Populate both catalogs under:

```text
launch.*
plan.*
analytics.*
sales.*
analysisSetup.*
settings.sources.*
settings.profile.*
settings.billing.*
settings.account.*
legalSafe.*
budget.*
team.*
modal.*
shared.pageTitle.*
```

Include calendar month/day labels, editor fields, drag/drop feedback, notes, billing state, checkout instructions, source cards, profile import, legal templates, budget rows, team tasks, shared modal actions, placeholders, titles, and ARIA labels.

- [ ] **Step 4: Make content-plan fallback creation locale-aware**

Add a final options argument to the affected exported builders:

```js
export function buildReelForCalendarPost(post, reels = [], { language = 'uk' } = {}) {
  const t = createTranslator(language);
  // preserve source post values; use t(...) only for UI-owned fallbacks and labels
}
```

Use semantic keys for `Content plan draft`, saved-scenario labels, block labels, quality, and insight fallbacks. Do not translate `post.title`, `post.body`, note content, or saved scenario fields.

- [ ] **Step 5: Migrate every remaining component**

Add `useI18n()` to each component in the expanded manifest. Translate all interface-owned text and notifications. Pass `{ language }` into content-plan helper calls. Mark calendar post bodies/titles, notes, plan data, workspace/source fields, and account fields with `data-i18n-content`.

Remove all remaining component-local bilingual copy maps. When a component is unreachable from the current MVP router, migrate it anyway so re-enabling it cannot reintroduce mixed-language UI.

- [ ] **Step 6: Run full component and affected regression verification**

```powershell
npm.cmd run test:i18n-core
npm.cmd run test:i18n-components
node scripts/test-content-plan-utils.mjs
node scripts/test-content-plan-post-body.cjs
npm.cmd run build
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit only remaining-surface localization hunks**

```powershell
git add src/locales/uk.mjs src/locales/en.mjs scripts/test-i18n-component-coverage.mjs scripts/test-content-plan-utils.mjs
git add -p src/contentPlanUtils.mjs src/main.jsx
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: localize content plan and settings surfaces"
```

### Task 7: Safe localized API and system error mapping

**Files:**
- Create: `src/interfaceErrors.mjs`
- Create: `scripts/test-interface-errors.mjs`
- Modify: `src/main.jsx:158-192 and API error call sites`
- Modify: `src/locales/uk.mjs`
- Modify: `src/locales/en.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `extractInterfaceErrorCode(value, fallbackCode): string`
- Produces: `localizeInterfaceError(value, t, fallbackKey, parameters?): string`
- Produces: stable code-to-key mapping; raw server messages never reach UI

- [ ] **Step 1: Write the failing error-mapping test**

Create `scripts/test-interface-errors.mjs`:

```js
import assert from 'node:assert/strict';
import { createTranslator } from '../src/i18nCore.mjs';
import { extractInterfaceErrorCode, localizeInterfaceError } from '../src/interfaceErrors.mjs';

const enT = createTranslator('en');
const ukT = createTranslator('uk');

assert.equal(extractInterfaceErrorCode({ error: 'plan_limit_reached' }), 'plan_limit_reached');
assert.equal(extractInterfaceErrorCode(new Error('youtube_popular_failed')), 'youtube_popular_failed');
assert.equal(extractInterfaceErrorCode({ message: 'SQL connection refused' }, 'unknown_error'), 'unknown_error');
assert.equal(localizeInterfaceError('youtube_popular_failed', enT), 'Could not load popular YouTube videos.');
assert.equal(localizeInterfaceError('youtube_popular_failed', ukT), 'Не вдалося завантажити популярні відео YouTube.');
assert.equal(localizeInterfaceError('SQL connection refused', enT), 'Something went wrong. Try again.');
assert.doesNotMatch(localizeInterfaceError('SQL connection refused', enT), /SQL|connection refused/);

console.log('interface error tests passed');
```

- [ ] **Step 2: Run and verify red**

Run: `node scripts/test-interface-errors.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/interfaceErrors.mjs`.

- [ ] **Step 3: Implement the whitelist mapping**

Create `src/interfaceErrors.mjs`:

```js
const CODE_TO_KEY = Object.freeze({
  plan_limit_reached: 'errors.planLimit',
  content_plan_save_failed: 'errors.contentPlanSave',
  brand_brain_save_failed: 'errors.brandBrainSave',
  auto_import_failed: 'errors.signalImport',
  youtube_popular_failed: 'errors.youtubePopular',
  apify_import_failed: 'errors.apifyImport',
  signal_discovery_status_failed: 'errors.discoveryStatus',
  signal_discovery_toggle_failed: 'errors.discoveryToggle',
  automatic_discovery_running: 'errors.discoveryRunning',
  automatic_budget_reached: 'errors.discoveryBudget',
  automatic_discovery_run_failed: 'errors.discoveryRun',
  remix_generation_failed: 'errors.remixGeneration',
  agent_error: 'errors.assistant',
  video_jobs_failed: 'errors.videoJobs',
  video_job_failed: 'errors.videoJob',
  idea_save_failed: 'errors.ideaSave',
  select_plan_failed: 'errors.selectPlan',
  meta_not_configured: 'errors.instagramNotConfigured',
  demo_error: 'errors.demoLogin',
  email_auth_failed: 'errors.emailLogin',
  request_failed: 'errors.generic',
  unknown_error: 'errors.generic',
});

export function extractInterfaceErrorCode(value, fallbackCode = 'unknown_error') {
  const candidates = [value?.error, value?.code, value instanceof Error ? value.message : value];
  const code = candidates.find((candidate) => typeof candidate === 'string' && Object.hasOwn(CODE_TO_KEY, candidate));
  return code || fallbackCode;
}

export function localizeInterfaceError(value, t, fallbackKey = 'errors.generic', parameters) {
  const code = extractInterfaceErrorCode(value);
  return t(CODE_TO_KEY[code] || fallbackKey, parameters);
}
```

Add matching `errors.*` keys to both catalogs, including every code in `CODE_TO_KEY`.

- [ ] **Step 4: Change API parsing to return codes, not raw messages**

Refactor `readApiError` in `src/main.jsx` so it returns the first whitelisted `payload.error` or `payload.code`, otherwise the supplied stable fallback code. At each catch/notify boundary, call `localizeInterfaceError(error, t, surfaceFallbackKey)`. Replace string interpolation of `error.message` in user-facing notifications with localized generic/surface-specific messages.

Keep `console.error` development diagnostics if already present, but do not add raw messages to UI. Preserve structured plan-limit parameters by passing `{ limit, used, remaining }` to the catalog key.

- [ ] **Step 5: Add command and run verification**

Add:

```json
"test:i18n-errors": "node scripts/test-interface-errors.mjs"
```

Run:

```powershell
npm.cmd run test:i18n-errors
npm.cmd run test:i18n-core
npm.cmd run test:i18n-components
npm.cmd run build
```

Expected: all commands exit 0 and error tests confirm no raw internal detail leaks.

- [ ] **Step 6: Commit error localization hunks**

```powershell
git add package.json src/interfaceErrors.mjs scripts/test-interface-errors.mjs src/locales/uk.mjs src/locales/en.mjs
git add -p src/main.jsx
git diff --cached --check
git diff --cached --name-only
git commit -m "fix: localize system errors by stable code"
```

### Task 8: Whole-source localization audit and removal of legacy DOM translation

**Files:**
- Rewrite: `scripts/check-i18n-language.mjs`
- Modify: `src/main.jsx:1-65,541-543`
- Delete: `src/i18n.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm.cmd run check:i18n-language` as the authoritative static regression gate
- Removes: `applyInterfaceLanguage`, DOM text walking, timers, and mutation observers

- [ ] **Step 1: Replace the weak audit with failing architectural checks**

Rewrite `scripts/check-i18n-language.mjs` to include:

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { assertCatalogParity } from '../src/i18nCore.mjs';

assert.equal(assertCatalogParity(), true);

const main = readFileSync('src/main.jsx', 'utf8');
const legacyPath = 'src/i18n.js';
const forbiddenArchitecture = [
  'applyInterfaceLanguage',
  'MutationObserver',
  'createTreeWalker',
  'SHOW_TEXT',
  'translateDocumentText',
  'englishMutationTimer',
];

for (const fragment of forbiddenArchitecture) {
  assert.equal(main.includes(fragment), false, `Legacy localization remains in main.jsx: ${fragment}`);
}

for (const pattern of [
  /language\s*===\s*['"]en['"]\s*\?\s*['"`]/,
  /notify\(\s*['"`][^'"`]*[А-Яа-яІіЇїЄєҐґ]/,
  /(?:placeholder|title|aria-label)="[^"]*[А-Яа-яІіЇїЄєҐґ]/,
  /<PageTitle[^>]+(?:title|subtitle)="[^"]*[А-Яа-яІіЇїЄєҐґ]/,
]) {
  assert.doesNotMatch(main, pattern, `Unlocalized interface pattern remains: ${pattern}`);
}

assert.equal(readFileSync('src/i18nProvider.mjs', 'utf8').includes('MutationObserver'), false);
assert.equal(existsSync(legacyPath), false, `${legacyPath} must be removed after catalog migration`);

console.log('i18n language audit passed');
```

- [ ] **Step 2: Run the static audit and verify red**

Run: `npm.cmd run check:i18n-language`

Expected: FAIL on `applyInterfaceLanguage`, `MutationObserver`, or existence of `src/i18n.js`.

- [ ] **Step 3: Prove the working-tree-only legacy translations were migrated**

Run: `git diff HEAD -- src/i18n.js`

For each added phrase in that diff, locate the semantic replacement in `src/locales/uk.mjs` and `src/locales/en.mjs`. The required keys are the nine `auth.brandScan.*` / `settings.sources.*` keys listed in Task 3. Do not delete the legacy file until all nine pairs exist and `test:i18n-core` passes.

- [ ] **Step 4: Remove post-render localization completely**

Delete:

- the `applyInterfaceLanguage` import from `src/main.jsx`
- the 0/80/250 ms localization effect
- every import or caller of the legacy translator
- `src/i18n.js` in full

Keep only the provider's `useLayoutEffect` for `document.documentElement.lang` and local-storage persistence. It must never inspect or mutate text nodes.

- [ ] **Step 5: Run the complete static gate**

```powershell
npm.cmd run test:i18n-core
npm.cmd run test:i18n-provider
npm.cmd run test:i18n-components
npm.cmd run test:i18n-errors
npm.cmd run check:i18n-language
npm.cmd run build
```

Expected: all commands exit 0 and the audit prints `i18n language audit passed`.

- [ ] **Step 6: Commit legacy removal without staging unrelated old hunks**

```powershell
git add scripts/check-i18n-language.mjs src/i18n.js
git add -p src/main.jsx
git diff --cached --check
git diff --cached --name-only
git commit -m "fix: remove delayed DOM translation pipeline"
```

### Task 9: Rendered whole-site English audit and no-flash regression

**Files:**
- Create: `scripts/test-i18n-rendered.js`
- Modify: `package.json`
- Modify: `src/main.jsx` only for missing `data-i18n-content` markers or deterministic selectors exposed by the failing audit

**Interfaces:**
- Produces: `npm.cmd run test:i18n-rendered`
- Verifies: visible text, placeholder/title/ARIA copy, content boundary, and language-switch mutation behavior

- [ ] **Step 1: Create the rendered audit**

Create `scripts/test-i18n-rendered.js` with these exact behaviors:

```js
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5174/';
const CYRILLIC = /[А-Яа-яІіЇїЄєҐґ]/;

async function unexpectedInterfaceCopy(page) {
  return page.evaluate(() => {
    const cyrillic = /[А-Яа-яІіЇїЄєҐґ]/;
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const issues = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      const value = node.nodeValue.trim();
      if (!parent || !value || !visible(parent) || parent.closest('[data-i18n-content]')) continue;
      if (cyrillic.test(value)) issues.push({ kind: 'text', value, tag: parent.tagName, className: parent.className });
    }
    for (const element of document.querySelectorAll('[placeholder], [title], [aria-label]')) {
      if (!visible(element) || element.closest('[data-i18n-content]')) continue;
      for (const attribute of ['placeholder', 'title', 'aria-label']) {
        const value = element.getAttribute(attribute) || '';
        if (cyrillic.test(value)) issues.push({ kind: attribute, value, tag: element.tagName, className: element.className });
      }
    }
    return issues;
  });
}

async function assertEnglishSurface(page, label) {
  await page.waitForTimeout(30);
  const issues = await unexpectedInterfaceCopy(page);
  assert.deepEqual(issues, [], `${label} contains untranslated UI: ${JSON.stringify(issues, null, 2)}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.addInitScript(() => localStorage.setItem('insta-producer-language', 'en'));
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    if (!(await page.locator('.shell').count())) {
      await page.getByRole('button', { name: /view demo|start with demo/i }).first().click();
      await page.waitForSelector('.shell', { timeout: 15000 });
    }

    await assertEnglishSurface(page, 'Home');
    for (const [selector, label] of [
      ['[data-tour="sidebar-transcript"]', 'Signals'],
      ['[data-tour="sidebar-remix"]', 'Studio'],
      ['[data-tour="sidebar-calendar"]', 'Content plan'],
      ['[data-tour="sidebar-settings"]', 'Settings'],
    ]) {
      await page.locator(selector).click();
      await page.waitForTimeout(50);
      await assertEnglishSurface(page, label);
    }

    const settingsTabs = page.locator('.page > .tabs button');
    for (let index = 0; index < await settingsTabs.count(); index += 1) {
      await settingsTabs.nth(index).click();
      await page.waitForTimeout(30);
      await assertEnglishSurface(page, `Settings tab ${index + 1}`);
    }

    const assistantButton = page.locator('.assistant-fab, [data-tour="assistant-open"]').first();
    if (await assistantButton.count()) {
      await assistantButton.click();
      await assertEnglishSurface(page, 'Assistant');
    }

    await page.locator('.language-switch button', { hasText: 'UK' }).first().click();
    await page.waitForTimeout(30);
    assert.equal(await page.locator('html').getAttribute('lang'), 'uk');
    assert.match(await page.locator('[data-tour="sidebar-home"]').innerText(), /Головна/);
    const captured = await page.evaluate(() => {
      window.__englishSwitchCyrillic = [];
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          const nodes = record.type === 'characterData' ? [record.target] : [...record.addedNodes];
          for (const node of nodes) {
            const text = node.textContent || '';
            const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : node.parentElement;
            if (/[А-Яа-яІіЇїЄєҐґ]/.test(text) && !parent?.closest?.('[data-i18n-content]')) {
              window.__englishSwitchCyrillic.push(text.trim());
            }
          }
        }
      });
      observer.observe(document.getElementById('root'), { childList: true, characterData: true, subtree: true });
      window.__englishSwitchObserver = observer;
      return true;
    });
    assert.equal(captured, true);
    await page.locator('.language-switch button', { hasText: 'EN' }).first().click();
    await page.waitForTimeout(300);
    const switchedCyrillic = await page.evaluate(() => {
      window.__englishSwitchObserver.disconnect();
      return window.__englishSwitchCyrillic;
    });
    assert.deepEqual(switchedCyrillic, [], `English switch rendered transient Cyrillic: ${switchedCyrillic.join(' | ')}`);
    await assertEnglishSurface(page, 'English language switch');

    console.log('rendered i18n audit passed');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Add the command and run against the current local app**

Add:

```json
"test:i18n-rendered": "node scripts/test-i18n-rendered.js"
```

Start backend and frontend in separate hidden/local processes if they are not already running:

```powershell
npm.cmd run dev:backend
npm.cmd run dev -- --port 5174
```

Run: `npm.cmd run test:i18n-rendered`

Expected red state: FAIL with a precise surface and untranslated UI entry or a missing deterministic selector.

- [ ] **Step 3: Fix every reported interface issue at its source**

For each failure:

- add matching semantic keys to both catalogs
- replace the interface literal with `t(key, params)`
- add `data-i18n-content` only when the value is genuinely user/imported/generated content
- add a stable selector only when the audit cannot reach an existing control reliably

Re-run the audit after each surface until the full list passes. Never suppress an interface string with `data-i18n-content`.

- [ ] **Step 4: Run green rendered and static verification**

```powershell
npm.cmd run test:i18n-rendered
npm.cmd run check:i18n-language
npm.cmd run test:i18n-core
npm.cmd run test:i18n-components
npm.cmd run build
```

Expected: rendered audit prints `rendered i18n audit passed`; every command exits 0.

- [ ] **Step 5: Commit the rendered audit and final source fixes**

```powershell
git add package.json scripts/test-i18n-rendered.js src/locales/uk.mjs src/locales/en.mjs
git add -p src/main.jsx
git diff --cached --check
git diff --cached --name-only
git commit -m "test: audit every english interface surface"
```

### Task 10: Final regression matrix and requirement-by-requirement audit

**Files:**
- Verify only: all files changed by Tasks 1-9
- Update only if evidence exposes a gap: relevant locale, component, helper, or test file

**Interfaces:**
- Proves: all acceptance criteria in the design spec
- Produces: clean verification evidence without claiming ownership of pre-existing unrelated changes

- [ ] **Step 1: Re-read the design acceptance criteria and inspect the final diff**

Run:

```powershell
Get-Content -Raw docs\superpowers\specs\2026-07-14-complete-english-localization-design.md
git status --short
git diff --stat
git diff --check
git diff -- src/main.jsx src/signalsUiState.mjs src/youtubeCategories.mjs src/contentPlanUtils.mjs src/i18nProvider.mjs src/i18nCore.mjs src/locales scripts/check-i18n-language.mjs scripts/test-i18n-rendered.js
```

Expected: no whitespace errors; `backend/data/db.json` remains uncommitted; unrelated pre-existing changes are still present and not silently discarded.

- [ ] **Step 2: Run the complete localization matrix fresh**

```powershell
npm.cmd run test:i18n-core
npm.cmd run test:i18n-provider
npm.cmd run test:i18n-components
npm.cmd run test:i18n-errors
npm.cmd run check:i18n-language
node scripts/test-signals-ui-state.mjs
npm.cmd run test:youtube-categories
node scripts/test-content-plan-utils.mjs
npm.cmd run test:i18n-rendered
```

Expected: every command exits 0 with no failed assertions.

- [ ] **Step 3: Run affected regressions and production build fresh**

```powershell
node scripts/test-automatic-discovery-regressions.mjs
node scripts/test-remix-auto-generation.mjs
node scripts/test-remix-quality.mjs
npm.cmd run test:brand-brain
node scripts/test-content-plan-post-body.cjs
npm.cmd run build
```

Expected: every test exits 0 and Vite reports a successful production build.

- [ ] **Step 4: Prove the legacy pipeline is gone**

Run:

```powershell
rg -n "applyInterfaceLanguage|MutationObserver|createTreeWalker|translateDocumentText|englishMutationTimer|\[0, 80, 250\]" src scripts
```

Expected: no matches in production localization code; only intentional assertion strings inside the audit are allowed.

- [ ] **Step 5: Prove catalog and UI coverage**

Run:

```powershell
rg -n "language === 'en'|language === \"en\"" src/main.jsx src/signalsUiState.mjs src/contentPlanUtils.mjs
rg -n "notify\([^\r\n]*[А-Яа-яІіЇїЄєҐґ]|placeholder=\"[^\"]*[А-Яа-яІіЇїЄєҐґ]|aria-label=\"[^\"]*[А-Яа-яІіЇїЄєҐґ]" src/main.jsx
```

Expected: no direct bilingual UI branches and no direct Cyrillic interface notifications/attributes. Cyrillic content-generation logic outside interface modules is allowed by the design boundary.

- [ ] **Step 6: Commit any evidence-driven final correction, otherwise leave the tree unchanged**

If verification exposed a real localization gap, add a failing assertion first, fix only that gap, re-run the failed command and the complete localization matrix, then commit only those reviewed hunks:

```powershell
git add -p src/main.jsx src/signalsUiState.mjs src/contentPlanUtils.mjs src/locales/uk.mjs src/locales/en.mjs scripts/check-i18n-language.mjs scripts/test-i18n-rendered.js
git diff --cached --check
git diff --cached --name-only
git commit -m "fix: close final english localization gaps"
```

If all checks passed without a correction, do not create an empty commit.

---

## Completion Evidence Map

| Requirement | Authoritative evidence |
| --- | --- |
| No Ukrainian-to-English flash | `test:i18n-rendered` mutation capture during UK → EN switch |
| No timers/observer/text walker | `check:i18n-language` plus Task 10 `rg` audit |
| All reachable surfaces are English | Playwright surface loop and settings/assistant checks |
| Dynamic states and errors are English | Signals unit tests, interface error tests, rendered audit |
| Attributes are localized | Playwright placeholder/title/ARIA scan |
| Content remains unchanged | `data-i18n-content` boundary plus rendered audit exclusions limited to marked content |
| Ukrainian mode remains functional | provider/core tests, existing regressions, manual UK → EN switch path |
| Catalog parity | `assertCatalogParity()` in core and static audit |
| Production is buildable | fresh `npm.cmd run build` exit 0 |
| User changes are preserved | final status/diff inspection and exclusion of `backend/data/db.json` from commits |
