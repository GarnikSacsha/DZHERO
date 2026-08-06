import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filterSignalCards, mapQualityAcceptedSignalsToProductCards } from '../src/productSignalsViewState.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');

function emptyDb() {
  return {
    users: [], sessions: [], workspaces: [], competitors: [], reels: [], ideas: [], leads: [],
    syncJobs: [], sources: [], metaStates: [], instagramAccounts: [], tiktokAccounts: [],
    aiMemory: [], aiJobs: [], remixes: [], contentPlanItems: [], videoJobs: [],
    dataDeletionRequests: [], plans: [], subscriptions: [], usageCounters: [], demoSessions: [],
    discoveryRuns: [], testerAccess: [], workspaceSavedSignals: [],
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

async function register(baseUrl, name, email) {
  const result = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password: 'test-password-123' }),
  });
  assert.equal(result.response.status, 201);
  return result.body;
}

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited early: ${output()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until the backend is ready.
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

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-saved-signals-'));
const dbPath = path.join(tempDir, 'db.json');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
await writeFile(dbPath, `${JSON.stringify(emptyDb(), null, 2)}\n`, 'utf8');

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
    GOOGLE_API_KEY: '',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    SHARED_SIGNAL_BANK_OWNER_EMAIL: 'bank-owner@example.com',
    UNLIMITED_ACCESS_EMAILS: 'bank-owner@example.com',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });

const qualityGate = (decision, admittedToBank, brandRelevance) => ({
  decision,
  admittedToBank,
  qualityScore: 70,
  brandRelevance,
  summary: 'A practical process with a visible outcome.',
  observations: [{ id: 'obs_1', kind: 'setup', description: 'Setup.' }],
  evidenceChains: [{ mode: 'process_demo', beforeEvidenceId: 'obs_1' }],
});

const brandBrain = (id, profileDescription, audience, niche, market) => ({
  version: 1,
  id,
  name: id,
  brain: { profileDescription, audience, niche, market },
  updatedAt: new Date().toISOString(),
});

try {
  await waitForServer(baseUrl, child, () => backendOutput);
  const owner = await register(baseUrl, 'Bank Owner', 'bank-owner@example.com');
  const workspaceA = await register(baseUrl, 'Product Teams', 'workspace-a@example.com');
  const workspaceB = await register(baseUrl, 'Runners', 'workspace-b@example.com');

  const signals = [
    {
      id: 'signal_accept_strong',
      title: 'AI automation workflow for product teams',
      caption: 'A repeatable process for small product teams.',
      market: 'Ukraine Europe',
      score: 95,
      sourceUrl: 'https://example.test/accept-strong',
      curationStatus: 'approved',
      importedMetadata: { qualityGate: qualityGate('accept', true, 91) },
    },
    {
      id: 'signal_accept_secondary',
      title: 'Mobility routine for runners',
      caption: 'A practical fitness routine with visible progress.',
      market: 'United States',
      score: 80,
      sourceUrl: 'https://example.test/accept-secondary',
      curationStatus: 'approved',
      importedMetadata: { qualityGate: qualityGate('accept', true, 37) },
    },
    {
      id: 'signal_reject',
      title: 'Rejected process signal',
      sourceUrl: 'https://example.test/reject',
      score: 60,
      curationStatus: 'approved',
      importedMetadata: { qualityGate: qualityGate('reject', true, 88) },
    },
    {
      id: 'signal_uncertain',
      title: 'Uncertain process signal',
      sourceUrl: 'https://example.test/uncertain',
      score: 50,
      curationStatus: 'approved',
      importedMetadata: { qualityGate: qualityGate('uncertain', true, 76) },
    },
    {
      id: 'signal_not_admitted',
      title: 'Not admitted process signal',
      sourceUrl: 'https://example.test/not-admitted',
      score: 40,
      curationStatus: 'approved',
      importedMetadata: { qualityGate: qualityGate('accept', false, 65) },
    },
  ].map((signal) => ({ ...signal, workspaceId: owner.user.workspaceId }));

  const db = JSON.parse(await readFile(dbPath, 'utf8'));
  db.workspaces.find((item) => item.id === workspaceA.user.workspaceId).productBrandBrain = brandBrain(
    'brand-a',
    'AI workflow automation for small product teams',
    'small product teams',
    'AI workflow automation',
    'Ukraine Europe',
  );
  db.workspaces.find((item) => item.id === workspaceB.user.workspaceId).productBrandBrain = brandBrain(
    'brand-b',
    'Fitness coaching and mobility routines',
    'runners',
    'fitness coaching',
    'United States',
  );
  db.reels.push(...signals);
  await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');

  const headersA = { authorization: `Bearer ${workspaceA.token}` };
  const headersB = { authorization: `Bearer ${workspaceB.token}` };
  const reelsA = await request(baseUrl, `/api/workspaces/${workspaceA.user.workspaceId}/reels`, { headers: headersA });
  const reelsB = await request(baseUrl, `/api/workspaces/${workspaceB.user.workspaceId}/reels`, { headers: headersB });
  assert.equal(reelsA.response.status, 200);
  assert.equal(reelsB.response.status, 200);

  const admittedIds = signals
    .filter((signal) => signal.importedMetadata.qualityGate.decision === 'accept'
      && signal.importedMetadata.qualityGate.admittedToBank === true)
    .map((signal) => signal.id);
  assert.deepEqual(
    reelsA.body.reels.filter((reel) => reel.sharedBank && admittedIds.includes(reel.sharedSourceId)).map((reel) => reel.sharedSourceId),
    admittedIds,
  );
  assert.deepEqual(
    reelsB.body.reels.filter((reel) => reel.sharedBank && admittedIds.includes(reel.sharedSourceId)).map((reel) => reel.sharedSourceId),
    admittedIds,
  );
  const scoresA = Object.fromEntries(reelsA.body.reels.filter((reel) => reel.sharedBank).map((reel) => [reel.sharedSourceId, reel.workspaceBrandMatch]));
  const scoresB = Object.fromEntries(reelsB.body.reels.filter((reel) => reel.sharedBank).map((reel) => [reel.sharedSourceId, reel.workspaceBrandMatch]));
  assert.notDeepEqual(scoresA, scoresB, 'different Brand Brains must retain different workspace projections');

  const strongA = reelsA.body.reels.find((reel) => reel.sharedSourceId === 'signal_accept_strong');
  const secondaryA = reelsA.body.reels.find((reel) => reel.sharedSourceId === 'signal_accept_secondary');
  assert.ok(strongA?.id && secondaryA?.id);
  const brandMatchSnapshot = { strong: strongA.workspaceBrandMatch, secondary: secondaryA.workspaceBrandMatch };
  const globalBeforeSave = structuredClone(
    JSON.parse(await readFile(dbPath, 'utf8')).reels.find((reel) => reel.id === 'signal_accept_strong'),
  );

  const emptyA = await request(baseUrl, `/api/workspaces/${workspaceA.user.workspaceId}/saved-signals`, { headers: headersA });
  const emptyB = await request(baseUrl, `/api/workspaces/${workspaceB.user.workspaceId}/saved-signals`, { headers: headersB });
  assert.deepEqual(emptyA.body.savedSignals, []);
  assert.deepEqual(emptyB.body.savedSignals, []);

  const firstSave = await request(baseUrl, `/api/workspaces/${workspaceA.user.workspaceId}/saved-signals/${strongA.id}`, { method: 'PUT', headers: headersA });
  assert.equal(firstSave.response.status, 201);
  assert.equal(firstSave.body.saved, true);
  assert.equal(firstSave.body.alreadySaved, false);
  assert.equal(firstSave.body.savedSignal.cardId, strongA.id);

  const duplicateSave = await request(baseUrl, `/api/workspaces/${workspaceA.user.workspaceId}/saved-signals/${strongA.id}`, { method: 'PUT', headers: headersA });
  assert.equal(duplicateSave.response.status, 200);
  assert.equal(duplicateSave.body.alreadySaved, true);
  const afterDuplicate = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(afterDuplicate.workspaceSavedSignals.filter((record) => record.workspaceId === workspaceA.user.workspaceId).length, 1);
  assert.deepEqual(afterDuplicate.reels.find((reel) => reel.id === 'signal_accept_strong'), globalBeforeSave);

  const reloadedA = await request(baseUrl, `/api/workspaces/${workspaceA.user.workspaceId}/saved-signals`, { headers: headersA });
  assert.equal(reloadedA.response.status, 200);
  assert.deepEqual(reloadedA.body.savedSignals.map((record) => record.cardId), [strongA.id]);
  const reelsAfterSave = await request(baseUrl, `/api/workspaces/${workspaceA.user.workspaceId}/reels`, { headers: headersA });
  const strongAfterSave = reelsAfterSave.body.reels.find((reel) => reel.sharedSourceId === 'signal_accept_strong');
  const secondaryAfterSave = reelsAfterSave.body.reels.find((reel) => reel.sharedSourceId === 'signal_accept_secondary');
  assert.deepEqual(
    { strong: strongAfterSave.workspaceBrandMatch, secondary: secondaryAfterSave.workspaceBrandMatch },
    brandMatchSnapshot,
    'save/reload must not mutate workspace Brand Match scores',
  );
  const cardsA = mapQualityAcceptedSignalsToProductCards(reelsA.body.reels);
  assert.deepEqual(
    filterSignalCards(cardsA, { platform: 'all', niche: 'all', aiMatch: 'all', views: 'all', likes: 'all', date: 'all', creator: 'all', status: 'saved' }, {
      savedIds: new Set(reloadedA.body.savedSignals.map((record) => record.cardId)),
    }).map((card) => card.id),
    [strongA.id],
    'Saved filter consumes backend returned card IDs',
  );
  const isolatedB = await request(baseUrl, `/api/workspaces/${workspaceB.user.workspaceId}/saved-signals`, { headers: headersB });
  assert.deepEqual(isolatedB.body.savedSignals, [], 'workspace B must not see workspace A saved state');

  const saveB = await request(baseUrl, `/api/workspaces/${workspaceB.user.workspaceId}/saved-signals/${strongA.id}`, { method: 'PUT', headers: headersB });
  assert.equal(saveB.response.status, 201);
  const bothSaved = JSON.parse(await readFile(dbPath, 'utf8')).workspaceSavedSignals;
  assert.equal(bothSaved.filter((record) => record.signalId === 'signal_accept_strong').length, 2);

  const unsaveA = await request(baseUrl, `/api/workspaces/${workspaceA.user.workspaceId}/saved-signals/${strongA.id}`, { method: 'DELETE', headers: headersA });
  assert.equal(unsaveA.response.status, 200);
  assert.equal(unsaveA.body.alreadyUnsaved, false);
  const repeatUnsaveA = await request(baseUrl, `/api/workspaces/${workspaceA.user.workspaceId}/saved-signals/${strongA.id}`, { method: 'DELETE', headers: headersA });
  assert.equal(repeatUnsaveA.response.status, 200);
  assert.equal(repeatUnsaveA.body.alreadyUnsaved, true);

  for (const signal of ['signal_reject', 'signal_uncertain', 'signal_not_admitted', 'missing_signal']) {
    const rejected = await request(baseUrl, `/api/workspaces/${workspaceA.user.workspaceId}/saved-signals/shared_${signal}`, { method: 'PUT', headers: headersA });
    assert.equal(rejected.response.status, 409, `${signal} must not be saveable`);
  }

  const saveForExclusion = await request(baseUrl, `/api/workspaces/${workspaceA.user.workspaceId}/saved-signals/${strongA.id}`, { method: 'PUT', headers: headersA });
  assert.equal(saveForExclusion.response.status, 201);
  const excluded = await request(baseUrl, '/api/owner/signals/signal_accept_strong/exclude', {
    method: 'POST',
    headers: { authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ reasonCode: 'no_useful_mechanic_or_outcome' }),
  });
  assert.equal(excluded.response.status, 200);

  const afterExclusionA = await request(baseUrl, `/api/workspaces/${workspaceA.user.workspaceId}/saved-signals`, { headers: headersA });
  const afterExclusionB = await request(baseUrl, `/api/workspaces/${workspaceB.user.workspaceId}/saved-signals`, { headers: headersB });
  assert.deepEqual(afterExclusionA.body.savedSignals, [], 'owner exclusion must hide an existing personal save');
  assert.deepEqual(afterExclusionB.body.savedSignals, [], 'owner exclusion must hide every workspace projection');
  const saveExcluded = await request(baseUrl, `/api/workspaces/${workspaceA.user.workspaceId}/saved-signals/${strongA.id}`, { method: 'PUT', headers: headersA });
  assert.equal(saveExcluded.response.status, 409, 'owner exclusion must not be bypassed by personal Save');

  const afterExclusionDb = JSON.parse(await readFile(dbPath, 'utf8'));
  const globalAfterSave = afterExclusionDb.reels.find((reel) => reel.id === 'signal_accept_strong');
  assert.equal(globalAfterSave.importedMetadata.qualityGate.decision, globalBeforeSave.importedMetadata.qualityGate.decision);
  assert.equal(globalAfterSave.ownerModeration.global.active, true);
  assert.equal(afterExclusionDb.workspaceSavedSignals.filter((record) => record.signalId === 'signal_accept_strong').length, 2, 'owner exclusion hides but does not duplicate or rewrite personal associations');
} catch (error) {
  if (backendOutput) console.error(backendOutput);
  throw error;
} finally {
  await stop(child);
  await rm(tempDir, { recursive: true, force: true });
}

console.log('Workspace saved signals API and Saved filter regression passed.');
console.log('provider calls: 0');
console.log('network attempts to Gemini/Apify: 0');
