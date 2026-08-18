import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createProductDiscoveryClient,
} from '../src/productDiscoveryIntegration.mjs';
import {
  getPersonalUrlAdaptationForLanguage,
  getPersonalUrlAdaptationIdentity,
  isCurrentPersonalUrlAdaptationResponse,
  mapSavedUrlToProductSignal,
} from '../src/productSavedUrlState.mjs';
import { buildStudioContentPlanDraft } from '../src/contentPlanUtils.mjs';
import {
  getStudioRemixes,
  getStudioSourceLinks,
  normalizeStudioScriptScenes,
} from '../src/studioViewState.mjs';

const sourceThumbnail = 'https://i.ytimg.com/vi/personal-short/maxresdefault.jpg';
const sourceProfileUrl = 'https://www.youtube.com/@personal-creator';

const savedUrl = {
  id: 'saved-youtube',
  workspaceId: 'workspace-a',
  platform: 'youtube',
  originalUrl: 'https://www.youtube.com/shorts/personal-short?feature=share',
  canonicalUrl: 'https://www.youtube.com/shorts/personal-short',
};
const adaptation = {
  id: 'url_adaptation_1',
  sourceType: 'personal_url',
  savedUrlId: savedUrl.id,
  generationId: 'url_adaptation_generation_1',
  sourceContext: {
    title: 'Personal YouTube video',
    image: sourceThumbnail,
    thumbnail: sourceThumbnail,
    profileUrl: sourceProfileUrl,
    sourceProfileUrl,
    metadata: {
      image: sourceThumbnail,
      thumbnail: sourceThumbnail,
      profileUrl: sourceProfileUrl,
      sourceProfileUrl,
      youtube: {
        channelId: 'UC_PERSONAL_CREATOR',
        channelUrl: sourceProfileUrl,
        thumbnail: sourceThumbnail,
      },
    },
    transcript: { status: 'unavailable', text: '', segments: [] },
    grounding: {
      status: 'full',
      mode: 'video',
      videoInput: { type: 'video', uri: savedUrl.canonicalUrl, source: 'test-video-provider' },
      transcript: { status: 'unavailable', trusted: false },
    },
    analysis: { status: 'unavailable', items: [] },
  },
  result: {
    remixes: ['visible_source_conflict', 'mechanism_walkthrough', 'viewer_decision'].map((semanticAngle, index) => ({
      title: `Grounded semantic variant ${index + 1}`,
      hook: `Show grounded proof angle ${index + 1} first.`,
      semanticAngle,
      centralClaim: `Distinct grounded claim ${index + 1}`,
      sourceConflict: 'A visible process has to prove the result before the pitch.',
      preservedMechanic: 'Show the process, reveal the result, then offer a concrete next step.',
      brandTranslation: 'Translate the setting through Brand Brain facts without replacing the source conflict.',
      productionProof: 'One phone, one real process, and one visible result.',
      adaptationLogic: 'Grounded conflict becomes a shootable brand proof sequence.',
      visualFlow: [0, 1, 2].map((beat) => ({
        timeframe: `0:0${beat}-0:0${beat + 1}`,
        actionDescription: `Shoot production action ${index + 1}.${beat + 1} with the real process visible.`,
        onScreenText: `Proof ${index + 1}.${beat + 1}`,
        audioVoiceover: `Explain production beat ${index + 1}.${beat + 1}.`,
      })),
      cta: `Take grounded next step ${index + 1}.`,
    })),
  },
};

const identity = getPersonalUrlAdaptationIdentity({ workspaceId: 'workspace-a', savedUrlId: savedUrl.id, brandRevision: 'brand-a:1' });
const englishIdentity = getPersonalUrlAdaptationIdentity({ workspaceId: 'workspace-a', savedUrlId: savedUrl.id, brandRevision: 'brand-a:1', language: 'en' });
assert.notEqual(identity, englishIdentity, 'Saved URL response identity must distinguish localized analysis requests');
assert.equal(getPersonalUrlAdaptationForLanguage({ ...adaptation, language: 'en' }, 'uk'), null);
assert.equal(getPersonalUrlAdaptationForLanguage({ ...adaptation, language: 'en' }, 'en')?.id, adaptation.id);
assert.equal(getPersonalUrlAdaptationForLanguage(adaptation, 'uk')?.id, adaptation.id, 'legacy records without language remain Ukrainian-readable');
assert.equal(isCurrentPersonalUrlAdaptationResponse({
  requestRevision: 2,
  currentRevision: 2,
  requestIdentity: identity,
  currentIdentity: identity,
}), true);
assert.equal(isCurrentPersonalUrlAdaptationResponse({
  requestRevision: 2,
  currentRevision: 3,
  requestIdentity: identity,
  currentIdentity: identity,
}), false);
assert.equal(isCurrentPersonalUrlAdaptationResponse({
  requestRevision: 2,
  currentRevision: 2,
  requestIdentity: identity,
  currentIdentity: getPersonalUrlAdaptationIdentity({ workspaceId: 'workspace-b', savedUrlId: savedUrl.id, brandRevision: 'brand-a:1' }),
}), false);

const signal = mapSavedUrlToProductSignal(savedUrl, adaptation);
assert.equal(signal.sourceType, 'personal_url');
assert.equal(signal.personalUrl, true);
assert.equal(signal.savedUrlId, savedUrl.id);
assert.equal(signal.sourceUrl, savedUrl.canonicalUrl);
assert.equal(signal.views, null);
assert.equal(signal.importedMetadata.videoIntelligence, null);
assert.equal(signal.importedMetadata.grounding.status, 'full');
assert.equal(signal.importedMetadata.grounding.videoInput.uri, savedUrl.canonicalUrl);
assert.equal(signal.personalUrlAdaptation, adaptation);
const studioRemixes = getStudioRemixes(signal, adaptation);
assert.deepEqual(
  studioRemixes.map((remix) => remix.semanticAngle),
  ['visible_source_conflict', 'mechanism_walkthrough', 'viewer_decision'],
  'Saved URL Studio exposes all three bounded semantic angles',
);
const selectedRemix = studioRemixes[1];
const productionScenes = normalizeStudioScriptScenes(signal, adaptation, selectedRemix);
assert.equal(productionScenes.length, 3, 'selected adaptation angle becomes a three-scene production script');
assert.ok(productionScenes.every((scene) => scene.direction && scene.onScreenText && scene.voiceover));
const contentPlanDraft = buildStudioContentPlanDraft(signal, adaptation, selectedRemix);
assert.equal(contentPlanDraft.title, selectedRemix.title);
assert.match(contentPlanDraft.body, /Кадр:/);
assert.match(contentPlanDraft.body, /Текст на екрані:/);
assert.match(contentPlanDraft.body, /Озвучка:/);
assert.match(contentPlanDraft.body, /CTA:/);
const studioPreviewImage = signal.image
  || signal.thumbnail
  || signal.importedMetadata?.thumbnail
  || signal.importedMetadata?.youtube?.thumbnail
  || '';
assert.deepEqual({
  previewImage: studioPreviewImage,
  sourceLinks: getStudioSourceLinks(signal),
}, {
  previewImage: sourceThumbnail,
  sourceLinks: {
    originalUrl: savedUrl.canonicalUrl,
    profileUrl: sourceProfileUrl,
  },
});

const calls = [];
const response = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});
const fetcher = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.endsWith('/saved-urls/saved-youtube/adaptation?language=en')) {
    return response(200, { sourceType: 'personal_url', savedUrl, status: 'ready', adaptation });
  }
  if (url.endsWith('/saved-urls/saved-youtube/analyze-adapt')) {
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { language: 'en' });
    return response(201, { sourceType: 'personal_url', savedUrl, adaptation });
  }
  throw new Error(`unexpected URL: ${url}`);
};

const client = createProductDiscoveryClient({ apiBase: '/api', workspaceId: 'workspace-a', fetcher });
assert.equal((await client.loadSavedUrlAdaptation(savedUrl.id, 'en')).adaptation.id, adaptation.id);
assert.equal((await client.analyzeAdaptSavedUrl(savedUrl.id, 'en')).sourceType, 'personal_url');
assert.ok(calls.some(({ url }) => url.includes('/saved-urls/saved-youtube/adaptation?language=en')));
assert.ok(calls.some(({ url, options }) => url.includes('/saved-urls/saved-youtube/analyze-adapt') && options.method === 'POST'));
assert.equal(calls.some(({ url }) => url.includes('/adaptations/')), false, 'personal URL flow never calls shared adaptation API');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');
const PROVIDER_FIXTURE = path.join(ROOT, 'scripts', 'fixtures', 'personal-url-source-observability-provider.cjs');
const NETWORK_GUARD = path.join(ROOT, 'scripts', 'fixtures', 'controlled-live-run-network-guard.cjs');
const brandProfileDescription = 'Synthetic workflow coaching for small product teams.';
const brandAudience = 'small product teams';

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

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`isolated backend exited early: ${output()}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1_000) })).ok) return;
    } catch {
      // Keep polling the isolated loopback server.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`isolated backend startup timed out: ${output()}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

function seededBrandMappingDb() {
  return {
    users: [{ id: 'user_brand_mapping', name: 'Brand Mapping User', email: 'brand-mapping@example.test', role: 'owner', workspaceId: 'ws_brand_mapping' }],
    sessions: [{ token: 'session_brand_mapping', userId: 'user_brand_mapping', expiresAt: '2030-01-01T00:00:00.000Z' }],
    workspaces: [{
      id: 'ws_brand_mapping',
      name: 'Brand Mapping Workspace',
      owner: 'Brand Mapping User',
      brief: {},
      productBrandBrain: {
        version: 1,
        id: 'brand_mapping_fixture',
        name: 'Synthetic Product Brand',
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
        brain: {
          profileDescription: brandProfileDescription,
          audience: brandAudience,
        },
      },
      contentPlanPosts: [],
    }],
    subscriptions: [{ id: 'sub_brand_mapping', workspaceId: 'ws_brand_mapping', planId: 'trial', status: 'trialing' }],
    workspaceSavedUrls: [{
      id: 'saved_brand_mapping',
      workspaceId: 'ws_brand_mapping',
      platform: 'youtube',
      originalUrl: 'https://example.test/synthetic-brand-mapping?utm_source=test',
      canonicalUrl: 'https://example.test/synthetic-brand-mapping',
      createdAt: '2026-08-18T00:00:00.000Z',
      status: 'not_analyzed',
    }],
    workspaceUrlAdaptations: [],
    reels: [], workspaceSavedSignals: [], workspaceAdaptations: [], usageCounters: [], plans: [], competitors: [], ideas: [], leads: [], syncJobs: [], sources: [], metaStates: [], instagramAccounts: [], tiktokAccounts: [],
    aiMemory: [], aiJobs: [], remixes: [], contentPlanItems: [], videoJobs: [], dataDeletionRequests: [], demoSessions: [], discoveryRuns: [], testerAccess: [], personalUrlRunTelemetry: [],
  };
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'saved-url-brand-mapping-'));
const dbPath = path.join(tempDir, 'db.json');
const providerCallsPath = path.join(tempDir, 'provider-calls.jsonl');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
await writeFile(dbPath, `${JSON.stringify(seededBrandMappingDb(), null, 2)}\n`, 'utf8');
await writeFile(providerCallsPath, '', 'utf8');

const child = spawn(process.execPath, ['--require', NETWORK_GUARD, SERVER_ENTRY], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    CLIENT_URL: baseUrl,
    NODE_ENV: 'test',
    DISABLE_LOCAL_ENV_LOADING: 'true',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    APIFY_TOKEN: '',
    APIFY_API_TOKEN: '',
    GEMINI_API_KEY: '',
    OPENAI_API_KEY: '',
    YOUTUBE_API_KEY: '',
    DZHERO_CRM_API_URL: '',
    DZHERO_CRM_SYNC_TOKEN: '',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    UNLIMITED_ACCESS_EMAILS: 'brand-mapping@example.test',
    BETA_OWNER_TEST_ENABLED: 'true',
    BETA_OWNER_TEST_SCOPE: 'staging',
    BETA_OWNER_TEST_USER_ID: 'user_brand_mapping',
    BETA_OWNER_TEST_WORKSPACE_ID: 'ws_brand_mapping',
    REMIX_TEST_PROVIDER: PROVIDER_FIXTURE,
    REMIX_TEST_PROVIDER_CALLS_PATH: providerCallsPath,
    CONTROLLED_LIVE_RUN_PROVIDER_CALLS_PATH: providerCallsPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });

try {
  await waitForServer(baseUrl, child, () => backendOutput);
  const lifecycleResponse = await fetch(`${baseUrl}/api/workspaces/ws_brand_mapping/saved-urls/saved_brand_mapping/analyze-adapt`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      authorization: 'Bearer session_brand_mapping',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ language: 'uk' }),
  });
  const body = await lifecycleResponse.json();
  assert.equal(lifecycleResponse.status, 201, `isolated Saved URL lifecycle must complete: ${JSON.stringify(body)}`);

  const events = (await readFile(providerCallsPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(events.filter((event) => event.kind === 'network_attempt').length, 0, 'isolated lifecycle performs no external network request');
  assert.equal(events.filter((event) => event.type === 'source_resolver').length, 1, 'source resolver runs exactly once');
  const remixCalls = events.filter((event) => event.type === 'remix_provider');
  assert.equal(remixCalls.length, 1, 'remix provider runs exactly once');
  const brandMappingFailures = [];
  for (const assertion of [
    () => assert.equal(
      remixCalls[0].businessBrief.product,
      brandProfileDescription,
      'Product Brand Brain profileDescription must become non-empty remix product context',
    ),
    () => assert.equal(remixCalls[0].businessBrief.audience, brandAudience),
    () => assert.equal(
      remixCalls[0].businessBrief.brandBrainMode,
      'brand',
      'A complete Product Brand Brain must reach remix in brand mode',
    ),
  ]) {
    try {
      assertion();
    } catch (error) {
      brandMappingFailures.push(error);
    }
  }
  assert.equal(
    brandMappingFailures.length,
    0,
    brandMappingFailures.map((error) => error.message).join('\n'),
  );
} finally {
  await stopServer(child);
  await rm(tempDir, { recursive: true, force: true });
}

console.log('Product Personal URL adaptation lifecycle checks passed.');
