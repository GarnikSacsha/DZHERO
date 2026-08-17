import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');
const PROVIDER_FIXTURE = path.join(ROOT, 'scripts', 'fixtures', 'controlled-live-run-test-provider.cjs');
const NETWORK_GUARD = path.join(ROOT, 'scripts', 'fixtures', 'controlled-live-run-network-guard.cjs');

const strictBudgetEnv = {
  PERSONAL_URL_STRICT_LIVE_RUN: 'true',
  PERSONAL_URL_RUN_BUDGET_USD: '0.75',
  PERSONAL_URL_INSTAGRAM_APIFY_MAX_ACTOR_STARTS: '1',
  PERSONAL_URL_TIKTOK_APIFY_MAX_ACTOR_STARTS: '1',
  PERSONAL_URL_INSTAGRAM_APIFY_TOTAL_MAX_CHARGE_USD: '0.05',
  PERSONAL_URL_TIKTOK_APIFY_TOTAL_MAX_CHARGE_USD: '0.50',
  PERSONAL_URL_INSTAGRAM_FALLBACK_ENABLED: 'false',
  PERSONAL_URL_MAX_VIDEO_DURATION_SECONDS: '60',
  PERSONAL_URL_GEMINI_VIDEO_MAX_INPUT_TOKENS: '25000',
  PERSONAL_URL_GEMINI_VIDEO_MAX_OUTPUT_TOKENS: '1536',
  PERSONAL_URL_GEMINI_REMIX_MAX_OUTPUT_TOKENS: '2560',
  PERSONAL_URL_GEMINI_VIDEO_MAX_REQUEST_BYTES: '12000',
  PERSONAL_URL_GEMINI_REMIX_MAX_REQUEST_BYTES: '12000',
};

const systemEnv = Object.fromEntries(Object.entries({
  PATH: process.env.PATH,
  Path: process.env.Path,
  SystemRoot: process.env.SystemRoot,
  WINDIR: process.env.WINDIR,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  ComSpec: process.env.ComSpec,
}).filter(([, value]) => value));

function createDb() {
  return {
    users: [
      {
        id: 'user_preflight',
        name: 'Preflight User',
        email: 'preflight@example.test',
        role: 'owner',
        workspaceId: 'ws_preflight',
      },
      {
        id: 'user_stale_demo',
        name: 'Stale Demo',
        email: 'agent-studio-demo+preflight@dzhero.app',
        role: 'owner',
        workspaceId: 'ws_stale_demo',
        demoVisitor: true,
        demoExperience: 'agent_studio',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
    ],
    sessions: [{
      token: 'session_preflight',
      userId: 'user_preflight',
      createdAt: '2026-08-17T00:00:00.000Z',
      expiresAt: '2030-01-01T00:00:00.000Z',
    }],
    workspaces: [
      {
        id: 'ws_preflight',
        name: 'Preflight Workspace',
        owner: 'Preflight User',
        ownerUserId: 'user_preflight',
        brief: {},
        productBrandBrain: {
          version: 1,
          id: 'brand_preflight',
          name: 'Preflight Brand',
          brain: {
            profileDescription: 'Credentialless preflight fixture.',
            audience: 'local teams',
          },
        },
        contentPlanPosts: [],
      },
      {
        id: 'ws_stale_demo',
        name: 'Stale Demo',
        owner: 'Stale Demo',
        ownerUserId: 'user_stale_demo',
        demoVisitor: true,
        demoExperience: 'agent_studio',
        brief: {},
      },
    ],
    subscriptions: [{
      id: 'sub_preflight',
      workspaceId: 'ws_preflight',
      planId: 'tester_pro',
      status: 'active',
    }],
    reels: [],
    workspaceSavedUrls: [{
      id: 'saved_preflight',
      workspaceId: 'ws_preflight',
      platform: 'instagram',
      originalUrl: 'https://www.instagram.com/reel/preflight/',
      canonicalUrl: 'https://www.instagram.com/reel/preflight/',
      status: 'not_analyzed',
      createdAt: '2026-08-17T00:00:00.000Z',
    }],
    agentStudioUploads: [{
      id: 'agent_upload_stale',
      workspaceId: 'ws_stale_demo',
      userId: 'user_stale_demo',
      file: { name: 'files/stale-preflight-upload', uri: 'mock://stale', mimeType: 'video/mp4' },
      createdAt: '2020-01-01T00:00:00.000Z',
      expiresAt: '2020-01-01T01:00:00.000Z',
    }],
    usageCounters: [],
    personalUrlRunTelemetry: [],
    workspaceUrlAdaptations: [],
    workspaceAdaptations: [],
    workspaceSavedSignals: [],
    agentStudioRuns: [],
    competitors: [],
    ideas: [],
    leads: [],
    syncJobs: [],
    discoveryRuns: [],
    sources: [],
    metaStates: [],
    instagramAccounts: [],
    tiktokAccounts: [],
    aiMemory: [],
    aiJobs: [],
    remixes: [],
    contentPlanItems: [],
    videoJobs: [],
    dataDeletionRequests: [],
    testerAccessGrants: [],
    demoSessions: [],
    plans: [],
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

function childEnv({ port, dbPath, callsPath, overrides = {} }) {
  return {
    ...systemEnv,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    YOUTUBE_API_KEY: '',
    AUTOMATIC_DISCOVERY_ENABLED: 'true',
    AUTOMATIC_DISCOVERY_TICK_MS: '1000',
    ENABLE_AGENT_STUDIO: 'true',
    API_RATE_LIMIT_PER_MINUTE: '1000',
    EXPENSIVE_RATE_LIMIT_PER_MINUTE: '1000',
    REMIX_TEST_PROVIDER: PROVIDER_FIXTURE,
    AUTOMATIC_DISCOVERY_TEST_PROVIDER: PROVIDER_FIXTURE,
    AGENT_STUDIO_TEST_PROVIDER: PROVIDER_FIXTURE,
    CONTROLLED_LIVE_RUN_PROVIDER_CALLS_PATH: callsPath,
    GEMINI_REMIX_MODEL: 'gemini-3.5-flash',
    ...strictBudgetEnv,
    ...overrides,
  };
}

async function readEvents(callsPath) {
  const raw = await readFile(callsPath, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return '';
    throw error;
  });
  return raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited early: ${output()}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {
      // Poll only the isolated local backend.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`backend startup timed out: ${output()}`);
}

async function request(baseUrl, pathname, { headers = {}, body = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json().catch(() => ({})) };
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

async function assertStartupFailure({ dbPath, callsPath, overrides, code }) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['--require', NETWORK_GUARD, SERVER_ENTRY], {
    cwd: ROOT,
    env: childEnv({
      port,
      dbPath,
      callsPath,
      overrides: { DISABLE_LOCAL_ENV_LOADING: 'true', ...overrides },
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`startup failure timed out: ${code}`)), 5_000)),
  ]);
  assert.notEqual(child.exitCode, 0);
  assert.match(output, new RegExp(code));
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'controlled-credentialless-preflight-'));
const dbPath = path.join(tempDir, 'db.json');
const callsPath = path.join(tempDir, 'provider-calls.jsonl');
const sentinelEnvPath = path.join(tempDir, 'sentinel.env');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
await writeFile(dbPath, `${JSON.stringify(createDb(), null, 2)}\n`, 'utf8');
await writeFile(callsPath, '', 'utf8');
await writeFile(sentinelEnvPath, [
  'GEMINI_API_KEY=sentinel-must-not-load',
  'APIFY_TOKEN=sentinel-must-not-load',
  'OPENAI_API_KEY=sentinel-must-not-load',
  'CONTROLLED_PREFLIGHT_SENTINEL=loaded',
  '',
].join('\n'), 'utf8');

const child = spawn(process.execPath, ['--require', NETWORK_GUARD, SERVER_ENTRY], {
  cwd: ROOT,
  env: childEnv({
    port,
    dbPath,
    callsPath,
    overrides: {
      PERSONAL_URL_CREDENTIALLESS_PREFLIGHT: 'true',
      LOCAL_ENV_TEST_PATH: sentinelEnvPath,
      DZHERO_CRM_API_URL: 'https://crm-preflight.invalid',
      DZHERO_CRM_SYNC_TOKEN: 'test-only-controlled-preflight',
    },
  }),
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

try {
  await waitForServer(baseUrl, child, () => output);
  const healthResponse = await fetch(`${baseUrl}/api/health`);
  const health = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(health.controlledLiveRun, {
    enabled: true,
    mode: 'credentialless_preflight',
    providerAccess: 'disabled',
    budget: {
      enabled: true,
      totalUsd: 0.75,
      worstCaseUsd: 0.7186,
      pricingValidThrough: '2026-12-31',
    },
  });
  const rootResponse = await fetch(`${baseUrl}/`);
  assert.equal(rootResponse.status, 200);
  assert.match(rootResponse.headers.get('content-type') || '', /text\/html/);

  const auth = { authorization: 'Bearer session_preflight' };
  const authResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: auth });
  assert.equal(authResponse.status, 200);

  await new Promise((resolve) => setTimeout(resolve, 1_200));
  assert.deepEqual(
    await readEvents(callsPath),
    [],
    'sentinel .env, startup/background/cleanup, and deferred CRM must make zero provider or network attempts',
  );
  const dbAfterStartup = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(dbAfterStartup.agentStudioUploads.some((upload) => upload.id === 'agent_upload_stale'), false);
  assert.equal(dbAfterStartup.discoveryRuns.length, 0);

  const legacy = await request(baseUrl, '/api/workspaces/ws_preflight/reels/import-url', {
    headers: auth,
    body: { url: 'https://www.instagram.com/reel/legacy-blocked/' },
  });
  assert.equal(legacy.response.status, 503);
  assert.equal(legacy.body.error, 'controlled_live_run_scope_blocked');
  assert.equal(legacy.body.scope, 'legacy_signals_import');

  const personalRequests = await Promise.all(Array.from({ length: 6 }, () => request(
    baseUrl,
    '/api/workspaces/ws_preflight/saved-urls/saved_preflight/analyze-adapt',
    { headers: auth, body: { language: 'uk' } },
  )));
  for (const result of personalRequests) {
    assert.equal(result.response.status, 503);
    assert.deepEqual(result.body, {
      error: 'provider_not_configured',
      reason: 'controlled_preflight',
      mode: 'credentialless_preflight',
      scope: 'personal_saved_url',
      retryable: false,
      requestId: result.body.requestId,
    });
    assert.match(result.body.requestId, /^[a-f0-9]{12}$/);
  }
  assert.deepEqual(await readEvents(callsPath), [], 'parallel forbidden/personal requests must keep every provider counter at zero');
  const finalDb = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.deepEqual(finalDb.usageCounters, dbAfterStartup.usageCounters);
  assert.deepEqual(finalDb.personalUrlRunTelemetry, dbAfterStartup.personalUrlRunTelemetry);
  assert.deepEqual(finalDb.workspaceUrlAdaptations, dbAfterStartup.workspaceUrlAdaptations);

  await assertStartupFailure({
    dbPath,
    callsPath,
    overrides: {
      PERSONAL_URL_STRICT_LIVE_RUN: '',
      PERSONAL_URL_CREDENTIALLESS_PREFLIGHT: 'true',
    },
    code: 'controlled_preflight_strict_mode_required',
  });
  await assertStartupFailure({
    dbPath,
    callsPath,
    overrides: {
      PERSONAL_URL_CREDENTIALLESS_PREFLIGHT: 'true',
      PERSONAL_URL_RUN_BUDGET_USD: '',
    },
    code: 'controlled_preflight_budget_required',
  });
  await assertStartupFailure({
    dbPath,
    callsPath,
    overrides: { PERSONAL_URL_CREDENTIALLESS_PREFLIGHT: '' },
    code: 'personal_url_run_budget_gemini_required',
  });
  assert.deepEqual(await readEvents(callsPath), []);

  console.log('Controlled credentialless preflight route checks passed.');
  console.log('sentinel local .env credentials loaded: 0');
  console.log('deferred CRM/cleanup/discovery attempts: 0');
  console.log('startup/background provider counters: 0');
  console.log('parallel route provider counters: 0');
  console.log('external network attempts: 0');
} finally {
  await stop(child);
  await rm(tempDir, { recursive: true, force: true });
}
