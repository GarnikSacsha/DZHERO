import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');
const PROVIDER_FIXTURE = path.join(ROOT, 'scripts', 'fixtures', 'personal-url-source-observability-provider.cjs');

const brand = {
  version: 1,
  id: 'brand_source_test',
  name: 'Source Context Test Brand',
  updatedAt: '2026-08-07T10:00:00.000Z',
  brain: {
    profileDescription: 'A small product team teaching practical workflow automation.',
    audience: 'small product teams',
    niche: 'workflow automation',
    market: 'Ukraine',
    product: 'workflow audit',
  },
};

const seededDb = {
  users: [{ id: 'user_source', name: 'Source Test User', email: 'source-test@example.com', role: 'owner', workspaceId: 'ws_source' }],
  sessions: [{ token: 'session_source', userId: 'user_source', expiresAt: '2030-01-01T00:00:00.000Z' }],
  workspaces: [{ id: 'ws_source', name: 'Source Test Workspace', owner: 'Source Test User', brief: {}, productBrandBrain: brand, contentPlanPosts: [] }],
  subscriptions: [{ id: 'sub_source', workspaceId: 'ws_source', planId: 'trial', status: 'trialing' }],
  reels: [],
  workspaceSavedSignals: [],
  workspaceAdaptations: [],
  workspaceUrlAdaptations: [],
  workspaceSavedUrls: [{
    id: 'saved_source',
    workspaceId: 'ws_source',
    platform: 'tiktok',
    originalUrl: 'https://vm.tiktok.com/ZMsource/?utm_source=test',
    canonicalUrl: 'https://vm.tiktok.com/ZMsource',
    createdAt: '2026-08-07T10:01:00.000Z',
    status: 'not_analyzed',
  }, {
    id: 'saved_source_partial', workspaceId: 'ws_source', platform: 'instagram', originalUrl: 'https://instagram.com/reel/partial', canonicalUrl: 'https://instagram.com/reel/partial', createdAt: '2026-08-07T10:02:00.000Z', status: 'not_analyzed',
  }, {
    id: 'saved_source_empty', workspaceId: 'ws_source', platform: 'youtube', originalUrl: 'https://youtube.com/shorts/empty', canonicalUrl: 'https://youtube.com/shorts/empty', createdAt: '2026-08-07T10:03:00.000Z', status: 'not_analyzed',
  }, {
    id: 'saved_source_failure', workspaceId: 'ws_source', platform: 'tiktok', originalUrl: 'https://vm.tiktok.com/ZMfailure', canonicalUrl: 'https://vm.tiktok.com/ZMfailure', createdAt: '2026-08-07T10:04:00.000Z', status: 'not_analyzed',
  }],
  usageCounters: [],
  plans: [], competitors: [], ideas: [], leads: [], syncJobs: [], sources: [], metaStates: [], instagramAccounts: [], tiktokAccounts: [],
  aiMemory: [], aiJobs: [], remixes: [], contentPlanItems: [], videoJobs: [], dataDeletionRequests: [], demoSessions: [], discoveryRuns: [], testerAccess: [],
};

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
      // Keep polling until the test server is ready.
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

function readEvents(content) {
  return content.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function readUsage(db, metric) {
  return db.usageCounters.find((counter) => counter.workspaceId === 'ws_source' && counter.metric === metric)?.value || 0;
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-source-context-'));
const dbPath = path.join(tempDir, 'db.json');
const callsPath = path.join(tempDir, 'provider-calls.jsonl');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
await writeFile(dbPath, `${JSON.stringify(seededDb, null, 2)}\n`, 'utf8');
await writeFile(callsPath, '', 'utf8');

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
    REMIX_TEST_PROVIDER: PROVIDER_FIXTURE,
    REMIX_TEST_PROVIDER_CALLS_PATH: callsPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });

try {
  await waitForServer(baseUrl, child, () => backendOutput);
  const result = await request(baseUrl, '/api/workspaces/ws_source/saved-urls/saved_source/analyze-adapt', {
    method: 'POST',
    headers: { authorization: 'Bearer session_source' },
  });
  assert.equal(result.response.status, 201);

  let events = readEvents(await readFile(callsPath, 'utf8'));
  const sourceEvents = events.filter((event) => event.type === 'source_resolver');
  const remixEvents = events.filter((event) => event.type === 'remix_provider');
  assert.equal(sourceEvents.length, 1, 'Analyze & Adapt must resolve source context exactly once before remix');
  assert.equal(remixEvents.length, 1, 'grounded source test must reach exactly one injected remix call');

  const sourceContext = sourceEvents[0].sourceContext;
  const insight = remixEvents[0].globalInsight;
  assert.equal(sourceContext.metadata.title, 'Grounded mocked source title');
  assert.equal(sourceContext.transcript.status, 'available');
  assert.equal(sourceContext.videoIntelligence.video.videoSummary, 'Автор показує процес перед тим, як розкриває результат.');
  assert.equal(sourceContext.grounding.status, 'full');
  assert.equal(sourceContext.grounding.mode, 'video');
  assert.equal(sourceContext.grounding.videoInput.uri, 'https://vm.tiktok.com/ZMsource');
  assert.equal(sourceContext.grounding.transcript.trusted, true);
  assert.ok(insight.title, 'remix insight must carry grounded title');
  assert.ok(insight.description, 'remix insight must carry grounded description');
  assert.ok(insight.transcriptText, 'remix insight must carry grounded transcript');
  assert.equal(insight.videoIntelligence.video.contentMechanic, 'доказ перед поясненням');
  assert.equal(insight.sourceGrounding.status, 'full');
  assert.equal(insight.sourceEvidence.grounding.mode, 'video');

  const richRecord = JSON.parse(await readFile(dbPath, 'utf8')).workspaceUrlAdaptations.find((record) => record.savedUrlId === 'saved_source');
  assert.equal(richRecord.sourceContext.globalInsight.title, 'Grounded mocked source title');
  const reload = await request(baseUrl, '/api/workspaces/ws_source/saved-urls/saved_source/adaptation', {
    headers: { authorization: 'Bearer session_source' },
  });
  assert.equal(reload.body.status, 'ready');
  assert.equal(reload.body.adaptation.sourceContext.transcript.status, 'available');
  assert.equal(reload.body.adaptation.sourceContext.grounding.status, 'full');

  const completedFastPath = await request(baseUrl, '/api/workspaces/ws_source/saved-urls/saved_source/analyze-adapt', {
    method: 'POST', headers: { authorization: 'Bearer session_source' },
  });
  assert.equal(completedFastPath.response.status, 200);
  assert.equal(completedFastPath.body.alreadyGenerated, true);
  events = readEvents(await readFile(callsPath, 'utf8'));
  assert.equal(events.filter((event) => event.type === 'source_resolver').length, 1, 'completed fast path skips source resolver');
  assert.equal(events.filter((event) => event.type === 'remix_provider').length, 1, 'completed fast path skips remix provider');

  const partial = await request(baseUrl, '/api/workspaces/ws_source/saved-urls/saved_source_partial/analyze-adapt', {
    method: 'POST', headers: { authorization: 'Bearer session_source' },
  });
  assert.equal(partial.response.status, 409);
  assert.equal(partial.body.error, 'saved_url_source_unavailable');
  assert.equal(partial.body.grounding.status, 'unavailable');
  assert.equal(partial.body.grounding.mode, 'metadata_only');
  assert.ok(partial.body.missing.includes('source_grounding'));
  const partialDb = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(partialDb.workspaceUrlAdaptations.some((record) => record.savedUrlId === 'saved_source_partial'), false, 'metadata-only source never becomes completed adaptation');

  const beforeEmptyDb = JSON.parse(await readFile(dbPath, 'utf8'));
  const emptyDailyBefore = readUsage(beforeEmptyDb, 'trial_remix_daily');
  const emptyAttemptsBefore = readUsage(beforeEmptyDb, 'trial_provider_attempts_daily');
  const empty = await request(baseUrl, '/api/workspaces/ws_source/saved-urls/saved_source_empty/analyze-adapt', {
    method: 'POST', headers: { authorization: 'Bearer session_source' },
  });
  assert.equal(empty.response.status, 409);
  assert.equal(empty.body.error, 'saved_url_source_unavailable');
  let afterEmptyDb = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(afterEmptyDb.workspaceUrlAdaptations.some((record) => record.savedUrlId === 'saved_source_empty'), false);
  assert.equal(readUsage(afterEmptyDb, 'trial_remix_daily'), emptyDailyBefore, 'empty source releases daily action reservation');
  assert.ok(readUsage(afterEmptyDb, 'trial_provider_attempts_daily') > emptyAttemptsBefore, 'source attempt accounting remains honest');
  events = readEvents(await readFile(callsPath, 'utf8'));
  assert.equal(events.filter((event) => event.type === 'remix_provider').length, 1, 'unavailable sources never call remix provider');
  const emptyRetry = await request(baseUrl, '/api/workspaces/ws_source/saved-urls/saved_source_empty/analyze-adapt', {
    method: 'POST', headers: { authorization: 'Bearer session_source' },
  });
  assert.equal(emptyRetry.response.status, 409, 'empty source remains retryable');
  afterEmptyDb = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(afterEmptyDb.workspaceUrlAdaptations.some((record) => record.savedUrlId === 'saved_source_empty'), false);

  const beforeFailureDb = JSON.parse(await readFile(dbPath, 'utf8'));
  const failureDailyBefore = readUsage(beforeFailureDb, 'trial_remix_daily');
  const failed = await request(baseUrl, '/api/workspaces/ws_source/saved-urls/saved_source_failure/analyze-adapt', {
    method: 'POST', headers: { authorization: 'Bearer session_source' },
  });
  assert.equal(failed.response.status, 500);
  assert.equal(failed.body.error, 'mock_source_resolver_failure');
  const afterFailureDb = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(afterFailureDb.workspaceUrlAdaptations.some((record) => record.savedUrlId === 'saved_source_failure'), false);
  assert.equal(readUsage(afterFailureDb, 'trial_remix_daily'), failureDailyBefore, 'source failure releases daily action reservation');
  events = readEvents(await readFile(callsPath, 'utf8'));
  assert.equal(events.filter((event) => event.type === 'remix_provider').length, 1, 'source failure never calls remix provider');
  const failedRetry = await request(baseUrl, '/api/workspaces/ws_source/saved-urls/saved_source_failure/analyze-adapt', {
    method: 'POST', headers: { authorization: 'Bearer session_source' },
  });
  assert.equal(failedRetry.response.status, 500, 'source failure remains retryable');
  events = readEvents(await readFile(callsPath, 'utf8'));

  const english = await request(baseUrl, '/api/workspaces/ws_source/saved-urls/saved_source/analyze-adapt', {
    method: 'POST',
    headers: { authorization: 'Bearer session_source' },
    body: JSON.stringify({ language: 'en' }),
  });
  assert.equal(english.response.status, 201, 'English source analysis must not reuse the Ukrainian adaptation');
  assert.equal(english.body.adaptation.language, 'en');
  const languageDb = JSON.parse(await readFile(dbPath, 'utf8'));
  const localizedRecords = languageDb.workspaceUrlAdaptations.filter((record) => record.savedUrlId === 'saved_source');
  assert.equal(localizedRecords.length, 2, 'Saved URL adaptations persist separately by requested language');
  assert.equal(localizedRecords.find((record) => record.language === 'uk').sourceContext.videoIntelligence.video.videoSummary, 'Автор показує процес перед тим, як розкриває результат.');
  assert.equal(localizedRecords.find((record) => record.language === 'en').sourceContext.videoIntelligence.video.videoSummary, 'The creator demonstrates a process before revealing the result.');
  assert.deepEqual(
    localizedRecords.find((record) => record.language === 'en').result.remixes.map((remix) => remix.semanticAngle),
    ['visible_source_conflict', 'mechanism_walkthrough', 'viewer_decision'],
  );
  const englishReload = await request(baseUrl, '/api/workspaces/ws_source/saved-urls/saved_source/adaptation?language=en', {
    headers: { authorization: 'Bearer session_source' },
  });
  assert.equal(englishReload.body.status, 'ready');
  assert.equal(englishReload.body.adaptation.language, 'en');
  const englishRepeat = await request(baseUrl, '/api/workspaces/ws_source/saved-urls/saved_source/analyze-adapt', {
    method: 'POST',
    headers: { authorization: 'Bearer session_source' },
    body: JSON.stringify({ language: 'en' }),
  });
  assert.equal(englishRepeat.response.status, 200);
  assert.equal(englishRepeat.body.alreadyGenerated, true, 'same-language Saved URL request reuses its persisted adaptation');
  events = readEvents(await readFile(callsPath, 'utf8'));
  assert.equal(events.filter((event) => event.type === 'source_resolver' && event.savedUrlId === 'saved_source').length, 2);
  assert.equal(events.filter((event) => event.type === 'remix_provider').length, 2);
  assert.equal(events.find((event) => event.type === 'source_resolver' && event.savedUrlId === 'saved_source' && event.language === 'en').sourceContext.videoIntelligence.analysisLanguage, 'en');
  assert.deepEqual(events.filter((event) => event.type === 'remix_provider').map((event) => event.language), ['uk', 'en']);

  console.log(`source resolver mock calls: ${events.filter((event) => event.type === 'source_resolver').length}`);
  console.log(`remix mock calls: ${events.filter((event) => event.type === 'remix_provider').length}`);
  console.log('real provider/network calls: 0');
  console.log('GREEN: grounded Personal URL source context contract passed.');
} finally {
  await stop(child);
  await rm(tempDir, { recursive: true, force: true });
}
