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
  assert.deepEqual(runtimeErrors, []);
  assert.match(bodyText, /Brand Brain/);
  assert.equal(await page.locator('.page-brand-brain-start .brand-brain').count(), 1);
  const agentStudioNav = page.locator('[data-tour="sidebar-agent-studio"]');
  assert.equal(await agentStudioNav.isDisabled(), true);
  assert.match(await agentStudioNav.innerText(), /Coming soon/i);
  await page.getByRole('button', { name: 'Студія' }).click();
  await page.getByText('Спочатку додайте сигнал', { exact: true }).waitFor({ timeout: 5_000 });

  const studioText = await page.locator('main.shell').innerText();
  assert.match(studioText, /Спочатку додайте сигнал/);
  assert.match(studioText, /Відкрити Сигнали/);
  assert.deepEqual(runtimeErrors, []);

  console.log('google auth empty workspace regression passed');
} finally {
  await browser.close();
  await new Promise((resolve, reject) => {
    previewServer.httpServer.close((error) => (error ? reject(error) : resolve()));
  });
}
