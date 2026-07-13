# Studio AI Scenario in Content Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save the current Studio AI adaptation as one content-plan event with a compact AI title and a full editable production scenario.

**Architecture:** Add a pure utility that converts the first displayed AI remix into `{ title, body }`, then reuse it in the existing Studio-to-calendar flow. Persist `body` alongside existing post metadata and let the calendar modal edit `title` and `body` separately while preserving title-only posts.

**Tech Stack:** React 19, Vite 8, Node.js ES modules, Express 5, Node `assert` scripts.

## Global Constraints

- One Studio action creates one event from the first currently displayed AI remix.
- Use the existing `remix.title`; do not add another AI request.
- Use the remix hook as the title fallback, then `AI-адаптація для Reels`.
- The original reel title remains only in `sourceTitle` and must not become the AI event title.
- Existing title-only content-plan posts remain editable and valid.
- Preserve the user's existing uncommitted changes in `src/main.jsx`, `src/i18n.js`, `src/styles.css`, and `backend/data/db.json`.
- Do not modify or commit `backend/data/db.json`.

---

### Task 1: Convert an AI remix into a calendar draft

**Files:**
- Modify: `src/contentPlanUtils.mjs`
- Test: `scripts/test-content-plan-utils.mjs`

**Interfaces:**
- Consumes: a reel-like object with `remixResult.remixes[0]`.
- Produces: `buildStudioContentPlanDraft(reel): { title: string, body: string } | null`.
- Extends: `buildReelFromCalendarPost(post)` to use `post.body` as Studio context.

- [ ] **Step 1: Write failing tests for AI title selection and scenario formatting**

Add `buildReelFromCalendarPost` and `buildStudioContentPlanDraft` to the test imports, then add assertions equivalent to:

```js
const studioDraft = buildStudioContentPlanDraft({
  title: 'Original viral reel title',
  remixResult: {
    remixes: [{
      title: 'Домашній десерт проти вітрини кафе',
      hook: 'Думаєш, домашній десерт завжди дешевший?',
      visualFlow: [{
        timeframe: '0:00-0:02',
        actionDescription: 'Дівчина тримає невдалий бісквіт.',
        onScreenText: 'Очікування проти реальності',
        audioVoiceover: 'Я вирішила зекономити.',
      }],
      cta: 'Замовляй у Direct.',
    }],
  },
});

assert.equal(studioDraft.title, 'Домашній десерт проти вітрини кафе');
assert.doesNotMatch(studioDraft.title, /Original viral reel title/);
assert.match(studioDraft.body, /Хук: Думаєш, домашній десерт завжди дешевший\?/);
assert.match(studioDraft.body, /0:00-0:02/);
assert.match(studioDraft.body, /Кадр: Дівчина тримає невдалий бісквіт\./);
assert.match(studioDraft.body, /Текст на екрані: Очікування проти реальності/);
assert.match(studioDraft.body, /Озвучка: Я вирішила зекономити\./);
assert.match(studioDraft.body, /CTA: Замовляй у Direct\./);

assert.equal(buildStudioContentPlanDraft({ title: 'Source only' }), null);
assert.equal(buildStudioContentPlanDraft({
  title: 'Source title',
  remixResult: { remixes: [{ title: '', hook: 'Короткий AI-хук', visualFlow: [] }] },
}).title, 'Короткий AI-хук');

const restored = buildReelFromCalendarPost({
  id: 'calendar-ai-1',
  title: 'Коротка назва',
  body: 'Хук: Повний сценарій\n\nCTA: Напиши в Direct.',
});
assert.equal(restored.title, 'Коротка назва');
assert.equal(restored.hook, 'Хук: Повний сценарій\n\nCTA: Напиши в Direct.');
assert.equal(restored.caption, restored.hook);
```

- [ ] **Step 2: Run the utility test and verify RED**

Run: `node scripts/test-content-plan-utils.mjs`

Expected: FAIL because `buildStudioContentPlanDraft` is not exported.

- [ ] **Step 3: Implement the minimal pure formatter**

Add the following behavior to `src/contentPlanUtils.mjs`:

```js
function cleanContentPlanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function buildStudioContentPlanDraft(reel = {}) {
  const remix = reel.remixResult?.remixes?.[0];
  if (!remix) return null;

  const hook = cleanContentPlanText(remix.hook);
  const title = cleanContentPlanText(remix.title)
    || hook.slice(0, 120)
    || 'AI-адаптація для Reels';
  const shotBlocks = (Array.isArray(remix.visualFlow) ? remix.visualFlow : [])
    .map((step) => [
      cleanContentPlanText(step?.timeframe),
      cleanContentPlanText(step?.actionDescription) && `Кадр: ${cleanContentPlanText(step.actionDescription)}`,
      cleanContentPlanText(step?.onScreenText) && `Текст на екрані: ${cleanContentPlanText(step.onScreenText)}`,
      cleanContentPlanText(step?.audioVoiceover) && `Озвучка: ${cleanContentPlanText(step.audioVoiceover)}`,
    ].filter(Boolean).join('\n'))
    .filter(Boolean);
  const cta = cleanContentPlanText(remix.cta);
  const body = [
    hook && `Хук: ${hook}`,
    ...shotBlocks,
    cta && `CTA: ${cta}`,
  ].filter(Boolean).join('\n\n');

  return { title, body };
}
```

In `buildReelFromCalendarPost`, set `body = String(post.body || '').trim()`, then use `hook: body || title` and `caption: body || title`.

- [ ] **Step 4: Run the utility test and verify GREEN**

Run: `node scripts/test-content-plan-utils.mjs`

Expected: PASS with `content plan utility tests passed`.

- [ ] **Step 5: Commit the utility behavior**

```bash
git add src/contentPlanUtils.mjs scripts/test-content-plan-utils.mjs
git commit -m "feat: format Studio remixes for content plan"
```

---

### Task 2: Send the current AI adaptation and edit its scenario

**Files:**
- Modify: `src/main.jsx`
- Test: `scripts/test-content-plan-utils.mjs`

**Interfaces:**
- Consumes: `buildStudioContentPlanDraft(reel)` from Task 1.
- Consumes: existing and candidate content-plan posts.
- Produces: one `studio_ai` post with separate `title` and `body` fields.
- Produces: `isDuplicateContentPlanPost(existing, candidate): boolean`.
- Preserves: the existing Brand Scan multi-post path when no remix is present.

- [ ] **Step 1: Write failing tests for AI-aware deduplication**

Import `isDuplicateContentPlanPost`, then add:

```js
const firstAiPost = {
  source: 'studio_ai',
  sourceKey: 'brand-scan:source-a',
  title: 'Перший AI-сценарій',
  format: 'Reels',
};
assert.equal(isDuplicateContentPlanPost(firstAiPost, { ...firstAiPost }), true);
assert.equal(isDuplicateContentPlanPost(firstAiPost, {
  ...firstAiPost,
  title: 'Інший AI-сценарій',
}), false);
assert.equal(isDuplicateContentPlanPost(
  { ...firstAiPost, source: 'brand_scan' },
  { ...firstAiPost, source: 'brand_scan', title: 'Інша задача' },
), true);
```

- [ ] **Step 2: Run the utility test and verify RED**

Run: `node scripts/test-content-plan-utils.mjs`

Expected: FAIL because `isDuplicateContentPlanPost` is not exported.

- [ ] **Step 3: Implement and use AI-aware deduplication**

Add this pure helper to `src/contentPlanUtils.mjs` and import it in `src/main.jsx`:

```js
export function isDuplicateContentPlanPost(existing = {}, candidate = {}) {
  const sameSource = normalizeContentIdentity(existing.sourceKey)
    && normalizeContentIdentity(existing.sourceKey) === normalizeContentIdentity(candidate.sourceKey);
  const sameTitle = normalizeContentIdentity(existing.title) === normalizeContentIdentity(candidate.title);
  const sameFormat = normalizeContentIdentity(existing.format) === normalizeContentIdentity(candidate.format);
  return candidate.source === 'studio_ai'
    ? Boolean(sameSource && sameTitle)
    : Boolean(sameSource || (sameTitle && sameFormat));
}
```

Replace the inline duplicate predicate with:

```js
const hasSamePost = (candidate) => currentPosts.some((post) => (
  isDuplicateContentPlanPost(post, candidate)
));
```

- [ ] **Step 4: Integrate the formatter into `addReelToPlan`**

Import `buildStudioContentPlanDraft`. At the start of `addReelToPlan`, derive `studioDraft` and use one source-plan entry for AI adaptations:

```js
const studioDraft = buildStudioContentPlanDraft(reel);
const sourcePlan = studioDraft
  ? [['AI', studioDraft.title]]
  : reel.scanPlan?.length
    ? reel.scanPlan
    : [['Пн', reel.scanExample?.title || reel.title || 'Brand Scan production draft']];
```

Each mapped post must include:

```js
body: studioDraft?.body || '',
source: studioDraft ? 'studio_ai' : 'brand_scan',
```

- [ ] **Step 5: Pass the generated remix from Studio**

Change the Studio callback from:

```js
const ok = await onAddToPlan?.(reel);
```

to:

```js
const ok = await onAddToPlan?.(effectiveReel);
```

This is the root-cause fix: the calendar flow receives the current AI result instead of the original reel object.

- [ ] **Step 6: Separate title and scenario in the calendar modal**

Extend draft state and open/save behavior with `body`:

```js
const [draft, setDraft] = useState({ title: '', body: '', format: 'Reels', time: '10:00' });

setDraft(post
  ? {
      title: post.title || '',
      body: post.body || post.title || '',
      format: normalizeContentFormat(post.format, 'Post'),
      time: post.time || '10:00',
    }
  : { title: '', body: '', format: 'Reels', time: '10:00' });
```

Persist `body: draft.body.trim()` in `cleanDraft`. Replace the single title textarea with a compact `Назва` input bound to `draft.title` and a wide `Сценарій / текст` textarea bound to `draft.body`. The modal heading and calendar card continue to use `title`.

- [ ] **Step 7: Run focused checks**

Run:

```bash
node scripts/test-content-plan-utils.mjs
npm.cmd run build
```

Expected: utility tests pass and Vite production build exits with code 0.

- [ ] **Step 8: Commit the Studio and calendar integration**

Review `git diff -- src/main.jsx` carefully so the commit includes the task changes while preserving the user's pre-existing edit in that file.

```bash
git add src/main.jsx scripts/test-content-plan-utils.mjs
git commit -m "feat: add Studio scenarios to content plan"
```

---

### Task 3: Persist scenario bodies through the API

**Files:**
- Modify: `backend/server.js`
- Test: `scripts/test-content-plan-utils.mjs`

**Interfaces:**
- Consumes: content-plan posts with optional `body`.
- Produces: normalized API posts retaining `body` up to 12,000 characters.

- [ ] **Step 1: Confirm the current API normalizer drops `body`**

Run:

```bash
rg -n -A 18 "function normalizeContentPlanPosts" backend/server.js
```

Expected: the normalized object includes `title` and source metadata but no `body`.

- [ ] **Step 2: Persist bounded body text**

Add this property immediately after `title` in `normalizeContentPlanPosts`:

```js
body: String(post?.body || '').trim().slice(0, 12000),
```

No database migration is required because workspace posts are stored as JSON objects and old posts omit the optional field.

- [ ] **Step 3: Run backend and full feature verification**

Run:

```bash
node --check backend/server.js
node scripts/test-content-plan-utils.mjs
npm.cmd run build
git diff --check
```

Expected: all commands exit with code 0, the utility script prints `content plan utility tests passed`, and Vite reports a successful production build.

- [ ] **Step 4: Review requirements against the final diff**

Verify in `git diff` that:

- Studio passes `effectiveReel`.
- AI posts use `remix.title` or hook fallback.
- Full scenarios are stored in `body`.
- The event modal edits `title` and `body` separately.
- `sourceTitle` still contains the original reel title.
- Brand Scan posts without remix data retain their old path.
- `backend/data/db.json` is absent from the task diff.

- [ ] **Step 5: Commit backend persistence**

```bash
git add backend/server.js
git commit -m "feat: persist content plan scenario bodies"
```
