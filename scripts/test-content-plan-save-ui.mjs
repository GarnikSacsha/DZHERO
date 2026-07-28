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

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-content-plan-ui-'));
const dbPath = path.join(tempDir, 'db.json');
const now = new Date().toISOString();
await writeFile(dbPath, `${JSON.stringify({
  users: [{
    id: 'usr_plan',
    name: 'Plan Owner',
    email: 'plan-owner@example.com',
    role: 'owner',
    workspaceId: 'ws_plan',
    createdAt: now,
  }],
  sessions: [{
    token: 'session_plan',
    userId: 'usr_plan',
    createdAt: now,
    expiresAt: '2030-01-01T00:00:00.000Z',
  }],
  workspaces: [{
    id: 'ws_plan',
    name: 'Plan Workspace',
    owner: 'Plan Owner',
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
    id: 'sub_plan',
    workspaceId: 'ws_plan',
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

const browser = await chromium.launch({ headless: true });
try {
  await Promise.all([
    waitForUrl(`${backendUrl}/api/health`, backend),
    waitForUrl(frontendUrl, frontend),
  ]);

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{
    name: 'dzhero_session',
    value: 'session_plan',
    url: backendUrl,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  const page = await context.newPage();
  let rejectedWrites = 0;
  await page.route(`${backendUrl}/api/workspaces/ws_plan/content-plan`, async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    rejectedWrites += 1;
    await route.fulfill({
      status: 402,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'plan_limit_reached',
        message: 'Content plan post limit reached for this plan.',
      }),
    });
  });

  await page.goto(frontendUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell', { timeout: 20_000 });
  await page.locator('[data-tour="sidebar-calendar"]').click();
  await page.waitForSelector('.page-content-plan', { timeout: 10_000 });
  await page.getByRole('button', { name: /New post|Новий пост/i }).click();
  await page.getByLabel(/Title|Назва/i).fill('Rejected calendar item');
  await page.getByRole('button', { name: /Add to calendar|Додати в календар/i }).click();
  await page.waitForTimeout(150);

  assert.equal(rejectedWrites, 1, 'The Content Plan PUT was not intercepted exactly once.');
  const toastText = await page.locator('.toast').textContent().catch(() => '');
  assert.doesNotMatch(
    String(toastText || ''),
    /added to calendar|додано в календар/i,
    `REPRODUCED: rejected Content Plan PUT still showed a success toast: ${toastText}`,
  );
  assert.equal(
    await page.locator('.gcal-event').filter({ hasText: 'Rejected calendar item' }).count(),
    0,
    'REPRODUCED: rejected Content Plan PUT remained committed in optimistic UI state.',
  );
  console.log('Content Plan rejected-save UI contract passed.');
  await context.close();
} catch (error) {
  if (backendOutput.trim()) console.error(backendOutput.trim());
  if (frontendOutput.trim()) console.error(frontendOutput.trim());
  throw error;
} finally {
  await browser.close().catch(() => {});
  await Promise.all([stopProcess(frontend), stopProcess(backend)]);
  await rm(tempDir, { recursive: true, force: true });
}
