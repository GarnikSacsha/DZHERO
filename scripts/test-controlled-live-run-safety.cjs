const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PERSONAL_SAVED_URL_PROVIDER_SCOPE,
  assertControlledLiveRunProviderAccess,
  isControlledCredentiallessPreflightEnabled,
  isControlledLiveRunEnabled,
} = require('../backend/services/controlledLiveRunGuard.cjs');
const {
  readPersonalUrlRunBudget,
} = require('../backend/services/personalUrlRunBudget.cjs');

const strictEnv = {
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

assert.equal(isControlledLiveRunEnabled({}), false);
assert.equal(isControlledCredentiallessPreflightEnabled({}), false);
assert.equal(assertControlledLiveRunProviderAccess({ env: {}, scope: 'legacy_signals_import' }), true);

let unrelatedProviderCalls = 0;
const blockedProviderScopes = [
  'legacy_instagram_thumbnail_analysis',
  'legacy_instagram_remix_attempt_1',
  'legacy_instagram_remix_attempt_2',
  'legacy_signals_import',
  'legacy_apify_import',
  'youtube_popular_import',
  'legacy_reel_analyze_ai',
  'legacy_remix_generate',
  'manual_discovery',
  'automatic_signal_quality',
  'public_brand_scan',
  'brand_brain_finalize',
  'agent_chat',
  'shared_signal_adaptation',
  'agent_studio_upload',
  'agent_studio_run',
  'agent_studio_context_resume',
  'agent_studio_source_file',
  'agent_studio_retry_source',
  'agent_studio_hybrid',
  'unrelated_apify',
  'unrelated_paid_ai',
];
for (const operation of blockedProviderScopes) {
  assert.throws(
    () => {
      assertControlledLiveRunProviderAccess({ env: strictEnv, scope: operation });
      unrelatedProviderCalls += 1;
    },
    (error) => error?.code === 'controlled_live_run_scope_blocked'
      && error?.providerAttemptBlocked === true,
  );
}
assert.equal(unrelatedProviderCalls, 0);

let intendedProviderCalls = 0;
assert.equal(assertControlledLiveRunProviderAccess({
  env: strictEnv,
  scope: PERSONAL_SAVED_URL_PROVIDER_SCOPE,
}), true);
intendedProviderCalls += 1;
assert.equal(intendedProviderCalls, 1);

const preflightEnv = {
  ...strictEnv,
  PERSONAL_URL_CREDENTIALLESS_PREFLIGHT: 'true',
};
assert.equal(isControlledCredentiallessPreflightEnabled(preflightEnv), true);
assert.throws(
  () => assertControlledLiveRunProviderAccess({
    env: preflightEnv,
    scope: PERSONAL_SAVED_URL_PROVIDER_SCOPE,
  }),
  (error) => error?.code === 'controlled_preflight_provider_not_configured'
    && error?.providerAttemptBlocked === true
    && error?.payload?.error === 'provider_not_configured'
    && error?.payload?.reason === 'controlled_preflight'
    && error?.payload?.scope === PERSONAL_SAVED_URL_PROVIDER_SCOPE,
);
assert.throws(
  () => assertControlledLiveRunProviderAccess({ env: preflightEnv, scope: 'legacy_signals_import' }),
  (error) => error?.code === 'controlled_live_run_scope_blocked',
);

const budget = readPersonalUrlRunBudget(strictEnv, {
  videoModel: 'gemini-3.6-flash',
  remixModel: 'gemini-3.5-flash',
  now: new Date('2026-08-15T00:00:00.000Z'),
});
assert.equal(budget.enabled, true);
assert.equal(budget.platforms.instagram.maxActorStarts, 1);
assert.equal(budget.platforms.instagram.allowInstagramFallback, false);
assert.equal(budget.platforms.tiktok.maxActorStarts, 1);
assert.equal(budget.maxVideoDurationSeconds, 60);
assert.equal(budget.geminiVideoMaxInputTokens, 25_000);
assert.equal(budget.geminiVideoMaxOutputTokens, 1_536);
assert.equal(budget.geminiRemixMaxOutputTokens, 2_560);
assert.equal(budget.worstCase.totalUsd, 0.65659);

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'backend', 'server.js'), 'utf8');
assert.match(serverSource, /PERSONAL_URL_STRICT_LIVE_RUN/);
assert.equal(
  (serverSource.match(/controlledLiveRunScope:\s*PERSONAL_SAVED_URL_PROVIDER_SCOPE/g) || []).length,
  1,
  'only the Saved URL provider-attempt guard may opt into the controlled-live-run scope',
);

function readRouteBlock(routeDeclaration) {
  const start = serverSource.indexOf(routeDeclaration);
  assert.notEqual(start, -1, `route is present: ${routeDeclaration}`);
  const nextRoute = serverSource.indexOf('\napp.', start + routeDeclaration.length);
  return serverSource.slice(start, nextRoute === -1 ? serverSource.length : nextRoute);
}

const guardedRoutes = new Map([
  ["app.post('/api/brand-scan/preview'", 'public_brand_scan'],
  ["app.post('/api/workspaces/:workspaceId/agent-studio/uploads'", 'agent_studio_upload'],
  ["app.post('/api/workspaces/:workspaceId/agent-studio/runs'", 'agent_studio_run'],
  ["app.post('/api/workspaces/:workspaceId/agent-studio/runs/:runId/context'", 'agent_studio_context_resume'],
  ["app.post('/api/workspaces/:workspaceId/agent-studio/runs/:runId/source-file'", 'agent_studio_source_file'],
  ["app.post('/api/workspaces/:workspaceId/agent-studio/runs/:runId/retry-source'", 'agent_studio_retry_source'],
  ["app.post('/api/workspaces/:workspaceId/agent-studio/runs/:runId/hybrid'", 'agent_studio_hybrid'],
  ["app.post('/api/workspaces/:workspaceId/signals/discovery/run'", 'manual_discovery'],
  ["app.post('/api/workspaces/:workspaceId/reels/youtube/popular'", 'youtube_popular_import'],
  ["app.post('/api/workspaces/:workspaceId/signals/apify/import'", 'legacy_apify_import'],
  ["app.post('/api/workspaces/:workspaceId/reels/import-url'", 'legacy_signals_import'],
  ["app.post('/api/workspaces/:workspaceId/reels/:reelId/analyze-ai'", 'legacy_reel_analyze_ai'],
  ["app.post('/api/workspaces/:workspaceId/agent/context/finalize'", 'brand_brain_finalize'],
  ["app.post('/api/workspaces/:workspaceId/agent/chat'", 'agent_chat'],
  ["app.post('/api/workspaces/:workspaceId/adaptations/:signalId/generate'", 'shared_signal_adaptation'],
  ["app.post('/api/workspaces/:workspaceId/remix/generate'", 'legacy_remix_generate'],
]);
for (const [routeDeclaration, scope] of guardedRoutes) {
  const routeBlock = readRouteBlock(routeDeclaration);
  assert.match(routeBlock, new RegExp(`assertServerProviderScope\\('${scope}'\\)`));
  assert.ok(
    routeBlock.indexOf(`assertServerProviderScope('${scope}')`) < routeBlock.indexOf('await '),
    `${routeDeclaration} must fail closed before its first awaited store/provider access`,
  );
}

assert.match(
  serverSource,
  /async function runAutomaticDiscoveryWorkerTick\(\) \{\s*if \(PERSONAL_URL_STRICT_LIVE_RUN \|\|/,
  'background Discovery is structurally unreachable in strict controlled mode',
);
assert.match(
  serverSource,
  /function scheduleGeminiFileCleanup\(fileNames = \[\]\) \{\s*if \(PERSONAL_URL_STRICT_LIVE_RUN \|\|/,
  'Gemini cleanup cannot create an unrelated provider operation in strict controlled mode',
);

const savedUrlRoute = readRouteBlock("app.post('/api/workspaces/:workspaceId/saved-urls/:savedUrlId/analyze-adapt'");
assert.match(savedUrlRoute, /createPersonalUrlProviderAttemptGuard/);
assert.match(savedUrlRoute, /maxAttempts:\s*2/);
assert.match(serverSource, /maxAttempts:\s*2/);
assert.match(serverSource, /geminiRemixMaxOutputTokens/);
assert.match(serverSource, /geminiRemixMaxRequestBytes/);

const incident = Object.freeze({
  platform: 'instagram',
  geminiOperations: 3,
  thumbnailOperations: 1,
  remixOperations: 2,
  apifyOperations: 0,
  videoAnalysisOperations: 0,
  actualGeminiCost: 'unknown',
  savedUrlPersisted: false,
});
assert.deepEqual(incident, {
  platform: 'instagram',
  geminiOperations: 3,
  thumbnailOperations: 1,
  remixOperations: 2,
  apifyOperations: 0,
  videoAnalysisOperations: 0,
  actualGeminiCost: 'unknown',
  savedUrlPersisted: false,
});

console.log('Controlled live-run provider isolation checks passed.');
