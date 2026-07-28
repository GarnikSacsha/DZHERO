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

function buildRun(workspaceId, marker) {
  const now = '2026-07-25T10:00:00.000Z';
  return {
    id: `agent_run_${workspaceId}`,
    workspaceId,
    input: {
      mode: 'adapt_reel',
      objective: `${marker} objective`,
      outputLanguage: 'en',
      sourceUrl: `https://example.com/${workspaceId}`,
    },
    status: 'awaiting_approval',
    currentStage: 'awaiting_approval',
    artifacts: {
      creative: {
        heroReel: {
          id: `hero_${workspaceId}`,
          kind: 'hero',
          title: marker,
          concept: `${marker} concept`,
          hook: `${marker} hook`,
          cta: `${marker} CTA`,
          scenes: [
            { timeframe: '0-2s', action: `${marker} opening` },
            { timeframe: '2-5s', action: `${marker} proof` },
          ],
          productionNotes: [`${marker} production note`],
        },
        alternatives: [],
      },
      managerReview: {
        headline: `${marker} manager review`,
        whyItWorks: `${marker} rationale`,
        approvalPrompt: `Approve ${marker}?`,
      },
      contentPlan: { strategy: `${marker} strategy`, days: [] },
    },
    trace: [],
    contextRequest: null,
    outputRepairCount: 0,
    criticRevisionCount: 0,
    approval: null,
    error: null,
    usageSummary: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-agent-workspace-race-'));
const dbPath = path.join(tempDir, 'db.json');
const now = '2026-07-25T10:00:00.000Z';
const completeBrief = {
  businessType: 'Coffee shop',
  product: 'Coffee and pastries',
  audience: 'Office commuters',
  offer: 'Morning set',
  cta: 'Visit today',
  toneOfVoice: 'Warm',
};
await writeFile(dbPath, `${JSON.stringify({
  users: [{
    id: 'usr_workspace_race',
    name: 'Workspace Race Owner',
    email: 'workspace-race@example.com',
    role: 'owner',
    workspaceId: 'ws_a',
    workspaceIds: ['ws_a', 'ws_b'],
    createdAt: now,
  }],
  sessions: [{
    token: 'session_workspace_race',
    userId: 'usr_workspace_race',
    createdAt: now,
    expiresAt: '2030-01-01T00:00:00.000Z',
  }],
  workspaces: [
    {
      id: 'ws_a',
      name: 'Workspace A',
      handle: '@workspace_a',
      type: 'Workspace',
      owner: 'Workspace Race Owner',
      mode: 'own_business',
      marketFocus: ['ua'],
      brief: completeBrief,
      contentPlanPosts: [],
      createdAt: now,
    },
    {
      id: 'ws_b',
      name: 'Workspace B',
      handle: '@workspace_b',
      type: 'Workspace',
      owner: 'Workspace Race Owner',
      mode: 'own_business',
      marketFocus: ['ua'],
      brief: completeBrief,
      contentPlanPosts: [],
      createdAt: now,
    },
  ],
  subscriptions: [
    {
      id: 'sub_a',
      workspaceId: 'ws_a',
      planId: 'pro',
      status: 'active',
      currentPeriodEnd: '2030-01-01T00:00:00.000Z',
      createdAt: now,
    },
    {
      id: 'sub_b',
      workspaceId: 'ws_b',
      planId: 'pro',
      status: 'active',
      currentPeriodEnd: '2030-01-01T00:00:00.000Z',
      createdAt: now,
    },
  ],
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
    ENABLE_AGENT_STUDIO: 'true',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    OPENAI_API_KEY: 'test-openai-key',
    GEMINI_API_KEY: 'test-gemini-key',
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
      VITE_ENABLE_AGENT_STUDIO: 'true',
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
let releaseWorkspaceA;
try {
  await Promise.all([
    waitForUrl(`${backendUrl}/api/health`, backend),
    waitForUrl(frontendUrl, frontend),
  ]);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{
    name: 'dzhero_session',
    value: 'session_workspace_race',
    url: backendUrl,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('insta-producer-language', 'en');
    localStorage.setItem('dzhero-active-workspace', 'ws_a');
  });

  let markWorkspaceARequested;
  const workspaceARequested = new Promise((resolve) => {
    markWorkspaceARequested = resolve;
  });
  let markWorkspaceAFulfilled;
  const workspaceAFulfilled = new Promise((resolve) => {
    markWorkspaceAFulfilled = resolve;
  });
  let workspaceBRequests = 0;

  await page.route(/\/api\/workspaces\/ws_[ab]\/agent-studio\/runs\/latest\?language=en$/, async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.includes('/workspaces/ws_a/')) {
      markWorkspaceARequested();
      await new Promise((resolve) => {
        releaseWorkspaceA = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ run: buildRun('ws_a', 'WORKSPACE_A_ARTIFACT') }),
      });
      markWorkspaceAFulfilled();
      return;
    }

    workspaceBRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ run: buildRun('ws_b', 'WORKSPACE_B_ARTIFACT') }),
    });
  });

  await page.goto(frontendUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell', { timeout: 20_000 });
  const agentStudioNav = page.locator('[data-tour="sidebar-agent-studio"]');
  await agentStudioNav.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-tour="sidebar-agent-studio"]');
    return button && !button.disabled;
  });
  await agentStudioNav.click();
  await workspaceARequested;

  await page.locator('.user-account-trigger').click();
  await page.locator('.workspace-menu button').filter({ hasText: 'Workspace B' }).click();
  await page.waitForFunction(() => localStorage.getItem('dzhero-active-workspace') === 'ws_b');
  await page.locator('.agent-studio-candidate h4').filter({ hasText: /^WORKSPACE_B_ARTIFACT$/ })
    .waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(workspaceBRequests, 1, 'Workspace B latest run was not restored exactly once.');

  await page.evaluate((marker) => {
    window.__workspaceAArtifactSeenInB = document.body.innerText.includes(marker);
    window.__workspaceAArtifactObserver = new MutationObserver(() => {
      if (document.body.innerText.includes(marker)) window.__workspaceAArtifactSeenInB = true;
    });
    window.__workspaceAArtifactObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, 'WORKSPACE_A_ARTIFACT');

  assert.equal(typeof releaseWorkspaceA, 'function', 'Workspace A response was not held for deterministic release.');
  releaseWorkspaceA();
  await workspaceAFulfilled;
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    window.__workspaceAArtifactObserver?.disconnect();
    return {
      activeWorkspaceId: localStorage.getItem('dzhero-active-workspace'),
      workspaceASeen: Boolean(window.__workspaceAArtifactSeenInB),
      bodyText: document.body.innerText,
    };
  });
  assert.equal(result.activeWorkspaceId, 'ws_b', 'The test was no longer observing workspace B.');
  assert.equal(
    result.workspaceASeen,
    false,
    'REPRODUCED: delayed workspace A restore response rendered its artifact after workspace B became active.',
  );
  assert.match(result.bodyText, /WORKSPACE_B_ARTIFACT/);
  assert.doesNotMatch(result.bodyText, /WORKSPACE_A_ARTIFACT/);

  console.log('Agent Studio workspace restore race contract passed.');
  await context.close();
} catch (error) {
  if (backendOutput.trim()) console.error(backendOutput.trim());
  if (frontendOutput.trim()) console.error(frontendOutput.trim());
  throw error;
} finally {
  if (typeof releaseWorkspaceA === 'function') releaseWorkspaceA();
  await browser?.close().catch(() => {});
  await Promise.all([stopProcess(frontend), stopProcess(backend)]);
  await rm(tempDir, { recursive: true, force: true });
}
