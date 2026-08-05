import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');
const TARGET_ID = 'reel_owner_workspace_exclusion_fixture';
const OTHER_ID = 'reel_owner_workspace_other_fixture';

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

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'owner-signal-owner-workspace-'));
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
  observations: [{ id: 'obs_1', kind: 'setup', description: 'Setup.' }],
  evidenceChains: [{ mode: 'process_demo', beforeEvidenceId: 'obs_1' }],
};

try {
  await waitForServer(baseUrl, child);
  const owner = await register(baseUrl, 'Bank Owner', 'bank-owner@example.com');
  const db = JSON.parse(await readFile(dbPath, 'utf8'));
  db.reels.push(
    {
      id: TARGET_ID,
      workspaceId: owner.user.workspaceId,
      curationStatus: 'approved',
      title: 'Owner workspace exclusion fixture',
      sourceUrl: 'https://example.test/owner-workspace-exclusion-fixture',
      handle: '@fixture_creator',
      importedMetadata: { qualityGate: structuredClone(qualityGate) },
    },
    {
      id: OTHER_ID,
      workspaceId: owner.user.workspaceId,
      curationStatus: 'approved',
      title: 'Owner workspace unrelated fixture',
      sourceUrl: 'https://example.test/owner-workspace-other-fixture',
      handle: '@other_creator',
      importedMetadata: { qualityGate: structuredClone(qualityGate) },
    },
  );
  await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`);

  const headers = { authorization: `Bearer ${owner.token}` };
  const before = await request(baseUrl, `/api/workspaces/${owner.user.workspaceId}/reels`, { headers });
  assert.equal(before.response.status, 200);
  assert.deepEqual(before.body.reels.map((reel) => reel.id), [TARGET_ID, OTHER_ID]);

  const excluded = await request(baseUrl, `/api/owner/signals/${TARGET_ID}/exclude`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reasonCode: 'no_useful_mechanic_or_outcome' }),
  });
  assert.equal(excluded.response.status, 200);

  const after = await request(baseUrl, `/api/workspaces/${owner.user.workspaceId}/reels`, { headers });
  assert.equal(after.response.status, 200);
  assert.deepEqual(after.body.reels.map((reel) => reel.id), [OTHER_ID]);

  const persisted = JSON.parse(await readFile(dbPath, 'utf8'));
  const target = persisted.reels.find((reel) => reel.id === TARGET_ID);
  assert.equal(target.importedMetadata.qualityGate.admittedToBank, false);
  assert.equal(target.importedMetadata.qualityGate.decision, 'accept');
  assert.equal(target.ownerModeration.global.active, true);
  assert.equal(target.ownerModeration.global.audit[0].scope, 'global');
  assert.equal(target.ownerModeration.global.audit[0].reasonCode, 'no_useful_mechanic_or_outcome');
  assert.deepEqual(target.importedMetadata.qualityGate.observations, qualityGate.observations);
  assert.deepEqual(target.importedMetadata.qualityGate.evidenceChains, qualityGate.evidenceChains);
  assert.doesNotMatch(backendOutput, /Gemini|Apify|fetchPublic/i);

  console.log('OWNER_WORKSPACE_EXCLUSION_REGRESSION: REPRODUCED');
} finally {
  await stop(child);
  await rm(tempDir, { recursive: true, force: true });
}
