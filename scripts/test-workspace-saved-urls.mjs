import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');

function emptyDb() {
  return {
    users: [], sessions: [], workspaces: [], competitors: [], reels: [], ideas: [], leads: [],
    syncJobs: [], sources: [], metaStates: [], instagramAccounts: [], tiktokAccounts: [],
    aiMemory: [], aiJobs: [], remixes: [], contentPlanItems: [], videoJobs: [],
    dataDeletionRequests: [], plans: [], subscriptions: [], usageCounters: [], discoveryRuns: [],
    testerAccessGrants: [], demoSessions: [], agentStudioRuns: [], agentStudioUploads: [],
    workspaceSavedSignals: [], workspaceSavedUrls: [], workspaceAdaptations: [],
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    signal: AbortSignal.timeout(5_000),
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  return { response, body: await response.json().catch(() => ({})) };
}

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited early: ${output()}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // Keep polling until the backend is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`backend startup timed out: ${output()}`);
}

async function register(baseUrl, name, email) {
  const result = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password: 'test-password-123' }),
  });
  assert.equal(result.response.status, 201);
  return result.body;
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-saved-urls-'));
const dbPath = path.join(tempDir, 'db.json');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
await writeFile(dbPath, `${JSON.stringify(emptyDb(), null, 2)}\n`, 'utf8');

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', DB_PATH: dbPath,
    DATABASE_URL: '', APIFY_TOKEN: '', APIFY_API_TOKEN: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '',
    AUTOMATIC_DISCOVERY_ENABLED: 'false', SHARED_SIGNAL_BANK_OWNER_EMAIL: '', UNLIMITED_ACCESS_EMAILS: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });

try {
  await waitForServer(baseUrl, child, () => backendOutput);
  const ownerA = await register(baseUrl, 'Workspace A', 'saved-url-a@example.com');
  const ownerB = await register(baseUrl, 'Workspace B', 'saved-url-b@example.com');
  const headersA = { authorization: `Bearer ${ownerA.token}` };
  const headersB = { authorization: `Bearer ${ownerB.token}` };
  const workspaceA = ownerA.user.workspaceId;
  const workspaceB = ownerB.user.workspaceId;

  const before = JSON.parse(await readFile(dbPath, 'utf8'));
  const boundarySnapshot = JSON.stringify({ reels: before.reels, workspaceSavedSignals: before.workspaceSavedSignals, workspaceAdaptations: before.workspaceAdaptations, contentPlanItems: before.contentPlanItems, usageCounters: before.usageCounters });

  const instagram = await request(baseUrl, `/api/workspaces/${workspaceA}/saved-urls`, {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ url: 'https://www.instagram.com/reels/ABC123/?utm_source=test#clip' }),
  });
  assert.equal(instagram.response.status, 201);
  assert.deepEqual(instagram.body.savedUrl, {
    id: instagram.body.savedUrl.id,
    workspaceId: workspaceA,
    originalUrl: 'https://www.instagram.com/reels/ABC123/?utm_source=test#clip',
    canonicalUrl: 'https://instagram.com/reel/ABC123',
    platform: 'instagram', status: 'not_analyzed',
    createdAt: instagram.body.savedUrl.createdAt, updatedAt: instagram.body.savedUrl.updatedAt,
  });
  const savedId = instagram.body.savedUrl.id;

  const duplicate = await request(baseUrl, `/api/workspaces/${workspaceA}/saved-urls`, {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ url: 'https://instagram.com/reel/ABC123/?fbclid=tracking' }),
  });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.body.alreadySaved, true);
  assert.equal(duplicate.body.savedUrl.id, savedId);

  const regularTikTok = await request(baseUrl, `/api/workspaces/${workspaceA}/saved-urls`, {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ url: 'https://www.tiktok.com/@creator/video/123456789?is_from_webapp=1' }),
  });
  assert.equal(regularTikTok.response.status, 201);

  const vmShort = await request(baseUrl, `/api/workspaces/${workspaceA}/saved-urls`, {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ url: 'https://vm.tiktok.com/ZMshort123/?utm_source=test#clip' }),
  });
  assert.equal(vmShort.response.status, 201);
  assert.equal(vmShort.body.savedUrl.canonicalUrl, 'https://vm.tiktok.com/ZMshort123');

  const vmDuplicate = await request(baseUrl, `/api/workspaces/${workspaceA}/saved-urls`, {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ url: 'https://vm.tiktok.com/ZMshort123?fbclid=tracking#other' }),
  });
  assert.equal(vmDuplicate.response.status, 200);
  assert.equal(vmDuplicate.body.alreadySaved, true);
  assert.equal(vmDuplicate.body.savedUrl.id, vmShort.body.savedUrl.id);

  const vtShort = await request(baseUrl, `/api/workspaces/${workspaceA}/saved-urls`, {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ url: 'https://vt.tiktok.com/ZMshort456/' }),
  });
  assert.equal(vtShort.response.status, 201);
  assert.equal(vtShort.body.savedUrl.canonicalUrl, 'https://vt.tiktok.com/ZMshort456');

  for (const url of [
    'https://youtube.com/shorts/short_id/?si=tracking',
    'https://www.youtube.com/watch?v=watch_id&utm_source=test#t=10',
    'https://youtu.be/short_id?si=tracking',
  ]) {
    const result = await request(baseUrl, `/api/workspaces/${workspaceA}/saved-urls`, {
      method: 'POST', headers: headersA, body: JSON.stringify({ url }),
    });
    assert.equal(result.response.status, 201, url);
  }

  const workspaceBSave = await request(baseUrl, `/api/workspaces/${workspaceB}/saved-urls`, {
    method: 'POST', headers: headersB,
    body: JSON.stringify({ url: 'https://instagram.com/reel/ABC123' }),
  });
  assert.equal(workspaceBSave.response.status, 201);
  assert.notEqual(workspaceBSave.body.savedUrl.id, savedId);

  for (const url of [
    'http://instagram.com/reel/abc',
    'https://instagram.com/profile',
    'https://example.com/reel/abc',
    'https://youtube.com/channel/abc',
    'https://tiktok.com/@creator',
    'https://vm.tiktok.com/@creator/video/123',
    'https://vt.tiktok.com/',
    'https://user:pass@youtube.com/watch?v=abc',
  ]) {
    const result = await request(baseUrl, `/api/workspaces/${workspaceA}/saved-urls`, {
      method: 'POST', headers: headersA, body: JSON.stringify({ url }),
    });
    assert.equal(result.response.status, 400, url);
  }

  const listA = await request(baseUrl, `/api/workspaces/${workspaceA}/saved-urls`, { headers: headersA });
  const listB = await request(baseUrl, `/api/workspaces/${workspaceB}/saved-urls`, { headers: headersB });
  assert.equal(listA.response.status, 200);
  assert.equal(listB.response.status, 200);
  assert.equal(listA.body.savedUrls.length, 7);
  assert.equal(listB.body.savedUrls.length, 1);
  assert.ok(listB.body.savedUrls.every((record) => record.workspaceId === workspaceB));
  assert.ok(!listB.body.savedUrls.some((record) => record.id === savedId));

  const crossWorkspaceDelete = await request(baseUrl, `/api/workspaces/${workspaceB}/saved-urls/${savedId}`, { method: 'DELETE', headers: headersB });
  assert.equal(crossWorkspaceDelete.response.status, 200);
  assert.equal(crossWorkspaceDelete.body.alreadyDeleted, true);
  const deleted = await request(baseUrl, `/api/workspaces/${workspaceA}/saved-urls/${savedId}`, { method: 'DELETE', headers: headersA });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.body.deleted, true);
  const reloadedA = await request(baseUrl, `/api/workspaces/${workspaceA}/saved-urls`, { headers: headersA });
  assert.ok(!reloadedA.body.savedUrls.some((record) => record.id === savedId));

  const after = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(JSON.stringify({ reels: after.reels, workspaceSavedSignals: after.workspaceSavedSignals, workspaceAdaptations: after.workspaceAdaptations, contentPlanItems: after.contentPlanItems, usageCounters: after.usageCounters }), boundarySnapshot);
  assert.ok(after.workspaceSavedUrls.every((record) => record.status === 'not_analyzed'));
  assert.ok(after.workspaceSavedUrls.every((record) => !('decision' in record) && !('admittedToBank' in record)));
  console.log('Workspace Personal URL Library API regression passed.');
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 3_000))]);
  }
  await rm(tempDir, { recursive: true, force: true });
}
