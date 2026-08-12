import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildStudioContentPlanDraft } from '../src/contentPlanUtils.mjs';
import { deriveStudioAnalysis, deriveStudioTranscript, getStudioSourceLinks, getStudioRemixes, normalizeStudioScriptScenes } from '../src/studioViewState.mjs';
import {
  buildPersonalUrlAdaptationFailureState,
  isCurrentPersonalUrlAdaptationResponse,
  mapSavedUrlToProductSignal,
} from '../src/productSavedUrlState.mjs';
import { createProductDiscoveryClient } from '../src/productDiscoveryIntegration.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');
const PROVIDER_FIXTURE = path.join(ROOT, 'scripts', 'fixtures', 'personal-url-grounded-harness-provider.cjs');
const require = createRequire(import.meta.url);
const { normalizeProductBrand } = require('../backend/services/productBrandBrain.cjs');

const brand = {
  version: 1,
  id: 'brand_grounded_harness',
  name: 'Grounded Harness Brand',
  updatedAt: '2026-08-08T10:00:00.000Z',
  brain: {
    profileDescription: 'Practical workflow automation for small product teams.',
    audience: 'small product teams',
    niche: 'workflow automation',
    market: 'Ukraine',
    product: 'workflow audit',
  },
};

const savedUrl = (id, platform = 'youtube') => ({
  id,
  workspaceId: 'ws_harness',
  platform,
  originalUrl: `https://example.test/${id}?utm_source=test`,
  canonicalUrl: `https://example.test/${id}`,
  createdAt: '2026-08-08T10:00:00.000Z',
  status: 'not_analyzed',
});

const normalizedBrand = normalizeProductBrand(brand);
const brandKey = JSON.stringify({ id: normalizedBrand.id, version: normalizedBrand.version, brain: normalizedBrand.brain });

function legacyUngroundedAdaptation() {
  return {
    id: 'url_adaptation_legacy_ungrounded',
    workspaceId: 'ws_harness',
    savedUrlId: 'saved_legacy_ungrounded',
    sourceType: 'personal_url',
    canonicalUrl: 'https://example.test/saved_legacy_ungrounded',
    platform: 'youtube',
    brandId: brand.id,
    brandVersion: brand.version,
    brandUpdatedAt: brand.updatedAt,
    brandKey,
    brandSnapshot: brand,
    sourceContext: {
      sourceType: 'personal_url',
      savedUrlId: 'saved_legacy_ungrounded',
      title: 'Legacy metadata-only adaptation',
      metadata: { title: 'Legacy metadata-only adaptation', sourceStatus: 'public_metadata' },
      transcript: { status: 'unavailable', text: '', segments: [] },
      videoIntelligence: { video: { status: 'unavailable' }, transcript: { status: 'unavailable', text: '', segments: [] } },
      analysis: { status: 'unavailable', items: [] },
      sourceStatus: 'public_metadata',
      missing: ['source_grounding'],
    },
    result: {
      remixes: [1, 2, 3].map((index) => ({
        title: `Legacy useful variant ${index}`,
        hook: `Legacy hook ${index}`,
        visualFlow: [{
          timeframe: '0:00-0:03',
          actionDescription: `Legacy shootable direction ${index}`,
          onScreenText: `LEGACY ${index}`,
          audioVoiceover: `Legacy voiceover ${index}`,
        }],
        cta: `Legacy CTA ${index}`,
      })),
    },
    status: 'completed',
    generationId: 'url_adaptation_generation_legacy_ungrounded',
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
    completedAt: '2026-08-08T10:00:00.000Z',
  };
}

function seededDb() {
  return {
    users: [{ id: 'user_harness', name: 'Harness User', email: 'harness@example.com', role: 'owner', workspaceId: 'ws_harness' }],
    sessions: [{ token: 'session_harness', userId: 'user_harness', expiresAt: '2030-01-01T00:00:00.000Z' }],
    workspaces: [{ id: 'ws_harness', name: 'Harness Workspace', owner: 'Harness User', brief: {}, productBrandBrain: brand, contentPlanPosts: [] }],
    subscriptions: [{ id: 'sub_harness', workspaceId: 'ws_harness', planId: 'trial', status: 'trialing' }],
    reels: [], workspaceSavedSignals: [], workspaceAdaptations: [], workspaceUrlAdaptations: [legacyUngroundedAdaptation()],
    workspaceSavedUrls: [
      savedUrl('saved_full'),
      savedUrl('saved_metadata_only', 'tiktok'),
      savedUrl('saved_no_speech', 'instagram'),
      savedUrl('saved_transcript_unavailable'),
      savedUrl('saved_provider_failure'),
      savedUrl('saved_legacy_ungrounded'),
    ],
    usageCounters: [], plans: [], competitors: [], ideas: [], leads: [], syncJobs: [], sources: [], metaStates: [], instagramAccounts: [], tiktokAccounts: [],
    aiMemory: [], aiJobs: [], remixes: [], contentPlanItems: [], videoJobs: [], dataDeletionRequests: [], demoSessions: [], discoveryRuns: [], testerAccess: [],
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
      // Keep polling until the isolated test server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
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

async function verifyStudioScriptUi(signal, adaptation, legacyFixture) {
  const vitePackagePath = require.resolve('vite/package.json');
  const vitePackage = JSON.parse(await readFile(vitePackagePath, 'utf8'));
  const viteEntry = path.resolve(path.dirname(vitePackagePath), vitePackage.exports['.']);
  const { createServer } = await import(pathToFileURL(viteEntry).href);
  const { chromium } = require('playwright');
  const port = await getFreePort();
  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: true },
    optimizeDeps: {
      entries: ['scripts/fixtures/product-studio-script-ui.html'],
      include: ['react', 'react-dom/client', 'lucide-react'],
    },
    resolve: {
      alias: [
        { find: /^react\/jsx-dev-runtime$/, replacement: require.resolve('react/jsx-dev-runtime') },
        { find: /^react\/jsx-runtime$/, replacement: require.resolve('react/jsx-runtime') },
        { find: /^react$/, replacement: require.resolve('react') },
        { find: /^react-dom\/client$/, replacement: require.resolve('react-dom/client') },
        { find: /^react-dom$/, replacement: require.resolve('react-dom') },
        { find: /^lucide-react$/, replacement: require.resolve('lucide-react') },
      ],
    },
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript((fixture) => {
      window.__DZHERO_PRODUCT_STUDIO_FIXTURE__ = fixture;
    }, { signal, adaptation });
    await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/product-studio-script-ui.html`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Adaptation' }).click();
    const variants = page.getByRole('group', { name: 'Adaptation variants' }).getByRole('button');
    assert.equal(await variants.count(), 3, 'the successful manual-video flow still displays three adaptation variants');
    await variants.nth(1).click();
    await page.getByRole('button', { name: 'Open production script' }).click();
    const script = page.locator('.studio-script');
    await script.waitFor({ state: 'visible' });
    assert.match(await script.locator('h2').innerText(), /Grounded variant 2 for workflow audit/);
    const renderedScenes = script.locator('.studio-scenes article');
    assert.equal(await renderedScenes.count(), 3, 'Script Editor displays all structured scenes for the selected adaptation');
    const renderedText = await script.innerText();
    assert.match(renderedText, /real task board on a laptop/i);
    assert.match(renderedText, /ДЕ ГУБИТЬСЯ ЗАДАЧА\?/);
    assert.match(renderedText, /Ось тут команда втрачає задачу/);
    assert.doesNotMatch(renderedText, /Analysis unavailable/);

    const retryPage = await browser.newPage();
    await retryPage.addInitScript((fixture) => {
      window.__DZHERO_PRODUCT_STUDIO_FIXTURE__ = fixture;
    }, legacyFixture);
    await retryPage.goto(`http://127.0.0.1:${port}/scripts/fixtures/product-studio-script-ui.html`, { waitUntil: 'networkidle' });
    const retryButton = retryPage.getByRole('button', { name: 'Retry grounded analysis' });
    await retryButton.click();
    assert.equal(await retryPage.evaluate(() => window.__DZHERO_GROUNDED_RETRY_COUNT__), 1, 'ungrounded Studio state exposes an actionable retry');
    await retryPage.getByRole('button', { name: 'Adaptation' }).click();
    assert.equal(
      await retryPage.getByRole('group', { name: 'Adaptation variants' }).getByRole('button').count(),
      3,
      'existing variants remain visible while grounded analysis is unavailable',
    );
    await retryPage.getByRole('button', { name: 'Open production script' }).click();
    assert.match(await retryPage.locator('.studio-script').innerText(), /Legacy shootable direction 1/);
  } finally {
    await browser?.close();
    await server.close();
  }
}

function parseEvents(value) {
  return value.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function countEvents(events, type, savedUrlId) {
  return events.filter((event) => event.type === type && (!savedUrlId || event.savedUrlId === savedUrlId)).length;
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'personal-url-grounded-harness-'));
const dbPath = path.join(tempDir, 'db.json');
const callsPath = path.join(tempDir, 'provider-calls.jsonl');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
await writeFile(dbPath, `${JSON.stringify(seededDb(), null, 2)}\n`, 'utf8');
await writeFile(callsPath, '', 'utf8');

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', DB_PATH: dbPath, DATABASE_URL: '',
    APIFY_TOKEN: '', APIFY_API_TOKEN: '', GEMINI_API_KEY: '', OPENAI_API_KEY: '', AUTOMATIC_DISCOVERY_ENABLED: 'false',
    UNLIMITED_ACCESS_EMAILS: 'harness@example.com',
    REMIX_TEST_PROVIDER: PROVIDER_FIXTURE, REMIX_TEST_PROVIDER_CALLS_PATH: callsPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });
const auth = { authorization: 'Bearer session_harness' };
const analyzePath = (id) => `/api/workspaces/ws_harness/saved-urls/${id}/analyze-adapt`;
const adaptationPath = (id) => `/api/workspaces/ws_harness/saved-urls/${id}/adaptation`;

try {
  await waitForServer(baseUrl, child, () => backendOutput);
  const callsBefore = parseEvents(await readFile(callsPath, 'utf8'));
  assert.equal(callsBefore.length, 0, 'server startup must not call a provider');

  // Save/read/navigation lifecycle is provider-free. Analyze & Adapt is the only generator.
  const saved = await request(baseUrl, '/api/workspaces/ws_harness/saved-urls', {
    method: 'POST', headers: auth, body: JSON.stringify({ url: 'https://youtube.com/shorts/saved_url_created' }),
  });
  assert.equal(saved.response.status, 201);
  await request(baseUrl, '/api/workspaces/ws_harness/saved-urls', { headers: auth });
  await request(baseUrl, adaptationPath('saved_full'), { headers: auth });
  await request(baseUrl, '/api/workspaces/ws_harness/reels', { headers: auth });
  await request(baseUrl, '/api/workspaces/ws_harness/saved-signals', { headers: auth });
  await request(baseUrl, '/api/workspaces/ws_harness/content-plan?surface=product_redesign', { headers: auth });
  assert.equal(parseEvents(await readFile(callsPath, 'utf8')).length, 0, 'save, Studio load and tab-style reads are provider-free');

  // A completed pre-grounding record must not permanently short-circuit Analyze & Adapt.
  const legacyBefore = await request(baseUrl, adaptationPath('saved_legacy_ungrounded'), { headers: auth });
  assert.equal(legacyBefore.response.status, 200);
  assert.equal(legacyBefore.body.status, 'ready');
  assert.equal(legacyBefore.body.adaptation.sourceContext.grounding, undefined);
  assert.equal(legacyBefore.body.adaptation.result.remixes.length, 3, 'existing useful variants remain readable before retry');
  const legacySignal = mapSavedUrlToProductSignal(savedUrl('saved_legacy_ungrounded'), legacyBefore.body.adaptation);
  assert.equal(deriveStudioAnalysis(legacySignal).status, 'unavailable');
  assert.equal(getStudioRemixes(legacySignal).length, 3, 'Studio keeps the existing variants while grounded analysis is unavailable');
  assert.deepEqual(
    buildPersonalUrlAdaptationFailureState('saved_url_source_unavailable', legacyBefore.body.adaptation),
    { status: 'ready', adaptation: legacyBefore.body.adaptation, errorCode: 'saved_url_source_unavailable' },
    'a failed grounded retry retains the existing adaptation and exposes its retryable error',
  );

  const legacyRetry = await request(baseUrl, analyzePath('saved_legacy_ungrounded'), { method: 'POST', headers: auth });
  assert.equal(legacyRetry.response.status, 201);
  assert.equal(legacyRetry.body.alreadyGenerated, false);
  assert.equal(legacyRetry.body.adaptation.sourceContext.grounding.status, 'full');
  assert.notEqual(legacyRetry.body.adaptation.generationId, 'url_adaptation_generation_legacy_ungrounded');
  let legacyEvents = parseEvents(await readFile(callsPath, 'utf8'));
  assert.equal(countEvents(legacyEvents, 'source_resolver', 'saved_legacy_ungrounded'), 1);
  assert.equal(countEvents(legacyEvents, 'remix_provider', 'saved_legacy_ungrounded'), 1);

  // Single-flight full flow: both requests resolve to one source + one remix call.
  const [fullFirst, fullSecond] = await Promise.all([
    request(baseUrl, analyzePath('saved_full'), { method: 'POST', headers: auth }),
    request(baseUrl, analyzePath('saved_full'), { method: 'POST', headers: auth }),
  ]);
  assert.ok([fullFirst.response.status, fullSecond.response.status].every((status) => [200, 201].includes(status)));
  let events = parseEvents(await readFile(callsPath, 'utf8'));
  assert.equal(countEvents(events, 'source_resolver', 'saved_full'), 1);
  assert.equal(countEvents(events, 'remix_provider', 'saved_full'), 1);
  const fullProviderCall = events.find((event) => event.type === 'remix_provider' && event.savedUrlId === 'saved_full');
  assert.deepEqual(fullProviderCall.receivedVideoInput, { type: 'video', uri: 'mock://video/saved_full', source: 'mock-video-input' }, 'provider receives the videoInput descriptor');
  assert.equal(fullProviderCall.receivedSourceTitle, 'Grounded source saved_full');
  assert.match(fullProviderCall.receivedTranscript, /Show the process first/);

  let db = JSON.parse(await readFile(dbPath, 'utf8'));
  const fullAdaptation = db.workspaceUrlAdaptations.find((record) => record.savedUrlId === 'saved_full');
  assert.ok(fullAdaptation);
  assert.equal(fullAdaptation.status, 'completed');
  assert.equal(fullAdaptation.sourceContext.grounding.status, 'full');
  assert.deepEqual(fullAdaptation.sourceContext.grounding.videoInput, fullProviderCall.receivedVideoInput);
  assert.equal(fullAdaptation.sourceContext.transcript.status, 'available');
  assert.equal(fullAdaptation.sourceContext.videoIntelligence.video.scenes[1].timeframe, '0:03-0:09');
  assert.deepEqual(fullAdaptation.sourceContext.videoIntelligence.video.soundMusicCues, ['quiet room tone', 'short reveal hit']);
  assert.equal(fullAdaptation.sourceContext.videoIntelligence.video.confidence, 'high for observed process and reveal');
  assert.deepEqual(fullAdaptation.sourceContext.videoIntelligence.video.limitations, ['local fixture does not archive provider frames']);
  assert.equal(Object.hasOwn(fullAdaptation, 'decision'), false, 'personal URL adaptation is not a shared-bank decision');
  const sourceSnapshot = JSON.stringify(fullAdaptation.sourceContext);

  // Studio receives the persisted source context, transcript, deep analysis, scenes, links and remix.
  const fullSignal = mapSavedUrlToProductSignal(savedUrl('saved_full'), fullAdaptation);
  assert.equal(deriveStudioTranscript(fullSignal).status, 'available');
  assert.deepEqual(deriveStudioTranscript(fullSignal).segments.map(({ time }) => time), ['00:00', '00:06']);
  assert.equal(deriveStudioAnalysis(fullSignal).status, 'available');
  assert.ok(deriveStudioAnalysis(fullSignal).items.some((item) => item.text === 'A process is shown before the result is revealed.'));
  assert.equal(getStudioRemixes(fullSignal, fullAdaptation).length, 3);
  const scriptScenes = normalizeStudioScriptScenes(fullSignal, fullAdaptation);
  assert.equal(scriptScenes.length, 3, 'Script Editor receives a structured, shootable scenario rather than an idea list');
  assert.equal(scriptScenes[0].time, '0:00-0:03');
  scriptScenes.forEach((scene) => {
    assert.ok(scene.time, 'every script scene has a timeframe');
    assert.ok(scene.direction, 'every script scene has a concrete filming direction');
    assert.ok(scene.onScreenText, 'every script scene has on-screen copy');
    assert.ok(scene.voiceover, 'every script scene has spoken copy');
  });
  assert.match(scriptScenes.map((scene) => scene.direction).join(' '), /task board|workflow-audit checklist|laptop/i);
  assert.match(scriptScenes.map((scene) => scene.voiceover).join(' '), /аудит|задач/i);
  assert.deepEqual(getStudioSourceLinks(fullSignal), {
    originalUrl: 'https://example.test/saved_full',
    profileUrl: 'https://example.test/profiles/saved_full',
  });
  const contentPlanDraft = buildStudioContentPlanDraft(fullSignal, fullAdaptation);
  assert.ok(contentPlanDraft);
  assert.match(contentPlanDraft.body, /0:00-0:03/);
  assert.match(contentPlanDraft.body, /task board/i);
  assert.match(contentPlanDraft.body, /Озвучка:/);
  await verifyStudioScriptUi(fullSignal, fullAdaptation, {
    signal: legacySignal,
    adaptation: legacyBefore.body.adaptation,
  });
  const plan = await request(baseUrl, '/api/workspaces/ws_harness/content-plan/posts', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ post: {
      ...contentPlanDraft,
      date: '2026-08-20',
      origin: 'studio_adaptation',
      sourceAdaptationId: fullAdaptation.id,
      sourceVariantIndex: 0,
    } }),
  });
  assert.equal(plan.response.status, 201);
  assert.equal(plan.body.post.sourceType, 'personal_url');
  assert.equal(plan.body.post.sourceAdaptationId, fullAdaptation.id);

  db = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(JSON.stringify(db.workspaceUrlAdaptations.find((record) => record.savedUrlId === 'saved_full').sourceContext), sourceSnapshot, 'source context remains immutable after Studio/Content Plan use');

  // Metadata-only: the resolver may run, but remix generation must never run.
  const metadataOnly = await request(baseUrl, analyzePath('saved_metadata_only'), { method: 'POST', headers: auth });
  assert.equal(metadataOnly.response.status, 409);
  assert.equal(metadataOnly.body.error, 'saved_url_source_unavailable');
  assert.equal(metadataOnly.body.grounding.mode, 'metadata_only');
  assert.deepEqual(metadataOnly.body.diagnostic, {
    platform: 'tiktok',
    stage: 'capability',
    reasonCode: 'public_url_analysis_unsupported',
    retryable: false,
    fallback: 'user_owned_upload_or_owner_authorized_captions',
  });
  assert.equal(metadataOnly.body.retryable, false, 'unsupported platform URLs fail closed instead of suggesting a futile retry');
  const retainedFailure = buildPersonalUrlAdaptationFailureState(
    metadataOnly.body.error,
    legacyBefore.body.adaptation,
    metadataOnly.body.diagnostic,
  );
  assert.equal(retainedFailure.status, 'ready');
  assert.equal(retainedFailure.adaptation.id, legacyBefore.body.adaptation.id);
  assert.equal(retainedFailure.diagnostic.reasonCode, 'public_url_analysis_unsupported');
  assert.equal(countEvents(parseEvents(await readFile(callsPath, 'utf8')), 'remix_provider', 'saved_metadata_only'), 0);
  assert.equal(JSON.parse(await readFile(dbPath, 'utf8')).workspaceUrlAdaptations.some((record) => record.savedUrlId === 'saved_metadata_only'), false);
  assert.equal(buildStudioContentPlanDraft(mapSavedUrlToProductSignal(savedUrl('saved_metadata_only'), null), null), null);

  // Video without speech: video grounding and deep analysis remain available; no speech is not an error.
  const noSpeech = await request(baseUrl, analyzePath('saved_no_speech'), { method: 'POST', headers: auth });
  assert.equal(noSpeech.response.status, 201);
  const noSpeechDb = JSON.parse(await readFile(dbPath, 'utf8'));
  const noSpeechAdaptation = noSpeechDb.workspaceUrlAdaptations.find((record) => record.savedUrlId === 'saved_no_speech');
  const noSpeechSignal = mapSavedUrlToProductSignal(savedUrl('saved_no_speech', 'instagram'), noSpeechAdaptation);
  assert.equal(noSpeechAdaptation.sourceContext.transcript.status, 'not_applicable');
  assert.equal(noSpeechAdaptation.sourceContext.grounding.status, 'full');
  assert.equal(deriveStudioTranscript(noSpeechSignal).status, 'not_applicable');
  assert.equal(deriveStudioAnalysis(noSpeechSignal).status, 'available');

  // Video available, transcript unavailable: preserve the honest unavailable state and do not invent text.
  const transcriptUnavailable = await request(baseUrl, analyzePath('saved_transcript_unavailable'), { method: 'POST', headers: auth });
  assert.equal(transcriptUnavailable.response.status, 201);
  const transcriptDb = JSON.parse(await readFile(dbPath, 'utf8'));
  const transcriptAdaptation = transcriptDb.workspaceUrlAdaptations.find((record) => record.savedUrlId === 'saved_transcript_unavailable');
  const transcriptSignal = mapSavedUrlToProductSignal(savedUrl('saved_transcript_unavailable'), transcriptAdaptation);
  assert.equal(transcriptAdaptation.sourceContext.transcript.status, 'unavailable');
  assert.equal(transcriptAdaptation.sourceContext.transcript.text, '');
  assert.equal(deriveStudioTranscript(transcriptSignal).status, 'unavailable');
  assert.equal(deriveStudioTranscript(transcriptSignal).spokenText, '');
  assert.equal(deriveStudioAnalysis(transcriptSignal).status, 'available');

  // Classified provider failure is retryable and never becomes completed.
  const failed = await request(baseUrl, analyzePath('saved_provider_failure'), { method: 'POST', headers: auth });
  assert.equal(failed.response.status, 500);
  assert.equal(failed.body.error, 'mock_provider_failure');
  db = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(db.workspaceUrlAdaptations.some((record) => record.savedUrlId === 'saved_provider_failure'), false);
  const failedRetry = await request(baseUrl, analyzePath('saved_provider_failure'), { method: 'POST', headers: auth });
  assert.equal(failedRetry.response.status, 500);
  events = parseEvents(await readFile(callsPath, 'utf8'));
  assert.equal(countEvents(events, 'remix_provider', 'saved_provider_failure'), 2, 'failed provider requests remain retryable');

  // Existing frontend lifecycle guards remain deterministic and stale responses cannot commit.
  assert.equal(isCurrentPersonalUrlAdaptationResponse({ requestRevision: 1, currentRevision: 1, requestIdentity: 'ws:saved:brand', currentIdentity: 'ws:saved:brand' }), true);
  assert.equal(isCurrentPersonalUrlAdaptationResponse({ requestRevision: 1, currentRevision: 2, requestIdentity: 'ws:saved:brand', currentIdentity: 'ws:saved:brand' }), false);
  assert.equal(isCurrentPersonalUrlAdaptationResponse({ requestRevision: 1, currentRevision: 1, requestIdentity: 'ws:saved:brand-a', currentIdentity: 'ws:saved:brand-b' }), false);
  const clientCalls = [];
  const client = createProductDiscoveryClient({
    apiBase: '/api', workspaceId: 'ws_harness',
    fetcher: async (url, options = {}) => {
      clientCalls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({}) };
    },
  });
  await client.loadSavedUrls();
  await client.loadSavedUrlAdaptation('saved_full');
  assert.equal(clientCalls.some(({ url }) => url.includes('/adaptations/')), false, 'Personal URL client never calls shared adaptation API');

  console.log('Personal URL grounded deterministic harness passed.');
  console.log(`mock source resolver calls: ${events.filter((event) => event.type === 'source_resolver').length}`);
  console.log(`mock remix provider calls: ${events.filter((event) => event.type === 'remix_provider').length}`);
  console.log('real provider/network calls: 0');
} finally {
  await stop(child);
  await rm(tempDir, { recursive: true, force: true });
}
