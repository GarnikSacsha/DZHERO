import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceId = 'ws_demo_ua';
const completeAnswers = Object.freeze({
  profileDescription: 'Specialty coffee and fast breakfasts',
  audience: 'Busy commuters',
  niche: 'Coffee shop',
  market: 'Kyiv',
  instagramUrl: '',
});
let childOutput = '';

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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitUntil(predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(20);
  }
  throw new Error(message);
}

async function waitForHealth(baseUrl, child) {
  await waitUntil(async () => {
    if (child.exitCode !== null) {
      throw new Error(`Brand Brain hardening server exited early: ${childOutput}`);
    }
    try {
      return (await fetch(`${baseUrl}/api/health`)).ok;
    } catch {
      return false;
    }
  }, `Brand Brain hardening server did not start: ${childOutput}`, 15000);
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

function buildSignal(id = 'reel_coffee_hardening') {
  return {
    id,
    workspaceId,
    title: 'Breakfast coffee before the Kyiv commute',
    caption: 'Fast coffee and breakfast for busy commuters',
    market: 'Kyiv',
    platform: 'tiktok',
    score: 91,
  };
}

function createGeminiFixture() {
  const calls = [];
  const held = new Map();
  const heldMarkets = new Set();

  const respond = (response, value) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
    }));
  };

  const server = http.createServer((request, response) => {
    let rawBody = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { rawBody += chunk; });
    request.on('end', () => {
      const payload = JSON.parse(rawBody || '{}');
      const promptText = payload.contents?.[0]?.parts?.[0]?.text || '{}';
      const prompt = JSON.parse(promptText);
      const task = String(prompt.task || '');
      const answers = prompt.answers || prompt.brand?.answers || {};
      const market = String(answers.market || '');
      const type = task.startsWith('Derive') ? 'derive' : 'rerank';
      calls.push({ type, market, prompt });

      if (type === 'derive' && heldMarkets.has(market)) {
        const responses = held.get(market) || [];
        responses.push(response);
        held.set(market, responses);
        return;
      }

      if (type === 'rerank') {
        respond(response, {
          signalId: prompt.candidates?.[0]?.id || '',
          reason: `Best controlled match for ${market}.`,
        });
        return;
      }
      respond(response, {});
    });
  });

  return {
    server,
    calls,
    hold(market) {
      heldMarkets.add(market);
    },
    release(market) {
      heldMarkets.delete(market);
      for (const response of held.get(market) || []) respond(response, {});
      held.delete(market);
    },
    releaseAll() {
      for (const market of [...held.keys()]) this.release(market);
    },
    reset() {
      this.releaseAll();
      calls.length = 0;
      heldMarkets.clear();
    },
    heldCount(market) {
      return (held.get(market) || []).length;
    },
  };
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

async function run() {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'dzhero-brand-brain-hardening-'));
  const databasePath = path.join(tempDirectory, 'db.json');
  const database = JSON.parse(readFileSync(path.join(root, 'backend', 'data', 'db.json'), 'utf8'));
  writeFileSync(databasePath, JSON.stringify(database));
  const appPort = await freePort();
  const geminiPort = await freePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const gemini = createGeminiFixture();
  await new Promise((resolve, reject) => {
    gemini.server.once('error', reject);
    gemini.server.listen(geminiPort, '127.0.0.1', resolve);
  });
  const child = spawn(process.execPath, ['backend/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(appPort),
      DB_PATH: databasePath,
      DATABASE_URL: '',
      AUTOMATIC_DISCOVERY_ENABLED: 'false',
      ALLOW_DEMO_LOGIN: 'true',
      GEMINI_API_KEY: 'controlled-test-key',
      GEMINI_API_BASE: `http://127.0.0.1:${geminiPort}/v1beta`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => { childOutput += chunk; });
  child.stderr.on('data', (chunk) => { childOutput += chunk; });

  const readDatabase = () => JSON.parse(readFileSync(databasePath, 'utf8'));
  const mutateDatabase = (mutate) => {
    const current = readDatabase();
    mutate(current);
    writeFileSync(databasePath, JSON.stringify(current));
  };
  const resetWorkspace = ({ brief = {}, signals = [buildSignal()], draft } = {}) => {
    mutateDatabase((current) => {
      const workspace = current.workspaces.find((item) => item.id === workspaceId);
      assert.ok(workspace);
      workspace.brief = brief;
      if (draft === undefined) delete workspace.brandBrainDraft;
      else workspace.brandBrainDraft = draft;
      delete workspace.brandBrainFinalizeIntent;
      current.reels = (current.reels || []).filter((item) => item.workspaceId !== workspaceId);
      current.reels.push(...signals);
      current.aiMemory = (current.aiMemory || []).filter((item) => item.workspaceId !== workspaceId);
      current.usageCounters = (current.usageCounters || []).filter((item) => item.workspaceId !== workspaceId);
    });
    gemini.reset();
  };

  try {
    await waitForHealth(baseUrl, child);
    const login = await requestJson(baseUrl, '/api/auth/demo', { method: 'POST' });
    assert.equal(login.status, 200);
    const cookie = `dzhero_session=${login.body.token}`;
    const finalize = (answers) => requestJson(
      baseUrl,
      `/api/workspaces/${workspaceId}/agent/context/finalize`,
      { method: 'POST', cookie, body: { answers } },
    );
    const requestedCase = process.env.BRAND_BRAIN_HARDENING_CASE || 'all';
    const shouldRun = (name) => requestedCase === 'all' || requestedCase === name;

    if (shouldRun('usage')) {
      const originalDraft = {
        currentStep: 4,
        answers: { ...completeAnswers, market: 'Denied market' },
        updatedAt: '2026-07-23T00:00:00.000Z',
      };
      resetWorkspace({
        brief: {
          schemaVersion: 2,
          answers: { ...completeAnswers, market: 'Existing saved market' },
          derivedBrief: {},
          recommendation: { signalId: buildSignal().id },
          updatedAt: '2026-07-22T00:00:00.000Z',
        },
        draft: originalDraft,
      });
      mutateDatabase((current) => {
        current.usageCounters.push({
          id: 'usage_brand_brain_denied',
          workspaceId,
          metric: 'ai_operations',
          period: currentPeriod(),
          value: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });
      const before = readDatabase();
      const result = await finalize({ ...completeAnswers, market: 'Denied market' });
      assert.equal(result.status, 402, 'A denied Gemini attempt must stop finalization');
      assert.equal(gemini.calls.length, 0, 'The provider must not be called after the attempt guard denies usage');
      const after = readDatabase();
      const beforeWorkspace = before.workspaces.find((item) => item.id === workspaceId);
      const afterWorkspace = after.workspaces.find((item) => item.id === workspaceId);
      assert.deepEqual(afterWorkspace.brief, beforeWorkspace.brief);
      assert.deepEqual(afterWorkspace.brandBrainDraft, beforeWorkspace.brandBrainDraft);
      assert.equal(Object.hasOwn(afterWorkspace, 'brandBrainFinalizeIntent'), false);
      assert.equal(
        after.aiMemory.filter((item) => item.workspaceId === workspaceId).length,
        before.aiMemory.filter((item) => item.workspaceId === workspaceId).length,
      );
    }

    if (shouldRun('single-flight')) {
      resetWorkspace();
      const answers = { ...completeAnswers, market: 'Single Flight Market' };
      gemini.hold(answers.market);
      const first = finalize(answers);
      await waitUntil(
        () => gemini.heldCount(answers.market) >= 1,
        'The first same-fingerprint derive request did not reach the controlled provider',
      );
      const second = finalize(answers);
      await delay(150);
      gemini.release(answers.market);
      const [firstResult, secondResult] = await Promise.all([first, second]);
      assert.equal(firstResult.status, 200);
      assert.equal(secondResult.status, 200);
      assert.equal(gemini.calls.filter((call) => call.type === 'derive').length, 1);
      assert.equal(gemini.calls.filter((call) => call.type === 'rerank').length, 1);
      assert.equal(firstResult.body.brief.updatedAt, secondResult.body.brief.updatedAt);
      assert.equal(
        readDatabase().aiMemory.filter((item) => item.workspaceId === workspaceId).length,
        1,
      );
      assert.equal(
        readDatabase().usageCounters
          .filter((item) => item.workspaceId === workspaceId && item.metric === 'ai_operations')
          .reduce((total, item) => total + Number(item.value || 0), 0),
        2,
        'The shared flight must charge exactly one guarded usage unit per Gemini derive/rerank attempt',
      );
    }

    if (shouldRun('newer-intent')) {
      resetWorkspace();
      const olderAnswers = { ...completeAnswers, market: 'Slow Old Market' };
      const newerAnswers = { ...completeAnswers, market: 'Fast New Market' };
      gemini.hold(olderAnswers.market);
      const older = finalize(olderAnswers);
      await waitUntil(
        () => gemini.heldCount(olderAnswers.market) === 1,
        'The older derive request did not reach the controlled provider',
      );
      const newer = await finalize(newerAnswers);
      assert.equal(newer.status, 200);
      assert.equal(newer.body.brief.answers.market, newerAnswers.market);
      gemini.release(olderAnswers.market);
      const olderResult = await older;
      assert.equal(olderResult.status, 409);
      assert.equal(olderResult.body.error, 'brand_brain_finalize_superseded');
      const persisted = readDatabase();
      const workspace = persisted.workspaces.find((item) => item.id === workspaceId);
      assert.equal(workspace.brief.answers.market, newerAnswers.market);
      assert.equal(
        persisted.aiMemory.filter((item) => item.workspaceId === workspaceId).length,
        1,
      );
    }

    if (shouldRun('empty-bank')) {
      resetWorkspace({ signals: [] });
      const result = await finalize({ ...completeAnswers, market: 'Empty Bank Market' });
      assert.equal(result.status, 200);
      assert.equal(result.body.complete, true);
      assert.equal(result.body.recommendation, null);
      assert.equal(result.body.signal, null);
      const workspace = readDatabase().workspaces.find((item) => item.id === workspaceId);
      assert.equal(workspace.brief.schemaVersion, 2);
      assert.equal(workspace.brief.recommendation, null);
      assert.equal(workspace.brandBrainDraft, undefined);
    }

    if (shouldRun('strict-v2')) {
      resetWorkspace({
        brief: {
          schemaVersion: 2,
          answers: { ...completeAnswers, market: '' },
          businessType: 'Legacy coffee shop',
          product: 'Legacy coffee',
          audience: 'Legacy commuters',
          offer: 'Legacy breakfast',
          cta: 'Legacy CTA',
          toneOfVoice: 'Legacy warm',
        },
      });
      const context = await requestJson(
        baseUrl,
        `/api/workspaces/${workspaceId}/agent/context`,
        { cookie },
      );
      assert.equal(context.status, 200);
      assert.equal(context.body.complete, false);
      assert.equal(context.body.draft.currentStep, 1);
      const draft = await requestJson(
        baseUrl,
        `/api/workspaces/${workspaceId}/agent/context/draft`,
        {
          method: 'PUT',
          cookie,
          body: { currentStep: 3, answers: context.body.brief.answers },
        },
      );
      assert.equal(draft.status, 200, 'Malformed Version 2 must stay repairable through the draft route');
    }
  } finally {
    gemini.releaseAll();
    if (child.exitCode === null) child.kill();
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(2000),
    ]);
    await new Promise((resolve) => gemini.server.close(resolve));
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

run()
  .then(() => console.log('Brand Brain finalize hardening tests passed'))
  .catch((error) => {
    console.error(error);
    if (childOutput) console.error(childOutput);
    process.exitCode = 1;
  });
