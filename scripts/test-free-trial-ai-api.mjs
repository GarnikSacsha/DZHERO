import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');
const PERIOD = new Date().toISOString().slice(0, 7);
const NOW = new Date().toISOString();
const KYIV_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function kyivDayKey(value = new Date()) {
  const parts = Object.fromEntries(KYIV_FORMATTER.formatToParts(value)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousKyivDayKey(now = new Date()) {
  const current = kyivDayKey(now);
  for (let hours = 1; hours <= 48; hours += 1) {
    const candidate = kyivDayKey(new Date(now.getTime() - hours * 60 * 60 * 1000));
    if (candidate !== current) return candidate;
  }
  throw new Error('Could not resolve the previous Kyiv date.');
}

const CURRENT_KYIV_DAY = kyivDayKey();
const PREVIOUS_KYIV_DAY = previousKyivDayKey();

function makeActor(id, email) {
  return {
    user: {
      id: `user_${id}`,
      email,
      role: 'owner',
      workspaceId: `ws_${id}`,
      createdAt: NOW,
    },
    session: {
      token: `${id}_session`,
      userId: `user_${id}`,
      expiresAt: '2030-01-01T00:00:00.000Z',
    },
    workspace: {
      id: `ws_${id}`,
      name: `${id} workspace`,
      owner: id,
      brief: { businessType: 'Coffee shop' },
      createdAt: NOW,
    },
    subscription: {
      id: `sub_${id}`,
      workspaceId: `ws_${id}`,
      planId: 'trial',
      status: 'trialing',
      trialEndsAt: '2030-01-01T00:00:00.000Z',
      createdAt: NOW,
      updatedAt: NOW,
    },
  };
}

function createDb({ chatOnly = false } = {}) {
  const ids = chatOnly
    ? ['chat_limit']
    : ['trial', 'reset', 'failure', 'retry', 'capacity', 'owner', 'tester', 'providerless'];
  const actors = ids.map((id) => makeActor(
    id,
    id === 'owner' ? 'owner@example.test' : `${id}@example.test`,
  ));
  const usageCounters = [];

  if (!chatOnly) {
    usageCounters.push(
      {
        id: 'usage_legacy_ai_operations',
        workspaceId: 'ws_trial',
        metric: 'ai_operations',
        period: PERIOD,
        value: 5,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'usage_previous_remix',
        workspaceId: 'ws_reset',
        metric: 'trial_remix_daily',
        period: PREVIOUS_KYIV_DAY,
        value: 5,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'usage_capacity',
        workspaceId: 'ws_capacity',
        metric: 'trial_provider_attempts_daily',
        period: CURRENT_KYIV_DAY,
        value: 250,
        createdAt: NOW,
        updatedAt: NOW,
      },
    );
    for (const workspaceId of ['ws_owner', 'ws_tester']) {
      usageCounters.push(
        {
          id: `usage_${workspaceId}_remix`,
          workspaceId,
          metric: 'trial_remix_daily',
          period: CURRENT_KYIV_DAY,
          value: 5,
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: `usage_${workspaceId}_chat`,
          workspaceId,
          metric: 'trial_agent_chat_daily',
          period: CURRENT_KYIV_DAY,
          value: 100,
          createdAt: NOW,
          updatedAt: NOW,
        },
      );
    }
  }

  return {
    users: actors.map((actor) => actor.user),
    sessions: actors.map((actor) => actor.session),
    workspaces: actors.map((actor) => actor.workspace),
    subscriptions: actors.map((actor) => actor.subscription),
    testerAccessGrants: chatOnly ? [] : [{
      id: 'tester_grant_active',
      email: 'tester@example.test',
      userId: 'user_tester',
      workspaceId: 'ws_tester',
      status: 'active',
      planId: 'tester_pro',
      createdAt: NOW,
      updatedAt: NOW,
    }],
    usageCounters,
  };
}

function validRemixResult() {
  return {
    deconstruction: {
      coreMechanics: 'A visible problem is resolved with a concrete three-step demonstration.',
      psychologicalTriggers: ['curiosity', 'recognition', 'proof'],
      removedCulturalContext: ['foreign prices'],
    },
    viabilityFilter: {
      isAdaptable: true,
      uaMentalityCheck: 'The practical demonstration fits a local audience.',
      productionFeasibility: 'One person can record every scene with a phone.',
    },
    remixes: Array.from({ length: 3 }, (_, index) => ({
      title: `Controlled adaptation ${index + 1}`,
      hook: `Distinct controlled hook number ${index + 1}`,
      visualFlow: [
        {
          timeframe: '0:00-0:03',
          actionDescription: `The creator shows the concrete customer problem for angle ${index + 1}.`,
          onScreenText: `Problem ${index + 1}`,
          audioVoiceover: `Here is the specific problem for controlled angle ${index + 1}.`,
        },
        {
          timeframe: '0:03-0:10',
          actionDescription: `The creator demonstrates a practical solution step for angle ${index + 1}.`,
          onScreenText: `Solution ${index + 1}`,
          audioVoiceover: `Watch the practical solution for controlled angle ${index + 1}.`,
        },
        {
          timeframe: '0:10-0:15',
          actionDescription: `The creator presents visible proof and a final action for angle ${index + 1}.`,
          onScreenText: `Proof ${index + 1}`,
          audioVoiceover: `Use the visible result and take action for angle ${index + 1}.`,
        },
      ],
      cta: `Send controlled keyword ${index + 1}`,
    })),
  };
}

async function createControlledGemini() {
  const state = {
    calls: 0,
    agentCalls: 0,
    remixCalls: 0,
    failNextAgent: 0,
    failNextRemix: 0,
    rejectNextRemixQuality: 0,
  };
  const server = http.createServer((request, response) => {
    let rawBody = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { rawBody += chunk; });
    request.on('end', () => {
      const payload = JSON.parse(rawBody || '{}');
      const isRemix = payload.generationConfig?.responseMimeType === 'application/json';
      state.calls += 1;
      if (isRemix) state.remixCalls += 1;
      else state.agentCalls += 1;

      if ((!isRemix && state.failNextAgent > 0) || (isRemix && state.failNextRemix > 0)) {
        if (isRemix) state.failNextRemix -= 1;
        else state.failNextAgent -= 1;
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'Controlled provider failure' } }));
        return;
      }

      let text = 'Controlled real Gemini reply.';
      if (isRemix) {
        if (state.rejectNextRemixQuality > 0) {
          state.rejectNextRemixQuality -= 1;
          text = JSON.stringify({ remixes: [] });
        } else {
          text = JSON.stringify(validRemixResult());
        }
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text }] },
        }],
      }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    state,
    baseUrl: `http://127.0.0.1:${port}/v1beta`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The temporary server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${baseUrl}/api/health`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

async function startServer(tempDir, {
  db,
  dbPath = path.join(tempDir, `db-${Math.random().toString(36).slice(2)}.json`),
  geminiBaseUrl = '',
} = {}) {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  if (db) await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      DB_PATH: dbPath,
      DATABASE_URL: '',
      CLIENT_URL: baseUrl,
      AUTOMATIC_DISCOVERY_ENABLED: 'false',
      UNLIMITED_ACCESS_EMAILS: 'owner@example.test',
      OPENAI_API_KEY: '',
      GEMINI_API_KEY: geminiBaseUrl ? 'controlled-test-key' : '',
      GEMINI_API_BASE: geminiBaseUrl,
      GEMINI_TEXT_MODEL: 'controlled-model',
      GEMINI_REMIX_MODEL: 'controlled-model',
      APIFY_TOKEN: '',
      YOUTUBE_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  child.getOutput = () => output;
  await waitForServer(baseUrl, child);
  return { baseUrl, child, dbPath };
}

async function requestJson(baseUrl, pathname, {
  token = 'trial_session',
  ...options
} = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

const CHAT_BODY = { message: 'Use the controlled provider for this reply.' };
const REMIX_BODY = {
  globalInsight: {
    title: 'Source signal title',
    hook: 'Source signal hook',
    script: 'Observed source facts',
  },
};
const COMPLETE_BRAND_ANSWERS = {
  profileDescription: 'Specialty coffee and fast breakfasts',
  audience: 'Busy commuters',
  niche: 'Coffee shop',
  market: 'Kyiv',
  instagramUrl: '',
};

async function runChatDailyLimit(tempDir, controlledGemini) {
  const first = await startServer(tempDir, {
    db: createDb({ chatOnly: true }),
    geminiBaseUrl: controlledGemini.baseUrl,
  });
  let current = first;
  try {
    for (let index = 1; index <= 100; index += 1) {
      const response = await requestJson(
        current.baseUrl,
        '/api/workspaces/ws_chat_limit/agent/chat',
        { method: 'POST', token: 'chat_limit_session', body: CHAT_BODY },
      );
      assert.equal(response.status, 201, `chat ${index} should be allowed`);
      assert.equal(response.body.provider, 'gemini');
      assert.equal(response.body.daily.agentChat.used, index);
      if (index % 20 === 0 && index < 100) {
        await stopServer(current.child);
        current = await startServer(tempDir, {
          dbPath: current.dbPath,
          geminiBaseUrl: controlledGemini.baseUrl,
        });
      }
    }
    await stopServer(current.child);
    current = await startServer(tempDir, {
      dbPath: current.dbPath,
      geminiBaseUrl: controlledGemini.baseUrl,
    });
    const blocked = await requestJson(
      current.baseUrl,
      '/api/workspaces/ws_chat_limit/agent/chat',
      { method: 'POST', token: 'chat_limit_session', body: CHAT_BODY },
    );
    assert.equal(blocked.status, 402);
    assert.equal(blocked.body.error, 'daily_agent_chat_limit_reached');
    assert.equal(blocked.body.used, 100);
  } finally {
    await stopServer(current?.child);
  }
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-free-trial-ai-api-'));
  const controlledGemini = await createControlledGemini();
  let server;
  let providerless;
  try {
    server = await startServer(tempDir, {
      db: createDb(),
      geminiBaseUrl: controlledGemini.baseUrl,
    });

    const billing = await requestJson(server.baseUrl, '/api/workspaces/ws_trial/billing');
    assert.equal(billing.status, 200);
    assert.deepEqual(billing.body.plan.dailyLimits, {
      remix: 5,
      agentChat: 100,
      providerAttempts: 250,
      timezone: 'Europe/Kyiv',
    });
    assert.equal(billing.body.plan.limits.aiOperations, 750);
    assert.equal(billing.body.plan.limits.agentChat, 300);
    assert.equal(billing.body.daily.period, CURRENT_KYIV_DAY);

    const legacyCounterChat = await requestJson(
      server.baseUrl,
      '/api/workspaces/ws_trial/agent/chat',
      { method: 'POST', body: CHAT_BODY },
    );
    assert.equal(legacyCounterChat.status, 201);
    assert.equal(legacyCounterChat.body.provider, 'gemini');
    assert.equal(legacyCounterChat.body.daily.agentChat.used, 1);

    for (let index = 1; index <= 5; index += 1) {
      const remix = await requestJson(server.baseUrl, '/api/workspaces/ws_trial/remix/generate', {
        method: 'POST',
        body: REMIX_BODY,
      });
      assert.equal(remix.status, 200, `remix ${index} should be allowed`);
      assert.equal(remix.body._generation.provider, 'gemini');
      assert.equal(remix.body.daily.remix.used, index);
    }
    const sixthRemix = await requestJson(server.baseUrl, '/api/workspaces/ws_trial/remix/generate', {
      method: 'POST',
      body: REMIX_BODY,
    });
    assert.equal(sixthRemix.status, 402);
    assert.equal(sixthRemix.body.error, 'daily_remix_limit_reached');
    assert.equal(sixthRemix.body.used, 5);

    const resetRemix = await requestJson(server.baseUrl, '/api/workspaces/ws_reset/remix/generate', {
      method: 'POST',
      token: 'reset_session',
      body: REMIX_BODY,
    });
    assert.equal(resetRemix.status, 200);
    assert.equal(resetRemix.body.daily.period, CURRENT_KYIV_DAY);
    assert.equal(resetRemix.body.daily.remix.used, 1);
    assert.equal(resetRemix.body.daily.remix.remaining, 4);

    controlledGemini.state.failNextAgent = 1;
    const failedChat = await requestJson(server.baseUrl, '/api/workspaces/ws_failure/agent/chat', {
      method: 'POST',
      token: 'failure_session',
      body: CHAT_BODY,
    });
    assert.equal(failedChat.status, 502);
    assert.equal(failedChat.body.error, 'ai_provider_failed');
    const recoveredChat = await requestJson(server.baseUrl, '/api/workspaces/ws_failure/agent/chat', {
      method: 'POST',
      token: 'failure_session',
      body: CHAT_BODY,
    });
    assert.equal(recoveredChat.status, 201);
    assert.equal(recoveredChat.body.daily.agentChat.used, 1);

    controlledGemini.state.failNextRemix = 2;
    const failedRemix = await requestJson(server.baseUrl, '/api/workspaces/ws_failure/remix/generate', {
      method: 'POST',
      token: 'failure_session',
      body: REMIX_BODY,
    });
    assert.equal(failedRemix.status, 502);
    assert.equal(failedRemix.body.error, 'ai_provider_failed');
    const recoveredRemix = await requestJson(server.baseUrl, '/api/workspaces/ws_failure/remix/generate', {
      method: 'POST',
      token: 'failure_session',
      body: REMIX_BODY,
    });
    assert.equal(recoveredRemix.status, 200);
    assert.equal(recoveredRemix.body.daily.remix.used, 1);

    controlledGemini.state.rejectNextRemixQuality = 1;
    const remixCallsBeforeRetry = controlledGemini.state.remixCalls;
    const retriedRemix = await requestJson(server.baseUrl, '/api/workspaces/ws_retry/remix/generate', {
      method: 'POST',
      token: 'retry_session',
      body: REMIX_BODY,
    });
    assert.equal(retriedRemix.status, 200);
    assert.equal(controlledGemini.state.remixCalls - remixCallsBeforeRetry, 2);
    assert.equal(retriedRemix.body._generation.attempts, 2);
    assert.equal(retriedRemix.body.daily.remix.used, 1);

    const capacity = await requestJson(server.baseUrl, '/api/workspaces/ws_capacity/agent/chat', {
      method: 'POST',
      token: 'capacity_session',
      body: CHAT_BODY,
    });
    assert.equal(capacity.status, 402);
    assert.equal(capacity.body.error, 'ai_provider_capacity_reached');
    assert.equal(capacity.body.limit, 250);
    assert.equal(capacity.body.period, CURRENT_KYIV_DAY);
    assert.ok(capacity.body.resetsAt);

    for (const actor of ['owner', 'tester']) {
      const token = `${actor}_session`;
      const ownerOrTesterChat = await requestJson(
        server.baseUrl,
        `/api/workspaces/ws_${actor}/agent/chat`,
        { method: 'POST', token, body: CHAT_BODY },
      );
      assert.equal(ownerOrTesterChat.status, 201);
      assert.equal(ownerOrTesterChat.body.billing.plan.dailyLimits, null);
      assert.equal(ownerOrTesterChat.body.daily.agentChat.limit, null);
      assert.equal(ownerOrTesterChat.body.daily.agentChat.used, 0);
      const ownerOrTesterRemix = await requestJson(
        server.baseUrl,
        `/api/workspaces/ws_${actor}/remix/generate`,
        { method: 'POST', token, body: REMIX_BODY },
      );
      assert.equal(ownerOrTesterRemix.status, 200);
      assert.equal(ownerOrTesterRemix.body.daily.remix.limit, null);
      assert.equal(ownerOrTesterRemix.body.daily.remix.used, 0);
    }

    providerless = await startServer(tempDir, { db: createDb() });
    const providerlessChat = await requestJson(
      providerless.baseUrl,
      '/api/workspaces/ws_providerless/agent/chat',
      { method: 'POST', token: 'providerless_session', body: CHAT_BODY },
    );
    assert.equal(providerlessChat.status, 503);
    assert.equal(providerlessChat.body.error, 'ai_provider_not_configured');
    assert.notEqual(providerlessChat.body.provider, 'fallback');

    const providerlessRemix = await requestJson(
      providerless.baseUrl,
      '/api/workspaces/ws_providerless/remix/generate',
      { method: 'POST', token: 'providerless_session', body: REMIX_BODY },
    );
    assert.equal(providerlessRemix.status, 503);
    assert.equal(providerlessRemix.body.error, 'ai_provider_not_configured');
    assert.notEqual(providerlessRemix.body?._generation?.provider, 'fallback');

    const dailyBeforeFinalize = await requestJson(
      providerless.baseUrl,
      '/api/workspaces/ws_providerless/billing',
      { token: 'providerless_session' },
    );
    const finalized = await requestJson(
      providerless.baseUrl,
      '/api/workspaces/ws_providerless/agent/context/finalize',
      {
        method: 'POST',
        token: 'providerless_session',
        body: { answers: COMPLETE_BRAND_ANSWERS },
      },
    );
    assert.equal(finalized.status, 200);
    const dailyAfterFinalize = await requestJson(
      providerless.baseUrl,
      '/api/workspaces/ws_providerless/billing',
      { token: 'providerless_session' },
    );
    assert.deepEqual(dailyAfterFinalize.body.daily.remix, dailyBeforeFinalize.body.daily.remix);
    assert.deepEqual(dailyAfterFinalize.body.daily.agentChat, dailyBeforeFinalize.body.daily.agentChat);

    await runChatDailyLimit(tempDir, controlledGemini);

    console.log(JSON.stringify({
      message: 'Free Trial API regression checks passed.',
      providerCalls: controlledGemini.state.calls,
      agentCalls: controlledGemini.state.agentCalls,
      remixCalls: controlledGemini.state.remixCalls,
      remixQualityRetryProviderCalls: 2,
      successfulTrialChats: 100,
      successfulTrialRemixes: 5,
    }));
  } finally {
    if (server?.child?.getOutput()?.trim()) console.error(server.child.getOutput().trim());
    if (providerless?.child?.getOutput()?.trim()) console.error(providerless.child.getOutput().trim());
    await Promise.all([stopServer(providerless?.child), stopServer(server?.child)]);
    await controlledGemini.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
