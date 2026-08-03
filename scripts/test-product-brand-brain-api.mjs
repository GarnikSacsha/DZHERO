import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');

function emptyDb() {
  return {
    users: [], sessions: [], workspaces: [], competitors: [], reels: [], ideas: [], leads: [],
    syncJobs: [], sources: [], metaStates: [], instagramAccounts: [], tiktokAccounts: [],
    aiMemory: [], aiJobs: [], remixes: [], contentPlanItems: [], videoJobs: [],
    dataDeletionRequests: [], plans: [], subscriptions: [], usageCounters: [], demoSessions: [],
    discoveryRuns: [], testerAccess: [],
  };
}

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

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  return { response, body: await response.json().catch(() => ({})) };
}

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited early: ${output()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`backend startup timed out: ${output()}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'product-brand-brain-api-'));
const dbPath = path.join(tempDir, 'db.json');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
await writeFile(dbPath, `${JSON.stringify(emptyDb(), null, 2)}\n`, 'utf8');

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    APIFY_TOKEN: '',
    GEMINI_API_KEY: '',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    ADMIN_TOKEN: 'offline-admin-token',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

try {
  await waitForServer(baseUrl, child, () => output);
  const registration = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Product Integration',
      email: 'product-integration@example.com',
      password: 'test-password-1',
    }),
  });
  assert.equal(registration.response.status, 201);
  const token = registration.body.token;
  const workspaceId = registration.body.user.workspaceId;
  const headers = { Authorization: `Bearer ${token}` };

  const incompleteBrand = {
    id: 'brand-backend',
    name: 'Backend Brand',
    brain: {
      profileDescription: 'An AI content producer for practical teams.',
      audience: 'Small product teams',
      niche: '',
      market: '',
      instagramUrl: '',
    },
  };
  const savedIncomplete = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context/redesign`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ brand: incompleteBrand }),
  });
  assert.equal(savedIncomplete.response.status, 200);
  assert.equal(savedIncomplete.body.complete, true);
  assert.deepEqual(savedIncomplete.body.missingFields, []);

  const restored = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context`, { headers });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.productBrand.id, incompleteBrand.id);
  assert.equal(restored.body.productBrand.brain.profileDescription, incompleteBrand.brain.profileDescription);

  const db = JSON.parse(await readFile(dbPath, 'utf8'));
  const user = db.users.find((item) => item.id === registration.body.user.id);
  user.authProvider = 'google';
  user.oauthProviders = ['google'];
  await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  const tester = await requestJson(baseUrl, '/api/admin/testers/grant', {
    method: 'POST',
    headers: { 'x-admin-token': 'offline-admin-token' },
    body: JSON.stringify({ email: 'product-integration@example.com' }),
  });
  assert.equal(tester.response.status, 201);

  const blockedProvider = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ surface: 'product_redesign', activeBrandId: incompleteBrand.id }),
  });
  assert.equal(blockedProvider.response.status, 501);
  assert.equal(blockedProvider.body.error, 'apify_not_configured');

  const completeBrand = {
    ...incompleteBrand,
    brain: {
      ...incompleteBrand.brain,
      niche: 'AI workflow automation',
      market: 'Ukraine and Europe',
    },
  };
  const savedComplete = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context/redesign`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ brand: completeBrand }),
  });
  assert.equal(savedComplete.response.status, 200);
  assert.equal(savedComplete.body.complete, true);

  const persisted = JSON.parse(await readFile(dbPath, 'utf8'));
  const persistedWorkspace = persisted.workspaces.find((item) => item.id === workspaceId);
  assert.equal(persistedWorkspace.productBrandBrain.id, completeBrand.id);
  assert.equal(persistedWorkspace.productBrandBrain.brain.niche, completeBrand.brain.niche);
  assert.equal(persisted.discoveryRuns.length, 0, 'blocked preflights must not persist fake successful runs');
} finally {
  await stopServer(child);
  await rm(tempDir, { recursive: true, force: true });
}

console.log('Product Brand Brain backend API checks passed with zero provider calls.');
