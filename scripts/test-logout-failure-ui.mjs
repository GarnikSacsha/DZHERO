import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForUrl(url, child) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`process exited early with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-logout-failure-ui-'));
const dbPath = path.join(tempDir, 'db.json');
const now = '2026-07-25T10:00:00.000Z';
await writeFile(dbPath, `${JSON.stringify({
  users: [{
    id: 'usr_logout_failure',
    name: 'Logout Failure Owner',
    email: 'logout-failure@example.com',
    role: 'owner',
    workspaceId: 'ws_logout_failure',
    createdAt: now,
  }],
  sessions: [{
    token: 'session_logout_failure',
    userId: 'usr_logout_failure',
    createdAt: now,
    expiresAt: '2030-01-01T00:00:00.000Z',
  }],
  workspaces: [{
    id: 'ws_logout_failure',
    name: 'Logout Failure Workspace',
    handle: '@logout_failure',
    type: 'Workspace',
    owner: 'Logout Failure Owner',
    mode: 'own_business',
    marketFocus: ['ua'],
    brief: {
      businessType: 'Coffee shop',
      product: 'Coffee and pastries',
      audience: 'Office commuters',
      offer: 'Morning set',
      cta: 'Visit today',
      toneOfVoice: 'Warm',
    },
    contentPlanPosts: [],
    createdAt: now,
  }],
  subscriptions: [{
    id: 'sub_logout_failure',
    workspaceId: 'ws_logout_failure',
    planId: 'pro',
    status: 'active',
    currentPeriodEnd: '2030-01-01T00:00:00.000Z',
    createdAt: now,
  }],
}, null, 2)}\n`, 'utf8');

const backendPort = await getFreePort();
const frontendPort = await getFreePort();
const backendUrl = `http://127.0.0.1:${backendPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

const backend = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(backendPort),
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    CLIENT_URL: frontendUrl,
    ALLOW_DEMO_LOGIN: 'false',
    ENABLE_AGENT_STUDIO: 'false',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '',
    APIFY_TOKEN: '',
    YOUTUBE_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const frontend = spawn(
  process.execPath,
  [path.join(ROOT_DIR, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'],
  {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      VITE_API_URL: `${backendUrl}/api`,
      VITE_ENABLE_AGENT_STUDIO: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let backendOutput = '';
let frontendOutput = '';
backend.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
backend.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });
frontend.stdout.on('data', (chunk) => { frontendOutput += chunk.toString(); });
frontend.stderr.on('data', (chunk) => { frontendOutput += chunk.toString(); });

let browser;
try {
  await Promise.all([
    waitForUrl(`${backendUrl}/api/health`, backend),
    waitForUrl(frontendUrl, frontend),
  ]);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{
    name: 'dzhero_session',
    value: 'session_logout_failure',
    url: backendUrl,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('insta-producer-language', 'en');
    localStorage.setItem('dzhero-active-workspace', 'ws_logout_failure');
  });

  let authMeRequestCount = 0;
  await page.route(`${backendUrl}/api/auth/me`, async (route) => {
    authMeRequestCount += 1;
    if (authMeRequestCount > 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await route.continue();
  });
  await page.route(`${backendUrl}/api/auth/logout`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'logout_failed',
        message: 'The session store is temporarily unavailable.',
      }),
    });
  });

  await page.goto(frontendUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell', { timeout: 20_000 });
  assert.equal(authMeRequestCount, 1, 'Initial authentication did not use exactly one /auth/me request.');

  await page.evaluate(() => {
    window.__logoutFailureGuestClaimSeen = false;
    window.__logoutFailureObserver = new MutationObserver(() => {
      if (document.querySelector('.auth-page')) window.__logoutFailureGuestClaimSeen = true;
    });
    window.__logoutFailureObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });

  const logoutResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && response.url() === `${backendUrl}/api/auth/logout`
  ));

  await page.locator('.user-account-trigger').click();
  await page.locator('.workspace-logout').click();

  const logoutResponse = await logoutResponsePromise;
  assert.equal(logoutResponse.status(), 503, 'The test did not inject the intended logout failure.');
  await page.locator('.toast').filter({
    hasText: /session is still active|Сесія все ще активна/i,
  }).waitFor({ state: 'visible', timeout: 5_000 });
  await page.waitForTimeout(400);
  await page.waitForSelector('.shell', { timeout: 10_000 });

  const observed = await page.evaluate(() => {
    window.__logoutFailureObserver?.disconnect();
    return {
      guestClaimSeen: Boolean(window.__logoutFailureGuestClaimSeen),
      authenticatedShellVisible: Boolean(document.querySelector('.shell')),
      toastText: document.querySelector('.toast')?.textContent || '',
    };
  });
  const successLogoutClaim = /logged out|signed out|вийшли/i.test(observed.toastText);
  const retryableFailureClaim = /session is still active|Сесія все ще активна/i.test(observed.toastText);

  assert.equal(
    authMeRequestCount,
    1,
    'A failed logout must not trigger a redundant /auth/me reauthentication request.',
  );
  assert.equal(observed.authenticatedShellVisible, true, 'A failed logout must preserve the authenticated shell.');
  assert.equal(retryableFailureClaim, true, `A failed logout must show a retryable error: ${observed.toastText}`);
  assert.equal(
    successLogoutClaim || observed.guestClaimSeen,
    false,
    [
      'A failed logout was presented as a successful or guest logout.',
      `successToast=${successLogoutClaim}`,
      `guestClaimSeen=${observed.guestClaimSeen}`,
      `toast=${JSON.stringify(observed.toastText)}`,
    ].join(' '),
  );

  console.log('Logout failure UI contract passed.');
  await context.close();
} catch (error) {
  if (backendOutput.trim()) console.error(backendOutput.trim());
  if (frontendOutput.trim()) console.error(frontendOutput.trim());
  throw error;
} finally {
  await browser?.close().catch(() => {});
  await Promise.all([stopProcess(frontend), stopProcess(backend)]);
  await rm(tempDir, { recursive: true, force: true });
}
