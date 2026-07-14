import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
    server.on('error', reject);
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Retry until ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('preview budget server did not start');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'public-preview-budget-'));
const dbPath = path.join(tempDir, 'db.json');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const period = new Date().toISOString().slice(0, 10);
await writeFile(dbPath, `${JSON.stringify({
  usageCounters: [{
    id: 'usage_public_preview',
    workspaceId: 'platform_global',
    metric: 'public_brand_scan_preview',
    period,
    value: 20,
  }],
}, null, 2)}\n`, 'utf8');

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DB_PATH: dbPath,
    CLIENT_URL: baseUrl,
    APIFY_TOKEN: 'configured-so-preview-is-paid',
    GEMINI_API_KEY: '',
    PUBLIC_PREVIEW_GLOBAL_DAILY_LIMIT: '20',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

try {
  await waitForServer(baseUrl, child);
  const response = await fetch(`${baseUrl}/api/brand-scan/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl },
    body: JSON.stringify({ input: 'A local coffee shop in Kyiv' }),
  });
  const body = await response.json();
  assert.equal(response.status, 429);
  assert.equal(body.error, 'preview_global_daily_limit_reached');
  console.log('public preview budget tests passed');
} catch (error) {
  if (stdout.trim()) console.error(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await stopServer(child);
  await rm(tempDir, { recursive: true, force: true });
}
