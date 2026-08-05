import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');
const TARGET_ID = 'reel_owner_exclusion_fixture';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until the backend is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('backend did not start');
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return {
    response,
    body: await response.json().catch(() => ({})),
  };
}

async function register(baseUrl, name, email) {
  const result = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password: 'test-password-123' }),
  });
  assert.equal(result.response.status, 201);
  return result.body;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'owner-signal-exclusion-'));
const dbPath = path.join(tempDir, 'db.json');
const seed = {
  users: [],
  sessions: [],
  workspaces: [],
  reels: [],
  subscriptions: [],
};
await writeFile(dbPath, `${JSON.stringify(seed, null, 2)}\n`);

const backendProbe = http.createServer();
const port = await listen(backendProbe);
await new Promise((resolve) => backendProbe.close(resolve));
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT,
  env: {
    ...process.env,
    APIFY_TOKEN: '',
    APIFY_API_TOKEN: '',
    GEMINI_API_KEY: '',
    GOOGLE_API_KEY: '',
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DB_PATH: dbPath,
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    SHARED_SIGNAL_BANK_WORKSPACE_ID: '',
    SHARED_SIGNAL_BANK_OWNER_EMAIL: 'bank-owner@example.com',
    UNLIMITED_ACCESS_EMAILS: 'bank-owner@example.com',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });

const qualityGate = {
  decision: 'accept',
  admittedToBank: true,
  qualityScore: 51.2,
  brandRelevance: 42,
  summary: 'A grounded process demo with preserved evidence.',
  observations: [{ id: 'obs_1', kind: 'setup', description: 'Setup.' }],
  evidenceChains: [{ mode: 'process_demo', beforeEvidenceId: 'obs_1' }],
};
const targetSignal = {
  id: TARGET_ID,
  workspaceId: '',
  curationStatus: 'approved',
  title: 'Owner exclusion fixture',
  sourceUrl: 'https://example.test/owner-exclusion-fixture',
  handle: '@fixture_creator',
  views: 318000,
  likes: 11000,
  importedMetadata: { qualityGate },
};
const otherSignal = {
  id: 'reel_other_signal',
  workspaceId: '',
  curationStatus: 'approved',
  title: 'Unrelated signal',
  sourceUrl: 'https://example.test/other-signal',
  importedMetadata: {
    qualityGate: {
      decision: 'accept',
      admittedToBank: true,
      observations: [{ id: 'other_obs', description: 'Other.' }],
      evidenceChains: [],
    },
  },
};

try {
  await waitForServer(baseUrl, child);
  const owner = await register(baseUrl, 'Bank Owner', 'bank-owner@example.com');
  const member = await register(baseUrl, 'Trial Member', 'trial-member@example.com');
  const db = JSON.parse(await readFile(dbPath, 'utf8'));
  targetSignal.workspaceId = owner.user.workspaceId;
  otherSignal.workspaceId = owner.user.workspaceId;
  db.reels.push(targetSignal, otherSignal);
  db.subscriptions = db.subscriptions.map((subscription) => (
    subscription.workspaceId === member.user.workspaceId
      ? { ...subscription, planId: 'trial', status: 'trialing' }
      : subscription
  ));
  await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`);

  const unauthenticated = await request(baseUrl, `/api/owner/signals/${TARGET_ID}/exclude`, {
    method: 'POST',
    body: JSON.stringify({ reasonCode: 'no_useful_mechanic_or_outcome' }),
  });
  assert.equal(unauthenticated.response.status, 401);

  const forbidden = await request(baseUrl, `/api/owner/signals/${TARGET_ID}/exclude`, {
    method: 'POST',
    headers: { authorization: `Bearer ${member.token}` },
    body: JSON.stringify({ reasonCode: 'no_useful_mechanic_or_outcome' }),
  });
  assert.equal(forbidden.response.status, 403);

  const invalidReason = await request(baseUrl, `/api/owner/signals/${TARGET_ID}/exclude`, {
    method: 'POST',
    headers: { authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ reasonCode: 'not-a-valid-reason' }),
  });
  assert.equal(invalidReason.response.status, 400);

  const missing = await request(baseUrl, '/api/owner/signals/missing_signal/exclude', {
    method: 'POST',
    headers: { authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ reasonCode: 'no_useful_mechanic_or_outcome' }),
  });
  assert.equal(missing.response.status, 404);

  const beforeBank = await request(
    baseUrl,
    `/api/workspaces/${member.user.workspaceId}/reels`,
    { headers: { authorization: `Bearer ${member.token}` } },
  );
  assert.equal(beforeBank.response.status, 200);
  assert.deepEqual(beforeBank.body.reels.map((reel) => reel.sharedSourceId), [TARGET_ID, otherSignal.id]);

  const beforeMutation = JSON.parse(await readFile(dbPath, 'utf8'));
  const beforeTarget = structuredClone(beforeMutation.reels.find((reel) => reel.id === TARGET_ID));
  const beforeOther = structuredClone(beforeMutation.reels.find((reel) => reel.id === otherSignal.id));

  const excluded = await request(baseUrl, `/api/owner/signals/${TARGET_ID}/exclude`, {
    method: 'POST',
    headers: { authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ reasonCode: 'no_useful_mechanic_or_outcome' }),
  });
  assert.equal(excluded.response.status, 200);
  assert.equal(excluded.body.alreadyExcluded, false);

  const afterMutation = JSON.parse(await readFile(dbPath, 'utf8'));
  const afterTarget = afterMutation.reels.find((reel) => reel.id === TARGET_ID);
  const afterOther = afterMutation.reels.find((reel) => reel.id === otherSignal.id);
  assert.equal(afterTarget.importedMetadata.qualityGate.admittedToBank, false);
  assert.equal(afterTarget.importedMetadata.qualityGate.decision, beforeTarget.importedMetadata.qualityGate.decision);
  assert.deepEqual(
    afterTarget.importedMetadata.qualityGate.observations,
    beforeTarget.importedMetadata.qualityGate.observations,
  );
  assert.deepEqual(
    afterTarget.importedMetadata.qualityGate.evidenceChains,
    beforeTarget.importedMetadata.qualityGate.evidenceChains,
  );
  assert.deepEqual(afterOther, beforeOther);

  const audit = afterTarget.ownerModeration.global.audit[0];
  assert.equal(afterTarget.ownerModeration.global.active, true);
  assert.equal(audit.scope, 'global');
  assert.equal(audit.reasonCode, 'no_useful_mechanic_or_outcome');
  assert.equal(audit.actor.userId, owner.user.id);
  assert.equal(audit.actor.email, owner.user.email);
  assert.match(audit.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(audit.previousState, {
    decision: 'accept',
    admittedToBank: true,
    curationStatus: 'approved',
  });

  const afterBank = await request(
    baseUrl,
    `/api/workspaces/${member.user.workspaceId}/reels`,
    { headers: { authorization: `Bearer ${member.token}` } },
  );
  assert.equal(afterBank.response.status, 200);
  assert.deepEqual(afterBank.body.reels.map((reel) => reel.sharedSourceId), [otherSignal.id]);

  const beforeRepeat = await readFile(dbPath, 'utf8');
  const repeated = await request(baseUrl, `/api/owner/signals/${TARGET_ID}/exclude`, {
    method: 'POST',
    headers: { authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ reasonCode: 'other' }),
  });
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.alreadyExcluded, true);
  assert.equal(await readFile(dbPath, 'utf8'), beforeRepeat);

  console.log('Owner signal exclusion API regression passed.');
  console.log('provider calls: 0');
  console.log('network attempts to Gemini/Apify: 0');
} catch (error) {
  if (backendOutput) console.error(backendOutput);
  throw error;
} finally {
  await stop(child);
  await rm(tempDir, { recursive: true, force: true });
}
