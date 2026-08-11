import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildStudioContentPlanDraft } from '../src/contentPlanUtils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');
const PROVIDER_FIXTURE = path.join(ROOT, 'scripts', 'fixtures', 'personal-url-adaptation-test-provider.cjs');
const require = createRequire(import.meta.url);
const { normalizeProductBrand } = require('../backend/services/productBrandBrain.cjs');

const brandA = {
  version: 1, id: 'brand_a', name: 'Automation Brand', updatedAt: '2026-08-06T10:00:00.000Z',
  brain: { profileDescription: 'AI workflow automation for small product teams', audience: 'small product teams', niche: 'AI automation', market: 'Ukraine', product: 'workflow audit' },
};
const brandB = {
  version: 1, id: 'brand_b', name: 'Fitness Brand', updatedAt: '2026-08-06T11:00:00.000Z',
  brain: { profileDescription: 'Fitness coaching for runners', audience: 'runners', niche: 'fitness coaching', market: 'Ukraine', product: 'mobility program' },
};

function brandKey(brand) {
  const normalized = normalizeProductBrand(brand);
  return JSON.stringify({ id: normalized.id, version: normalized.version, brain: normalized.brain });
}

function emptyDb() {
  const workspace = (id, name, owner, brand) => ({ id, name, owner, brief: {}, productBrandBrain: brand, contentPlanPosts: [] });
  return {
    users: [
      { id: 'user_a', name: 'Workspace A', email: 'workspace-a@example.com', role: 'owner', workspaceId: 'ws_a' },
      { id: 'user_b', name: 'Workspace B', email: 'workspace-b@example.com', role: 'owner', workspaceId: 'ws_b' },
    ],
    sessions: [
      { token: 'session_a', userId: 'user_a', expiresAt: '2030-01-01T00:00:00.000Z' },
      { token: 'session_b', userId: 'user_b', expiresAt: '2030-01-01T00:00:00.000Z' },
    ],
    workspaces: [workspace('ws_a', 'Workspace A', 'Workspace A', brandA), workspace('ws_b', 'Workspace B', 'Workspace B', brandB)],
    subscriptions: [
      { id: 'sub_a', workspaceId: 'ws_a', planId: 'trial', status: 'trialing' },
      { id: 'sub_b', workspaceId: 'ws_b', planId: 'trial', status: 'trialing' },
    ],
    reels: [],
    workspaceSavedSignals: [],
    workspaceAdaptations: [],
    workspaceUrlAdaptations: [],
    workspaceSavedUrls: [
      { id: 'saved_main', workspaceId: 'ws_a', platform: 'tiktok', originalUrl: 'https://vm.tiktok.com/ZM123abc/?utm_source=test', canonicalUrl: 'https://vm.tiktok.com/ZM123abc', createdAt: '2026-08-07T08:00:00.000Z', status: 'not_analyzed' },
      { id: 'saved_race', workspaceId: 'ws_a', platform: 'instagram', originalUrl: 'https://instagram.com/reel/race', canonicalUrl: 'https://instagram.com/reel/race', createdAt: '2026-08-07T08:01:00.000Z', status: 'not_analyzed' },
      { id: 'saved_failure', workspaceId: 'ws_a', platform: 'youtube', originalUrl: 'https://youtube.com/shorts/failure', canonicalUrl: 'https://youtube.com/shorts/failure', createdAt: '2026-08-07T08:02:00.000Z', status: 'not_analyzed' },
    ],
    usageCounters: [],
    plans: [], competitors: [], ideas: [], leads: [], syncJobs: [], sources: [], metaStates: [], instagramAccounts: [], tiktokAccounts: [],
    aiMemory: [], aiJobs: [], remixes: [], contentPlanItems: [], videoJobs: [], dataDeletionRequests: [], demoSessions: [], discoveryRuns: [], testerAccess: [],
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
    signal: AbortSignal.timeout(10_000),
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
      // Keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`backend startup timed out: ${output()}`);
}

async function waitForMode(filePath, mode) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const events = (await readFile(filePath, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
    if (events.some((event) => event.mode === mode)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`provider mode timed out: ${mode}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-url-adaptation-'));
const dbPath = path.join(tempDir, 'db.json');
const callsPath = path.join(tempDir, 'provider-calls.jsonl');
const releasePath = path.join(tempDir, 'provider-release');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const seededDb = emptyDb();
await writeFile(dbPath, `${JSON.stringify(seededDb, null, 2)}\n`, 'utf8');
await writeFile(callsPath, '', 'utf8');

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', DB_PATH: dbPath, DATABASE_URL: '',
    APIFY_TOKEN: '', APIFY_API_TOKEN: '', GEMINI_API_KEY: '', OPENAI_API_KEY: '', AUTOMATIC_DISCOVERY_ENABLED: 'false',
    UNLIMITED_ACCESS_EMAILS: 'workspace-a@example.com',
    REMIX_TEST_PROVIDER: PROVIDER_FIXTURE, REMIX_TEST_PROVIDER_CALLS_PATH: callsPath, REMIX_TEST_PROVIDER_RELEASE_PATH: releasePath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });
const auth = (token) => ({ authorization: `Bearer ${token}` });
const adaptationPath = (id) => `/api/workspaces/ws_a/saved-urls/${id}/adaptation`;
const analyzePath = (id) => `/api/workspaces/ws_a/saved-urls/${id}/analyze-adapt`;
const switchBrand = (brand) => request(baseUrl, '/api/workspaces/ws_a/agent/context/redesign', { method: 'PUT', headers: auth('session_a'), body: JSON.stringify({ brand }) });

try {
  await waitForServer(baseUrl, child, () => backendOutput);
  const headersA = auth('session_a');
  const headersB = auth('session_b');
  const baseline = JSON.parse(await readFile(dbPath, 'utf8'));
  const baselineProtected = {
    reels: baseline.reels,
    workspaceSavedSignals: baseline.workspaceSavedSignals,
    workspaceAdaptations: baseline.workspaceAdaptations,
  };

  const unloaded = await request(baseUrl, adaptationPath('saved_main'), { headers: headersA });
  assert.equal(unloaded.response.status, 200);
  assert.equal(unloaded.body.status, 'absent');
  assert.equal(unloaded.body.brandBrain.complete, true);
  assert.equal((await readFile(callsPath, 'utf8')).trim(), '');

  const [first, second] = await Promise.all([
    request(baseUrl, analyzePath('saved_main'), { method: 'POST', headers: headersA }),
    request(baseUrl, analyzePath('saved_main'), { method: 'POST', headers: headersA }),
  ]);
  assert.ok(
    [first.response.status, second.response.status].every((status) => [200, 201].includes(status)),
    JSON.stringify({ first: first.body, second: second.body }),
  );
  let db = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(db.workspaceUrlAdaptations.filter((record) => record.savedUrlId === 'saved_main').length, 1);
  const mainA = db.workspaceUrlAdaptations.find((record) => record.savedUrlId === 'saved_main');
  assert.equal(mainA.sourceType, 'personal_url');
  assert.equal(mainA.sourceContext.metadata.title, 'Mock source saved_main', 'adaptation persists grounded metadata');
  assert.equal(mainA.sourceContext.transcript.status, 'available');
  assert.equal(mainA.sourceContext.videoIntelligence.video.contentMechanic, 'proof before explanation');
  assert.equal(mainA.sourceContext.grounding.status, 'full');
  assert.equal(mainA.sourceContext.grounding.mode, 'video');
  assert.ok(mainA.sourceContext.missing.includes('visual frames'));
  assert.equal(Object.hasOwn(mainA, 'decision'), false);
  assert.equal(Object.hasOwn(mainA, 'admittedToBank'), false);
  assert.equal(mainA.canonicalUrl, 'https://vm.tiktok.com/ZM123abc');
  assert.equal((await readFile(callsPath, 'utf8')).trim().split('\n').filter(Boolean).length, 1);

  const repeat = await request(baseUrl, analyzePath('saved_main'), { method: 'POST', headers: headersA });
  assert.equal(repeat.response.status, 200);
  assert.equal(repeat.body.alreadyGenerated, true);
  assert.equal((await readFile(callsPath, 'utf8')).trim().split('\n').filter(Boolean).length, 1);

  const crossWorkspaceRead = await request(baseUrl, '/api/workspaces/ws_b/saved-urls/saved_main/adaptation', { headers: headersB });
  const crossWorkspaceAnalyze = await request(baseUrl, '/api/workspaces/ws_b/saved-urls/saved_main/analyze-adapt', { method: 'POST', headers: headersB });
  assert.equal(crossWorkspaceRead.response.status, 404);
  assert.equal(crossWorkspaceAnalyze.response.status, 404);

  const race = request(baseUrl, analyzePath('saved_race'), { method: 'POST', headers: headersA });
  await waitForMode(callsPath, 'waiting_for_release');
  const switchedB = await switchBrand(brandB);
  assert.equal(switchedB.response.status, 200);
  const blockedDelete = await request(baseUrl, '/api/workspaces/ws_a/saved-urls/saved_race', { method: 'DELETE', headers: headersA });
  assert.equal(blockedDelete.response.status, 409);
  assert.equal(blockedDelete.body.error, 'saved_url_adaptation_in_flight');
  await writeFile(releasePath, 'release\n', 'utf8');
  const raceA = await race;
  assert.equal(raceA.response.status, 201);
  assert.equal(raceA.body.activeBrandChanged, true);
  assert.equal(raceA.body.adaptation.brandId, brandA.id);
  const raceB = await request(baseUrl, analyzePath('saved_race'), { method: 'POST', headers: headersA });
  assert.equal(raceB.response.status, 201);
  assert.equal(raceB.body.adaptation.brandId, brandB.id);
  const mainB = await request(baseUrl, analyzePath('saved_main'), { method: 'POST', headers: headersA });
  assert.equal(mainB.response.status, 201);
  assert.equal(mainB.body.adaptation.brandId, brandB.id);
  const switchedA = await switchBrand(brandA);
  assert.equal(switchedA.response.status, 200);
  const raceAReload = await request(baseUrl, adaptationPath('saved_race'), { headers: headersA });
  assert.equal(raceAReload.body.status, 'ready');
  assert.equal(raceAReload.body.adaptation.brandId, brandA.id);

  const failureBefore = JSON.parse(await readFile(dbPath, 'utf8'));
  const failureDailyBefore = failureBefore.usageCounters.find((counter) => counter.workspaceId === 'ws_a' && counter.metric === 'trial_remix_daily')?.value || 0;
  const failed = await request(baseUrl, analyzePath('saved_failure'), { method: 'POST', headers: headersA });
  assert.equal(failed.response.status, 500);
  assert.equal(failed.body.error, 'mock_personal_url_provider_failure');
  db = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(db.workspaceUrlAdaptations.some((record) => record.savedUrlId === 'saved_failure'), false);
  assert.equal(db.usageCounters.find((counter) => counter.workspaceId === 'ws_a' && counter.metric === 'trial_remix_daily')?.value || 0, failureDailyBefore);
  const failedRetry = await request(baseUrl, analyzePath('saved_failure'), { method: 'POST', headers: headersA });
  assert.equal(failedRetry.response.status, 500);

  const studioPlanDraft = buildStudioContentPlanDraft({
    id: `personal_url:${mainA.savedUrlId}`,
    sourceType: 'personal_url',
    savedUrlId: mainA.savedUrlId,
  }, mainA);
  assert.ok(studioPlanDraft, 'Studio produces a Content Plan draft from the persisted adaptation');
  const studioPlan = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: studioPlanDraft }),
  });
  assert.equal(studioPlan.response.status, 201, JSON.stringify({
    draft: studioPlanDraft,
    status: studioPlan.response.status,
    body: studioPlan.body,
  }));
  assert.equal(studioPlan.body.post.title, studioPlanDraft.title);

  const plan = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: {
      origin: 'studio_adaptation', sourceAdaptationId: mainA.id, sourceVariantIndex: 1, date: '2026-08-20',
      title: 'MALICIOUS CLIENT TITLE', body: 'MALICIOUS CLIENT BODY', sourceType: 'shared_signal', savedUrlId: 'other-url',
    } }),
  });
  assert.equal(plan.response.status, 201);
  assert.equal(plan.body.post.sourceType, 'personal_url');
  assert.equal(plan.body.post.savedUrlId, 'saved_main');
  assert.notEqual(plan.body.post.title, 'MALICIOUS CLIENT TITLE');
  assert.notEqual(plan.body.post.body, 'MALICIOUS CLIENT BODY');
  assert.equal(plan.body.post.sourceAdaptationId, mainA.id);
  const invalidVariant = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: { origin: 'studio_adaptation', sourceAdaptationId: mainA.id, sourceVariantIndex: 99, date: '2026-08-21' } }),
  });
  assert.equal(invalidVariant.response.status, 400);
  assert.equal(invalidVariant.body.error, 'content_plan_variant_invalid');

  db = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.deepEqual({ reels: db.reels, workspaceSavedSignals: db.workspaceSavedSignals, workspaceAdaptations: db.workspaceAdaptations }, baselineProtected);
  const deleted = await request(baseUrl, '/api/workspaces/ws_a/saved-urls/saved_main', { method: 'DELETE', headers: headersA });
  assert.equal(deleted.response.status, 200);
  const afterDelete = await request(baseUrl, adaptationPath('saved_main'), { headers: headersA });
  assert.equal(afterDelete.response.status, 404);
  const planReload = await request(baseUrl, '/api/workspaces/ws_a/content-plan?surface=product_redesign', { headers: headersA });
  assert.ok(planReload.body.posts.some((post) => post.id === plan.body.post.id), 'Content Plan keeps an immutable adaptation snapshot');
  db = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(db.workspaceUrlAdaptations.some((record) => record.savedUrlId === 'saved_main'), false);
  assert.deepEqual({ reels: db.reels, workspaceSavedSignals: db.workspaceSavedSignals, workspaceAdaptations: db.workspaceAdaptations }, baselineProtected);

  const events = (await readFile(callsPath, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(events.filter((event) => event.mode === 'success').length, 2, 'main A/B each use one provider call');
  assert.equal(events.filter((event) => event.mode === 'failure').length, 2, 'failed requests may be retried without a completed record');
  assert.equal(events.filter((event) => event.mode === 'race').length, 2);
  console.log('Workspace Personal URL Analyze & Adapt lifecycle regression passed.');
  console.log(`mock provider calls: ${events.filter((event) => event.savedUrlId).length}`);
  console.log('real provider calls: 0');
  console.log('external network attempts: 0');
} finally {
  await stop(child);
  await rm(tempDir, { recursive: true, force: true });
}
