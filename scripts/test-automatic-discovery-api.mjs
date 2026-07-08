import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');

function createEmptyDb() {
  return {
    users: [],
    sessions: [],
    workspaces: [],
    competitors: [],
    reels: [],
    ideas: [],
    leads: [],
    syncJobs: [],
    sources: [],
    metaStates: [],
    instagramAccounts: [],
    tiktokAccounts: [],
    aiMemory: [],
    aiJobs: [],
    remixes: [],
    contentPlanItems: [],
    videoJobs: [],
    dataDeletionRequests: [],
    plans: [],
    subscriptions: [],
    usageCounters: [],
    demoSessions: [],
    discoveryRuns: [],
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
    server.on('error', reject);
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until the server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('timed out waiting for backend health check');
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  let body = null;
  if (text && contentType.includes('application/json')) {
    body = JSON.parse(text);
  }
  return { response, body, text };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'automatic-discovery-api-'));
const dbPath = path.join(tempDir, 'db.json');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;

await writeFile(dbPath, `${JSON.stringify(createEmptyDb(), null, 2)}\n`, 'utf8');

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'development',
    DB_PATH: dbPath,
    APIFY_TOKEN: 'test-apify-token',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  await waitForServer(baseUrl, child);

  const auth = await requestJson(baseUrl, '/api/auth/email', {
    method: 'POST',
    body: JSON.stringify({ email: 'automatic-discovery-smoke@example.com' }),
  });
  assert.equal(auth.response.status, 201);
  assert.ok(auth.body?.token);
  assert.ok(auth.body?.user?.workspaceId);

  const token = auth.body.token;
  const workspaceId = auth.body.user.workspaceId;
  const headers = {
    authorization: `Bearer ${token}`,
  };

  const initialStatus = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery`, {
    headers,
  });
  assert.equal(initialStatus.response.status, 200);
  assert.equal(initialStatus.body?.settings?.enabled, true);
  assert.equal(initialStatus.body?.settings?.dailyBudgetUsd, 0.8);
  assert.equal(initialStatus.body?.status?.dailySpendUsd, 0);

  const patchedStatus = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(patchedStatus.response.status, 200);
  assert.equal(patchedStatus.body?.settings?.enabled, false);

  const manualRun = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  assert.equal(manualRun.response.status, 201);
  assert.equal(manualRun.body?.run?.status, 'paused');
  assert.equal(manualRun.body?.run?.budgetUsd, 0.8);

  const persistedState = JSON.parse(await readFile(dbPath, 'utf8'));
  const persistedRun = persistedState.discoveryRuns?.find((run) => run.workspaceId === workspaceId);
  assert.equal(persistedRun?.status, 'paused');

  const budgetBlockedState = JSON.parse(await readFile(dbPath, 'utf8'));
  const workspace = budgetBlockedState.workspaces.find((item) => item.id === workspaceId);
  workspace.discoverySettings = {
    ...(workspace.discoverySettings || {}),
    enabled: true,
  };
  budgetBlockedState.discoveryRuns.unshift({
    id: 'automatic_budget_cap_reached',
    workspaceId,
    lane: 'automatic',
    status: 'completed',
    actualCostUsd: 0.8,
    completedAt: new Date().toISOString(),
  });
  await writeFile(dbPath, `${JSON.stringify(budgetBlockedState, null, 2)}\n`, 'utf8');

  const blockedRun = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  assert.equal(blockedRun.response.status, 429);
  assert.equal(blockedRun.body?.error, 'automatic_budget_reached');

  console.log('automatic discovery API smoke tests passed');
} catch (error) {
  if (stdout.trim()) {
    console.error(stdout.trim());
  }
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  throw error;
} finally {
  await stopServer(child);
  await rm(tempDir, { recursive: true, force: true });
}
