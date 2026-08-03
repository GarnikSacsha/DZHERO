import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.join(ROOT_DIR, 'backend', 'data', 'db.json');
const previousPreviewFlag = process.env.VITE_ENABLE_PRODUCT_PREVIEW;
process.env.VITE_ENABLE_PRODUCT_PREVIEW = 'true';

const user = {
  id: 'usr_product_entry',
  email: 'product-entry@example.test',
  name: 'Product Entry',
  role: 'owner',
  workspaceId: 'ws_product_entry',
  provider: 'demo',
  isDemo: true,
};

const workspaces = [{
  id: 'ws_product_entry',
  name: 'Product Entry Workspace',
  owner: user.id,
  mode: 'demo',
  marketFocus: ['global'],
}];

const productBrand = {
  id: 'brand_product_entry',
  name: 'Product Entry Brand',
  brain: {
    profileDescription: 'AI workflow product for small teams.',
    audience: 'Small product teams',
    niche: 'AI automation',
    market: 'Global',
    instagramUrl: 'https://www.instagram.com/chatcutapp/',
  },
};

const PRODUCT_BRANDS_STORAGE_KEY = 'dzhero-preview-product-brands-v1';
const PRODUCT_ACTIVE_BRAND_STORAGE_KEY = 'dzhero-preview-product-active-brand-v1';
const PRODUCT_TEST_SEED_KEY = 'codex-product-entry-test-seeded';

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function jsonPayload(pathname) {
  if (pathname === '/api/workspaces') return { workspaces };
  if (pathname.endsWith('/agent/context')) {
    return { complete: true, brief: productBrand.brain, productBrand };
  }
  if (pathname.endsWith('/reels')) return { reels: [] };
  if (pathname.endsWith('/ideas')) return { ideas: [] };
  if (pathname.endsWith('/content-plan')) return { posts: [] };
  if (pathname.endsWith('/billing')) return { plans: [], daily: null };
  if (pathname === '/api/auth/meta/status') return { connectedAccounts: [] };
  return {};
}

async function installApiMock(page, {
  initiallyAuthenticated,
  logoutStatus = 204,
  logoutDelayMs = 0,
}) {
  let authenticated = initiallyAuthenticated;
  let logoutCalls = 0;
  const apiCalls = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    apiCalls.push({ method: request.method(), pathname });

    if (pathname === '/api/auth/me') {
      await route.fulfill({
        status: authenticated ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(authenticated ? { user, workspaces } : { error: 'auth_required' }),
      });
      return;
    }

    if (pathname === '/api/auth/demo') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'demo_login_disabled_for_guest_case' }),
      });
      return;
    }

    if (pathname === '/api/auth/logout') {
      logoutCalls += 1;
      if (logoutDelayMs) await new Promise((resolve) => setTimeout(resolve, logoutDelayMs));
      if (logoutStatus >= 200 && logoutStatus < 300) authenticated = false;
      const response = {
        status: logoutStatus,
        contentType: 'application/json',
      };
      if (logoutStatus !== 204) response.body = JSON.stringify({ error: 'logout_failed' });
      await route.fulfill(response);
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(jsonPayload(pathname)),
    });
  });

  return {
    snapshot: () => ({ logoutCalls, apiCalls: [...apiCalls] }),
  };
}

async function seedProductState(page) {
  await page.addInitScript(({ brandsKey, activeBrandKey, seedKey, brand }) => {
    if (!localStorage.getItem(seedKey)) {
      localStorage.clear();
      localStorage.setItem('insta-producer-language', 'en');
      localStorage.setItem(brandsKey, JSON.stringify([brand]));
      localStorage.setItem(activeBrandKey, brand.id);
      localStorage.setItem(seedKey, '1');
    }
  }, {
    brandsKey: PRODUCT_BRANDS_STORAGE_KEY,
    activeBrandKey: PRODUCT_ACTIVE_BRAND_STORAGE_KEY,
    seedKey: PRODUCT_TEST_SEED_KEY,
    brand: productBrand,
  });
}

async function expectLanding(page, trigger) {
  await page.locator('.marketing-landing').waitFor({ state: 'visible', timeout: 15_000 });
  const url = new URL(page.url());
  assert.equal(await page.locator('.product-shell-preview').count(), 0, `${trigger} must not render product shell`);
  assert.equal(url.searchParams.has('preview'), false, `${trigger} must remove the private product preview route`);
}

const dbBefore = sha256File(DB_PATH);
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const vite = await createServer({
  root: ROOT_DIR,
  logLevel: 'silent',
  server: { host: '127.0.0.1', port, strictPort: true },
});
const browser = await chromium.launch({ headless: true });
const providerCalls = [];
const runtimeErrors = [];

try {
  await vite.listen();

  const guestContext = await browser.newContext();
  try {
    const guestPage = await guestContext.newPage();
    const guestApi = await installApiMock(guestPage, { initiallyAuthenticated: false });
    guestPage.on('pageerror', (error) => runtimeErrors.push(error.message));
    guestPage.on('request', (request) => {
      const hostname = new URL(request.url()).hostname;
      if (/(^|\.)api\.apify\.com$|(^|\.)generativelanguage\.googleapis\.com$|(^|\.)api\.openai\.com$/i.test(hostname)) {
        providerCalls.push(request.url());
      }
    });
    await guestPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await expectLanding(guestPage, 'guest root entry');
    assert.equal(guestApi.snapshot().logoutCalls, 0);
  } finally {
    await guestContext.close();
  }

  const directGuestContext = await browser.newContext();
  try {
    const directGuestPage = await directGuestContext.newPage();
    await installApiMock(directGuestPage, { initiallyAuthenticated: false });
    await directGuestPage.goto(`${baseUrl}/?preview=product&tab=discover`, { waitUntil: 'domcontentloaded' });
    await expectLanding(directGuestPage, 'direct guest product entry');
  } finally {
    await directGuestContext.close();
  }

  const authenticatedContext = await browser.newContext();
  try {
    const authenticatedPage = await authenticatedContext.newPage();
    await seedProductState(authenticatedPage);
    const authApi = await installApiMock(authenticatedPage, {
      initiallyAuthenticated: true,
      logoutDelayMs: 250,
    });
    authenticatedPage.on('pageerror', (error) => runtimeErrors.push(error.message));
    authenticatedPage.on('request', (request) => {
      const hostname = new URL(request.url()).hostname;
      if (/(^|\.)api\.apify\.com$|(^|\.)generativelanguage\.googleapis\.com$|(^|\.)api\.openai\.com$/i.test(hostname)) {
        providerCalls.push(request.url());
      }
    });
    await authenticatedPage.goto(`${baseUrl}/?preview=product&tab=discover`, { waitUntil: 'domcontentloaded' });
    await authenticatedPage.locator('.product-shell-preview').waitFor({ state: 'visible', timeout: 15_000 });

    const logoutButton = authenticatedPage.locator('.product-logout-button');
    assert.equal(await logoutButton.count(), 1, 'Authenticated redesign must expose one Log out button');

    await logoutButton.click();
    assert.equal(await logoutButton.isDisabled(), true, 'Logout button must disable during the backend request');
    await logoutButton.click({ force: true });
    await expectLanding(authenticatedPage, 'successful product logout');
    assert.equal(authApi.snapshot().logoutCalls, 1, 'Double click must issue exactly one POST /api/auth/logout');
    assert.equal(await authenticatedPage.evaluate((key) => localStorage.getItem(key), PRODUCT_BRANDS_STORAGE_KEY), null, 'Successful logout must clear product brand state');
    assert.equal(await authenticatedPage.evaluate((key) => localStorage.getItem(key), PRODUCT_ACTIVE_BRAND_STORAGE_KEY), null, 'Successful logout must clear active product brand state');

    await authenticatedPage.goto(`${baseUrl}/?preview=product&tab=discover`, { waitUntil: 'domcontentloaded' });
    await expectLanding(authenticatedPage, 'next guest product entry after logout');
  } finally {
    await authenticatedContext.close();
  }

  const failureContext = await browser.newContext();
  try {
    const failurePage = await failureContext.newPage();
    await seedProductState(failurePage);
    const failureApi = await installApiMock(failurePage, {
      initiallyAuthenticated: true,
      logoutStatus: 503,
    });
    await failurePage.goto(`${baseUrl}/?preview=product&tab=discover`, { waitUntil: 'domcontentloaded' });
    await failurePage.locator('.product-shell-preview').waitFor({ state: 'visible', timeout: 15_000 });
    await failurePage.getByRole('button', { name: /^log out$/i }).click();
    const failureToast = failurePage.locator('.toast');
    await failureToast.waitFor({ state: 'visible', timeout: 5_000 });
    assert.match(await failureToast.innerText(), /failed|active|again/i, 'Failed logout must show a retryable error');
    assert.equal(await failurePage.locator('.product-shell-preview').count(), 1, 'Failed logout must keep the authenticated product shell');
    assert.equal(new URL(failurePage.url()).searchParams.get('preview'), 'product', 'Failed logout must keep the private route active');
    assert.equal(failureApi.snapshot().logoutCalls, 1, 'Failed logout must still issue only one request');
    assert.notEqual(await failurePage.evaluate((key) => localStorage.getItem(key), PRODUCT_BRANDS_STORAGE_KEY), null, 'Failed logout must preserve product state for retry');
  } finally {
    await failureContext.close();
  }

  assert.deepEqual(runtimeErrors, [], 'Auth routing must not emit runtime errors');
  assert.deepEqual(providerCalls, [], 'Auth routing regression must make zero provider calls');
  assert.equal(sha256File(DB_PATH), dbBefore, 'Auth routing regression must not modify backend/data/db.json');
  console.log('GREEN product logout/auth routing regression passed.');
  console.log('provider calls: 0');
  console.log('backend/data/db.json: unchanged');
} catch (error) {
  console.log(`RED assertion: ${error.message.split('\n')[0]}`);
  console.log(`provider calls: ${providerCalls.length}`);
  console.log(`backend/data/db.json: ${sha256File(DB_PATH) === dbBefore ? 'unchanged' : 'CHANGED'}`);
  throw error;
} finally {
  await browser.close().catch(() => {});
  await vite.close().catch(() => {});
  if (previousPreviewFlag === undefined) delete process.env.VITE_ENABLE_PRODUCT_PREVIEW;
  else process.env.VITE_ENABLE_PRODUCT_PREVIEW = previousPreviewFlag;
}
