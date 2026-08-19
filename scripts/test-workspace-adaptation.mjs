import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');
const PROVIDER_FIXTURE = path.join(ROOT, 'scripts', 'fixtures', 'workspace-adaptation-test-provider.cjs');

function emptyDb() {
  return {
    users: [
      { id: 'user_owner', name: 'Bank Owner', email: 'bank-owner@example.com', role: 'owner', workspaceId: 'ws_bank' },
      { id: 'user_a', name: 'Workspace A', email: 'workspace-a@example.com', role: 'owner', workspaceId: 'ws_a' },
      { id: 'user_b', name: 'Workspace B', email: 'workspace-b@example.com', role: 'owner', workspaceId: 'ws_b' },
      { id: 'user_c', name: 'Workspace C', email: 'workspace-c@example.com', role: 'owner', workspaceId: 'ws_c' },
    ],
    sessions: [
      { token: 'session_owner', userId: 'user_owner', expiresAt: '2030-01-01T00:00:00.000Z' },
      { token: 'session_a', userId: 'user_a', expiresAt: '2030-01-01T00:00:00.000Z' },
      { token: 'session_b', userId: 'user_b', expiresAt: '2030-01-01T00:00:00.000Z' },
      { token: 'session_c', userId: 'user_c', expiresAt: '2030-01-01T00:00:00.000Z' },
    ],
    workspaces: [
      { id: 'ws_bank', name: 'Shared Bank', owner: 'Bank Owner', brief: {} },
      {
        id: 'ws_a', name: 'Automation Workspace', owner: 'Workspace A', brief: {},
        productBrandBrain: {
          version: 1, id: 'brand_a', name: 'Automation Brand', updatedAt: '2026-08-06T10:00:00.000Z',
          brain: { profileDescription: 'AI workflow automation for small product teams', audience: 'small product teams', niche: 'AI automation', market: 'Ukraine', product: 'workflow audit' },
        },
      },
      {
        id: 'ws_b', name: 'Fitness Workspace', owner: 'Workspace B', brief: {},
        productBrandBrain: {
          version: 1, id: 'brand_b', name: 'Fitness Brand', updatedAt: '2026-08-06T10:00:00.000Z',
          brain: { profileDescription: 'Fitness coaching for runners', audience: 'runners', niche: 'fitness coaching', market: 'Ukraine', product: 'mobility program' },
        },
      },
      { id: 'ws_c', name: 'Incomplete Workspace', owner: 'Workspace C', brief: {} },
    ],
    subscriptions: [
      { id: 'sub_bank', workspaceId: 'ws_bank', planId: 'trial', status: 'trialing' },
      { id: 'sub_a', workspaceId: 'ws_a', planId: 'trial', status: 'trialing' },
      { id: 'sub_b', workspaceId: 'ws_b', planId: 'trial', status: 'trialing' },
      { id: 'sub_c', workspaceId: 'ws_c', planId: 'trial', status: 'trialing' },
    ],
    reels: [],
    workspaceAdaptations: [],
    usageCounters: [],
  };
}

function qualityGate(decision = 'accept', admittedToBank = true) {
  return {
    decision,
    admittedToBank,
    qualityScore: 84,
    brandRelevance: 12,
    centralIdea: 'Show the mechanism before the explanation.',
    contentMechanic: 'visible proof before the offer',
    transferableMechanic: 'proof -> process -> next step',
    summary: 'A visible process creates curiosity before the CTA.',
    observations: [{ id: 'obs_1', kind: 'setup', description: 'A person shows the setup.' }],
    evidenceChains: [{ mode: 'process_demo', beforeEvidenceId: 'obs_1' }],
  };
}

function bankSignal(id, title, gate = qualityGate()) {
  return {
    id,
    workspaceId: 'ws_bank',
    curationStatus: 'approved',
    title,
    caption: 'The source caption describes a visible workflow and outcome.',
    sourceUrl: `https://example.test/${id}`,
    handle: '@verified_source',
    market: 'Ukraine',
    score: 92,
    transcript: 'Show the process, then reveal the next step.',
    analysis: { recommendation: 'Keep the visible proof grounded.', signals: ['process', 'proof'] },
    importedMetadata: {
      id,
      source: { label: 'Shared Bank', tone: 'shared_bank' },
      videoIntelligence: {
        video: { videoSummary: 'A visible process ends in a clear reveal.', contentMechanic: 'proof before explanation' },
        transcript: { text: 'Show the process, then reveal the next step.' },
      },
      qualityGate: gate,
    },
  };
}

async function waitForProviderMode(filePath, mode) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const events = (await readFile(filePath, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    if (events.some((event) => event.mode === mode)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`provider mode timed out: ${mode}`);
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
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until ready.
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

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-adaptation-'));
const dbPath = path.join(tempDir, 'db.json');
const providerCallsPath = path.join(tempDir, 'provider-calls.jsonl');
const providerReleasePath = path.join(tempDir, 'provider-release');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const seededDb = emptyDb();
seededDb.reels.push(
  bankSignal('signal_good', 'Grounded automation workflow'),
  bankSignal('signal_race', 'Brand Race source'),
  bankSignal('signal_failure', 'Failure adaptation source'),
  bankSignal('signal_reject', 'Rejected adaptation source', qualityGate('reject', true)),
  bankSignal('signal_uncertain', 'Uncertain adaptation source', qualityGate('uncertain', true)),
  bankSignal('signal_not_admitted', 'Not admitted adaptation source', qualityGate('accept', false)),
);
await writeFile(dbPath, `${JSON.stringify(seededDb, null, 2)}\n`, 'utf8');
await writeFile(providerCallsPath, '', 'utf8');

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    APIFY_TOKEN: '',
    APIFY_API_TOKEN: '',
    GEMINI_API_KEY: '',
    OPENAI_API_KEY: '',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    SHARED_SIGNAL_BANK_WORKSPACE_ID: 'ws_bank',
    SHARED_SIGNAL_BANK_LIMIT: '250',
    SHARED_SIGNAL_BANK_OWNER_EMAIL: 'bank-owner@example.com',
    UNLIMITED_ACCESS_EMAILS: 'bank-owner@example.com',
    REMIX_TEST_PROVIDER: PROVIDER_FIXTURE,
    REMIX_TEST_PROVIDER_CALLS_PATH: providerCallsPath,
    REMIX_TEST_PROVIDER_RELEASE_PATH: providerReleasePath,
    USE_PRODUCT_LIVE_REMIX_PIPELINE: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });

const auth = (token) => ({ authorization: `Bearer ${token}` });
const adaptationPath = (workspaceId, signalId) => `/api/workspaces/${workspaceId}/adaptations/${signalId}`;
const generationPath = (workspaceId, signalId) => `${adaptationPath(workspaceId, signalId)}/generate`;

try {
  await waitForServer(baseUrl, child, () => backendOutput);
  const headersA = auth('session_a');
  const headersB = auth('session_b');
  const headersC = auth('session_c');
  const headersOwner = auth('session_owner');
  const brandA = structuredClone(seededDb.workspaces.find((workspace) => workspace.id === 'ws_a').productBrandBrain);
  const brandB = structuredClone(seededDb.workspaces.find((workspace) => workspace.id === 'ws_b').productBrandBrain);

  const before = await request(baseUrl, adaptationPath('ws_a', 'shared_signal_good'), { headers: headersA });
  assert.equal(before.response.status, 200);
  assert.equal(before.body.status, 'absent');
  assert.equal(before.body.adaptation, null);
  assert.equal((await readFile(providerCallsPath, 'utf8')).trim(), '', 'Studio load must not call a provider');

  const beforeReels = await request(baseUrl, '/api/workspaces/ws_a/reels', { headers: headersA });
  const beforeProjected = beforeReels.body.reels.find((reel) => reel.sharedSourceId === 'signal_good');
  const beforeMatch = beforeProjected.workspaceBrandMatch;
  const globalBefore = structuredClone(JSON.parse(await readFile(dbPath, 'utf8')).reels.find((reel) => reel.id === 'signal_good'));

  const concurrent = await Promise.all([
    request(baseUrl, generationPath('ws_a', 'shared_signal_good'), { method: 'POST', headers: headersA }),
    request(baseUrl, generationPath('ws_a', 'shared_signal_good'), { method: 'POST', headers: headersA }),
  ]);
  assert.ok(concurrent.every(({ response }) => [200, 201].includes(response.status)));
  assert.equal((await readFile(providerCallsPath, 'utf8')).trim().split('\n').filter(Boolean).length, 1, 'single-flight must issue one provider call');
  assert.ok(concurrent.every(({ body }) => body.adaptation?.result?.remixes?.length === 3));

  const afterGenerationDb = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(afterGenerationDb.workspaceAdaptations.length, 1);
  const savedA = afterGenerationDb.workspaceAdaptations[0];
  assert.equal(savedA.workspaceId, 'ws_a');
  assert.equal(savedA.signalId, 'signal_good');
  assert.equal(savedA.sharedSignalId, 'shared_signal_good');
  assert.equal(savedA.brandId, 'brand_a');
  assert.equal(savedA.brandSnapshot.brain.audience, 'small product teams');
  assert.equal(savedA.sourceContext.transcript.text, 'Show the process, then reveal the next step.');
  assert.equal(savedA.sourceContext.videoIntelligence.video.videoSummary, 'A visible process ends in a clear reveal.');
  assert.equal(savedA.sourceContext.sourceEvidence.qualityGate.decision, 'accept');
  assert.deepEqual(savedA.sourceContext.sourceEvidence.qualityGate.observations, globalBefore.importedMetadata.qualityGate.observations);
  assert.deepEqual(savedA.sourceContext.sourceEvidence.qualityGate.evidenceChains, globalBefore.importedMetadata.qualityGate.evidenceChains);
  assert.equal(savedA.payloadDiagnostics.truncatedFields.length, 0);
  assert.equal(savedA.result.remixes.length, 3);
  assert.ok(savedA.result.remixes[0].visualFlow.length > 0, 'production script remains persisted with adaptation');
  assert.deepEqual(afterGenerationDb.reels.find((reel) => reel.id === 'signal_good'), globalBefore);

  const reloadedA = await request(baseUrl, adaptationPath('ws_a', 'shared_signal_good'), { headers: headersA });
  assert.equal(reloadedA.response.status, 200);
  assert.equal(reloadedA.body.status, 'ready');
  assert.equal(reloadedA.body.adaptation.id, savedA.id);
  const afterReels = await request(baseUrl, '/api/workspaces/ws_a/reels', { headers: headersA });
  assert.equal(afterReels.body.reels.find((reel) => reel.sharedSourceId === 'signal_good').workspaceBrandMatch, beforeMatch);

  const isolatedB = await request(baseUrl, adaptationPath('ws_b', 'shared_signal_good'), { headers: headersB });
  assert.equal(isolatedB.response.status, 200);
  assert.equal(isolatedB.body.status, 'absent');
  assert.equal(isolatedB.body.adaptation, null);
  const generatedB = await request(baseUrl, generationPath('ws_b', 'shared_signal_good'), { method: 'POST', headers: headersB });
  assert.equal(generatedB.response.status, 201);
  const afterB = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(afterB.workspaceAdaptations.length, 2);
  assert.deepEqual(
    afterB.workspaceAdaptations.map((record) => record.brandId).sort(),
    ['brand_a', 'brand_b'],
  );

  const incompleteRead = await request(baseUrl, adaptationPath('ws_c', 'shared_signal_good'), { headers: headersC });
  assert.equal(incompleteRead.response.status, 200);
  assert.equal(incompleteRead.body.brandBrain.complete, false);
  const incompleteGenerate = await request(baseUrl, generationPath('ws_c', 'shared_signal_good'), { method: 'POST', headers: headersC });
  assert.equal(incompleteGenerate.response.status, 409);
  assert.equal(incompleteGenerate.body.error, 'product_brand_brain_incomplete');

  for (const signalId of ['signal_reject', 'signal_uncertain', 'signal_not_admitted', 'missing_signal']) {
    const blocked = await request(baseUrl, generationPath('ws_a', `shared_${signalId}`), { method: 'POST', headers: headersA });
    assert.equal(blocked.response.status, 409, `${signalId} must not be adaptable`);
    assert.equal(blocked.body.error, 'signal_not_adaptable');
  }

  const raceGeneration = request(baseUrl, generationPath('ws_a', 'shared_signal_race'), { method: 'POST', headers: headersA });
  await waitForProviderMode(providerCallsPath, 'waiting_for_release');
  const switchedToB = await request(baseUrl, '/api/workspaces/ws_a/agent/context/redesign', {
    method: 'PUT',
    headers: headersA,
    body: JSON.stringify({ brand: brandB }),
  });
  assert.equal(switchedToB.response.status, 200);
  assert.equal(switchedToB.body.productBrand.id, 'brand_b');
  await writeFile(providerReleasePath, 'release\n', 'utf8');
  const raceResultA = await raceGeneration;
  assert.equal(raceResultA.response.status, 201);
  assert.equal(raceResultA.body.activeBrandChanged, true);
  assert.equal(raceResultA.body.adaptation.brandId, 'brand_a');
  assert.equal(raceResultA.body.adaptation.brandSnapshot.brain.audience, 'small product teams');

  const activeBRead = await request(baseUrl, adaptationPath('ws_a', 'shared_signal_race'), { headers: headersA });
  assert.equal(activeBRead.response.status, 200);
  assert.equal(activeBRead.body.status, 'absent', 'active Brand B must not read Brand A adaptation');
  const raceResultB = await request(baseUrl, generationPath('ws_a', 'shared_signal_race'), { method: 'POST', headers: headersA });
  assert.equal(raceResultB.response.status, 201);
  assert.equal(raceResultB.body.adaptation.brandId, 'brand_b');

  const switchedBackToA = await request(baseUrl, '/api/workspaces/ws_a/agent/context/redesign', {
    method: 'PUT',
    headers: headersA,
    body: JSON.stringify({ brand: brandA }),
  });
  assert.equal(switchedBackToA.response.status, 200);
  const activeARead = await request(baseUrl, adaptationPath('ws_a', 'shared_signal_race'), { headers: headersA });
  assert.equal(activeARead.response.status, 200);
  assert.equal(activeARead.body.status, 'ready');
  assert.equal(activeARead.body.adaptation.brandId, 'brand_a');

  const legacyContract = await request(baseUrl, '/api/workspaces/ws_a/remix/generate', {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({
      globalInsight: {
        title: 'Legacy frontend source',
        hook: 'Show the proof first.',
        script: 'Show a process and reveal the result.',
        marketingMechanics: 'proof before explanation',
      },
      businessBrief: { niche: '', location: '', toneOfVoice: '' },
      targetLanguage: 'uk',
    }),
  });
  assert.equal(legacyContract.response.status, 200);
  assert.equal(legacyContract.body.remixes.length, 3);
  assert.ok(legacyContract.body.generationId);
  assert.ok(legacyContract.body.daily);
  assert.equal(legacyContract.body._generation.brandSource, 'product_brand_brain');
  assert.equal(
    legacyContract.body._generation.generationBrandKey,
    activeARead.body.adaptation.generationBrandKey,
    'legacy and Product routes must resolve the same Product Brand snapshot',
  );

  const beforeFailure = JSON.parse(await readFile(dbPath, 'utf8'));
  const failureCounterBefore = beforeFailure.usageCounters.find((counter) => counter.workspaceId === 'ws_a' && counter.metric === 'trial_remix_daily')?.value || 0;
  const failureReels = await request(baseUrl, '/api/workspaces/ws_a/reels', { headers: headersA });
  const providerFailure = await request(baseUrl, generationPath('ws_a', 'shared_signal_failure'), { method: 'POST', headers: headersA });
  assert.equal(providerFailure.response.status, 500);
  assert.equal(providerFailure.body.error, 'mock_provider_failure');
  const afterFailure = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(afterFailure.workspaceAdaptations.filter((record) => record.signalId === 'signal_failure').length, 0);
  const failureCounterAfter = afterFailure.usageCounters.find((counter) => counter.workspaceId === 'ws_a' && counter.metric === 'trial_remix_daily')?.value || 0;
  assert.equal(failureCounterAfter, failureCounterBefore, 'daily remix reservation must release after provider failure');

  const excluded = await request(baseUrl, '/api/owner/signals/signal_good/exclude', {
    method: 'POST',
    headers: headersOwner,
    body: JSON.stringify({ reasonCode: 'no_useful_mechanic_or_outcome' }),
  });
  assert.equal(excluded.response.status, 200);
  const hiddenAdaptation = await request(baseUrl, adaptationPath('ws_a', 'shared_signal_good'), { headers: headersA });
  assert.equal(hiddenAdaptation.response.status, 409);
  assert.equal(hiddenAdaptation.body.error, 'signal_not_adaptable');
  const bypassAttempt = await request(baseUrl, generationPath('ws_a', 'shared_signal_good'), { method: 'POST', headers: headersA });
  assert.equal(bypassAttempt.response.status, 409);
  assert.equal(bypassAttempt.body.error, 'signal_not_adaptable');

  const finalDb = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(finalDb.reels.find((reel) => reel.id === 'signal_good').importedMetadata.qualityGate.decision, 'accept');
  assert.equal(finalDb.reels.find((reel) => reel.id === 'signal_good').ownerModeration.global.active, true);
  assert.equal(finalDb.workspaceAdaptations.length, 4, 'failed and blocked actions must not create records');
} catch (error) {
  if (backendOutput) console.error(backendOutput);
  throw error;
} finally {
  await stop(child);
  await rm(tempDir, { recursive: true, force: true });
}

console.log('Workspace adaptation persistence regression passed.');
console.log('real provider calls: 0');
console.log('external network attempts: 0');
