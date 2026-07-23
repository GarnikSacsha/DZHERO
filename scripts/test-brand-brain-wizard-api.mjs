import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { normalizeBrandBrain } = require('../backend/services/brandBrainContext.cjs');
let output = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Brand Brain wizard test server exited early: ${output}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Brand Brain wizard test server did not start: ${output}`);
}

async function requestJson(baseUrl, pathname, { method = 'GET', cookie = '', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed = {};
  try { parsed = JSON.parse(text); } catch {}
  return { status: response.status, body: parsed };
}

function seedWizardFixture(database) {
  const workspace = database.workspaces.find((item) => item.id === 'ws_demo_ua');
  assert.ok(workspace, 'Demo workspace fixture is missing');
  workspace.brief = {};
  workspace.brandBrainDraft = undefined;
  database.reels = (database.reels || []).filter((item) => item.workspaceId !== workspace.id);
  database.reels.unshift(
    {
      id: 'reel_coffee_fixture',
      workspaceId: workspace.id,
      title: 'Breakfast coffee before the Kyiv commute',
      caption: 'Fast coffee and breakfast for busy Kyiv commuters',
      market: 'Kyiv',
      platform: 'tiktok',
      score: 91,
    },
    {
      id: 'reel_unrelated_fixture',
      workspaceId: workspace.id,
      title: 'Weekend mountain bikes',
      caption: 'Trail riding gear review',
      market: 'Lviv',
      platform: 'youtube',
      score: 99,
    },
  );
  database.usageCounters = (database.usageCounters || []).filter((item) => item.workspaceId !== workspace.id);
}

async function testDraftFinalizeAndSharedBankAccess() {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'dzhero-brand-brain-wizard-'));
  const databasePath = path.join(tempDirectory, 'db.json');
  const database = JSON.parse(readFileSync(path.join(root, 'backend', 'data', 'db.json'), 'utf8'));
  seedWizardFixture(database);
  writeFileSync(databasePath, JSON.stringify(database));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['backend/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: databasePath,
      DATABASE_URL: '',
      AUTOMATIC_DISCOVERY_ENABLED: 'false',
      ALLOW_DEMO_LOGIN: 'true',
      SHARED_SIGNAL_BANK_WORKSPACE_ID: 'ws_demo_ua',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  try {
    await waitForHealth(baseUrl, child);
    const login = await requestJson(baseUrl, '/api/auth/demo', { method: 'POST' });
    assert.equal(login.status, 200);
    const cookie = `dzhero_session=${login.body.token}`;
    const workspaceId = 'ws_demo_ua';

    const draftResponse = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context/draft`, {
      method: 'PUT',
      cookie,
      body: {
        currentStep: 2,
        answers: {
          profileDescription: 'Coffee and breakfasts',
          audience: '',
          niche: '',
          market: '',
          instagramUrl: '',
        },
      },
    });
    assert.equal(draftResponse.status, 200);
    assert.equal(draftResponse.body.complete, false);

    const incomplete = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context/finalize`, {
      method: 'POST',
      cookie,
      body: { answers: draftResponse.body.draft.answers },
    });
    assert.equal(incomplete.status, 422);
    assert.deepEqual(incomplete.body.missingFields, ['audience', 'niche', 'market']);

    const completeAnswers = {
      profileDescription: 'Coffee and fast breakfasts',
      audience: 'Busy commuters',
      niche: 'Coffee shop',
      market: 'Kyiv',
      instagramUrl: '',
    };
    const completed = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context/finalize`, {
      method: 'POST',
      cookie,
      body: { answers: completeAnswers },
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.brief.schemaVersion, 2);
    assert.deepEqual(completed.body.brief.answers, completeAnswers);
    assert.ok(completed.body.recommendation.signalId);
    assert.equal(completed.body.signal.id, completed.body.recommendation.signalId);
    assert.equal(completed.body.signal.id, 'reel_coffee_fixture');
    const persistedAfterComplete = JSON.parse(readFileSync(databasePath, 'utf8'));
    const finalizedWorkspace = persistedAfterComplete.workspaces.find((item) => item.id === workspaceId);
    assert.equal(finalizedWorkspace.brief.schemaVersion, 2);
    assert.equal(finalizedWorkspace.brief.businessType, 'Coffee shop');
    assert.equal(finalizedWorkspace.brief.product, 'Coffee and fast breakfasts');
    assert.equal(finalizedWorkspace.brief.audience, 'Busy commuters');
    assert.equal(finalizedWorkspace.brief.location, 'Kyiv');
    assert.equal(normalizeBrandBrain(finalizedWorkspace.brief).ready, true);

    for (const pathname of [
      `/api/workspaces/${workspaceId}/agent/context`,
      `/api/workspaces/${workspaceId}/brief`,
    ]) {
      const legacyWrite = await requestJson(baseUrl, pathname, {
        method: 'PUT',
        cookie,
        body: { product: 'Legacy write must not replace Version 2' },
      });
      assert.equal(legacyWrite.status, 409);
      assert.equal(legacyWrite.body.error, 'brand_brain_v2_finalize_required');
    }

    const repeated = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context/finalize`, {
      method: 'POST',
      cookie,
      body: { answers: completeAnswers },
    });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.recommendation.signalId, completed.body.recommendation.signalId);
    assert.equal(repeated.body.brief.updatedAt, completed.body.brief.updatedAt);

    const memoryCountBeforeUnavailableRetry = persistedAfterComplete.aiMemory
      .filter((item) => item.workspaceId === workspaceId).length;
    persistedAfterComplete.reels = persistedAfterComplete.reels
      .filter((item) => item.id !== 'reel_coffee_fixture');
    writeFileSync(databasePath, JSON.stringify(persistedAfterComplete));
    const unavailableRetry = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context/finalize`, {
      method: 'POST',
      cookie,
      body: { answers: completeAnswers },
    });
    assert.equal(unavailableRetry.status, 409);
    assert.equal(unavailableRetry.body.error, 'brand_brain_recommendation_unavailable');
    const persistedAfterUnavailableRetry = JSON.parse(readFileSync(databasePath, 'utf8'));
    const unavailableWorkspace = persistedAfterUnavailableRetry.workspaces.find((item) => item.id === workspaceId);
    assert.deepEqual(unavailableWorkspace.brief, finalizedWorkspace.brief);
    assert.equal(
      persistedAfterUnavailableRetry.aiMemory.filter((item) => item.workspaceId === workspaceId).length,
      memoryCountBeforeUnavailableRetry,
    );
    persistedAfterUnavailableRetry.reels.unshift({
      ...completed.body.signal,
      workspaceId,
      sharedBank: undefined,
    });
    writeFileSync(databasePath, JSON.stringify(persistedAfterUnavailableRetry));

    const resumed = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent/context`, { cookie });
    assert.equal(resumed.body.complete, true);
    assert.equal(resumed.body.draft, null);

    const registration = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Shared bank trial', email: 'shared-bank-trial@example.com', password: 'secure-pass' },
    });
    assert.equal(registration.status, 201);
    const trialCookie = `dzhero_session=${registration.body.token}`;
    const trialWorkspaceId = registration.body.workspaces[0].id;
    const accessible = await requestJson(baseUrl, `/api/workspaces/${trialWorkspaceId}/reels`, { cookie: trialCookie });
    assert.equal(accessible.status, 200);
    assert.ok(accessible.body.reels.some((signal) => signal.id === 'shared_reel_coffee_fixture'));

    const sharedCompleted = await requestJson(baseUrl, `/api/workspaces/${trialWorkspaceId}/agent/context/finalize`, {
      method: 'POST',
      cookie: trialCookie,
      body: { answers: completeAnswers },
    });
    assert.equal(sharedCompleted.status, 200);
    assert.ok(accessible.body.reels.some((signal) => signal.id === sharedCompleted.body.recommendation.signalId));
    assert.equal(sharedCompleted.body.signal.id, sharedCompleted.body.recommendation.signalId);
  } finally {
    if (child.exitCode === null) child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

testDraftFinalizeAndSharedBankAccess()
  .then(() => console.log('brand brain wizard API tests passed'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
