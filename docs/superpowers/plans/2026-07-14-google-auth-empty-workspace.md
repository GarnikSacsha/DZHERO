# Google Auth Empty Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `Головна` page and Studio render safely after Google login when the authenticated workspace contains no reels, ideas, or content-plan posts.

**Architecture:** Keep the working OAuth/session flow unchanged and fix the invalid frontend assumptions at their render boundaries. A Playwright regression script will serve the built Vite app, mock an authenticated empty workspace, and verify both the first `Головна` render and the empty Studio path.

**Tech Stack:** React 19, Vite 8, Playwright 1.60, Node.js assertions.

## Global Constraints

- Keep the current Google OAuth start, callback, session-cookie, and `/api/auth/me` flow unchanged.
- Keep the user on the existing `Головна` page after authentication.
- Treat empty workspace collections as valid product state.
- Do not inject demo reels or represent demo data as the user's data.
- Do not refactor the full `src/main.jsx` file.
- Preserve unrelated local edits, especially `backend/data/db.json` and the current content-plan worktree changes.

## File Structure

- Create `scripts/test-google-auth-empty-workspace.mjs`: production-like browser regression for an authenticated empty workspace.
- Modify `src/main.jsx`: guard the Home signal summary and render an inline Studio empty state when no reel is selected.
- Reuse existing `.signals-empty-state`, `.signals-empty-actions`, and page/card styles from `src/styles.css`; no stylesheet change is required.

---

### Task 1: Render `Головна` for an authenticated empty workspace

**Files:**
- Create: `scripts/test-google-auth-empty-workspace.mjs`
- Modify: `src/main.jsx:2998-3096`

**Interfaces:**
- Consumes: built Vite output from `npm.cmd run build`; same-origin `/api/*` calls from the production frontend.
- Produces: `HomeDashboard` behavior where `data.reels` may be an empty array and the signal summary remains renderable.

- [ ] **Step 1: Write the failing browser regression**

Create `scripts/test-google-auth-empty-workspace.mjs` with this complete test harness:

```js
import assert from 'node:assert/strict';

import { chromium } from 'playwright';
import { preview } from 'vite';

const HOST = '127.0.0.1';
const PORT = 4179;
const BASE_URL = `http://${HOST}:${PORT}`;

const user = {
  id: 'usr_google_empty',
  email: 'google-empty@example.com',
  name: 'Google Empty',
  role: 'owner',
  workspaceId: 'ws_google_empty',
  provider: 'google',
};

const workspaces = [{
  id: 'ws_google_empty',
  name: 'Google Empty Workspace',
  owner: 'usr_google_empty',
  mode: 'owner',
  marketFocus: [],
}];

function apiPayload(pathname) {
  if (pathname === '/api/auth/me') return { user, workspaces };
  if (pathname === '/api/workspaces') return { workspaces };
  if (pathname.endsWith('/reels')) return { reels: [] };
  if (pathname.endsWith('/ideas')) return { ideas: [] };
  if (pathname.endsWith('/content-plan')) return { posts: [] };
  if (pathname.endsWith('/agent/context')) return { brief: {} };
  if (pathname === '/api/auth/meta/status') return { connectedAccounts: [] };
  return {};
}

const previewServer = await preview({
  preview: { host: HOST, port: PORT, strictPort: true },
});
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(apiPayload(url.pathname)),
    });
  });

  await page.goto(`${BASE_URL}/?auth=google`, {
    waitUntil: 'networkidle',
    timeout: 30_000,
  });

  const bodyText = await page.locator('body').innerText();
  assert.match(bodyText, /Головна/);
  assert.match(bodyText, /Сигнали\s+0/);
  assert.match(bodyText, /Сигналів ще немає/);
  assert.deepEqual(runtimeErrors, []);

  console.log('google auth empty workspace home test passed');
} finally {
  await browser.close();
  await new Promise((resolve, reject) => {
    previewServer.httpServer.close((error) => (error ? reject(error) : resolve()));
  });
}
```

- [ ] **Step 2: Build and run the regression to verify the current failure**

Run:

```powershell
npm.cmd run build
node scripts/test-google-auth-empty-workspace.mjs
```

Expected: the browser check fails, and the captured runtime error includes `Cannot read properties of undefined (reading 'score')` from `HomeDashboard`.

- [ ] **Step 3: Implement the minimal Home guard**

In `HomeDashboard`, keep the existing top-reel lookup:

```jsx
const topReel = data.reels[0];
```

Replace the unconditional score paragraph:

```jsx
<p>Найсильніший: {topReel.score} score</p>
```

with:

```jsx
<p>{topReel ? `Найсильніший: ${topReel.score} score` : 'Сигналів ще немає'}</p>
```

This preserves the existing populated-workspace copy and adds the approved zero state without synthetic data.

- [ ] **Step 4: Rebuild and verify that `Головна` now passes**

Run:

```powershell
npm.cmd run build
node scripts/test-google-auth-empty-workspace.mjs
```

Expected:

```text
google auth empty workspace home test passed
```

- [ ] **Step 5: Commit the focused Home fix**

```powershell
git add -- scripts/test-google-auth-empty-workspace.mjs
git add -p -- src/main.jsx
git diff --cached -- scripts/test-google-auth-empty-workspace.mjs src/main.jsx
git commit -m "fix: render empty workspace after google login"
```

At the interactive `git add -p` prompt, stage only the `HomeDashboard` signal-summary hunk. The cached diff must not contain the existing content-plan edits or any other unrelated `src/main.jsx` changes.

### Task 2: Guard Studio when the empty workspace has no selected signal

**Files:**
- Modify: `scripts/test-google-auth-empty-workspace.mjs`
- Modify: `src/main.jsx:1229`
- Modify: `src/main.jsx` immediately before `HomeDashboard`

**Interfaces:**
- Consumes: `selectedReel`, `setMvpPage('viral')`, and the existing `.signals-empty-state` style system.
- Produces: `StudioEmptyState({ onOpenSignals: () => void })`, rendered whenever `page === 'remix'` and `selectedReel` is absent.

- [ ] **Step 1: Extend the regression with the failing Studio path**

Insert these assertions in `scripts/test-google-auth-empty-workspace.mjs` after the existing Home assertions and before the success log:

```js
await page.getByRole('button', { name: 'Студія' }).click();
await page.getByText('Спочатку додайте сигнал', { exact: true }).waitFor();

const studioText = await page.locator('main.shell').innerText();
assert.match(studioText, /Спочатку додайте сигнал/);
assert.match(studioText, /Відкрити Сигнали/);
assert.deepEqual(runtimeErrors, []);
```

Change the success log to:

```js
console.log('google auth empty workspace regression passed');
```

- [ ] **Step 2: Run the extended regression to verify the missing Studio state**

Run:

```powershell
node scripts/test-google-auth-empty-workspace.mjs
```

Expected: FAIL because the text `Спочатку додайте сигнал` is not rendered; the current code tries to mount `RemixStudio` with an undefined reel.

- [ ] **Step 3: Add the inline Studio empty-state component**

Add this component immediately before `HomeDashboard` in `src/main.jsx`:

```jsx
function StudioEmptyState({ onOpenSignals }) {
  return (
    <section className="page">
      <PageTitle
        title="Студія"
        subtitle="Оберіть сигнал, щоб Джеро підготував адаптацію, сценарій і CTA."
      />
      <div className="table-card signals-empty-shell">
        <div className="signals-empty-state signals-empty-state--authoritative">
          <span className="signals-empty-state-kicker">Студія</span>
          <strong>Спочатку додайте сигнал</strong>
          <p>Відкрийте Signals, додайте ролик або джерело, а потім поверніться до адаптації.</p>
          <div className="signals-empty-actions">
            <button className="dark" type="button" onClick={onOpenSignals}>Відкрити Сигнали</button>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Guard the Studio render boundary**

Replace the current unconditional Studio render:

```jsx
{page === 'remix' && <RemixStudio reel={selectedReel} notify={notify} setPage={setMvpPage} workspaceId={workspaceId} autoGenerateRequest={remixAutoRequest} onAutoGenerateConsumed={() => setRemixAutoRequest(null)} onAddToPlan={addReelToPlan} onSaveBrandBrain={saveBrandScanToBrain} />}
```

with:

```jsx
{page === 'remix' && (
  selectedReel
    ? <RemixStudio reel={selectedReel} notify={notify} setPage={setMvpPage} workspaceId={workspaceId} autoGenerateRequest={remixAutoRequest} onAutoGenerateConsumed={() => setRemixAutoRequest(null)} onAddToPlan={addReelToPlan} onSaveBrandBrain={saveBrandScanToBrain} />
    : <StudioEmptyState onOpenSignals={() => setMvpPage('viral')} />
)}
```

- [ ] **Step 5: Rebuild and run the complete regression**

Run:

```powershell
npm.cmd run build
node scripts/test-google-auth-empty-workspace.mjs
```

Expected:

```text
google auth empty workspace regression passed
```

- [ ] **Step 6: Run the relevant existing auth/workspace tests**

Run:

```powershell
node scripts/test-auth-workspace-payload.js
node scripts/test-workspace-snapshot.mjs
node scripts/test-auth-session-upgrade.js
```

Expected: all three scripts print their respective `passed` messages and exit with code `0`.

- [ ] **Step 7: Verify the production bundle scenario once more**

Run:

```powershell
npm.cmd run build
node scripts/test-google-auth-empty-workspace.mjs
```

Expected: build exits with code `0`, the regression prints `google auth empty workspace regression passed`, and no `reading 'score'` browser error is recorded.

- [ ] **Step 8: Commit the Studio guard**

```powershell
git add -- scripts/test-google-auth-empty-workspace.mjs
git add -p -- src/main.jsx
git diff --cached -- scripts/test-google-auth-empty-workspace.mjs src/main.jsx
git commit -m "fix: guard empty studio workspace"
```

At the interactive `git add -p` prompt, stage only the `StudioEmptyState` component and guarded `page === 'remix'` render hunks. The cached diff must not contain unrelated worktree changes.
