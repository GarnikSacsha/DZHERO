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

function createDb() {
  const productBrandBrain = {
    version: 1,
    id: 'brand_controlled',
    name: 'Controlled Brand',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    brain: {
      profileDescription: 'A bounded offline workflow product.',
      audience: 'small local teams',
      niche: 'workflow operations',
      market: 'Ukraine',
      product: 'workflow audit',
    },
  };
  return {
    users: [
      {
        id: 'user_controlled',
        name: 'Controlled User',
        email: 'controlled@example.test',
        role: 'owner',
        workspaceId: 'ws_controlled',
      },
      {
        id: 'user_stale_demo',
        name: 'Stale Demo',
        email: 'agent-studio-demo+stale@dzhero.app',
        role: 'owner',
        workspaceId: 'ws_stale_demo',
        demoVisitor: true,
        demoExperience: 'agent_studio',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
    ],
    sessions: [{
      token: 'session_controlled',
      userId: 'user_controlled',
      createdAt: '2026-08-15T00:00:00.000Z',
      expiresAt: '2030-01-01T00:00:00.000Z',
    }],
    workspaces: [
      {
        id: 'ws_controlled',
        name: 'Controlled Workspace',
        owner: 'Controlled User',
        ownerUserId: 'user_controlled',
        brief: {
          businessType: 'workflow operations',
          product: 'workflow audit',
          audience: 'small local teams',
        },
        productBrandBrain,
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
      id: 'sub_controlled',
      workspaceId: 'ws_controlled',
      planId: 'tester_pro',
      status: 'active',
      createdAt: '2026-08-15T00:00:00.000Z',
    }],
    reels: [{
      id: 'reel_controlled',
      workspaceId: 'ws_controlled',
      title: 'Forbidden legacy reel',
      sourceUrl: 'https://www.instagram.com/reel/forbidden/',
      importedMetadata: {},
      status: [],
    }],
    workspaceSavedUrls: [
      {
        id: 'saved_primary',
        workspaceId: 'ws_controlled',
        platform: 'instagram',
        originalUrl: 'https://www.instagram.com/reel/controlled-primary/',
        canonicalUrl: 'https://www.instagram.com/reel/controlled-primary/',
        status: 'not_analyzed',
        createdAt: '2026-08-15T00:00:00.000Z',
      },
      {
        id: 'saved_secondary',
        workspaceId: 'ws_controlled',
        platform: 'instagram',
        originalUrl: 'https://www.instagram.com/reel/controlled-secondary/',
        canonicalUrl: 'https://www.instagram.com/reel/controlled-secondary/',
        status: 'not_analyzed',
        createdAt: '2026-08-15T00:00:00.000Z',
      },
    ],
    agentStudioUploads: [{
      id: 'agent_upload_stale',
      workspaceId: 'ws_stale_demo',
      userId: 'user_stale_demo',
      file: { name: 'files/stale-controlled-upload', uri: 'mock://stale', mimeType: 'video/mp4' },
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

async function request(baseUrl, pathname, {
  method = 'POST',
  body = {},
  headers = {},
  raw = false,
} = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    signal: AbortSignal.timeout(10_000),
    headers: raw
      ? headers
      : { 'content-type': 'application/json', ...headers },
    body: method === 'GET' || method === 'HEAD'
      ? undefined
      : raw
        ? body
        : JSON.stringify(body),
  });
  return {
    response,
    body: await response.json().catch(() => ({})),
  };
}

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited early: ${output()}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {
      // Wait for the isolated child only.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`backend startup timed out: ${output()}`);
}

async function waitForEvent(callsPath, predicate) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const events = await readEvents(callsPath);
    if (events.some(predicate)) return events;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('timed out waiting for controlled provider fixture event');
}

async function readEvents(callsPath) {
  const value = await readFile(callsPath, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return '';
    throw error;
  });
  return value.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

function count(events, kind) {
  return events.filter((event) => event.kind === kind).length;
}

function providerCounterSnapshot(events) {
  return {
    network: count(events, 'network_attempt'),
    apify: count(events, 'apify_actor'),
    videoAnalysis: count(events, 'video_analysis'),
    remix: count(events, 'remix'),
    automaticDiscovery: count(events, 'automatic_discovery'),
    agentStudioAgent: count(events, 'agent_studio_agent'),
    agentStudioVideo: count(events, 'agent_studio_video'),
  };
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'controlled-live-run-routes-'));
const dbPath = path.join(tempDir, 'db.json');
const callsPath = path.join(tempDir, 'provider-calls.jsonl');
const releasePath = path.join(tempDir, 'release-primary');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
await writeFile(dbPath, `${JSON.stringify(createDb(), null, 2)}\n`, 'utf8');
await writeFile(callsPath, '', 'utf8');

const systemEnv = Object.fromEntries(Object.entries({
  PATH: process.env.PATH,
  Path: process.env.Path,
  SystemRoot: process.env.SystemRoot,
  WINDIR: process.env.WINDIR,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  ComSpec: process.env.ComSpec,
}).filter(([, value]) => value));

const child = spawn(process.execPath, ['--require', NETWORK_GUARD, SERVER_ENTRY], {
  cwd: ROOT,
  env: {
    ...systemEnv,
    PORT: String(port),
    HOST: '127.0.0.1',
    CLIENT_URL: baseUrl,
    NODE_ENV: 'test',
    DISABLE_LOCAL_ENV_LOADING: 'true',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    APIFY_TOKEN: 'offline-fake-apify-token',
    APIFY_API_TOKEN: '',
    GEMINI_API_KEY: 'offline-fake-gemini-key',
    OPENAI_API_KEY: 'offline-fake-openai-key',
    YOUTUBE_API_KEY: 'offline-fake-youtube-key',
    DZHERO_CRM_API_URL: '',
    DZHERO_CRM_SYNC_TOKEN: '',
    ENABLE_PUBLIC_APIFY_BRAND_SCAN: 'true',
    ENABLE_AGENT_STUDIO: 'true',
    AUTOMATIC_DISCOVERY_ENABLED: 'true',
    AUTOMATIC_DISCOVERY_TICK_MS: '1000',
    API_RATE_LIMIT_PER_MINUTE: '1000',
    EXPENSIVE_RATE_LIMIT_PER_MINUTE: '1000',
    PUBLIC_PREVIEW_DAILY_LIMIT: '1000',
    UNLIMITED_ACCESS_EMAILS: 'controlled@example.test',
    REMIX_TEST_PROVIDER: PROVIDER_FIXTURE,
    AUTOMATIC_DISCOVERY_TEST_PROVIDER: PROVIDER_FIXTURE,
    AGENT_STUDIO_TEST_PROVIDER: PROVIDER_FIXTURE,
    CONTROLLED_LIVE_RUN_PROVIDER_CALLS_PATH: callsPath,
    CONTROLLED_LIVE_RUN_HOLD_SAVED_URL_ID: 'saved_primary',
    CONTROLLED_LIVE_RUN_RELEASE_PATH: releasePath,
    ...strictBudgetEnv,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });
const auth = { authorization: 'Bearer session_controlled' };

try {
  await waitForServer(baseUrl, child, () => output);
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  assert.deepEqual(providerCounterSnapshot(await readEvents(callsPath)), {
    network: 0,
    apify: 0,
    videoAnalysis: 0,
    remix: 0,
    automaticDiscovery: 0,
    agentStudioAgent: 0,
    agentStudioVideo: 0,
  }, 'startup cleanup and background Discovery must not reach any provider');
  const dbAfterStartup = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(
    dbAfterStartup.agentStudioUploads.some((upload) => upload.id === 'agent_upload_stale'),
    false,
    'startup must discover and prune the seeded stale upload before strict mode suppresses provider cleanup',
  );
  assert.equal(dbAfterStartup.discoveryRuns.length, 0);

  const exactLegacy = await request(baseUrl, '/api/workspaces/ws_controlled/reels/import-url', {
    headers: auth,
    body: { url: 'https://www.instagram.com/reel/accidental-legacy-action/' },
  });
  assert.equal(exactLegacy.response.status, 503);
  assert.equal(exactLegacy.body.error, 'controlled_live_run_scope_blocked');
  assert.equal(exactLegacy.body.scope, 'legacy_signals_import');
  assert.deepEqual(providerCounterSnapshot(await readEvents(callsPath)), {
    network: 0,
    apify: 0,
    videoAnalysis: 0,
    remix: 0,
    automaticDiscovery: 0,
    agentStudioAgent: 0,
    agentStudioVideo: 0,
  }, 'the exact accidental legacy action must stop before thumbnail/remix/provider work');

  const dbBeforeForbidden = JSON.parse(await readFile(dbPath, 'utf8'));
  const usageBeforeForbidden = JSON.stringify(dbBeforeForbidden.usageCounters || []);
  const telemetryBeforeForbidden = JSON.stringify(dbBeforeForbidden.personalUrlRunTelemetry || []);
  const forbidden = [
    ['/api/workspaces/ws_controlled/signals/apify/import', { platform: 'instagram', inputValue: 'blocked' }, 'legacy_apify_import'],
    ['/api/workspaces/ws_controlled/reels/youtube/popular', { maxResults: 1 }, 'youtube_popular_import'],
    ['/api/workspaces/ws_controlled/reels/reel_controlled/analyze-ai', {}, 'legacy_reel_analyze_ai'],
    ['/api/workspaces/ws_controlled/remix/generate', { globalInsight: { title: 'blocked' } }, 'legacy_remix_generate'],
    ['/api/workspaces/ws_controlled/signals/discovery/run', {}, 'manual_discovery'],
    ['/api/brand-scan/preview', { url: 'https://example.test' }, 'public_brand_scan'],
    ['/api/workspaces/ws_controlled/agent/context/finalize', { answers: { profileDescription: 'blocked', audience: 'blocked' } }, 'brand_brain_finalize'],
    ['/api/workspaces/ws_controlled/agent/chat', { message: 'blocked provider request' }, 'agent_chat'],
    ['/api/workspaces/ws_controlled/adaptations/shared_signal/generate', {}, 'shared_signal_adaptation'],
    ['/api/workspaces/ws_controlled/agent-studio/runs', { mode: 'find_trend', objective: 'blocked run' }, 'agent_studio_run'],
    ['/api/workspaces/ws_controlled/agent-studio/runs/run_missing/context', { userNotes: 'blocked context with enough text' }, 'agent_studio_context_resume'],
    ['/api/workspaces/ws_controlled/agent-studio/runs/run_missing/retry-source', {}, 'agent_studio_retry_source'],
    ['/api/workspaces/ws_controlled/agent-studio/runs/run_missing/hybrid', { candidateIds: ['one', 'two'] }, 'agent_studio_hybrid'],
  ];
  const forbiddenRequests = forbidden.map(([pathname, body, scope]) => ({
    scope,
    promise: request(baseUrl, pathname, { headers: auth, body }),
  }));
  forbiddenRequests.push({
    scope: 'agent_studio_upload',
    promise: request(baseUrl, '/api/workspaces/ws_controlled/agent-studio/uploads', {
      headers: { ...auth, 'content-type': 'video/mp4', 'x-file-name': 'blocked.mp4' },
      body: Buffer.from('blocked-video'),
      raw: true,
    }),
  });
  forbiddenRequests.push({
    scope: 'agent_studio_source_file',
    promise: request(baseUrl, '/api/workspaces/ws_controlled/agent-studio/runs/run_missing/source-file', {
      headers: { ...auth, 'content-type': 'video/mp4', 'x-file-name': 'blocked-source.mp4' },
      body: Buffer.from('blocked-source-video'),
      raw: true,
    }),
  });
  const forbiddenResults = await Promise.all(forbiddenRequests.map(({ promise }) => promise));
  for (let index = 0; index < forbiddenResults.length; index += 1) {
    const result = forbiddenResults[index];
    assert.equal(result.response.status, 503, JSON.stringify(result.body));
    assert.equal(result.body.error, 'controlled_live_run_scope_blocked');
    assert.equal(result.body.scope, forbiddenRequests[index].scope);
  }
  const forbiddenEvents = await readEvents(callsPath);
  assert.deepEqual(providerCounterSnapshot(forbiddenEvents), {
    network: 0,
    apify: 0,
    videoAnalysis: 0,
    remix: 0,
    automaticDiscovery: 0,
    agentStudioAgent: 0,
    agentStudioVideo: 0,
  }, 'parallel forbidden routes must leave every fake provider counter at zero');
  const dbAfterForbidden = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(JSON.stringify(dbAfterForbidden.usageCounters || []), usageBeforeForbidden);
  assert.equal(JSON.stringify(dbAfterForbidden.personalUrlRunTelemetry || []), telemetryBeforeForbidden);

  const primaryPath = '/api/workspaces/ws_controlled/saved-urls/saved_primary/analyze-adapt';
  const secondaryPath = '/api/workspaces/ws_controlled/saved-urls/saved_secondary/analyze-adapt';
  const primaryLeader = request(baseUrl, primaryPath, { headers: auth, body: { language: 'uk' } });
  await waitForEvent(callsPath, (event) => event.kind === 'source_waiting' && event.savedUrlId === 'saved_primary');
  const primaryFollower = request(baseUrl, primaryPath, { headers: auth, body: { language: 'uk' } });
  const parallelSecondary = request(baseUrl, secondaryPath, { headers: auth, body: { language: 'uk' } });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await writeFile(releasePath, 'release', 'utf8');
  const [leaderResult, followerResult, secondaryResult] = await Promise.all([
    primaryLeader,
    primaryFollower,
    parallelSecondary,
  ]);
  assert.equal(leaderResult.response.status, 201, JSON.stringify(leaderResult.body));
  assert.equal(followerResult.response.status, 201, JSON.stringify(followerResult.body));
  assert.equal(secondaryResult.response.status, 409, JSON.stringify(secondaryResult.body));
  assert.equal(secondaryResult.body.error, 'saved_url_workspace_busy');
  assert.deepEqual(
    new Set([leaderResult.body.singleFlightState, followerResult.body.singleFlightState]),
    new Set(['leader', 'joined']),
  );

  const allowedEvents = await readEvents(callsPath);
  assert.deepEqual(providerCounterSnapshot(allowedEvents), {
    network: 0,
    apify: 1,
    videoAnalysis: 1,
    remix: 1,
    automaticDiscovery: 0,
    agentStudioAgent: 0,
    agentStudioVideo: 0,
  });
  const sourceConfig = allowedEvents.find((event) => event.kind === 'source_config');
  assert.deepEqual(sourceConfig.budget, {
    enabled: true,
    totalBudgetUsd: 0.75,
    platform: 'instagram',
    maxActorStarts: 1,
    totalMaxChargeUsd: 0.05,
    allowInstagramFallback: false,
    maxVideoDurationSeconds: 60,
    geminiVideoMaxInputTokens: 25000,
    geminiVideoMaxOutputTokens: 1536,
    geminiVideoMaxRequestBytes: 12000,
  });
  assert.equal(allowedEvents.filter((event) => event.kind === 'apify_actor')[0].actor, 'apify/instagram-reel-scraper');
  assert.equal(allowedEvents.some((event) => String(event.actor || '').includes('instagram-scraper')), false);
  assert.deepEqual(allowedEvents.find((event) => event.kind === 'remix').config, {
    maxAttempts: 1,
    maxOutputTokens: 2560,
    maxRequestBytes: 12000,
    language: 'uk',
  });

  const cached = await request(baseUrl, primaryPath, { headers: auth, body: { language: 'uk' } });
  assert.equal(cached.response.status, 200);
  assert.equal(cached.body.alreadyGenerated, true);
  assert.deepEqual(providerCounterSnapshot(await readEvents(callsPath)), providerCounterSnapshot(allowedEvents));

  const finalDb = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(finalDb.workspaceUrlAdaptations.filter((record) => record.savedUrlId === 'saved_primary').length, 1);
  assert.equal(finalDb.workspaceUrlAdaptations.some((record) => record.savedUrlId === 'saved_secondary'), false);
  const telemetry = finalDb.personalUrlRunTelemetry || [];
  assert.ok(telemetry.some((record) => (
    record.singleFlightState === 'leader'
    && record.providers.reduce((sum, provider) => sum + provider.attemptCount, 0) === 3
  )));
  assert.ok(telemetry.some((record) => record.singleFlightState === 'joined' && record.providers.length === 0));
  assert.ok(telemetry.some((record) => record.singleFlightState === 'blocked' && record.providers.length === 0));
  assert.ok(telemetry.every((record) => (
    record.providers.reduce((sum, provider) => sum + provider.attemptCount, 0) <= 3
  )));

  console.log('Controlled live-run route integration checks passed.');
  console.log('forbidden provider counters: 0');
  console.log('allowed fake provider counters: apify=1 video=1 remix=1');
  console.log('external network attempts: 0');
} finally {
  await stop(child);
  await rm(tempDir, { recursive: true, force: true });
}
