# Interface Settings and TikTok Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move authenticated language/theme controls into Settings, make Auto reliably light before 21:00, remove the sidebar Settings duplicate, and recover expired TikTok thumbnails.

**Architecture:** Extract pure theme preference rules from `src/main.jsx`, add an Interface Settings panel that owns the existing app-level state, and render signal posters through an error-aware image component. Add a small backend TikTok oEmbed service plus a workspace-scoped refresh route that updates the canonical source reel, including shared-bank projections.

**Tech Stack:** React 19, Vite 8, Express 5, Node.js built-in test assertions, Playwright 1.60, existing JSONB/local JSON state layer.

## Global Constraints

- Auto is light from `07:00:00` through `20:59:59` and dark from `21:00:00` through `06:59:59` in browser local time.
- A new versioned storage key resets ambiguous legacy theme state to Auto once.
- Compact Ukrainian language labels use `UA`, never `UK`.
- The authenticated top bar keeps its quick action and Settings gear; language/theme controls live in Settings.
- The authenticated sidebar has no Settings navigation row.
- Signed-out Brand Scan keeps language/theme controls because Settings is unavailable.
- TikTok recovery uses only the fixed official `https://www.tiktok.com/oembed` endpoint and validated TikTok video URLs.
- Thumbnail refresh consumes no AI, trial outcome, or paid discovery quota.
- Do not edit or commit `backend/data/db.json`.

---

## File structure

- Create `src/themePreferences.mjs`: pure schedule, storage migration, and mode-cycle rules.
- Create `src/components/SignalThumbnail.jsx`: one-attempt image recovery and stable fallback rendering.
- Create `backend/services/tiktokThumbnail.cjs`: TikTok URL validation and bounded oEmbed lookup.
- Create `scripts/test-theme-preferences.mjs`: pure theme regression tests.
- Create `scripts/test-tiktok-thumbnail-service.cjs`: pure backend service tests.
- Create `scripts/test-tiktok-thumbnail-api.mjs`: owned/shared workspace API and persistence tests.
- Modify `src/main.jsx`: wire extracted theme rules, Interface Settings, topbar/sidebar cleanup, and thumbnail refresh callback.
- Modify `src/styles.css`: Interface Settings controls and thumbnail image/fallback presentation.
- Modify `backend/server.js`: import the service and expose the authenticated refresh route.
- Modify `scripts/test-i18n-rendered.js`: use the new Settings location and `UA` label.
- Modify `scripts/test-signal-preview-ui.mjs`: prove failed TikTok images recover once and fall back safely.
- Modify `package.json`: add focused test commands.

### Task 1: Theme preference rules

**Files:**
- Create: `src/themePreferences.mjs`
- Create: `scripts/test-theme-preferences.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `THEME_MODE_KEY`, `getAutoTheme(date) -> 'light' | 'dark'`, `getInitialThemeMode(storage) -> 'auto' | 'light' | 'dark'`, `getNextThemeMode(mode)`, and `persistThemeMode(storage, mode)`.
- Consumes: a Web Storage-compatible object with `getItem`, `setItem`, and `removeItem`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test-theme-preferences.mjs
import assert from 'node:assert/strict';
import {
  THEME_MODE_KEY,
  getAutoTheme,
  getInitialThemeMode,
  getNextThemeMode,
  persistThemeMode,
} from '../src/themePreferences.mjs';

const memoryStorage = (entries = {}) => {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

assert.equal(getAutoTheme(new Date(2026, 6, 24, 18, 27)), 'light');
assert.equal(getAutoTheme(new Date(2026, 6, 24, 20, 59, 59)), 'light');
assert.equal(getAutoTheme(new Date(2026, 6, 24, 21, 0)), 'dark');
assert.equal(getAutoTheme(new Date(2026, 6, 25, 6, 59, 59)), 'dark');
assert.equal(getAutoTheme(new Date(2026, 6, 25, 7, 0)), 'light');

assert.equal(getInitialThemeMode(memoryStorage({
  'insta-producer-theme-mode-v1': 'dark',
  'insta-producer-theme-v2': 'dark',
})), 'auto');
assert.equal(getInitialThemeMode(memoryStorage({ [THEME_MODE_KEY]: 'dark' })), 'dark');
assert.equal(getInitialThemeMode(memoryStorage({ [THEME_MODE_KEY]: 'light' })), 'light');
assert.equal(getInitialThemeMode(memoryStorage({ [THEME_MODE_KEY]: 'auto' })), 'auto');

const storage = memoryStorage();
persistThemeMode(storage, 'light');
assert.equal(storage.getItem(THEME_MODE_KEY), 'light');
assert.equal(getNextThemeMode('auto'), 'dark');
assert.equal(getNextThemeMode('dark'), 'light');
assert.equal(getNextThemeMode('light'), 'auto');

console.log('theme preference tests passed');
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node scripts/test-theme-preferences.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/themePreferences.mjs`.

- [ ] **Step 3: Implement the pure theme module**

```js
// src/themePreferences.mjs
export const THEME_MODE_KEY = 'insta-producer-theme-mode-v2';
export const DAY_THEME_START_HOUR = 7;
export const NIGHT_THEME_START_HOUR = 21;

const VALID_MODES = new Set(['auto', 'dark', 'light']);

export function getAutoTheme(date = new Date()) {
  const hour = date.getHours();
  return hour >= NIGHT_THEME_START_HOUR || hour < DAY_THEME_START_HOUR ? 'dark' : 'light';
}

export function getInitialThemeMode(storage = globalThis.localStorage) {
  const savedMode = storage?.getItem?.(THEME_MODE_KEY);
  return VALID_MODES.has(savedMode) ? savedMode : 'auto';
}

export function persistThemeMode(storage, themeMode) {
  const normalized = VALID_MODES.has(themeMode) ? themeMode : 'auto';
  storage?.setItem?.(THEME_MODE_KEY, normalized);
  return normalized;
}

export function getNextThemeMode(themeMode) {
  if (themeMode === 'auto') return 'dark';
  if (themeMode === 'dark') return 'light';
  return 'auto';
}
```

Add to `package.json`:

```json
"test:theme-preferences": "node scripts/test-theme-preferences.mjs"
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `npm.cmd run test:theme-preferences`

Expected: exit 0 and `theme preference tests passed`.

- [ ] **Step 5: Commit**

```powershell
git add src/themePreferences.mjs scripts/test-theme-preferences.mjs package.json
git commit -m "test: define automatic theme preference rules"
```

### Task 2: Interface Settings and navigation cleanup

**Files:**
- Modify: `src/main.jsx:201-229, 442-452, 700-720, 1554-1613, 2475-2808, 3183-3368, 8306-8554`
- Modify: `src/styles.css` near existing `.language-switch`, Settings tab, and responsive rules
- Modify: `scripts/test-i18n-rendered.js:160-240`

**Interfaces:**
- Consumes: Task 1 exports from `src/themePreferences.mjs`.
- Produces: `InterfaceSettings({ language, setLanguage, themeMode, setThemeMode })`.

- [ ] **Step 1: Update rendered UI assertions before production code**

Before entering the demo on the signed-out Brand Scan screen, assert:

```js
assert.equal(await page.getByRole('button', { name: 'UA', exact: true }).count(), 1);
assert.equal(await page.getByRole('button', { name: 'UK', exact: true }).count(), 0);
```

Add assertions in `scripts/test-i18n-rendered.js` after authenticated shell load:

```js
assert.equal(
  await page.locator('.top-actions .language-switch').count(),
  0,
  'Authenticated topbar must not expose the language switch',
);
assert.equal(
  await page.locator('.top-actions button[title*="theme" i], .top-actions button[title*="тема" i]').count(),
  0,
  'Authenticated topbar must not expose the theme switch',
);
assert.equal(
  await page.locator('[data-tour="sidebar-settings"]').count(),
  0,
  'Settings must not be duplicated in sidebar navigation',
);
await page.locator('[data-tour="topbar-settings"]').click();
await page.getByRole('button', { name: /interface|інтерфейс/i }).click();
assert.equal(await page.locator('.interface-settings').count(), 1);
assert.equal(await page.getByRole('button', { name: 'UA', exact: true }).count(), 1);
assert.equal(await page.getByRole('button', { name: 'UK', exact: true }).count(), 0);
assert.equal(await page.getByRole('button', { name: /auto|авто/i }).count(), 1);
assert.equal(await page.getByRole('button', { name: /light|світла/i }).count(), 1);
assert.equal(await page.getByRole('button', { name: /dark|темна/i }).count(), 1);
await page.getByRole('button', { name: /dark|темна/i }).click();
assert.equal(await page.locator('.app').getAttribute('data-theme'), 'dark');
await page.getByRole('button', { name: /light|світла/i }).click();
assert.equal(await page.locator('.app').getAttribute('data-theme'), 'light');
await page.getByRole('button', { name: /auto|авто/i }).click();
assert.equal(
  await page.getByRole('button', { name: /auto|авто/i }).getAttribute('aria-pressed'),
  'true',
);
```

Replace existing language-switch navigation:

```js
await page.getByRole('button', { name: 'UA', exact: true }).click();
await page.waitForTimeout(50);
assert.equal(await page.locator('html').getAttribute('lang'), 'uk');
await page.locator('[data-tour="topbar-settings"]').click();
await page.getByRole('button', { name: /interface|інтерфейс/i }).click();
await page.getByRole('button', { name: 'EN', exact: true }).click();
```

- [ ] **Step 2: Run rendered UI test to verify RED**

Run: `npm.cmd run test:i18n-rendered`

Expected: FAIL because authenticated topbar controls still exist, sidebar Settings still exists, and Interface tab is absent.

- [ ] **Step 3: Wire the theme module and new storage key**

Import:

```js
import {
  getAutoTheme,
  getInitialThemeMode,
  getNextThemeMode,
  persistThemeMode,
} from './themePreferences.mjs';
```

Remove the old theme constants and local helper functions from `src/main.jsx`. Initialize state with:

```js
const [themeMode, setThemeMode] = useState(() => getInitialThemeMode(window.localStorage));
const [autoTheme, setAutoTheme] = useState(() => getAutoTheme());
const theme = themeMode === 'auto' ? autoTheme : themeMode;
```

Persist only the new mode:

```js
useEffect(() => {
  persistThemeMode(window.localStorage, themeMode);
}, [themeMode]);
```

Keep the existing minute-aligned Auto timer.

- [ ] **Step 4: Remove duplicate authenticated controls**

Change `Topbar` signature to:

```js
function Topbar({ language, setPage, page, agentStudioAvailable = false, navigationLocked = false, onOpenMenu, onCloseMenu }) {
```

Delete the authenticated `language-switch`, theme title calculation, and theme button. Keep:

```jsx
<button
  className={page === 'settings' ? 'icon active' : 'icon'}
  data-tour="topbar-settings"
  title={language === 'en' ? 'Settings' : 'Налаштування'}
  disabled={navigationLocked}
  onClick={() => { onCloseMenu?.(); setPage('settings'); }}
>
  <Settings size={16} />
</button>
```

Remove `settings` from `CleanSidebar` `tourTargets`, `labels`, and `primaryItems`. Remove the visible account-card button whose text is `Account, tariff and sources` / `Кабінет, тариф і джерела`, so the gear remains the only general Settings navigation control. Keep the workspace menu's explicit Connect Instagram action.

Change both signed-out compact labels from `UK` to `UA`.

- [ ] **Step 5: Add Interface Settings**

Pass app state into `DataSources`:

```jsx
<DataSources
  sources={data.sources}
  notify={notify}
  workspaceId={workspaceId}
  currentUser={currentUser}
  language={language}
  setLanguage={setLanguage}
  themeMode={themeMode}
  setThemeMode={setThemeMode}
  initialBrief={brandContext}
  onBrandSaved={(savedBrief) => handleBrandContextSaved(workspaceId, savedBrief)}
  brandEditSuggestion={brandEditSuggestion}
  onBrandEditSuggestionConsumed={consumeBrandEditSuggestion}
  onOpenRecommendedSignal={openRecommendedSignal}
  activeTab={sourcesTab}
  onTabChange={(nextTab) => {
    setSourcesTab(nextTab);
    window.localStorage.setItem(SOURCES_TAB_KEY, nextTab);
  }}
  onOpenBrandScan={(scan) => {
    setRemixDraft(buildReelFromBrandScan(scan));
    setMvpPage('remix');
    notify('Brand Scan відкрито в Студії');
  }}
/>
```

Extend its signature and tabs:

```js
function DataSources({ sources, notify, workspaceId, currentUser, onOpenBrandScan, initialBrief, onBrandSaved, brandEditSuggestion, onBrandEditSuggestionConsumed, onOpenRecommendedSignal, activeTab = 'sources', onTabChange, language = 'uk', setLanguage, themeMode = 'auto', setThemeMode }) {
  const settingsTabs = [
    ['interface', language === 'en' ? 'Interface' : 'Інтерфейс'],
    ['sources', language === 'en' ? 'Sources Hub' : 'Джерела'],
    ['profile', language === 'en' ? 'My Brands' : 'Мої бренди'],
    ['billing', language === 'en' ? 'Plan and limits' : 'Тариф і ліміти'],
    ['communications', language === 'en' ? 'Email preferences' : 'Листи та згоди'],
    ...(currentUser?.canManageTesters && !currentUser?.isDemo
      ? [['testers', language === 'en' ? 'Testers' : 'Тестери']]
      : []),
  ];
```

Render:

```jsx
{tab === 'interface' && (
  <section className="interface-settings">
    <article>
      <div>
        <small>{language === 'en' ? 'Language' : 'Мова'}</small>
        <h2>{language === 'en' ? 'Interface language' : 'Мова інтерфейсу'}</h2>
      </div>
      <div className="interface-choice" role="group" aria-label={language === 'en' ? 'Interface language' : 'Мова інтерфейсу'}>
        {['uk', 'en'].map((value) => (
          <button
            type="button"
            aria-pressed={language === value}
            className={language === value ? 'active' : ''}
            onClick={() => setLanguage?.(value)}
            key={value}
          >
            {value === 'uk' ? 'UA' : 'EN'}
          </button>
        ))}
      </div>
    </article>
    <article>
      <div>
        <small>{language === 'en' ? 'Appearance' : 'Вигляд'}</small>
        <h2>{language === 'en' ? 'Theme' : 'Тема'}</h2>
        <p>{language === 'en' ? 'Auto uses local time: dark after 21:00.' : 'Авто використовує локальний час: темна після 21:00.'}</p>
      </div>
      <div className="interface-choice" role="group" aria-label={language === 'en' ? 'Theme' : 'Тема'}>
        {['auto', 'light', 'dark'].map((value) => (
          <button
            type="button"
            aria-pressed={themeMode === value}
            className={themeMode === value ? 'active' : ''}
            onClick={() => setThemeMode?.(value)}
            key={value}
          >
            {language === 'en'
              ? ({ auto: 'Auto', light: 'Light', dark: 'Dark' })[value]
              : ({ auto: 'Авто', light: 'Світла', dark: 'Темна' })[value]}
          </button>
        ))}
      </div>
    </article>
  </section>
)}
```

Add CSS for a two-card responsive `.interface-settings` layout and reuse current selected-button colors.

- [ ] **Step 6: Run UI and theme tests**

Run:

```powershell
npm.cmd run test:theme-preferences
npm.cmd run test:i18n-rendered
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```powershell
git add src/main.jsx src/styles.css scripts/test-i18n-rendered.js
git commit -m "feat: move interface controls into settings"
```

### Task 3: TikTok oEmbed thumbnail service

**Files:**
- Create: `backend/services/tiktokThumbnail.cjs`
- Create: `scripts/test-tiktok-thumbnail-service.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeTikTokVideoUrl(value) -> string` and `fetchTikTokThumbnail(value, options) -> Promise<{ thumbnailUrl: string }>`; throws typed errors with `code` and `status`.
- Consumes: injected `fetcher`, defaulting to `globalThis.fetch`.

- [ ] **Step 1: Write failing service tests**

```js
// scripts/test-tiktok-thumbnail-service.cjs
const assert = require('node:assert/strict');
const {
  normalizeTikTokVideoUrl,
  fetchTikTokThumbnail,
} = require('../backend/services/tiktokThumbnail.cjs');

(async () => {
  assert.equal(
    normalizeTikTokVideoUrl('https://www.tiktok.com/@creator/video/1234567890?lang=en'),
    'https://www.tiktok.com/@creator/video/1234567890',
  );
  assert.equal(normalizeTikTokVideoUrl('https://example.com/@creator/video/123'), '');
  assert.equal(normalizeTikTokVideoUrl('https://www.tiktok.com/@creator'), '');

  const calls = [];
  const result = await fetchTikTokThumbnail(
    'https://www.tiktok.com/@creator/video/1234567890',
    {
      fetcher: async (url, options) => {
        calls.push({ url: String(url), options });
        return new Response(JSON.stringify({
          thumbnail_url: 'https://p16.muscdn.com/example-cover.jpeg',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  );
  assert.equal(result.thumbnailUrl, 'https://p16.muscdn.com/example-cover.jpeg');
  assert.match(calls[0].url, /^https:\/\/www\.tiktok\.com\/oembed\?/);
  assert.match(calls[0].url, /url=https%3A%2F%2Fwww\.tiktok\.com/);

  await assert.rejects(
    () => fetchTikTokThumbnail('https://example.com/video/123', { fetcher: async () => new Response() }),
    (error) => error.code === 'invalid_tiktok_video_url' && error.status === 400,
  );
  await assert.rejects(
    () => fetchTikTokThumbnail('https://www.tiktok.com/@creator/video/123', {
      fetcher: async () => new Response('{}', { status: 200 }),
    }),
    (error) => error.code === 'tiktok_thumbnail_unavailable' && error.status === 404,
  );

  console.log('TikTok thumbnail service tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run service test to verify RED**

Run: `node scripts/test-tiktok-thumbnail-service.cjs`

Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement bounded fixed-origin lookup**

Create `backend/services/tiktokThumbnail.cjs` with:

```js
'use strict';

const OFFICIAL_OEMBED_ORIGIN = 'https://www.tiktok.com/oembed';
const MAX_RESPONSE_BYTES = 100_000;

function createError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeTikTokVideoUrl(value = '') {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== 'https:') return '';
    if (!['www.tiktok.com', 'm.tiktok.com'].includes(url.hostname.toLowerCase())) return '';
    const match = url.pathname.match(/^\/@[^/]+\/video\/(\d+)\/?$/);
    if (!match) return '';
    return `https://www.tiktok.com${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return '';
  }
}

async function fetchTikTokThumbnail(value, {
  fetcher = globalThis.fetch,
  timeoutMs = 10_000,
  oEmbedOrigin = OFFICIAL_OEMBED_ORIGIN,
} = {}) {
  const videoUrl = normalizeTikTokVideoUrl(value);
  if (!videoUrl) throw createError('invalid_tiktok_video_url', 400);
  const endpoint = new URL(oEmbedOrigin);
  endpoint.searchParams.set('url', videoUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(endpoint, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; DzheroBot/0.1; +https://dzhero.com.ua)',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw createError('tiktok_thumbnail_unavailable', 404);
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw createError('tiktok_thumbnail_unavailable', 404);
    }
    const payload = JSON.parse(text);
    const thumbnail = new URL(String(payload.thumbnail_url || ''));
    if (thumbnail.protocol !== 'https:') throw createError('tiktok_thumbnail_unavailable', 404);
    return { thumbnailUrl: thumbnail.toString(), videoUrl };
  } catch (error) {
    if (error?.code) throw error;
    throw createError('tiktok_thumbnail_unavailable', 404);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { fetchTikTokThumbnail, normalizeTikTokVideoUrl };
```

Add:

```json
"test:tiktok-thumbnail-service": "node scripts/test-tiktok-thumbnail-service.cjs"
```

- [ ] **Step 4: Run service test to verify GREEN**

Run: `npm.cmd run test:tiktok-thumbnail-service`

Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add backend/services/tiktokThumbnail.cjs scripts/test-tiktok-thumbnail-service.cjs package.json
git commit -m "feat: resolve fresh TikTok thumbnails"
```

### Task 4: Authenticated thumbnail refresh API

**Files:**
- Modify: `backend/server.js:65-79, 2028-2040, 6677-6689`
- Create: `scripts/test-tiktok-thumbnail-api.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `fetchTikTokThumbnail(sourceUrl)` from Task 3 and existing `getAccessibleWorkspaceSignals`.
- Produces: `POST /api/workspaces/:workspaceId/reels/:reelId/thumbnail/refresh` returning `{ thumbnailUrl }`.

- [ ] **Step 1: Write the API integration test**

Create a temporary database with:

```js
reels: [{
  id: 'source_tiktok',
  workspaceId: 'ws_bank',
  sourceUrl: 'https://www.tiktok.com/@creator/video/1234567890',
  image: 'https://expired.example/cover.jpg',
  importedMetadata: {
    platform: 'tiktok',
    image: 'https://expired.example/cover.jpg',
  },
}]
```

Start `backend/server.js` with `NODE_ENV=test` and a test-only `TIKTOK_OEMBED_BASE_URL` pointing at a local HTTP fixture server. Production ignores this variable and always uses TikTok's official origin. The fixture returns:

```json
{"thumbnail_url":"https://p16.muscdn.com/fresh-cover.jpeg"}
```

Authenticate one owner workspace and one trial workspace configured to use `ws_bank` as the shared bank. Assert:

```js
assert.equal(owner.response.status, 200);
assert.equal(owner.body.thumbnailUrl, 'https://p16.muscdn.com/fresh-cover.jpeg');
assert.equal(shared.response.status, 200);
assert.equal(shared.body.thumbnailUrl, 'https://p16.muscdn.com/fresh-cover.jpeg');
assert.equal(nonTikTok.response.status, 400);
assert.equal(inaccessible.response.status, 404);

const persisted = JSON.parse(await readFile(dbPath, 'utf8'));
const source = persisted.reels.find((reel) => reel.id === 'source_tiktok');
assert.equal(source.image, 'https://p16.muscdn.com/fresh-cover.jpeg');
assert.equal(source.importedMetadata.image, 'https://p16.muscdn.com/fresh-cover.jpeg');
assert.equal(persisted.reels.some((reel) => reel.id.startsWith('shared_')), false);
```

In `backend/server.js`, call the service with:

```js
const tiktokOEmbedOrigin = process.env.NODE_ENV === 'test'
  ? process.env.TIKTOK_OEMBED_BASE_URL || undefined
  : undefined;

const { thumbnailUrl } = await fetchTikTokThumbnail(
  sourceReel.sourceUrl || sourceReel.importedMetadata?.url,
  { oEmbedOrigin: tiktokOEmbedOrigin },
);
```

The request body never accepts a fetch origin.

- [ ] **Step 2: Run API test to verify RED**

Run: `node scripts/test-tiktok-thumbnail-api.mjs`

Expected: FAIL with HTTP 404 for the missing refresh route.

- [ ] **Step 3: Import the service and implement canonical reel resolution**

Add:

```js
const { fetchTikTokThumbnail } = require('./services/tiktokThumbnail.cjs');
```

Add a helper near `getAccessibleWorkspaceSignals`:

```js
function resolveThumbnailSourceReel(db, workspaceId, reelId, authUser) {
  const accessible = getAccessibleWorkspaceSignals(db, workspaceId, authUser)
    .find((reel) => reel.id === reelId);
  if (!accessible) return null;
  if (accessible.sharedBank && accessible.sharedSourceId) {
    return db.reels.find((reel) => reel.id === accessible.sharedSourceId) || null;
  }
  return db.reels.find((reel) => reel.id === reelId && reel.workspaceId === workspaceId) || null;
}
```

- [ ] **Step 4: Implement the route**

```js
app.post('/api/workspaces/:workspaceId/reels/:reelId/thumbnail/refresh', async (req, res, next) => {
  try {
    const db = await readDb();
    if (!requireWorkspace(db, req.params.workspaceId, res)) return;
    const sourceReel = resolveThumbnailSourceReel(
      db,
      req.params.workspaceId,
      req.params.reelId,
      req.authUser,
    );
    if (!sourceReel) {
      res.status(404).json({ error: 'reel_not_found' });
      return;
    }
    const { thumbnailUrl } = await fetchTikTokThumbnail(sourceReel.sourceUrl || sourceReel.importedMetadata?.url);
    await serializeBackgroundMutation(async () => {
      const currentDb = await readDb();
      assertCurrentWorkspaceAccess(currentDb, req.params.workspaceId, req.authUser);
      const currentSource = resolveThumbnailSourceReel(
        currentDb,
        req.params.workspaceId,
        req.params.reelId,
        req.authUser,
      );
      if (!currentSource) {
        const error = new Error('reel_not_found');
        error.status = 404;
        throw error;
      }
      currentSource.image = thumbnailUrl;
      currentSource.importedMetadata = {
        ...(currentSource.importedMetadata || {}),
        image: thumbnailUrl,
      };
      currentSource.updatedAt = new Date().toISOString();
      await writeDb(currentDb);
    });
    res.json({ thumbnailUrl });
  } catch (error) {
    next(error);
  }
});
```

Map `invalid_tiktok_video_url` and `tiktok_thumbnail_unavailable` through the existing error middleware using their `status` and `code`.

- [ ] **Step 5: Run service and API tests**

Run:

```powershell
npm.cmd run test:tiktok-thumbnail-service
node scripts/test-tiktok-thumbnail-api.mjs
```

Expected: both exit 0.

- [ ] **Step 6: Add package script and commit**

Add:

```json
"test:tiktok-thumbnail-api": "node scripts/test-tiktok-thumbnail-api.mjs"
```

Then:

```powershell
git add backend/server.js scripts/test-tiktok-thumbnail-api.mjs package.json
git commit -m "feat: refresh workspace TikTok thumbnails"
```

### Task 5: Error-aware Signals thumbnails

**Files:**
- Create: `src/components/SignalThumbnail.jsx`
- Modify: `src/main.jsx:3953-4210, 5243-5301`
- Modify: `src/styles.css` near `.thumb`
- Modify: `scripts/test-signal-preview-ui.mjs`

**Interfaces:**
- Consumes: `onRecover() -> Promise<string>` supplied by `App`.
- Produces: `SignalThumbnail({ src, alt, fallbackLabel, onRecover })`, rendering one `<img>` attempt plus `.signal-thumbnail-fallback`.

- [ ] **Step 1: Extend the Playwright regression before production code**

Add two TikTok fixtures:

```js
{
  id: 'reel_expired_thumbnail_fixture',
  workspaceId: DEMO_WORKSPACE_ID,
  handle: '@preview_fixture',
  sourceHandle: '@preview_fixture',
  sourceUrl: 'https://www.tiktok.com/@preview_fixture/video/1234567890',
  sourceStatus: 'apify_metadata',
  scanLabel: 'TikTok',
  sourceType: 'TikTok',
  market: 'global',
  image: 'https://expired-image.test/cover.jpg',
  videoUrl: '',
  title: 'Expired TikTok thumbnail fixture',
  views: 402100,
  likes: 39800,
  comments: 398,
  score: 96,
  status: ['TikTok', 'Source', 'Metadata'],
  importedMetadata: { platform: 'tiktok', image: 'https://expired-image.test/cover.jpg' },
  createdAt: '2026-07-23T00:00:00.000Z',
},
{
  id: 'reel_unavailable_thumbnail_fixture',
  workspaceId: DEMO_WORKSPACE_ID,
  handle: '@preview_fixture',
  sourceHandle: '@preview_fixture',
  sourceUrl: 'https://www.tiktok.com/@preview_fixture/video/9999999999',
  sourceStatus: 'apify_metadata',
  scanLabel: 'TikTok',
  sourceType: 'TikTok',
  market: 'global',
  image: 'https://expired-image.test/unavailable.jpg',
  videoUrl: '',
  title: 'Unavailable TikTok thumbnail fixture',
  views: 120000,
  likes: 8000,
  comments: 120,
  score: 92,
  status: ['TikTok', 'Source', 'Metadata'],
  importedMetadata: { platform: 'tiktok', image: 'https://expired-image.test/unavailable.jpg' },
  createdAt: '2026-07-23T00:00:00.000Z',
}
```

Route failed images and refresh responses:

```js
let recoveredRequests = 0;
let unavailableRequests = 0;
await page.route('https://expired-image.test/**', (route) => route.fulfill({ status: 410 }));
await page.route('**/thumbnail/refresh', async (route) => {
  if (route.request().url().includes('reel_expired_thumbnail_fixture')) {
    recoveredRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ thumbnailUrl: POSTER }),
    });
    return;
  }
  unavailableRequests += 1;
  await route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'tiktok_thumbnail_unavailable' }),
  });
});
```

Assert:

```js
await page.getByText('Expired TikTok thumbnail fixture').waitFor();
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('.reel-row')]
    .find((item) => item.textContent.includes('Expired TikTok thumbnail fixture'));
  return row?.querySelector('.thumb img')?.getAttribute('src')?.startsWith('data:image/svg+xml');
});
assert.equal(recoveredRequests, 1);

await page.getByText('Unavailable TikTok thumbnail fixture').waitFor();
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('.reel-row')]
    .find((item) => item.textContent.includes('Unavailable TikTok thumbnail fixture'));
  return Boolean(row?.querySelector('.signal-thumbnail-fallback'));
});
assert.equal(unavailableRequests, 1);
```

- [ ] **Step 2: Run the UI test to verify RED**

Run: `node scripts/test-signal-preview-ui.mjs`

Expected: FAIL because row thumbnails are CSS backgrounds and never request recovery.

- [ ] **Step 3: Implement `SignalThumbnail`**

```jsx
import { useEffect, useRef, useState } from 'react';

export default function SignalThumbnail({ src = '', alt = '', fallbackLabel = 'Signal', onRecover }) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const attemptedRef = useRef(false);

  useEffect(() => {
    setCurrentSrc(src);
    attemptedRef.current = false;
  }, [src]);

  const recover = async () => {
    if (attemptedRef.current) {
      setCurrentSrc('');
      return;
    }
    attemptedRef.current = true;
    setCurrentSrc('');
    try {
      const recovered = await onRecover?.();
      setCurrentSrc(typeof recovered === 'string' ? recovered : '');
    } catch {
      setCurrentSrc('');
    }
  };

  return currentSrc
    ? <img src={currentSrc} alt={alt} loading="lazy" onError={recover} />
    : <span className="signal-thumbnail-fallback" aria-hidden="true">{fallbackLabel}</span>;
}
```

- [ ] **Step 4: Wire backend recovery into the table**

In `App`:

```js
const refreshSignalThumbnail = async (reel) => {
  const response = await authFetch(
    `${API_BASE}/workspaces/${workspaceId}/reels/${encodeURIComponent(reel.id)}/thumbnail/refresh`,
    { method: 'POST' },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.thumbnailUrl) throw createInterfaceApiError(payload, 'tiktok_thumbnail_unavailable');
  return payload.thumbnailUrl;
};
```

Pass `onRefreshThumbnail={refreshSignalThumbnail}` through `ViralBank`, `SignalsReelsTable`, and `ReelsTable`.

Replace the CSS background style in each `.thumb`:

```jsx
<button
  className={`thumb market-${reel.market}`}
  data-i18n-content
  type="button"
  onClick={() => onOpenPreview(reel)}
  aria-label={translateText(`Відкрити прев'ю ${reel.title}`)}
>
  <SignalThumbnail
    src={previewImage}
    alt=""
    fallbackLabel={getSignalSourceGroup(reel) === 'tiktok' ? 'TikTok' : 'Signal'}
    onRecover={getSignalSourceGroup(reel) === 'tiktok'
      ? () => onRefreshThumbnail?.(reel)
      : undefined}
  />
  <span>{viewsLabel}</span>
  <i className="thumb-play" aria-hidden="true" />
</button>
```

Only supply `onRecover` for `getSignalSourceGroup(reel) === 'tiktok'`; other platforms fall directly to their stable fallback.

Update CSS so `.thumb img` fills the tile with `object-fit: cover`, while overlay metrics and Play remain above it. Give `.signal-thumbnail-fallback` a deliberate TikTok gradient and legible compact label.

- [ ] **Step 5: Run the thumbnail UI and API suites**

Run:

```powershell
node scripts/test-signal-preview-ui.mjs
npm.cmd run test:tiktok-thumbnail-service
npm.cmd run test:tiktok-thumbnail-api
```

Expected: all exit 0; recovered and unavailable request counters both equal 1.

- [ ] **Step 6: Commit**

```powershell
git add src/components/SignalThumbnail.jsx src/main.jsx src/styles.css scripts/test-signal-preview-ui.mjs
git commit -m "fix: recover expired TikTok signal thumbnails"
```

### Task 6: Full verification

**Files:**
- Modify only if a verification command reveals a regression.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: fresh verification evidence for the complete change.

- [ ] **Step 1: Run focused suites**

```powershell
npm.cmd run test:theme-preferences
npm.cmd run test:tiktok-thumbnail-service
npm.cmd run test:tiktok-thumbnail-api
node scripts/test-signal-preview-ui.mjs
npm.cmd run test:i18n-rendered
```

Expected: every command exits 0.

- [ ] **Step 2: Run existing neighboring regressions**

```powershell
npm.cmd run test:i18n-core
npm.cmd run test:i18n-components
npm.cmd run test:public-beta
```

Expected: every command exits 0.

- [ ] **Step 3: Build production frontend**

Run: `npm.cmd run build`

Expected: Vite exits 0. The existing non-blocking bundle-size warning is allowed.

- [ ] **Step 4: Inspect final diff and runtime-data boundary**

```powershell
git diff --check
git status --short
git diff --name-only 04129bb..HEAD
```

Expected:

- no whitespace errors;
- `backend/data/db.json` remains only the pre-existing unstaged runtime-data modification;
- no secret or environment files are staged;
- implementation files match this plan.

- [ ] **Step 5: Commit verification fixes only when Step 1–4 required code changes**

If verification required changes, stage each explicit implementation path reported by `git status --short`, confirm `backend/data/db.json` is absent from `git diff --cached --name-only`, and commit with:

```powershell
git commit -m "fix: close interface preview regressions"
```

If verification required no code changes, do not create an empty commit.
