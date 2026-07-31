import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  if (pathname.endsWith('/reels')) return { reels: [] };
  if (pathname.endsWith('/ideas')) return { ideas: [] };
  if (pathname.endsWith('/content-plan')) return { posts: [] };
  if (pathname.endsWith('/billing')) return { plans: [], daily: null };
  if (pathname.endsWith('/agent/context')) {
    return {
      complete: true,
      brief: productBrand.brain,
      productBrand,
    };
  }
  if (pathname === '/api/auth/meta/status') return { connectedAccounts: [] };
  return {};
}

async function installApiMock(page, { initiallyAuthenticated }) {
  let authenticated = initiallyAuthenticated;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === '/api/auth/me') {
      await route.fulfill({
        status: authenticated ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(authenticated ? { user, workspaces } : { error: 'auth_required' }),
      });
      return;
    }
    if (pathname === '/api/auth/demo') {
      authenticated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user, workspaces }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(jsonPayload(pathname)),
    });
  });
}

async function assertNewProductEntry(page, trigger) {
  await page.waitForFunction(() => (
    document.querySelector('.product-shell-preview')
    || document.querySelector('.shell')
    || document.querySelector('.workspace-onboarding')
  ), null, { timeout: 15_000 });

  const productVisible = await page.locator('.product-shell-preview').isVisible().catch(() => false);
  const legacyVisible = await page.locator('.shell').isVisible().catch(() => false);
  const legacyOnboardingVisible = await page.locator('.workspace-onboarding').isVisible().catch(() => false);
  const url = new URL(page.url());

  assert.equal(productVisible, true, `${trigger} rendered legacy=${legacyVisible || legacyOnboardingVisible} at ${url.pathname}${url.search}`);
  assert.equal(url.searchParams.get('preview'), 'product', `${trigger} did not select the redesign route`);
  assert.equal(url.searchParams.get('tab'), 'discover', `${trigger} did not select the redesign Discover tab`);
}

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const vite = await createServer({
  root: ROOT_DIR,
  logLevel: 'silent',
  server: { host: '127.0.0.1', port, strictPort: true },
});
const browser = await chromium.launch({ headless: true });
let previewDisabledVite = null;

try {
  await vite.listen();
  const failures = [];

  const guestContext = await browser.newContext();
  try {
    const guestPage = await guestContext.newPage();
    await installApiMock(guestPage, { initiallyAuthenticated: false });
    await guestPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await guestPage.locator('.marketing-landing').waitFor({ state: 'visible' });
    assert.equal(new URL(guestPage.url()).searchParams.has('preview'), false, 'guest root entry must remain on the landing page');
    assert.equal(await guestPage.locator('.product-shell-preview').count(), 0);
  } catch (error) {
    failures.push(error);
  } finally {
    await guestContext.close();
  }

  const returningContext = await browser.newContext();
  try {
    const returningPage = await returningContext.newPage();
    await installApiMock(returningPage, { initiallyAuthenticated: true });
    await returningPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await assertNewProductEntry(returningPage, 'authenticated root entry');
  } catch (error) {
    failures.push(error);
  } finally {
    await returningContext.close();
  }

  const demoContext = await browser.newContext();
  try {
    const demoPage = await demoContext.newPage();
    await installApiMock(demoPage, { initiallyAuthenticated: false });
    await demoPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await demoPage.locator('[data-dzhero-track="btn_signup_entry"]').click();
    await demoPage.locator('[data-dzhero-track="btn_demo_entry"]').click();
    await assertNewProductEntry(demoPage, 'landing demo entry');
  } catch (error) {
    failures.push(error);
  } finally {
    await demoContext.close();
  }

  const onboardingContext = await browser.newContext();
  try {
    const onboardingPage = await onboardingContext.newPage();
    await installApiMock(onboardingPage, { initiallyAuthenticated: true });
    await onboardingPage.goto(`${baseUrl}/?preview=onboarding`, { waitUntil: 'domcontentloaded' });
    await onboardingPage.locator('.workspace-onboarding').waitFor({ state: 'visible' });
    assert.equal(new URL(onboardingPage.url()).searchParams.get('preview'), 'onboarding');
    assert.equal(await onboardingPage.locator('.product-shell-preview').count(), 0);
  } catch (error) {
    failures.push(error);
  } finally {
    await onboardingContext.close();
  }

  const publicContext = await browser.newContext();
  try {
    const publicPage = await publicContext.newPage();
    await installApiMock(publicPage, { initiallyAuthenticated: true });
    await publicPage.goto(`${baseUrl}/about`, { waitUntil: 'domcontentloaded' });
    await publicPage.locator('.public-about').waitFor({ state: 'visible' });
    await publicPage.waitForTimeout(100);
    assert.equal(new URL(publicPage.url()).pathname, '/about');
    assert.equal(new URL(publicPage.url()).searchParams.has('preview'), false);
  } catch (error) {
    failures.push(error);
  } finally {
    await publicContext.close();
  }

  const adminContext = await browser.newContext();
  try {
    const adminPage = await adminContext.newPage();
    await installApiMock(adminPage, { initiallyAuthenticated: true });
    await adminPage.goto(`${baseUrl}/admin/dev-roadmap`, { waitUntil: 'domcontentloaded' });
    await adminPage.locator('.shell').waitFor({ state: 'visible' });
    assert.equal(new URL(adminPage.url()).pathname, '/admin/dev-roadmap');
    assert.equal(new URL(adminPage.url()).searchParams.has('preview'), false);
  } catch (error) {
    failures.push(error);
  } finally {
    await adminContext.close();
  }

  process.env.VITE_ENABLE_PRODUCT_PREVIEW = 'false';
  const previewDisabledPort = await getFreePort();
  const previewDisabledBaseUrl = `http://127.0.0.1:${previewDisabledPort}`;
  previewDisabledVite = await createServer({
    root: ROOT_DIR,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: previewDisabledPort, strictPort: true },
  });
  await previewDisabledVite.listen();
  const previewDisabledContext = await browser.newContext();
  try {
    const previewDisabledPage = await previewDisabledContext.newPage();
    await installApiMock(previewDisabledPage, { initiallyAuthenticated: true });
    await previewDisabledPage.goto(previewDisabledBaseUrl, { waitUntil: 'domcontentloaded' });
    await previewDisabledPage.locator('.shell').waitFor({ state: 'visible' });
    assert.equal(new URL(previewDisabledPage.url()).searchParams.has('preview'), false, 'preview-disabled main domain must remain unchanged');
    assert.equal(await previewDisabledPage.locator('.product-shell-preview').count(), 0);
  } catch (error) {
    failures.push(error);
  } finally {
    await previewDisabledContext.close();
  }

  if (failures.length) {
    throw new AggregateError(failures, failures.map((error) => error.message).join('\n'));
  }

  console.log('Product entry routing regression passed.');
} finally {
  await browser.close().catch(() => {});
  await previewDisabledVite?.close().catch(() => {});
  await vite.close().catch(() => {});
  if (previousPreviewFlag === undefined) delete process.env.VITE_ENABLE_PRODUCT_PREVIEW;
  else process.env.VITE_ENABLE_PRODUCT_PREVIEW = previousPreviewFlag;
}
