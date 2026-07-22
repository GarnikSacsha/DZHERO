import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');
const ORIGIN = 'https://dzhero.com.ua';

function hashPassword(password, salt = 'launch-guard-test-salt') {
  const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

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
      // Keep polling.
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

async function postJson(baseUrl, pathname, data) {
  return fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      referer: `${ORIGIN}/`,
    },
    body: JSON.stringify(data),
  });
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-auth-guards-'));
const dbPath = path.join(tempDir, 'db.json');
const now = Date.now();
const db = {
  users: [{
    id: 'usr_existing',
    name: 'Existing User',
    email: 'existing@example.com',
    role: 'owner',
    workspaceId: 'ws_existing',
    passwordHash: hashPassword('password-123'),
    createdAt: new Date(now - 86_400_000).toISOString(),
  }],
  sessions: [
    { token: 'expired', userId: 'usr_existing', createdAt: new Date(now - 90_000).toISOString(), expiresAt: new Date(now - 60_000).toISOString() },
    { token: 'active-old', userId: 'usr_existing', createdAt: new Date(now - 50_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString() },
    { token: 'active-new', userId: 'usr_existing', createdAt: new Date(now - 40_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString() },
  ],
  workspaces: [{ id: 'ws_existing', name: 'Existing Workspace', owner: 'Existing User', brief: {}, createdAt: new Date(now).toISOString() }],
  subscriptions: [{ id: 'sub_existing', workspaceId: 'ws_existing', planId: 'trial', status: 'trialing', trialEndsAt: '2030-01-01T00:00:00.000Z' }],
};
await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');

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
    CLIENT_URL: ORIGIN,
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '',
    APIFY_TOKEN: '',
    YOUTUBE_API_KEY: '',
    REGISTER_RATE_LIMIT_PER_HOUR: '2',
    MAX_ACTIVE_SESSIONS_PER_USER: '2',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

try {
  await waitForBackend(baseUrl, child);
  const login = await postJson(baseUrl, '/api/auth/login', {
    email: 'existing@example.com',
    password: 'password-123',
  });
  assert.equal(login.status, 200, await login.text());

  const registrationStatuses = [];
  for (let index = 1; index <= 3; index += 1) {
    const response = await postJson(baseUrl, '/api/auth/register', {
      name: `Launch User ${index}`,
      email: `launch-${index}@example.com`,
      password: 'password-123',
    });
    registrationStatuses.push(response.status);
    await response.text();
  }

  const persisted = JSON.parse(await readFile(dbPath, 'utf8'));
  const existingSessions = persisted.sessions.filter((session) => session.userId === 'usr_existing');
  const failures = [];
  if (existingSessions.some((session) => Date.parse(session.expiresAt || '') <= Date.now())) {
    failures.push('expired sessions were not pruned');
  }
  if (existingSessions.length > 2) {
    failures.push(`active session cap was not enforced (${existingSessions.length} > 2)`);
  }
  if (registrationStatuses.join(',') !== '201,201,429') {
    failures.push(`registration limiter returned ${registrationStatuses.join(',')} instead of 201,201,429`);
  }
  assert.deepEqual(failures, [], `REPRODUCED: ${failures.join('; ')}`);
  console.log('Launch auth guard checks passed.');
} catch (error) {
  if (stdout.trim()) console.error(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await stopBackend(child);
  await rm(tempDir, { recursive: true, force: true });
}
