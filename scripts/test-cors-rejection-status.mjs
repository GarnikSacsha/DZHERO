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
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForBackend(baseUrl, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited early with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
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
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-cors-repro-'));
const dbPath = path.join(tempDir, 'db.json');
await writeFile(dbPath, '{}\n', 'utf8');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    CLIENT_URL: 'https://dzhero.com.ua',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '',
    APIFY_TOKEN: '',
    YOUTUBE_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

try {
  await waitForBackend(baseUrl, child);
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://evil.example',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  });
  const payload = await response.json().catch(() => null);

  assert.equal(
    response.status,
    403,
    `REPRODUCED: rejected CORS preflight returned ${response.status} instead of 403 (${payload?.error || 'no error code'}).`,
  );
  console.log('CORS rejection status check passed.');
} catch (error) {
  if (stdout.trim()) console.error(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await stopBackend(child);
  await rm(tempDir, { recursive: true, force: true });
}
