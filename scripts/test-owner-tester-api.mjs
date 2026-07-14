import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');

function createDb() {
  const now = '2026-07-14T10:00:00.000Z';
  return {
    users: [
      { id: 'usr_owner', name: 'Owner', email: 'owner@example.com', role: 'owner', workspaceId: 'ws_owner', createdAt: now },
      {
        id: 'usr_regular',
        name: 'Regular',
        email: 'regular@example.com',
        role: 'owner',
        workspaceId: 'ws_regular',
        authProvider: 'google',
        oauthProviders: ['google'],
        createdAt: now,
      },
    ],
    sessions: [
      { token: 'owner_session', userId: 'usr_owner', expiresAt: '2030-01-01T00:00:00.000Z' },
      { token: 'regular_session', userId: 'usr_regular', expiresAt: '2030-01-01T00:00:00.000Z' },
    ],
    workspaces: [
      { id: 'ws_owner', name: 'Owner workspace', owner: 'Owner', createdAt: now, brief: {} },
      { id: 'ws_regular', name: 'Regular workspace', owner: 'Regular', createdAt: now, brief: {} },
    ],
    subscriptions: [
      { id: 'sub_owner', workspaceId: 'ws_owner', planId: 'trial', status: 'trialing', trialEndsAt: '2030-01-01T00:00:00.000Z' },
      { id: 'sub_regular', workspaceId: 'ws_regular', planId: 'trial', status: 'trialing', trialEndsAt: '2030-01-01T00:00:00.000Z' },
    ],
    testerAccessGrants: [],
    usageCounters: [{
      id: 'usage_regular_ai',
      workspaceId: 'ws_regular',
      metric: 'ai_operations',
      period: '2026-07',
      value: 50,
      createdAt: now,
      updatedAt: now,
    }],
  };
}

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
      // Retry until the temporary server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('owner tester API server did not start');
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
  let body = null;
  if (text && (response.headers.get('content-type') || '').includes('application/json')) {
    body = JSON.parse(text);
  }
  return { response, body, text };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'owner-tester-api-'));
const dbPath = path.join(tempDir, 'db.json');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
await writeFile(dbPath, `${JSON.stringify(createDb(), null, 2)}\n`, 'utf8');

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DB_PATH: dbPath,
    CLIENT_URL: baseUrl,
    UNLIMITED_ACCESS_EMAILS: 'owner@example.com',
    ADMIN_TOKEN: 'test-admin-token',
    GEMINI_API_KEY: 'must-not-be-called-at-limit',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

const ownerHeaders = { authorization: 'Bearer owner_session' };
const regularHeaders = { authorization: 'Bearer regular_session' };

try {
  await waitForServer(baseUrl, child);

  const removedEmailLogin = await requestJson(baseUrl, '/api/auth/email', {
    method: 'POST',
    body: JSON.stringify({ email: 'removed@example.com' }),
  });
  assert.equal(removedEmailLogin.response.status, 404);

  let result = await requestJson(baseUrl, '/api/owner/testers', { headers: ownerHeaders });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.testers, []);

  const denied = await requestJson(baseUrl, '/api/owner/testers', { headers: regularHeaders });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error, 'owner_access_required');

  const invalid = await requestJson(baseUrl, '/api/owner/testers', {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ email: 'not-an-email' }),
  });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error, 'valid_email_required');

  const pending = await requestJson(baseUrl, '/api/owner/testers', {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ email: ' Future.Tester@Example.com ', note: 'feedback group' }),
  });
  assert.equal(pending.response.status, 201);
  assert.equal(pending.body.tester.email, 'future.tester@example.com');
  assert.equal(pending.body.tester.status, 'pending');

  const active = await requestJson(baseUrl, '/api/owner/testers', {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ email: 'REGULAR@example.com' }),
  });
  assert.equal(active.response.status, 201);
  assert.equal(active.body.tester.status, 'active');
  assert.equal(active.body.tester.workspaceId, 'ws_regular');

  const testerBilling = await requestJson(baseUrl, '/api/workspaces/ws_regular/billing', { headers: regularHeaders });
  assert.equal(testerBilling.response.status, 200);
  assert.equal(testerBilling.body.plan.id, 'tester_pro');
  assert.equal(testerBilling.body.plan.limits.aiOperations, 50);
  assert.equal(testerBilling.body.plan.limits.reelImports, 30);
  assert.equal(testerBilling.body.accessSource, 'tester_grant');
  assert.equal(testerBilling.body.unlimited, false);
  assert.equal(testerBilling.body.usage.aiOperations, 50);

  const blockedSecondWorkspace = await requestJson(baseUrl, '/api/workspaces', {
    method: 'POST',
    headers: regularHeaders,
    body: JSON.stringify({ name: 'Must not be created' }),
  });
  assert.equal(blockedSecondWorkspace.response.status, 402);
  assert.equal(blockedSecondWorkspace.body.error, 'plan_limit_reached');
  assert.equal(blockedSecondWorkspace.body.usageKey, 'workspaces');

  const blockedAiAttempt = await requestJson(baseUrl, '/api/workspaces/ws_regular/agent/chat', {
    method: 'POST',
    headers: regularHeaders,
    body: JSON.stringify({ message: 'This must be rejected before the provider call.' }),
  });
  assert.equal(blockedAiAttempt.response.status, 402);
  assert.equal(blockedAiAttempt.body.error, 'plan_limit_reached');
  assert.equal(blockedAiAttempt.body.usageKey, 'aiOperations');
  assert.equal(blockedAiAttempt.body.remaining, 0);

  const ownerBilling = await requestJson(baseUrl, '/api/workspaces/ws_owner/billing', { headers: ownerHeaders });
  assert.equal(ownerBilling.body.plan.id, 'owner_unlimited');
  assert.equal(ownerBilling.body.accessSource, 'owner_unlimited');

  const publicPlans = await requestJson(baseUrl, '/api/billing/plans');
  assert.equal(publicPlans.body.plans.some((plan) => plan.id === 'tester_pro'), false);

  const internalCheckout = await requestJson(baseUrl, '/api/workspaces/ws_regular/billing/select-plan', {
    method: 'POST',
    headers: regularHeaders,
    body: JSON.stringify({ planId: 'tester_pro' }),
  });
  assert.equal(internalCheckout.response.status, 400);
  assert.equal(internalCheckout.body.error, 'valid_paid_plan_required');

  const legacyGrant = await requestJson(baseUrl, '/api/admin/testers/grant', {
    method: 'POST',
    headers: { 'x-admin-token': 'test-admin-token' },
    body: JSON.stringify({ email: 'legacy-pending@example.com' }),
  });
  assert.equal(legacyGrant.response.status, 201);
  assert.equal(legacyGrant.body.tester.planId, 'tester_pro');
  assert.equal(legacyGrant.body.tester.status, 'pending');

  const revoked = await requestJson(baseUrl, `/api/owner/testers/${active.body.tester.id}`, {
    method: 'DELETE',
    headers: ownerHeaders,
  });
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.body.tester.status, 'revoked');

  const restoredBilling = await requestJson(baseUrl, '/api/workspaces/ws_regular/billing', { headers: regularHeaders });
  assert.equal(restoredBilling.body.plan.id, 'trial');
  assert.equal(restoredBilling.body.accessSource, 'subscription');

  console.log('owner tester API tests passed');
} catch (error) {
  if (stdout.trim()) console.error(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await stopServer(child);
  await rm(tempDir, { recursive: true, force: true });
}
