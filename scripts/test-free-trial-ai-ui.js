const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { copyFile, mkdtemp, rm } = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.on('error', reject);
  });
}

function startProcess(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: ROOT_DIR,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  child.getOutput = () => output;
  return child;
}

async function waitForUrl(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`process exited before ${url} was ready:\n${child.getOutput()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Runtime is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${url}:\n${child.getOutput()}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

async function enterDemo(page) {
  if (await page.locator('.shell').count()) return;
  await page.getByRole('button', { name: /demo|демо/i }).first().click();
  await page.waitForSelector('.shell', { timeout: 20_000 });
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-free-trial-ai-ui-'));
  const dbPath = path.join(tempDir, 'db.json');
  await copyFile(path.join(ROOT_DIR, 'backend', 'data', 'db.json'), dbPath);
  const backendPort = await getFreePort();
  const frontendPort = await getFreePort();
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const frontendUrl = `http://127.0.0.1:${frontendPort}`;
  const backend = startProcess(['backend/server.js'], {
    PORT: String(backendPort),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    CLIENT_URL: frontendUrl,
    ALLOW_DEMO_LOGIN: 'true',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '',
    APIFY_TOKEN: '',
    YOUTUBE_API_KEY: '',
  });
  const frontend = startProcess([
    'node_modules/vite/bin/vite.js',
    '--host', '127.0.0.1',
    '--port', String(frontendPort),
    '--strictPort',
  ], {
    VITE_API_URL: `${backendUrl}/api`,
  });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const failures = [];
  let resolveChatRequest;
  const chatRequest = new Promise((resolve) => { resolveChatRequest = resolve; });
  const check = async (label, assertion) => {
    try {
      await assertion();
    } catch (error) {
      error.message = `${label}: ${error.message}`;
      failures.push(error);
    }
  };

  try {
    await Promise.all([
      waitForUrl(`${backendUrl}/api/health`, backend),
      waitForUrl(frontendUrl, frontend),
    ]);
    await page.route('**/api/workspaces/*/agent/context', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        complete: true,
        brief: {
          businessType: 'Coffee shop',
          product: 'Coffee',
          audience: 'Local customers',
          toneOfVoice: 'Clear',
          goals: ['Adapt a signal'],
        },
      }),
    }));
    await page.goto(frontendUrl, { waitUntil: 'domcontentloaded' });
    await enterDemo(page);

    await page.route('**/api/workspaces/*/remix/generate', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'ai_provider_not_configured' }),
    }));
    await page.waitForFunction(() => !document.querySelector('[data-tour="sidebar-transcript"]')?.hasAttribute('disabled'));
    await page.locator('[data-tour="sidebar-transcript"]').click();
    await page.waitForSelector('.signal-adapt-button', { timeout: 20_000 });
    await page.locator('.signal-adapt-button').first().click();
    await page.waitForSelector('.studio-error-note', { timeout: 10_000 });
    await check('Studio must keep provider failure as a draft', async () => {
      const studioText = await page.locator('.remix-bottom').innerText();
      assert.doesNotMatch(studioText, /Готова структура/);
      assert.match(studioText, /чернетк|draft/i);
    });

    await page.route('**/api/workspaces/*/agent/chat', (route) => {
      resolveChatRequest();
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'daily_agent_chat_limit_reached' }),
      });
    });
    await page.locator('.jeryk-idle-card').click();
    await page.locator('.jeryk-prompts button').first().click();
    await chatRequest;
    await page.waitForFunction(() => !document.querySelector('.jeryk-prompts button')?.hasAttribute('disabled'));
    await check('Jeryk quota failure must not be relabelled as OFFLINE', async () => {
      assert.doesNotMatch(await page.locator('.jeryk-context em').innerText(), /offline/i);
    });

    if (failures.length) {
      throw new AggregateError(failures, 'Free Trial UI regression assertions failed');
    }
    console.log('Free Trial UI regression checks passed.');
  } finally {
    await browser.close().catch(() => {});
    await Promise.all([stopProcess(frontend), stopProcess(backend)]);
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
