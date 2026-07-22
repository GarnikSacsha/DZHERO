import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function getFreePort() {
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
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function isVisible(locator) {
  return locator.count().then((count) => count > 0 && locator.first().isVisible()).catch(() => false);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-launch-ui-'));
const dbPath = path.join(tempDir, 'db.json');
await writeFile(dbPath, '{}\n', 'utf8');
const backendPort = await getFreePort();
const frontendPort = await getFreePort();
const backendUrl = `http://127.0.0.1:${backendPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

const backend = spawn(process.execPath, [path.join(ROOT_DIR, 'backend', 'server.js')], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(backendPort),
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    CLIENT_URL: frontendUrl,
    ALLOW_DEMO_LOGIN: 'true',
    ENABLE_AGENT_STUDIO: 'false',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '',
    APIFY_TOKEN: '',
    YOUTUBE_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const frontend = spawn(process.execPath, [path.join(ROOT_DIR, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    VITE_API_URL: `${backendUrl}/api`,
    VITE_ENABLE_AGENT_STUDIO: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

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

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const securityConsoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /content security policy|fonts\.googleapis|fonts\.gstatic/i.test(message.text())) {
        securityConsoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(frontendUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'), 'https://dzhero.com.ua/og-image.png');
    assert.ok(await page.locator('meta[name="description"]').getAttribute('content'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), `${viewport.name} landing overflows horizontally`);

    const demoButton = page.getByRole('button', { name: /view demo|start with demo|demo|демо/i }).first();
    assert.equal(await isVisible(demoButton), true, `${viewport.name} demo entry is unavailable`);
    await demoButton.click();
    await page.waitForSelector('.shell', { timeout: 20_000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), `${viewport.name} app shell overflows horizontally`);
    assert.deepEqual(pageErrors, [], `${viewport.name} page errors: ${pageErrors.join('; ')}`);
    assert.deepEqual(securityConsoleErrors, [], `${viewport.name} CSP/font errors: ${securityConsoleErrors.join('; ')}`);
    await context.close();
  }

  const request = await browser.newContext();
  for (const pathname of ['/robots.txt', '/sitemap.xml', '/.well-known/security.txt', '/site.webmanifest', '/og-image.png']) {
    const response = await request.request.get(`${frontendUrl}${pathname}`);
    assert.equal(response.status(), 200, `${pathname} returned ${response.status()}`);
  }
  await request.close();
  console.log('Local desktop/mobile launch UI checks passed.');
} catch (error) {
  if (backendOutput.trim()) console.error(backendOutput.trim());
  if (frontendOutput.trim()) console.error(frontendOutput.trim());
  throw error;
} finally {
  await browser.close().catch(() => {});
  await Promise.all([stopProcess(frontend), stopProcess(backend)]);
  await rm(tempDir, { recursive: true, force: true });
}
