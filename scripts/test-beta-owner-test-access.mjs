import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  getSafeBetaOwnerTestDiagnostic,
  matchesBetaOwnerTestPair,
  readBetaOwnerTestAccessConfig,
} = require('../backend/services/betaOwnerTestAccess.cjs');
const { getKyivDayKey, resolveProviderAttemptBudget } = require('../backend/services/dailyTrialQuota.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');

const configured = readBetaOwnerTestAccessConfig({
  BETA_OWNER_TEST_ENABLED: 'true',
  BETA_OWNER_TEST_SCOPE: 'staging',
  BETA_OWNER_TEST_USER_ID: 'usr_beta_fixture',
  BETA_OWNER_TEST_WORKSPACE_ID: 'ws_beta_fixture',
});
assert.equal(configured.status, 'configured');
assert.equal(matchesBetaOwnerTestPair(configured, { id: 'usr_beta_fixture' }, 'ws_beta_fixture'), true);
assert.equal(matchesBetaOwnerTestPair(configured, { id: 'usr_peer_fixture' }, 'ws_beta_fixture'), false);
assert.equal(matchesBetaOwnerTestPair(configured, { id: 'usr_beta_fixture' }, 'ws_other_fixture'), false);
assert.deepEqual(getSafeBetaOwnerTestDiagnostic(configured), {
  configured: true,
  enabled: true,
  requiredScope: 'staging',
  status: 'configured',
});
assert.equal(readBetaOwnerTestAccessConfig({ BETA_OWNER_TEST_ENABLED: 'true' }).status, 'invalid_scope');
assert.equal(readBetaOwnerTestAccessConfig({
  BETA_OWNER_TEST_ENABLED: 'true',
  BETA_OWNER_TEST_SCOPE: 'staging',
}).status, 'missing_pair');
assert.equal(readBetaOwnerTestAccessConfig({
  BETA_OWNER_TEST_ENABLED: 'true',
  BETA_OWNER_TEST_SCOPE: 'production',
  BETA_OWNER_TEST_USER_ID: 'usr_beta_fixture',
  BETA_OWNER_TEST_WORKSPACE_ID: 'ws_beta_fixture',
}).status, 'invalid_scope');
assert.deepEqual(
  resolveProviderAttemptBudget({
    plan: { id: 'beta_owner_test', limits: { aiOperations: null } },
    unlimited: true,
    accessSource: 'beta_owner_test_pair',
  }, new Date('2026-08-14T12:00:00.000Z')),
  {
    metric: 'beta_owner_test_provider_attempts_daily',
    limit: 250,
    period: '2026-08-14',
    unlimited: false,
  },
  'product quotas are unlimited but provider attempts keep a hard daily cap',
);

function fixtureDb() {
  const workspaces = [
    ['ws_beta_fixture', 'Beta Fixture'],
    ['ws_other_fixture', 'Other Fixture'],
    ['ws_operator_fixture', 'Make Sense'],
  ].map(([id, name]) => ({
    id,
    name,
    owner: 'Fixture',
    brief: {},
    contentPlanPosts: [],
    ...(id === 'ws_beta_fixture' ? {
      productBrandBrain: {
        version: 1,
        id: 'brand_beta_fixture',
        name: 'Fictional Beta Brand',
        updatedAt: '2026-08-14T00:00:00.000Z',
        brain: {
          profileDescription: 'Fictional workflow software for small teams.',
          audience: 'Small fictional product teams',
          niche: 'Workflow software',
          market: 'Test market',
          product: 'Workflow review',
        },
      },
    } : {}),
  }));
  return {
    users: [
      { id: 'usr_beta_fixture', email: 'beta-owner@example.test', role: 'owner', workspaceId: 'ws_beta_fixture', workspaceIds: ['ws_beta_fixture', 'ws_other_fixture'] },
      { id: 'usr_peer_fixture', email: 'peer@example.test', role: 'member', workspaceId: 'ws_beta_fixture' },
      { id: 'usr_operator_fixture', email: 'operator@example.test', role: 'admin', workspaceId: 'ws_operator_fixture' },
    ],
    sessions: [
      { token: 'session_beta_fixture', userId: 'usr_beta_fixture', expiresAt: '2030-01-01T00:00:00.000Z' },
      { token: 'session_peer_fixture', userId: 'usr_peer_fixture', expiresAt: '2030-01-01T00:00:00.000Z' },
      { token: 'session_operator_fixture', userId: 'usr_operator_fixture', expiresAt: '2030-01-01T00:00:00.000Z' },
    ],
    workspaces,
    subscriptions: workspaces.map((workspace) => ({
      id: `sub_${workspace.id}`,
      workspaceId: workspace.id,
      planId: 'trial',
      status: 'trialing',
    })),
    workspaceSavedUrls: [{
      id: 'saved_cap_fixture',
      workspaceId: 'ws_beta_fixture',
      platform: 'youtube',
      originalUrl: 'https://example.test/safe-fixture',
      canonicalUrl: 'https://example.test/safe-fixture',
      status: 'not_analyzed',
      createdAt: '2026-08-14T00:00:00.000Z',
    }],
    usageCounters: [{
      id: 'usage_beta_provider_cap_fixture',
      workspaceId: 'ws_beta_fixture',
      metric: 'beta_owner_test_provider_attempts_daily',
      period: getKyivDayKey(),
      value: 250,
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
    }],
    personalUrlRunTelemetry: [],
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited early: ${output()}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // Wait for the local fixture server only.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`backend startup timed out: ${output()}`);
}

async function request(baseUrl, pathname, token, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    signal: AbortSignal.timeout(10_000),
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'beta-owner-pair-'));
const dbPath = path.join(tempDir, 'db.json');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
await writeFile(dbPath, `${JSON.stringify(fixtureDb(), null, 2)}\n`, 'utf8');

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    APIFY_TOKEN: '',
    APIFY_API_TOKEN: '',
    GEMINI_API_KEY: '',
    OPENAI_API_KEY: '',
    API_RATE_LIMIT_PER_MINUTE: '1000',
    EXPENSIVE_RATE_LIMIT_PER_MINUTE: '1',
    UNLIMITED_ACCESS_EMAILS: 'operator@example.test',
    BETA_OWNER_TEST_ENABLED: 'true',
    BETA_OWNER_TEST_SCOPE: 'staging',
    BETA_OWNER_TEST_USER_ID: 'usr_beta_fixture',
    BETA_OWNER_TEST_WORKSPACE_ID: 'ws_beta_fixture',
    REMIX_TEST_PROVIDER: path.join(ROOT, 'scripts', 'fixtures', 'personal-url-adaptation-test-provider.cjs'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

try {
  await waitForServer(baseUrl, child, () => output);

  const health = await request(baseUrl, '/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body.betaOwnerTestEntitlement, {
    configured: true,
    enabled: true,
    requiredScope: 'staging',
    status: 'configured',
  });
  const healthText = JSON.stringify(health.body.betaOwnerTestEntitlement);
  assert.equal(healthText.includes('usr_beta_fixture'), false);
  assert.equal(healthText.includes('ws_beta_fixture'), false);

  const exact = await request(baseUrl, '/api/workspaces/ws_beta_fixture/billing', 'session_beta_fixture');
  assert.equal(exact.status, 200);
  assert.equal(exact.body.unlimited, true);
  assert.equal(exact.body.plan.id, 'beta_owner_test');
  assert.equal(exact.body.accessSource, 'beta_owner_test_pair');

  const sameUserOtherWorkspace = await request(baseUrl, '/api/workspaces/ws_other_fixture/billing', 'session_beta_fixture');
  assert.equal(sameUserOtherWorkspace.status, 200);
  assert.equal(sameUserOtherWorkspace.body.unlimited, false);
  assert.equal(sameUserOtherWorkspace.body.accessSource, 'subscription');

  const peerSameWorkspace = await request(baseUrl, '/api/workspaces/ws_beta_fixture/billing', 'session_peer_fixture');
  assert.equal(peerSameWorkspace.status, 200);
  assert.equal(peerSameWorkspace.body.unlimited, false);
  assert.equal(peerSameWorkspace.body.accessSource, 'subscription');

  const broadOperator = await request(baseUrl, '/api/workspaces/ws_operator_fixture/billing', 'session_operator_fixture');
  assert.equal(broadOperator.status, 200);
  assert.equal(broadOperator.body.unlimited, false, 'admin/operator email must not bypass product quotas');
  assert.equal(broadOperator.body.accessSource, 'subscription');

  const firstExpensive = await request(
    baseUrl,
    '/api/workspaces/ws_beta_fixture/saved-urls/saved_cap_fixture/analyze-adapt',
    'session_beta_fixture',
    { method: 'POST', body: '{}' },
  );
  assert.equal(firstExpensive.status, 402);
  assert.equal(firstExpensive.body.error, 'ai_provider_capacity_reached', 'provider hard cap remains fail-closed for the unlimited product pair');
  const secondExpensive = await request(
    baseUrl,
    '/api/workspaces/ws_beta_fixture/saved-urls/another_missing_fixture/analyze-adapt',
    'session_beta_fixture',
    { method: 'POST', body: '{}' },
  );
  assert.equal(secondExpensive.status, 429, 'saved URL generation is protected by the expensive-request limiter');

  console.log('Beta owner-test pair access matrix passed.');
  console.log('Saved URL expensive-request limiter passed.');
  console.log('real provider/network calls: 0');
} finally {
  await stop(child);
  await rm(tempDir, { recursive: true, force: true });
}
