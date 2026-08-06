import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');
const require = createRequire(import.meta.url);
const { normalizeProductBrand } = require('../backend/services/productBrandBrain.cjs');

const brandA = {
  version: 1,
  id: 'brand_a',
  name: 'Automation Brand',
  updatedAt: '2026-08-06T10:00:00.000Z',
  brain: {
    profileDescription: `${'x'.repeat(1300)}A1-tail`,
    audience: 'small product teams',
    niche: 'AI automation',
    market: 'Ukraine',
    product: 'workflow audit',
  },
};
const brandA2 = {
  ...brandA,
  brain: {
    ...brandA.brain,
    profileDescription: `${'x'.repeat(1300)}A2-tail`,
  },
};
const brandB = {
  ...brandA,
  id: 'brand_b',
  name: 'Fitness Brand',
  brain: {
    profileDescription: 'Fitness coaching for runners',
    audience: 'runners',
    niche: 'fitness coaching',
    market: 'Ukraine',
    product: 'mobility program',
  },
};

function brandKey(brand) {
  const normalized = normalizeProductBrand(brand);
  return JSON.stringify({ id: normalized.id, version: normalized.version, brain: normalized.brain });
}

function qualityGate(decision = 'accept', admittedToBank = true) {
  return {
    decision,
    admittedToBank,
    qualityScore: 84,
    brandRelevance: 19,
    centralIdea: 'Show the mechanism before the explanation.',
    contentMechanic: 'visible proof before the offer',
    transferableMechanic: 'proof -> process -> next step',
    summary: 'A visible process creates curiosity before a CTA.',
    observations: [{ id: 'obs_1', kind: 'setup', description: 'The creator shows the setup.' }],
    evidenceChains: [{ mode: 'process_demo', beforeEvidenceId: 'obs_1' }],
  };
}

function sharedSignal() {
  return {
    id: 'signal_shared',
    workspaceId: 'ws_bank',
    title: 'The visible workflow reveal',
    caption: 'A process with a clear outcome.',
    sourceUrl: 'https://example.test/shared-signal',
    handle: '@verified_source',
    market: 'Ukraine',
    score: 92,
    transcript: 'Show the process, then reveal the next step.',
    analysis: { recommendation: 'Keep the proof grounded.', signals: ['process', 'proof'] },
    curationStatus: 'approved',
    importedMetadata: {
      source: { label: 'Shared Bank', tone: 'shared_bank' },
      qualityGate: qualityGate(),
      videoIntelligence: {
        video: { videoSummary: 'A process ends in a reveal.', contentMechanic: 'proof before explanation' },
        transcript: { text: 'Show the process, then reveal the next step.' },
      },
    },
  };
}

function remix(index) {
  return {
    title: `Variant ${index + 1} title`,
    hook: `Variant ${index + 1} hook`,
    cta: `Variant ${index + 1} CTA`,
    visualFlow: [{
      timeframe: `0:0${index + 1}`,
      actionDescription: `Variant ${index + 1} action`,
      onScreenText: `Variant ${index + 1} text`,
      audioVoiceover: `Variant ${index + 1} voiceover`,
    }],
  };
}

function emptyDb() {
  return {
    users: [
      { id: 'user_bank', name: 'Bank Owner', email: 'bank-owner@example.com', role: 'owner', workspaceId: 'ws_bank' },
      { id: 'user_a', name: 'Workspace A', email: 'workspace-a@example.com', role: 'owner', workspaceId: 'ws_a' },
      { id: 'user_b', name: 'Workspace B', email: 'workspace-b@example.com', role: 'owner', workspaceId: 'ws_b' },
    ],
    sessions: [
      { token: 'session_bank', userId: 'user_bank', expiresAt: '2030-01-01T00:00:00.000Z' },
      { token: 'session_a', userId: 'user_a', expiresAt: '2030-01-01T00:00:00.000Z' },
      { token: 'session_b', userId: 'user_b', expiresAt: '2030-01-01T00:00:00.000Z' },
    ],
    workspaces: [
      { id: 'ws_bank', name: 'Shared Bank', owner: 'Bank Owner', brief: {}, contentPlanPosts: [] },
      {
        id: 'ws_a', name: 'Automation Workspace', owner: 'Workspace A', brief: {}, productBrandBrain: brandA,
        contentPlanPosts: [
          { id: 'legacy_agent_post', title: 'Agent Studio legacy post', date: '2026-08-10', source: 'agent_studio', body: 'legacy', format: 'Post' },
          { id: 'brand_a_existing', title: 'Brand A existing post', date: '2026-08-11', origin: 'product_redesign', brandId: brandA.id, brandKey: brandKey(brandA).slice(0, 1000), brandSnapshot: brandA },
          { id: 'truncated_without_snapshot', title: 'Legacy ambiguous post', date: '2026-08-12', origin: 'product_redesign', brandId: brandA.id, brandKey: brandKey(brandA).slice(0, 1000) },
        ],
      },
      { id: 'ws_b', name: 'Other Workspace', owner: 'Workspace B', brief: {}, productBrandBrain: brandB, contentPlanPosts: [] },
    ],
    subscriptions: [
      { id: 'sub_bank', workspaceId: 'ws_bank', planId: 'trial', status: 'trialing' },
      { id: 'sub_a', workspaceId: 'ws_a', planId: 'trial', status: 'trialing' },
      { id: 'sub_b', workspaceId: 'ws_b', planId: 'trial', status: 'trialing' },
    ],
    reels: [sharedSignal()],
    workspaceAdaptations: [{
      id: 'adaptation_a', workspaceId: 'ws_a', signalId: 'signal_shared', sharedSignalId: 'signal_shared',
      generationId: 'generation_a', brandId: brandA.id, brandKey: brandKey(brandA), brandVersion: brandA.version,
      brandSnapshot: brandA, result: { remixes: [remix(0), remix(1), remix(2)] },
      createdAt: '2026-08-06T10:01:00.000Z', updatedAt: '2026-08-06T10:01:00.000Z',
    }],
    workspaceSavedSignals: [{ id: 'saved_a', workspaceId: 'ws_a', signalId: 'signal_shared', sharedSignalId: 'signal_shared', cardId: 'signal_shared' }],
    usageCounters: [], plans: [],
    competitors: [], ideas: [], leads: [], syncJobs: [], sources: [], metaStates: [], instagramAccounts: [], tiktokAccounts: [],
    aiMemory: [], aiJobs: [], remixes: [], contentPlanItems: [], videoJobs: [], dataDeletionRequests: [], demoSessions: [],
    discoveryRuns: [], testerAccess: [],
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
    signal: AbortSignal.timeout(8_000),
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

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-content-plan-'));
const dbPath = path.join(tempDir, 'db.json');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
await writeFile(dbPath, `${JSON.stringify(emptyDb(), null, 2)}\n`, 'utf8');
const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', DB_PATH: dbPath, DATABASE_URL: '',
    APIFY_TOKEN: '', APIFY_API_TOKEN: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '',
    AUTOMATIC_DISCOVERY_ENABLED: 'false', SHARED_SIGNAL_BANK_OWNER_EMAIL: 'bank-owner@example.com',
    UNLIMITED_ACCESS_EMAILS: 'bank-owner@example.com',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });

const headersA = { authorization: 'Bearer session_a' };
const headersB = { authorization: 'Bearer session_b' };
const headersBank = { authorization: 'Bearer session_bank' };

try {
  await waitForServer(baseUrl, child, () => backendOutput);
  const before = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.ok(brandKey(brandA).length > 1000, 'long Brand Brain fixture must exercise legacy key compatibility');
  assert.notEqual(brandKey(brandA), brandKey(brandA2));
  assert.equal(brandKey(brandA).slice(0, 1000), brandKey(brandA2).slice(0, 1000));
  const globalSignalBefore = structuredClone(before.reels[0]);
  const adaptationBefore = structuredClone(before.workspaceAdaptations[0]);
  const savedBefore = structuredClone(before.workspaceSavedSignals);

  const reelsBefore = await request(baseUrl, '/api/workspaces/ws_a/reels', { headers: headersA });
  assert.equal(reelsBefore.response.status, 200);
  const matchBefore = reelsBefore.body.reels.find((item) => item.sharedSourceId === 'signal_shared').workspaceBrandMatch;
  assert.equal(typeof matchBefore, 'number');

  const initialA = await request(baseUrl, '/api/workspaces/ws_a/content-plan?surface=product_redesign', { headers: headersA });
  assert.deepEqual(initialA.body.posts.map((post) => post.id), ['legacy_agent_post', 'brand_a_existing']);
  const workspaceB = await request(baseUrl, '/api/workspaces/ws_b/content-plan?surface=product_redesign', { headers: headersB });
  assert.deepEqual(workspaceB.body.posts, []);

  const addVariant2 = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: {
      origin: 'studio_adaptation', sourceAdaptationId: 'adaptation_a', sourceVariantIndex: 1,
      date: '2026-08-12', time: '12:30', format: 'Reels', status: 'scheduled',
      title: 'Client supplied title must not win', body: 'Client supplied body must not win',
    } }),
  });
  assert.equal(addVariant2.response.status, 201);
  assert.equal(addVariant2.body.post.title, 'Variant 2 title');
  assert.match(addVariant2.body.post.body, /Variant 2 hook/);
  assert.match(addVariant2.body.post.body, /Variant 2 CTA/);
  assert.match(addVariant2.body.post.body, /Variant 2 action/);
  assert.equal(addVariant2.body.post.sourceVariantIndex, 1);
  assert.equal(addVariant2.body.post.sourceAdaptationId, 'adaptation_a');
  assert.equal(addVariant2.body.post.brandKey, brandKey(brandA));

  const reloadedA = await request(baseUrl, '/api/workspaces/ws_a/content-plan?surface=product_redesign', { headers: headersA });
  assert.ok(reloadedA.body.posts.some((post) => post.id === addVariant2.body.post.id));
  const duplicateVariant2 = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: { origin: 'studio_adaptation', sourceAdaptationId: 'adaptation_a', sourceVariantIndex: 1, date: '2026-08-12' } }),
  });
  assert.equal(duplicateVariant2.response.status, 200);
  assert.equal(duplicateVariant2.body.alreadyExists, true);
  const addVariant3 = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: { origin: 'studio_adaptation', sourceAdaptationId: 'adaptation_a', sourceVariantIndex: 2, date: '2026-08-13' } }),
  });
  assert.equal(addVariant3.response.status, 201);
  assert.equal(addVariant3.body.post.sourceVariantIndex, 2);
  assert.equal(addVariant3.body.post.title, 'Variant 3 title');
  const addVariant0 = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: { origin: 'studio_adaptation', sourceAdaptationId: 'adaptation_a', sourceVariantIndex: 0, date: '2026-08-14' } }),
  });
  assert.equal(addVariant0.response.status, 201);
  assert.equal(addVariant0.body.post.sourceVariantIndex, 0);
  const nullVariant = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: { origin: 'studio_adaptation', sourceAdaptationId: 'adaptation_a', sourceVariantIndex: null, date: '2026-08-15' } }),
  });
  assert.equal(nullVariant.response.status, 400);
  assert.equal(nullVariant.body.error, 'content_plan_variant_invalid');
  const garbageVariant = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: { origin: 'studio_adaptation', sourceAdaptationId: 'adaptation_a', sourceVariantIndex: 'garbage', date: '2026-08-15' } }),
  });
  assert.equal(garbageVariant.response.status, 400);
  const booleanVariant = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: { origin: 'studio_adaptation', sourceAdaptationId: 'adaptation_a', sourceVariantIndex: false, date: '2026-08-15' } }),
  });
  assert.equal(booleanVariant.response.status, 400);

  const switchedB = await request(baseUrl, '/api/workspaces/ws_a/agent/context/redesign', {
    method: 'PUT', headers: headersA, body: JSON.stringify({ brand: brandB }),
  });
  assert.equal(switchedB.response.status, 200);
  const brandBPlan = await request(baseUrl, '/api/workspaces/ws_a/content-plan?surface=product_redesign', { headers: headersA });
  assert.deepEqual(brandBPlan.body.posts.map((post) => post.id), ['legacy_agent_post']);
  const mismatch = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: { origin: 'studio_adaptation', sourceAdaptationId: 'adaptation_a', sourceVariantIndex: 3, date: '2026-08-14' } }),
  });
  assert.equal(mismatch.response.status, 409);
  assert.equal(mismatch.body.error, 'content_plan_brand_changed');
  const switchedA = await request(baseUrl, '/api/workspaces/ws_a/agent/context/redesign', {
    method: 'PUT', headers: headersA, body: JSON.stringify({ brand: brandA }),
  });
  assert.equal(switchedA.response.status, 200);
  const brandAPlanAgain = await request(baseUrl, '/api/workspaces/ws_a/content-plan?surface=product_redesign', { headers: headersA });
  assert.ok(brandAPlanAgain.body.posts.some((post) => post.id === addVariant2.body.post.id));
  assert.ok(brandAPlanAgain.body.posts.some((post) => post.id === addVariant3.body.post.id));

  const switchedA2 = await request(baseUrl, '/api/workspaces/ws_a/agent/context/redesign', {
    method: 'PUT', headers: headersA, body: JSON.stringify({ brand: brandA2 }),
  });
  assert.equal(switchedA2.response.status, 200);
  const brandA2Plan = await request(baseUrl, '/api/workspaces/ws_a/content-plan?surface=product_redesign', { headers: headersA });
  assert.deepEqual(brandA2Plan.body.posts.map((post) => post.id), ['legacy_agent_post'], 'same-prefix Brand A2 must not see A1 posts');
  const editA1FromA2 = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts/brand_a_existing', {
    method: 'PUT', headers: headersA, body: JSON.stringify({ post: { title: 'Must stay isolated' } }),
  });
  assert.equal(editA1FromA2.response.status, 409);
  assert.equal(editA1FromA2.body.error, 'content_plan_brand_changed');
  const deleteA1FromA2 = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts/brand_a_existing', {
    method: 'DELETE', headers: headersA,
  });
  assert.equal(deleteA1FromA2.response.status, 409);
  assert.equal(deleteA1FromA2.body.error, 'content_plan_brand_changed');
  const switchedBackA1 = await request(baseUrl, '/api/workspaces/ws_a/agent/context/redesign', {
    method: 'PUT', headers: headersA, body: JSON.stringify({ brand: brandA }),
  });
  assert.equal(switchedBackA1.response.status, 200);
  const brandA1AfterCollision = await request(baseUrl, '/api/workspaces/ws_a/content-plan?surface=product_redesign', { headers: headersA });
  assert.ok(brandA1AfterCollision.body.posts.some((post) => post.id === 'brand_a_existing'));
  assert.equal(brandA1AfterCollision.body.posts.some((post) => post.id === 'truncated_without_snapshot'), false);
  const editedVariant2 = await request(baseUrl, `/api/workspaces/ws_a/content-plan/posts/${addVariant2.body.post.id}`, {
    method: 'PUT', headers: headersA,
    body: JSON.stringify({ post: { title: 'Variant 2 edited after reload' } }),
  });
  assert.equal(editedVariant2.response.status, 200);
  assert.equal(editedVariant2.body.post.title, 'Variant 2 edited after reload');
  assert.equal(editedVariant2.body.post.brandKey, brandKey(brandA));
  const deletedVariant3 = await request(baseUrl, `/api/workspaces/ws_a/content-plan/posts/${addVariant3.body.post.id}`, {
    method: 'DELETE', headers: headersA,
  });
  assert.equal(deletedVariant3.response.status, 200);
  assert.equal(deletedVariant3.body.posts.some((post) => post.id === addVariant3.body.post.id), false);

  const manual = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: { title: 'Manual post', body: 'Manual body', date: '2026-08-15', time: '09:00', format: 'Post', status: 'scheduled' } }),
  });
  assert.equal(manual.response.status, 201);
  assert.equal(manual.body.post.sourceVariantIndex, null);
  const edited = await request(baseUrl, `/api/workspaces/ws_a/content-plan/posts/${manual.body.post.id}`, {
    method: 'PUT', headers: headersA,
    body: JSON.stringify({ post: { title: 'Edited manual post', body: 'Edited body', date: '2026-08-16', time: '10:00', format: 'Stories', status: 'completed' } }),
  });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.body.post.status, 'completed');
  const deleted = await request(baseUrl, `/api/workspaces/ws_a/content-plan/posts/${manual.body.post.id}`, { method: 'DELETE', headers: headersA });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.body.posts.some((post) => post.id === manual.body.post.id), false);

  const legacy = await request(baseUrl, '/api/workspaces/ws_a/content-plan', { headers: headersA });
  assert.ok(legacy.body.posts.some((post) => post.id === 'legacy_agent_post'));
  assert.ok(legacy.body.posts.some((post) => post.id === addVariant2.body.post.id));
  const sevenPosts = Array.from({ length: 7 }, (_, index) => ({
    id: `limit-${index}`, title: `Limit ${index}`, date: `2026-09-${String(index + 1).padStart(2, '0')}`, format: 'Post',
  }));
  const legacyPut = await request(baseUrl, '/api/workspaces/ws_a/content-plan', { method: 'PUT', headers: headersA, body: JSON.stringify({ posts: sevenPosts }) });
  assert.equal(legacyPut.response.status, 200);
  const limitFailure = await request(baseUrl, '/api/workspaces/ws_a/content-plan/posts', {
    method: 'POST', headers: headersA,
    body: JSON.stringify({ post: { title: 'Over limit', date: '2026-09-20' } }),
  });
  assert.equal(limitFailure.response.status, 402);
  assert.equal(limitFailure.body.error, 'plan_limit_reached');
  const afterLimit = await request(baseUrl, '/api/workspaces/ws_a/content-plan', { headers: headersA });
  assert.equal(afterLimit.body.posts.length, 7);

  const after = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.deepEqual(after.reels[0], globalSignalBefore);
  assert.deepEqual(after.workspaceAdaptations[0], adaptationBefore);
  assert.deepEqual(after.workspaceSavedSignals, savedBefore);
  const reelsAfter = await request(baseUrl, '/api/workspaces/ws_a/reels', { headers: headersA });
  assert.equal(reelsAfter.body.reels.find((item) => item.sharedSourceId === 'signal_shared').workspaceBrandMatch, matchBefore);
  assert.equal(backendOutput.includes('Gemini') || backendOutput.includes('Apify'), false);
  void headersBank;
} catch (error) {
  if (backendOutput) console.error(backendOutput);
  throw error;
} finally {
  await stop(child);
  await rm(tempDir, { recursive: true, force: true });
}

console.log('Workspace Content Plan API regression passed.');
console.log('provider calls: 0');
console.log('network attempts to Gemini/Apify: 0');
