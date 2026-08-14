import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');
const require = createRequire(import.meta.url);
const {
  getInstagramUsernameFromUrl,
  isInstagramHostname,
} = require('../backend/services/instagramUrl.cjs');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function getFreePort() {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitForBackend(baseUrl, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited early with ${child.exitCode}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // Keep polling until the isolated backend is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('isolated backend did not start');
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

for (const hostname of ['instagram.com', 'www.instagram.com', 'WWW.INSTAGRAM.COM.', 'instagram.com.']) {
  assert.equal(isInstagramHostname(hostname), true, `${hostname} should be an accepted Instagram hostname`);
}
for (const hostname of ['evilinstagram.com', 'instagram.com.attacker.test', 'www.instagram.com.attacker.test', 'notinstagram.com']) {
  assert.equal(isInstagramHostname(hostname), false, `${hostname} must not be accepted as Instagram`);
}
assert.equal(getInstagramUsernameFromUrl('https://www.instagram.com/valid.handle/'), 'valid.handle');
assert.equal(getInstagramUsernameFromUrl('https://evilinstagram.com/valid.handle/'), '');
assert.equal(getInstagramUsernameFromUrl('https://instagram.com.attacker.test/valid.handle/'), '');

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-oauth-callback-security-'));
const dbPath = path.join(tempDir, 'db.json');
await writeFile(dbPath, '{}\n', 'utf8');
const backendPort = await getFreePort();
const baseUrl = `http://127.0.0.1:${backendPort}`;
const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(backendPort),
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    CLIENT_URL: 'https://dzhero.com.ua',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    ALLOW_DEMO_LOGIN: 'false',
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '',
    APIFY_TOKEN: '',
    YOUTUBE_API_KEY: '',
    META_APP_ID: '',
    META_APP_SECRET: '',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    INSTAGRAM_APP_ID: '',
    INSTAGRAM_APP_SECRET: '',
    TIKTOK_CLIENT_KEY: '',
    TIKTOK_CLIENT_SECRET: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });

const marker = 'oauth-callback-untrusted-marker';
try {
  await waitForBackend(baseUrl, child);
  for (const route of [
    '/api/auth/meta/callback',
    '/api/auth/callback/google',
    '/api/auth/instagram/callback',
    '/api/auth/tiktok/callback',
  ]) {
    const response = await fetch(`${baseUrl}${route}?error=access_denied&error_description=${marker}`);
    const body = await response.text();
    assert.equal(response.status, 400, `${route} should reject the provider error`);
    assert.match(response.headers.get('content-type') || '', /^application\/json(?:;|$)/i, `${route} must not return HTML`);
    assert.equal(body.includes(marker), false, `${route} reflected an untrusted provider parameter`);
    assert.equal(body.includes('<'), false, `${route} exposed an HTML execution surface`);
    assert.deepEqual(JSON.parse(body), { error: 'oauth_provider_error' });
  }
  console.log('OAuth callback error response security contract passed.');
  console.log('Provider/network calls: 0.');
} catch (error) {
  if (backendOutput.trim()) console.error(backendOutput.trim());
  throw error;
} finally {
  await stopBackend(child);
  await rm(tempDir, { recursive: true, force: true });
}
