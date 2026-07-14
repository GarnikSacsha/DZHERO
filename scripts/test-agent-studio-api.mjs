import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');
const FIXTURE_PATH = path.join(ROOT_DIR, 'scripts', 'fixtures', 'agent-studio-coffee-shop.cjs');

function createDb() {
  const now = '2026-07-14T10:00:00.000Z';
  return {
    users: [
      { id: 'usr_1', name: 'Coffee Owner', email: 'coffee@example.com', role: 'owner', workspaceId: 'ws_1', createdAt: now },
      { id: 'usr_2', name: 'Other Owner', email: 'other@example.com', role: 'owner', workspaceId: 'ws_2', createdAt: now },
    ],
    sessions: [
      { token: 'session_1', userId: 'usr_1', expiresAt: '2030-01-01T00:00:00.000Z' },
      { token: 'session_2', userId: 'usr_2', expiresAt: '2030-01-01T00:00:00.000Z' },
    ],
    workspaces: [
      {
        id: 'ws_1',
        name: 'Reset Coffee Kyiv',
        owner: 'Coffee Owner',
        brief: {
          businessType: 'Independent coffee shop',
          product: 'Espresso drinks and fresh pastries',
          location: 'Kyiv, Ukraine',
          audience: 'Busy professionals walking to work',
          toneOfVoice: 'Warm, quick, lightly playful',
          cta: 'Visit before work',
        },
        contentPlanPosts: [],
      },
      { id: 'ws_2', name: 'Other Workspace', owner: 'Other Owner', brief: {}, contentPlanPosts: [] },
    ],
    reels: [{
      id: 'signal_coffee_reveal',
      workspaceId: 'ws_1',
      title: 'The quiet setup and sensory reveal',
      sourceUrl: 'https://example.com/reels/coffee-reveal',
      caption: 'Wait for the reveal.',
      handle: '@source',
      score: 91,
    }],
    subscriptions: [
      { id: 'sub_1', workspaceId: 'ws_1', planId: 'trial', status: 'trialing', trialEndsAt: '2030-01-01T00:00:00.000Z' },
      { id: 'sub_2', workspaceId: 'ws_2', planId: 'trial', status: 'trialing', trialEndsAt: '2030-01-01T00:00:00.000Z' },
    ],
    usageCounters: [],
    agentStudioRuns: [{
      id: 'agent_run_stale',
      workspaceId: 'ws_1',
      userId: 'usr_1',
      input: { mode: 'adapt_reel', objective: 'Stale run', signalId: 'signal_coffee_reveal' },
      status: 'queued',
      currentStage: 'queued',
      artifacts: {},
      trace: [],
      contextRequest: null,
      contextHistory: [],
      outputRepairCount: 0,
      criticRevisionCount: 0,
      approval: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }],
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
    server.on('error', reject);
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Agent Studio API server did not start.');
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text && (response.headers.get('content-type') || '').includes('application/json')
    ? JSON.parse(text)
    : null;
  return { response, body, text };
}

async function waitForRun(baseUrl, workspaceId, runId, headers, statuses) {
  const accepted = new Set(statuses);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/agent-studio/runs/${runId}`, { headers });
    if (result.response.status !== 200) throw new Error(`Run polling failed: ${result.response.status} ${result.text}`);
    if (accepted.has(result.body.run.status)) return result.body.run;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for run ${runId}.`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-studio-api-'));
const dbPath = path.join(tempDir, 'db.json');
const providerPath = path.join(tempDir, 'agent-studio-provider.cjs');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;

await writeFile(dbPath, `${JSON.stringify(createDb(), null, 2)}\n`, 'utf8');
await writeFile(providerPath, `'use strict';
const fixture = require(process.env.AGENT_STUDIO_TEST_FIXTURE);
const criticCalls = new Map();

module.exports = {
  async analyzeVideo({ input }) {
    if (String(input.sourceUrl || '').includes('unavailable') && !input.userNotes) {
      return {
        ...fixture.evidence,
        source: { kind: 'url', url: input.sourceUrl, title: 'Unavailable source' },
        availability: 'unavailable',
        items: [{ id: 'ev_source_metadata', sourceType: 'source_metadata', text: 'Unavailable source URL', confidence: 0.6 }],
        unknowns: ['The test source did not expose playable video.'],
        requiresContext: true,
      };
    }
    if (input.userNotes) {
      return {
        ...fixture.evidence,
        source: { kind: 'url', url: input.sourceUrl || 'https://example.com/user-note', title: 'User-described source' },
        items: [...fixture.evidence.items, { id: 'ev_user_note', sourceType: 'user_note', text: input.userNotes, confidence: 0.7 }],
        availability: 'partial',
        requiresContext: false,
      };
    }
    return fixture.evidence;
  },
  async runAgent({ agentId, groupId }) {
    if (agentId === 'trend_analyst') return fixture.selectedTrend;
    if (agentId === 'brand_strategist') return fixture.brandStrategy;
    if (agentId === 'creative_producer') return fixture.creative;
    if (agentId === 'content_planner') return fixture.contentPlan;
    if (agentId === 'jeryk_manager') return fixture.managerReview;
    if (agentId === 'critic') {
      const count = (criticCalls.get(groupId) || 0) + 1;
      criticCalls.set(groupId, count);
      return count === 1 ? fixture.reviseEvaluation : fixture.acceptEvaluation;
    }
    throw new Error('unknown test agent: ' + agentId);
  },
};
`, 'utf8');

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DB_PATH: dbPath,
    CLIENT_URL: baseUrl,
    ENABLE_AGENT_STUDIO: 'true',
    OPENAI_API_KEY: 'test-openai-key',
    GEMINI_API_KEY: 'test-gemini-key',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    AGENT_STUDIO_TEST_PROVIDER: providerPath,
    AGENT_STUDIO_TEST_FIXTURE: FIXTURE_PATH,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

const headers = { authorization: 'Bearer session_1' };

try {
  await waitForServer(baseUrl, child);

  let result = await requestJson(baseUrl, '/api/workspaces/ws_1/agent-studio/config');
  assert.equal(result.response.status, 401);

  result = await requestJson(baseUrl, '/api/workspaces/ws_1/agent-studio/config', { headers });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.enabled, true);
  assert.equal(result.body.configured, true);
  assert.equal(result.body.model, 'gpt-5.6');

  result = await requestJson(baseUrl, '/api/workspaces/ws_2/agent-studio/config', { headers });
  assert.equal(result.response.status, 403);

  const stale = await waitForRun(baseUrl, 'ws_1', 'agent_run_stale', headers, ['failed']);
  assert.equal(stale.error.code, 'interrupted');

  const create = await requestJson(baseUrl, '/api/workspaces/ws_1/agent-studio/runs', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mode: 'find_trend',
      objective: 'Drive morning visits with a repeatable weekly system',
      idempotencyKey: 'coffee_week_1',
    }),
  });
  assert.equal(create.response.status, 201);
  assert.ok(create.body.run.id);

  const duplicateCreate = await requestJson(baseUrl, '/api/workspaces/ws_1/agent-studio/runs', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mode: 'find_trend',
      objective: 'Drive morning visits with a repeatable weekly system',
      idempotencyKey: 'coffee_week_1',
    }),
  });
  assert.equal(duplicateCreate.response.status, 200);
  assert.equal(duplicateCreate.body.run.id, create.body.run.id);

  const completed = await waitForRun(baseUrl, 'ws_1', create.body.run.id, headers, ['awaiting_approval', 'failed']);
  assert.equal(completed.status, 'awaiting_approval');
  assert.equal(completed.artifacts.creative.alternatives.length, 2);
  assert.equal(completed.artifacts.contentPlan.days.length, 7);
  assert.equal(completed.trace.some((entry) => entry.agent === 'Critic' && entry.status === 'revised'), true);
  assert.equal(JSON.stringify(completed).includes('test-openai-key'), false);

  const approve = await requestJson(baseUrl, `/api/workspaces/ws_1/agent-studio/runs/${create.body.run.id}/approve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ candidateId: 'hero_reset', addToContentPlan: true }),
  });
  assert.equal(approve.response.status, 200);
  assert.equal(approve.body.run.status, 'completed');
  assert.equal(approve.body.addedPosts, 7);

  const approveAgain = await requestJson(baseUrl, `/api/workspaces/ws_1/agent-studio/runs/${create.body.run.id}/approve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ candidateId: 'hero_reset', addToContentPlan: true }),
  });
  assert.equal(approveAgain.response.status, 200);
  assert.equal(approveAgain.body.addedPosts, 0);

  const contextCreate = await requestJson(baseUrl, '/api/workspaces/ws_1/agent-studio/runs', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mode: 'adapt_reel',
      objective: 'Adapt this reveal for the coffee shop',
      sourceUrl: 'https://example.com/unavailable',
      idempotencyKey: 'context_run_1',
    }),
  });
  assert.equal(contextCreate.response.status, 201);
  const needsContext = await waitForRun(baseUrl, 'ws_1', contextCreate.body.run.id, headers, ['needs_context']);
  assert.equal(needsContext.contextRequest.question.includes('what happens'), true);

  const context = await requestJson(baseUrl, `/api/workspaces/ws_1/agent-studio/runs/${contextCreate.body.run.id}/context`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userNotes: 'A barista reveals a warm croissant next to espresso after a quiet setup.' }),
  });
  assert.equal(context.response.status, 202);
  const resumed = await waitForRun(baseUrl, 'ws_1', contextCreate.body.run.id, headers, ['awaiting_approval', 'failed']);
  assert.equal(resumed.status, 'awaiting_approval');
  assert.equal(resumed.artifacts.evidence.items.some((item) => item.sourceType === 'user_note'), true);

  const cancelCreate = await requestJson(baseUrl, '/api/workspaces/ws_1/agent-studio/runs', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mode: 'adapt_reel',
      objective: 'Cancel this unavailable source',
      sourceUrl: 'https://example.com/unavailable-cancel',
      idempotencyKey: 'cancel_run_1',
    }),
  });
  const cancellable = await waitForRun(baseUrl, 'ws_1', cancelCreate.body.run.id, headers, ['needs_context']);
  const cancelled = await requestJson(baseUrl, `/api/workspaces/ws_1/agent-studio/runs/${cancellable.id}/cancel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.body.run.status, 'cancelled');

  const persisted = JSON.parse(await readFile(dbPath, 'utf8'));
  const workspace = persisted.workspaces.find((item) => item.id === 'ws_1');
  assert.equal(workspace.contentPlanPosts.filter((post) => post.source === 'agent_studio').length, 7);
  assert.equal(persisted.agentStudioRuns.filter((run) => run.workspaceId === 'ws_1').length, 4);

  console.log('Agent Studio API checks passed.');
} catch (error) {
  if (stdout.trim()) console.error(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await stopServer(child);
  await rm(tempDir, { recursive: true, force: true });
}
