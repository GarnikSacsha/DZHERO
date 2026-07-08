# Apify Signal Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a night-ready Apify import path that fills Dzhero Signals with Instagram and TikTok videos, caches duplicates, and enables internal playback when provider media URLs exist.

**Architecture:** Keep the existing `db.reels` model as the Signal Bank store for this MVP. Add a focused Apify provider module, expose one backend import endpoint, and extend the current Signals UI with an Apify import modal and richer sorting/playback.

**Tech Stack:** Node/Express backend, JSON file storage, React 19 frontend, Vite, existing usage/billing helpers.

## Global Constraints

- Do not commit or print `APIFY_TOKEN`; read it only from `.env`.
- Charge `reelImports` only for newly saved provider signals, not reused cached signals.
- Keep implementation scoped to existing `reels` storage for tonight.
- Support `apify/instagram-scraper` and `clockworks/tiktok-scraper`.
- TikTok internal player requires `downloadVideos` so `mediaUrls[0]` exists.
- Preserve existing YouTube import and manual URL import behavior.

---

## File Structure

- `backend/services/apifySignalProvider.js`: Apify actor calls, provider result mapping, dedupe key helpers, score helpers.
- `backend/server.js`: env config, rate limiter registration, import endpoint, usage accounting, DB writes.
- `scripts/test-apify-signal-provider.mjs`: local mapping tests using sample Instagram and TikTok payloads.
- `src/main.jsx`: frontend import modal state, API call, sort options, signal player source detection.
- `src/styles.css`: modal and provider import UI polish.
- `.env.example`: document `APIFY_TOKEN`.

---

### Task 1: Provider Mapping and Tests

**Files:**
- Create: `backend/services/apifySignalProvider.js`
- Create: `scripts/test-apify-signal-provider.mjs`

**Interfaces:**
- Produces: `getApifySignalKey(metadata: object): string`
- Produces: `mapInstagramApifyItem(item: object, context: object): object`
- Produces: `mapTikTokApifyItem(item: object, context: object): object`

- [ ] **Step 1: Create provider mapper exports**

Implement `backend/services/apifySignalProvider.js` with pure helpers first:

```js
function compactText(value = '', maxLength = 1600) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function toCompactNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number;
}

function parseTikTokVideoId(url = '') {
  const match = String(url || '').match(/\/video\/(\d+)/);
  return match?.[1] || '';
}

function buildScore({ views, likes, comments, shares, saves, publishedAt, sourceQuality = 8 }) {
  const viewScore = Math.min(36, Math.log10(Math.max(Number(views || 0), 1)) * 6);
  const engagementTotal = Number(likes || 0) + Number(comments || 0) * 3 + Number(shares || 0) * 4 + Number(saves || 0) * 3;
  const engagementRate = Number(views || 0) > 0 ? engagementTotal / Number(views || 1) : 0;
  const engagementScore = Math.min(28, engagementRate * 160);
  const ageMs = publishedAt ? Date.now() - new Date(publishedAt).getTime() : Number.POSITIVE_INFINITY;
  const ageDays = Number.isFinite(ageMs) ? Math.max(0, ageMs / 86400000) : 999;
  const freshnessScore = ageDays <= 7 ? 18 : ageDays <= 30 ? 12 : ageDays <= 90 ? 7 : 3;
  return Math.max(55, Math.min(96, Math.round(30 + viewScore + engagementScore + freshnessScore + sourceQuality)));
}

function getApifySignalKey(metadata = {}) {
  const platform = metadata.platform || metadata.providerPlatform || metadata.source?.tone || '';
  const stableId = metadata.shortCode || metadata.externalId || metadata.tiktokVideoId || metadata.id || '';
  return [platform, stableId || metadata.url || metadata.webVideoUrl].filter(Boolean).join(':').toLowerCase();
}

function mapInstagramApifyItem(item = {}, context = {}) {
  const views = toCompactNumber(item.videoPlayCount);
  const likes = toCompactNumber(item.likesCount);
  const comments = toCompactNumber(item.commentsCount);
  const thumbnailUrl = item.displayUrl || item.images?.[0] || '';
  const handle = item.ownerUsername ? `@${item.ownerUsername}` : '@instagram';
  const title = compactText(item.caption || `Instagram Reel ${item.shortCode || item.id || ''}`, 180);
  const metadata = {
    provider: 'apify',
    providerActor: 'apify/instagram-scraper',
    platform: 'instagram',
    externalId: item.id || '',
    shortCode: item.shortCode || '',
    url: item.url || (item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : ''),
    title,
    description: item.caption || '',
    handle,
    image: thumbnailUrl,
    videoUrl: item.videoUrl || '',
    audioUrl: item.audioUrl || '',
    publishedAt: item.timestamp || '',
    stats: { views, likes, comments },
    rawStats: { views, likes, comments },
    source: { label: 'Instagram', tone: 'instagram' },
    sourceStatus: item.videoUrl ? 'apify_video' : 'apify_metadata',
    duration: item.videoDuration || '',
    apify: item,
  };
  return {
    id: context.createId ? context.createId('reel') : undefined,
    workspaceId: context.workspaceId,
    sourceId: null,
    sourceHandle: handle,
    handle,
    sourceUrl: metadata.url,
    sourceStatus: metadata.sourceStatus,
    scanLabel: 'Instagram',
    market: context.market || 'global',
    title,
    caption: item.caption || '',
    transcript: '',
    image: thumbnailUrl,
    videoUrl: item.videoUrl || '',
    views,
    likes,
    comments,
    shares: 0,
    saves: 0,
    hook: title,
    status: ['Instagram', 'Apify', item.videoUrl ? 'Плеєр готовий' : 'Метадані'],
    tag: (item.ownerUsername?.[0] || 'I').toUpperCase(),
    score: buildScore({ views, likes, comments, publishedAt: item.timestamp, sourceQuality: item.videoUrl ? 12 : 8 }),
    importedMetadata: metadata,
    createdAt: new Date().toISOString(),
  };
}

function mapTikTokApifyItem(item = {}, context = {}) {
  const url = item.webVideoUrl || item.url || '';
  const tiktokVideoId = parseTikTokVideoId(url);
  const views = toCompactNumber(item.playCount);
  const likes = toCompactNumber(item.diggCount);
  const comments = toCompactNumber(item.commentCount);
  const shares = toCompactNumber(item.shareCount);
  const saves = toCompactNumber(item.collectCount);
  const mediaUrls = Array.isArray(item.mediaUrls) ? item.mediaUrls : [];
  const videoUrl = mediaUrls[0] || item.videoUrl || '';
  const thumbnailUrl = item['videoMeta.coverUrl'] || item.videoMeta?.coverUrl || item.covers?.[0] || item['authorMeta.avatar'] || item.authorMeta?.avatar || '';
  const authorName = item['authorMeta.name'] || item.authorMeta?.name || 'tiktok';
  const handle = authorName.startsWith('@') ? authorName : `@${authorName}`;
  const title = compactText(item.text || `TikTok ${tiktokVideoId}`, 180);
  const publishedAt = item.createTimeISO || '';
  const metadata = {
    provider: 'apify',
    providerActor: 'clockworks/tiktok-scraper',
    platform: 'tiktok',
    externalId: tiktokVideoId,
    tiktokVideoId,
    url,
    title,
    description: item.text || '',
    handle,
    image: thumbnailUrl,
    videoUrl,
    mediaUrls,
    publishedAt,
    stats: { views, likes, comments, shares, saves },
    rawStats: { views, likes, comments, shares, saves },
    source: { label: 'TikTok', tone: 'tiktok' },
    sourceStatus: videoUrl ? 'apify_video' : 'apify_metadata',
    duration: item['videoMeta.duration'] || item.videoMeta?.duration || '',
    apify: item,
  };
  return {
    id: context.createId ? context.createId('reel') : undefined,
    workspaceId: context.workspaceId,
    sourceId: null,
    sourceHandle: handle,
    handle,
    sourceUrl: url,
    sourceStatus: metadata.sourceStatus,
    scanLabel: 'TikTok',
    market: context.market || 'global',
    title,
    caption: item.text || '',
    transcript: '',
    image: thumbnailUrl,
    videoUrl,
    views,
    likes,
    comments,
    shares,
    saves,
    hook: title,
    status: ['TikTok', 'Apify', videoUrl ? 'Плеєр готовий' : 'Метадані'],
    tag: (authorName[0] || 'T').toUpperCase(),
    score: buildScore({ views, likes, comments, shares, saves, publishedAt, sourceQuality: videoUrl ? 12 : 8 }),
    importedMetadata: metadata,
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  getApifySignalKey,
  mapInstagramApifyItem,
  mapTikTokApifyItem,
  parseTikTokVideoId,
  buildScore,
};
```

- [ ] **Step 2: Add mapper smoke tests**

Create `scripts/test-apify-signal-provider.mjs`:

```js
import assert from 'node:assert/strict';
import provider from '../backend/services/apifySignalProvider.js';

const {
  getApifySignalKey,
  mapInstagramApifyItem,
  mapTikTokApifyItem,
} = provider;

const instagram = mapInstagramApifyItem({
  id: '3926661823774853592',
  type: 'Video',
  shortCode: 'DZ-Th_XMAnY',
  caption: 'Choose the people you lean on.',
  url: 'https://www.instagram.com/p/DZ-Th_XMAnY/',
  commentsCount: 429,
  displayUrl: 'https://example.com/ig.jpg',
  videoUrl: 'https://example.com/ig.mp4',
  likesCount: 22546,
  videoPlayCount: 908912,
  timestamp: '2026-06-24T15:25:39.000Z',
  ownerFullName: 'Humans of New York',
  ownerUsername: 'humansofny',
  videoDuration: 88.512,
}, { workspaceId: 'ws_test', market: 'global', createId: (prefix) => `${prefix}_ig` });

assert.equal(instagram.id, 'reel_ig');
assert.equal(instagram.importedMetadata.platform, 'instagram');
assert.equal(instagram.videoUrl, 'https://example.com/ig.mp4');
assert.equal(instagram.views, 908912);
assert.equal(getApifySignalKey(instagram.importedMetadata), 'instagram:dz-th_xmany');

const tiktok = mapTikTokApifyItem({
  'authorMeta.avatar': 'https://example.com/avatar.jpg',
  'authorMeta.name': 'maverickgpt',
  text: 'Claude just killed graphic designers.',
  diggCount: 9747,
  shareCount: 1974,
  playCount: 193300,
  commentCount: 411,
  collectCount: 7934,
  'videoMeta.duration': 47,
  createTimeISO: '2026-07-05T17:19:12.000Z',
  webVideoUrl: 'https://www.tiktok.com/@maverickgpt/video/7659094629786193183',
  mediaUrls: ['https://api.apify.com/v2/key-value-stores/store/records/video.mp4'],
}, { workspaceId: 'ws_test', market: 'global', createId: (prefix) => `${prefix}_tt` });

assert.equal(tiktok.id, 'reel_tt');
assert.equal(tiktok.importedMetadata.platform, 'tiktok');
assert.equal(tiktok.videoUrl, 'https://api.apify.com/v2/key-value-stores/store/records/video.mp4');
assert.equal(tiktok.shares, 1974);
assert.equal(getApifySignalKey(tiktok.importedMetadata), 'tiktok:7659094629786193183');

console.log('apify signal provider mapping tests passed');
```

- [ ] **Step 3: Run mapper tests**

Run: `node scripts/test-apify-signal-provider.mjs`

Expected: prints `apify signal provider mapping tests passed`.

---

### Task 2: Apify Actor Calls

**Files:**
- Modify: `backend/services/apifySignalProvider.js`

**Interfaces:**
- Consumes: mapper helpers from Task 1.
- Produces: `fetchApifySignals(options: object): Promise<object[]>`

- [ ] **Step 1: Add actor runner**

Append to `backend/services/apifySignalProvider.js`:

```js
const APIFY_API_BASE = 'https://api.apify.com/v2';

async function runApifyActor({ token, actorId, input }) {
  if (!token) {
    const error = new Error('apify_not_configured');
    error.status = 501;
    throw error;
  }
  const runUrl = `${APIFY_API_BASE}/acts/${encodeURIComponent(actorId).replace('%2F', '~')}/runs?token=${encodeURIComponent(token)}`;
  const runResponse = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const runPayload = await runResponse.json().catch(() => ({}));
  if (!runResponse.ok) {
    const error = new Error(runPayload?.error?.message || `apify_run_failed_${runResponse.status}`);
    error.status = runResponse.status;
    error.payload = runPayload;
    throw error;
  }
  const runId = runPayload?.data?.id;
  if (!runId) throw new Error('apify_run_id_missing');

  const deadline = Date.now() + 180000;
  let run = runPayload.data;
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
    if (Date.now() > deadline) {
      const error = new Error('apify_run_timeout');
      error.status = 504;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const statusResponse = await fetch(`${APIFY_API_BASE}/actor-runs/${runId}?token=${encodeURIComponent(token)}`);
    const statusPayload = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) throw new Error(statusPayload?.error?.message || `apify_status_failed_${statusResponse.status}`);
    run = statusPayload.data;
  }
  if (run.status !== 'SUCCEEDED') {
    const error = new Error(`apify_run_${String(run.status).toLowerCase()}`);
    error.status = 502;
    error.run = run;
    throw error;
  }

  const datasetId = run.defaultDatasetId;
  if (!datasetId) return [];
  const itemResponse = await fetch(`${APIFY_API_BASE}/datasets/${datasetId}/items?clean=true&format=json&token=${encodeURIComponent(token)}`);
  const items = await itemResponse.json().catch(() => []);
  if (!itemResponse.ok) {
    const error = new Error(items?.error?.message || `apify_dataset_failed_${itemResponse.status}`);
    error.status = itemResponse.status;
    throw error;
  }
  return Array.isArray(items) ? items : [];
}

function buildInstagramInput({ inputValue, inputType, limit }) {
  return {
    directUrls: inputType === 'url' || inputType === 'profile' ? [inputValue] : [],
    search: inputType === 'search' || inputType === 'hashtag' ? inputValue : '',
    resultsType: 'posts',
    resultsLimit: limit,
  };
}

function buildTikTokInput({ inputValue, inputType, limit, downloadVideo }) {
  const input = {
    resultsPerPage: limit,
    maxItems: limit,
    shouldDownloadVideos: Boolean(downloadVideo),
    shouldDownloadCovers: Boolean(downloadVideo),
  };
  if (inputType === 'hashtag') input.hashtags = [inputValue.replace(/^#/, '')];
  else if (inputType === 'profile') input.profiles = [inputValue.replace(/^@/, '')];
  else if (inputType === 'url') input.postURLs = [inputValue];
  else input.searchQueries = [inputValue];
  return input;
}

async function fetchApifySignals({ token, platform, inputType, inputValue, limit = 5, downloadVideo = false, workspaceId, market, createId }) {
  const boundedLimit = Math.min(Math.max(Number(limit || 5), 1), 30);
  if (platform === 'instagram') {
    const items = await runApifyActor({
      token,
      actorId: 'apify/instagram-scraper',
      input: buildInstagramInput({ inputValue, inputType, limit: boundedLimit }),
    });
    return items.map((item) => mapInstagramApifyItem(item, { workspaceId, market, createId }));
  }
  if (platform === 'tiktok') {
    const items = await runApifyActor({
      token,
      actorId: 'clockworks/tiktok-scraper',
      input: buildTikTokInput({ inputValue, inputType, limit: boundedLimit, downloadVideo }),
    });
    return items.map((item) => mapTikTokApifyItem(item, { workspaceId, market, createId }));
  }
  const error = new Error('unsupported_apify_platform');
  error.status = 400;
  throw error;
}
```

Update `module.exports` to also export `fetchApifySignals`.

- [ ] **Step 2: Re-run mapper tests**

Run: `node scripts/test-apify-signal-provider.mjs`

Expected: same PASS output. The tests do not call live Apify.

---

### Task 3: Backend Import Endpoint

**Files:**
- Modify: `backend/server.js`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `fetchApifySignals`, `getApifySignalKey`.
- Produces: `POST /api/workspaces/:workspaceId/signals/apify/import`

- [ ] **Step 1: Import provider and env**

At the top of `backend/server.js`, require:

```js
const {
  fetchApifySignals,
  getApifySignalKey,
} = require('./services/apifySignalProvider');
```

Near other env constants add:

```js
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
```

- [ ] **Step 2: Add limiter line**

Near other expensive limiter registrations add:

```js
app.use('/api/workspaces/:workspaceId/signals/apify/import', expensiveLimiter);
```

- [ ] **Step 3: Add existing signal lookup helper**

Add near route helpers:

```js
function getExistingReelByApifyKey(db, workspaceId) {
  const map = new Map();
  for (const reel of db.reels.filter((item) => item.workspaceId === workspaceId)) {
    const key = getApifySignalKey(reel.importedMetadata || {});
    if (key && !map.has(key)) map.set(key, reel);
  }
  return map;
}
```

- [ ] **Step 4: Add route**

Insert before `/api/workspaces/:workspaceId/reels/import-url`:

```js
app.post('/api/workspaces/:workspaceId/signals/apify/import', async (req, res, next) => {
  try {
    const db = await readDb();
    const workspace = requireWorkspace(db, req.params.workspaceId, res);
    if (!workspace) return;
    if (!APIFY_TOKEN) {
      res.status(501).json({ error: 'apify_not_configured', message: 'Set APIFY_TOKEN in .env before importing Instagram or TikTok signals.' });
      return;
    }

    const platform = String(req.body.platform || '').toLowerCase();
    const inputType = String(req.body.inputType || 'search').toLowerCase();
    const inputValue = String(req.body.inputValue || '').trim();
    const requestedLimit = Math.min(Math.max(Number(req.body.limit || 5), 1), 30);
    if (!['instagram', 'tiktok'].includes(platform) || !inputValue) {
      res.status(400).json({ error: 'unsupported_apify_import', message: 'Choose Instagram or TikTok and provide an input value.' });
      return;
    }

    const entitlements = buildEntitlements(db, req.params.workspaceId, req.authUser);
    const maxResults = getAllowedBatchSize({
      requested: requestedLimit,
      limit: entitlements.plan.limits.reelImports,
      used: entitlements.usage.reelImports,
      unlimited: entitlements.unlimited,
    });
    if (maxResults <= 0) {
      res.status(402).json({
        error: 'usage_limit_reached',
        metric: 'reelImports',
        limit: entitlements.plan.limits.reelImports,
        used: entitlements.usage.reelImports,
      });
      return;
    }

    const mappedReels = await fetchApifySignals({
      token: APIFY_TOKEN,
      platform,
      inputType,
      inputValue,
      limit: maxResults,
      downloadVideo: Boolean(req.body.downloadVideo),
      workspaceId: req.params.workspaceId,
      market: req.body.market || 'global',
      createId,
    });

    const existingByKey = getExistingReelByApifyKey(db, req.params.workspaceId);
    const importedReels = [];
    const returnedReels = [];
    for (const reel of mappedReels) {
      const key = getApifySignalKey(reel.importedMetadata || {});
      if (key && existingByKey.has(key)) {
        const existing = existingByKey.get(key);
        existing.importedMetadata = {
          ...(existing.importedMetadata || {}),
          ...(reel.importedMetadata || {}),
          apify: reel.importedMetadata?.apify || existing.importedMetadata?.apify,
        };
        existing.videoUrl = existing.videoUrl || reel.videoUrl || '';
        existing.image = existing.image || reel.image || '';
        existing.views = reel.views || existing.views;
        existing.likes = reel.likes || existing.likes;
        existing.comments = reel.comments || existing.comments;
        existing.shares = reel.shares || existing.shares || 0;
        existing.saves = reel.saves || existing.saves || 0;
        existing.updatedAt = new Date().toISOString();
        returnedReels.push(existing);
        continue;
      }
      const analysis = analyzeReel(reel, workspace);
      reel.score = Math.max(reel.score || 0, analysis.score);
      reel.analysis = analysis;
      importedReels.push(reel);
      returnedReels.push(reel);
      if (key) existingByKey.set(key, reel);
    }

    db.reels.unshift(...importedReels);
    if (importedReels.length) {
      createSyncJob(db, req.params.workspaceId, 'apify_signals_imported', {
        platform,
        inputType,
        inputValue,
        importedCount: importedReels.length,
      });
      incrementUsage(db, req.params.workspaceId, USAGE_METRICS.reelImports, importedReels.length);
    }
    const billing = buildEntitlements(db, req.params.workspaceId, req.authUser);
    await writeDb(db);
    res.status(201).json({
      reels: returnedReels,
      importedCount: importedReels.length,
      reusedCount: returnedReels.length - importedReels.length,
      billing,
    });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 5: Document env**

Add to `.env.example`:

```env
APIFY_TOKEN=
```

- [ ] **Step 6: Verify backend syntax**

Run: `node --check backend/server.js`

Expected: no output and exit code 0.

---

### Task 4: Frontend Import Modal and Sorting

**Files:**
- Modify: `src/main.jsx`

**Interfaces:**
- Consumes: backend `POST /api/workspaces/:workspaceId/signals/apify/import`.
- Produces: `onImportApifySignals` frontend callback and modal type `apifySignal`.

- [ ] **Step 1: Add import callback in `App`**

Near `pullYouTubePopular`, add:

```jsx
const importApifySignals = async ({ platform, inputType, inputValue, limit, downloadVideo }) => {
  const response = await authFetch(`${API_BASE}/workspaces/${workspaceId}/signals/apify/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform,
      inputType,
      inputValue,
      limit,
      downloadVideo,
      market: market === 'all' ? 'global' : market,
    }),
  });
  if (!response.ok) throw new Error(await readApiError(response, 'apify_import_failed'));
  const payload = await response.json();
  const incomingReels = (payload.reels || []).map((reel) => ({
    ...reel,
    handle: reel.handle || reel.sourceHandle || `@${platform}`,
  }));
  setData((current) => {
    const incomingIds = new Set(incomingReels.map((reel) => reel.id));
    return { ...current, reels: [...incomingReels, ...current.reels.filter((reel) => !incomingIds.has(reel.id))] };
  });
  notify(payload.importedCount
    ? `${platform === 'instagram' ? 'Instagram' : 'TikTok'} Signals: +${payload.importedCount}.`
    : `Сигнали вже були в банку: ${payload.reusedCount || incomingReels.length}.`);
  return payload;
};
```

Pass it into `ViralBank` as `onImportApifySignals={importApifySignals}`.

- [ ] **Step 2: Extend `ViralBank` props and state**

Change signature:

```jsx
function ViralBank({ reels, competitors = [], market, notify, openModal, onImportUrl, onImportApifySignals, onPullYouTubePopular, onAdapt, setPage }) {
```

Add state:

```jsx
const [apifyModalOpen, setApifyModalOpen] = useState(false);
```

Change title actions `Додати сигнал` button to `onClick={() => setApifyModalOpen(true)}`.

- [ ] **Step 3: Add sort choices**

Replace sort select options with:

```jsx
<select value={sort} onChange={(event) => setSort(event.target.value)}>
  <option value="score">За оцінкою</option>
  <option value="views">За переглядами</option>
  <option value="likes">За лайками</option>
  <option value="comments">За коментарями</option>
  <option value="newest">Нові</option>
</select>
```

Update `.sort`:

```jsx
.sort((a, b) => {
  if (sort === 'views') return parseMetric(b.views) - parseMetric(a.views);
  if (sort === 'likes') return parseMetric(b.likes) - parseMetric(a.likes);
  if (sort === 'comments') return parseMetric(b.comments) - parseMetric(a.comments);
  if (sort === 'newest') return new Date(b.createdAt || b.publishedAt || b.importedMetadata?.publishedAt || 0) - new Date(a.createdAt || a.publishedAt || a.importedMetadata?.publishedAt || 0);
  return scoreSortDirection === 'asc' ? a.score - b.score : b.score - a.score;
});
```

- [ ] **Step 4: Add modal component**

Add below `ViralBank`:

```jsx
function ApifySignalImportModal({ onClose, onImport, notify }) {
  const [platform, setPlatform] = useState('instagram');
  const [inputType, setInputType] = useState('profile');
  const [inputValue, setInputValue] = useState('');
  const [limit, setLimit] = useState(5);
  const [downloadVideo, setDownloadVideo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submit = async () => {
    if (!inputValue.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onImport({ platform, inputType, inputValue: inputValue.trim(), limit, downloadVideo });
      onClose();
    } catch (error) {
      notify(`Apify імпорт не вдався: ${error?.message || 'невідома помилка'}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="quick-modal-overlay" onClick={onClose}>
      <div className="quick-modal apify-signal-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose}>×</button>
        <h3>Підтягнути сигнали з Apify</h3>
        <p>Джеро збере нові Reels або TikTok, збереже їх у банк і не спише імпорт за дублікати.</p>
        <div className="manual-reel-grid">
          <label>
            <span>Платформа</span>
            <select value={platform} onChange={(event) => {
              setPlatform(event.target.value);
              setInputType(event.target.value === 'instagram' ? 'profile' : 'hashtag');
            }}>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
            </select>
          </label>
          <label>
            <span>Тип</span>
            <select value={inputType} onChange={(event) => setInputType(event.target.value)}>
              <option value="profile">Профіль</option>
              <option value="url">URL відео</option>
              <option value="hashtag">Hashtag</option>
              <option value="search">Пошук</option>
            </select>
          </label>
          <label className="wide">
            <span>Значення</span>
            <input value={inputValue} onChange={(event) => setInputValue(event.target.value)} placeholder={platform === 'instagram' ? 'https://www.instagram.com/humansofny/' : 'claude або @maverickgpt'} />
          </label>
          <label>
            <span>Ліміт</span>
            <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={30}>30</option>
            </select>
          </label>
          {platform === 'tiktok' && (
            <label className="wide checkbox-row">
              <input type="checkbox" checked={downloadVideo} onChange={(event) => setDownloadVideo(event.target.checked)} />
              <span>Завантажити відео для внутрішнього плеєра</span>
            </label>
          )}
        </div>
        <div className="quick-modal-actions">
          <button type="button" onClick={onClose}>Скасувати</button>
          <button className="dark" type="button" onClick={submit} disabled={isSubmitting || !inputValue.trim()}>
            <Download size={16} />{isSubmitting ? 'Імпортуємо...' : 'Імпортувати'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

Render inside `ViralBank`:

```jsx
{apifyModalOpen && (
  <ApifySignalImportModal
    onClose={() => setApifyModalOpen(false)}
    onImport={onImportApifySignals}
    notify={notify}
  />
)}
```

- [ ] **Step 5: Verify build catches JSX issues**

Run: `npm run build`

Expected: Vite build succeeds.

---

### Task 5: Player Source Support

**Files:**
- Modify: `src/main.jsx`

**Interfaces:**
- Consumes: `reel.videoUrl`, `reel.importedMetadata.videoUrl`, `reel.importedMetadata.mediaUrls[0]`.
- Produces: preview modal with playable provider video when available.

- [ ] **Step 1: Add helper**

Near `getReelPreviewImage`, add:

```jsx
function getReelVideoSource(reel) {
  return reel?.videoUrl
    || reel?.importedMetadata?.videoUrl
    || reel?.importedMetadata?.mediaUrls?.[0]
    || reel?.importedMetadata?.apify?.mediaUrls?.[0]
    || '';
}
```

- [ ] **Step 2: Use helper in preview**

In the preview/modal section that renders `previewReel`, use:

```jsx
const previewVideoSource = getReelVideoSource(previewReel);
```

Render:

```jsx
{previewVideoSource ? (
  <video className="signal-preview-video" src={previewVideoSource} poster={getReelPreviewImage(previewReel)} controls playsInline />
) : (
  <div className={`phone-video market-${previewReel.market} ${getReelPreviewImage(previewReel) ? 'has-media' : ''}`}>
    {getReelPreviewImage(previewReel) && <img src={getReelPreviewImage(previewReel)} alt="" />}
  </div>
)}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Vite build succeeds.

---

### Task 6: Styling and Final Verification

**Files:**
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: classes from Task 4 and Task 5.
- Produces: polished modal and player sizing.

- [ ] **Step 1: Add CSS**

Add:

```css
.apify-signal-modal {
  max-width: 720px;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.checkbox-row input {
  width: auto;
}

.signal-preview-video {
  width: 100%;
  max-height: 70vh;
  aspect-ratio: 9 / 16;
  object-fit: contain;
  background: #080b12;
  border-radius: 8px;
}
```

- [ ] **Step 2: Run all verification**

Run:

```powershell
node scripts/test-apify-signal-provider.mjs
node --check backend/server.js
npm run build
```

Expected:

- mapping tests print pass message;
- backend syntax check exits 0;
- Vite build completes.

- [ ] **Step 3: Manual smoke test**

Start backend and frontend:

```powershell
npm run dev:backend
npm run dev:frontend
```

Expected:

- Signals page opens.
- `Додати сигнал` opens Apify modal.
- Instagram profile import returns playable items when `APIFY_TOKEN` is configured.
- TikTok hashtag import returns metric rows.
- TikTok hashtag import with download enabled returns playable `mediaUrls[0]`.
