import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.join(ROOT, 'backend', 'data', 'db.json');
process.env.VITE_ENABLE_PRODUCT_PREVIEW = 'true';

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

const signal = {
  id: 'shared_reel_owner_ui_fixture',
  sharedBank: true,
  sharedSourceId: 'reel_owner_ui_fixture',
  sourceUrl: 'https://example.test/owner-ui-fixture',
  title: 'Owner exclusion UI fixture',
  handle: '@fixture_creator',
  market: 'global',
  views: 318000,
  likes: 11000,
  importedMetadata: {
    platform: 'tiktok',
    qualityGate: {
      decision: 'accept',
      admittedToBank: true,
      qualityScore: 80,
      brandRelevance: 75,
      summary: 'A grounded synthetic signal.',
      centralIdea: 'A visible correction.',
      contentMechanic: 'Show setup, correction, and result.',
    },
  },
};

async function installApiMock(page, { canManageSharedSignals }) {
  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    let status = 200;
    let payload = {};
    if (pathname === '/api/auth/me') {
      payload = {
        user: {
          id: canManageSharedSignals ? 'usr_owner' : 'usr_member',
          name: canManageSharedSignals ? 'Product Owner' : 'Regular Member',
          email: canManageSharedSignals ? 'owner@example.test' : 'member@example.test',
          role: 'owner',
          canManageSharedSignals,
          workspaceId: 'ws_ui',
        },
        workspaces: [{ id: 'ws_ui', name: 'UI Test Workspace' }],
      };
    } else if (pathname === '/api/workspaces') {
      payload = { workspaces: [{ id: 'ws_ui', name: 'UI Test Workspace' }] };
    } else if (pathname.endsWith('/reels')) {
      payload = { reels: [signal], sharedBank: { enabled: true, signalCount: 1 } };
    } else if (pathname.endsWith('/ideas')) {
      payload = { ideas: [] };
    } else if (pathname.endsWith('/content-plan')) {
      payload = { posts: [] };
    } else if (pathname.endsWith('/agent/context')) {
      payload = { productBrand: null, brief: {} };
    } else if (pathname.endsWith('/billing')) {
      payload = { plans: [], daily: null };
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

async function seedLanguage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('insta-producer-language', 'en');
  });
}

const dbBefore = sha256File(DB_PATH);
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const vite = await createServer({
  root: ROOT,
  logLevel: 'silent',
  server: { host: '127.0.0.1', port, strictPort: true },
});
const browser = await chromium.launch({ headless: true });
const providerCalls = [];

try {
  await vite.listen();

  const regularContext = await browser.newContext();
  try {
    const page = await regularContext.newPage();
    await seedLanguage(page);
    await installApiMock(page, { canManageSharedSignals: false });
    page.on('request', (request) => {
      const hostname = new URL(request.url()).hostname;
      if (/(^|\.)api\.apify\.com$|(^|\.)generativelanguage\.googleapis\.com$|(^|\.)api\.openai\.com$/i.test(hostname)) {
        providerCalls.push(request.url());
      }
    });
    await page.goto(`${baseUrl}/?preview=product&tab=discover`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Owner exclusion UI fixture', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('button', { name: 'More actions' }).count(), 0);
  } finally {
    await regularContext.close();
  }

  const ownerContext = await browser.newContext();
  try {
    const page = await ownerContext.newPage();
    await seedLanguage(page);
    await installApiMock(page, { canManageSharedSignals: true });
    await page.goto(`${baseUrl}/?preview=product&tab=discover`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Owner exclusion UI fixture', { exact: true }).waitFor({ state: 'visible' });
    const moreActions = page.getByRole('button', { name: 'More actions' });
    assert.equal(await moreActions.count(), 1);
    await moreActions.click();
    assert.equal(await page.getByRole('menuitem', { name: 'Exclude from shared bank' }).count(), 1);
  } finally {
    await ownerContext.close();
  }

  assert.deepEqual(providerCalls, []);
  assert.equal(sha256File(DB_PATH), dbBefore);
  console.log('Owner signal exclusion UI regression passed.');
  console.log('provider calls: 0');
  console.log('backend/data/db.json: unchanged');
} finally {
  await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
