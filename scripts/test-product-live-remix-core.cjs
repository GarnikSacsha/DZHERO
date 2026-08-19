'use strict';

const assert = require('node:assert/strict');
const youtubeFixture = require('./fixtures/product-live-youtube-source.cjs');
const {
  resolveWorkspaceGenerationBrand,
  getPopulatedGenerationBrandFieldNames,
} = require('../backend/services/productBrandBrain.cjs');
const {
  buildRemixGenerationPayload,
  buildRemixGenerationCacheKey,
  generateProductLiveRemix,
  normalizeRemixSourceContext,
} = require('../backend/services/productLiveRemix.cjs');
const {
  classifyGeminiProviderResult,
  getRemixRetryDecision,
} = require('../backend/services/remixEngine.js');

const clone = (value) => JSON.parse(JSON.stringify(value));
const productBrand = {
  version: 1,
  id: 'brand_product',
  name: 'Product Brand',
  updatedAt: '2026-08-19T08:00:00.000Z',
  brain: {
    profileDescription: 'Automation consulting for small product teams',
    audience: 'small product teams',
    niche: 'AI automation',
    market: 'Ukraine',
    product: 'workflow audit',
    toneOfVoice: 'clear and practical',
  },
};
const legacyBrief = {
  niche: 'legacy coffee',
  product: 'legacy dessert',
  location: 'Legacy City',
  audience: 'legacy audience',
};

const productResolution = resolveWorkspaceGenerationBrand({
  id: 'ws_product',
  productBrandBrain: productBrand,
  brief: legacyBrief,
}, { niche: '', location: '', toneOfVoice: '' });
assert.equal(productResolution.brandSource, 'product_brand_brain');
assert.equal(productResolution.generationBrand.niche, 'AI automation');
assert.equal(productResolution.generationBrand.product, 'workflow audit');
assert.equal(productResolution.generationBrand.location, 'Ukraine');
assert.equal(productResolution.generationBrand.toneOfVoice, 'clear and practical');
assert.equal(productResolution.brandSnapshot.id, productBrand.id);
assert.equal(productResolution.brandSnapshot.brain.audience, productBrand.brain.audience);
assert.equal(productResolution.brandSnapshot.brain.product, productBrand.brain.product);
assert.equal(productResolution.completeness, 'complete');
assert.deepEqual(productResolution.missingFields, []);

const sourceCompleteWithOptionalNicheMarket = resolveWorkspaceGenerationBrand({
  id: 'ws_thin_product_brand',
  productBrandBrain: {
    version: 1,
    id: 'brand_thin_projection',
    name: 'Thin Product Brand',
    brain: {
      profileDescription: 'Synthetic workflow coaching for small product teams',
      audience: 'small product teams',
      niche: '',
      market: '',
    },
  },
});
assert.deepEqual({
  sourceCompleteness: sourceCompleteWithOptionalNicheMarket.sourceCompleteness,
  generationCompleteness: sourceCompleteWithOptionalNicheMarket.generationCompleteness,
  generationMissingFields: sourceCompleteWithOptionalNicheMarket.generationMissingFields,
  readyForBrandMode: sourceCompleteWithOptionalNicheMarket.complete,
}, {
  sourceCompleteness: 'complete',
  generationCompleteness: 'complete',
  generationMissingFields: [],
  readyForBrandMode: true,
}, 'niche and market remain optional for a source-complete Product Brand');
assert.equal(
  getPopulatedGenerationBrandFieldNames(sourceCompleteWithOptionalNicheMarket.generationBrand).includes('audience'),
  true,
  'populated brand telemetry must count audience',
);
assert.deepEqual(productResolution.generationBrandSnapshot, productResolution.generationBrand);
assert.equal(productResolution.brandSnapshot.brain.profileDescription, productBrand.brain.profileDescription);

const overridden = resolveWorkspaceGenerationBrand({ productBrandBrain: productBrand }, {
  niche: '',
  location: 'Lviv',
  toneOfVoice: '   ',
  audience: 'founder-led teams',
  forbidden: 'ignored',
});
assert.equal(overridden.generationBrand.niche, 'AI automation', 'empty override must not erase Product Brand Brain');
assert.equal(overridden.generationBrand.location, 'Lviv');
assert.equal(overridden.generationBrand.toneOfVoice, 'clear and practical');
assert.equal(overridden.generationBrand.audience, 'founder-led teams');
assert.equal(overridden.generationBrand.forbidden, undefined);

const fallback = resolveWorkspaceGenerationBrand({ id: 'ws_legacy', brief: legacyBrief }, {});
assert.equal(fallback.brandSource, 'legacy_brief');
assert.equal(fallback.generationBrand.niche, 'legacy coffee');
assert.deepEqual(fallback.brandSnapshot, legacyBrief);

const fixtureBefore = JSON.stringify(youtubeFixture);
const youtubeSource = normalizeRemixSourceContext(clone(youtubeFixture));
const built = buildRemixGenerationPayload(youtubeSource, productResolution.generationBrand, {
  targetLanguage: 'uk',
  maxInputTokens: 30_000,
  maxRequestBytes: 500_000,
});
assert.equal(JSON.stringify(youtubeFixture), fixtureBefore, 'payload construction must not mutate sourceContext');
assert.equal(built.payload.source.platform, 'youtube');
assert.equal(built.payload.source.metadata.durationSeconds, 41);
assert.equal(built.payload.source.originalLanguage, 'en');
assert.equal(built.payload.source.analysisLanguage, 'en');
assert.equal(built.payload.source.transcript.segments.length, 3);
assert.equal(built.payload.source.transcript.text, undefined, 'timestamped segments are canonical when available');
assert.equal(built.payloadDiagnostics.includedTranscriptSegmentCount, 3);
assert.ok(built.payloadDiagnostics.removedDuplicates.includes('transcript.text'));
assert.equal((JSON.stringify(built.payload).match(/Unique transcript fixture:/g) || []).length, 1, 'transcript must occur once in prompt payload');

for (const field of ['metadata', 'transcript', 'videoIntelligence', 'visual', 'analysis', 'readiness', 'grounding', 'diagnostic']) {
  assert.deepEqual(youtubeSource[field], youtubeFixture[field], `${field} must survive source normalization`);
}
for (const field of ['videoSummary', 'hook', 'contentMechanic', 'observations', 'scenes', 'sceneBeats', 'shotList', 'soundMusicCues', 'confidence', 'limitations']) {
  assert.deepEqual(youtubeSource.videoIntelligence.video[field], youtubeFixture.videoIntelligence.video[field], `${field} must survive adaptation preparation`);
}

const sourceKeys = ['instagram', 'tiktok', 'youtube'].map((platform) => normalizeRemixSourceContext({
  sourceType: 'personal_url',
  platform,
  canonicalUrl: `https://example.test/${platform}/video`,
  metadata: { title: `${platform} title` },
  transcript: { status: 'unavailable', text: '', segments: [] },
}));
assert.deepEqual(sourceKeys.map((source) => Object.keys(source).sort()), [
  Object.keys(sourceKeys[0]).sort(),
  Object.keys(sourceKeys[0]).sort(),
  Object.keys(sourceKeys[0]).sort(),
]);

const cacheA = buildRemixGenerationCacheKey({
  sourceContext: youtubeSource,
  generationBrandKey: productResolution.generationBrandKey,
  targetLanguage: 'uk',
});
const cacheARepeat = buildRemixGenerationCacheKey({
  sourceContext: clone(youtubeSource),
  generationBrandKey: productResolution.generationBrandKey,
  targetLanguage: 'uk',
});
const cacheLanguageChanged = buildRemixGenerationCacheKey({
  sourceContext: youtubeSource,
  generationBrandKey: productResolution.generationBrandKey,
  targetLanguage: 'en',
});
const changedBrand = resolveWorkspaceGenerationBrand({
  productBrandBrain: { ...productBrand, brain: { ...productBrand.brain, audience: 'enterprise operators' } },
});
const cacheBrandChanged = buildRemixGenerationCacheKey({
  sourceContext: youtubeSource,
  generationBrandKey: changedBrand.generationBrandKey,
  targetLanguage: 'uk',
});
assert.equal(cacheA, cacheARepeat);
assert.notEqual(cacheA, cacheLanguageChanged);
assert.notEqual(cacheA, cacheBrandChanged);

assert.throws(() => buildRemixGenerationPayload(youtubeSource, productResolution.generationBrand, {
  targetLanguage: 'uk',
  maxInputTokens: 10,
  maxRequestBytes: 80,
}), (error) => (
  error.code === 'remix_input_budget_exceeded'
  && error.status === 413
  && error.payload?.diagnostic?.originalSizeBytes > error.payload?.diagnostic?.maxRequestBytes
));

assert.equal(classifyGeminiProviderResult({ finishReason: 'MAX_TOKENS' }).category, 'output_token_limit');
assert.equal(classifyGeminiProviderResult({ finishReason: 'PROHIBITED_CONTENT' }).category, 'provider_content_blocked');
assert.equal(classifyGeminiProviderResult({ finishReason: 'SAFETY' }).category, 'provider_content_blocked');
assert.equal(classifyGeminiProviderResult({ status: 429, error: new Error('rate limited') }).category, 'provider_rate_limited');
assert.equal(classifyGeminiProviderResult({ status: 504, error: new Error('timeout') }).category, 'provider_timeout');
assert.equal(classifyGeminiProviderResult({ status: 500, error: new Error('transport') }).category, 'provider_transport');
assert.equal(getRemixRetryDecision({ category: 'provider_content_blocked', attempt: 1 }).retry, false);
assert.equal(getRemixRetryDecision({ category: 'invalid_provider_json', attempt: 1 }).retry, true);
assert.equal(getRemixRetryDecision({ category: 'invalid_provider_json', attempt: 2 }).retry, false);
assert.equal(getRemixRetryDecision({ category: 'output_token_limit', attempt: 1 }).retry, true);
assert.equal(getRemixRetryDecision({ category: 'provider_rate_limited', attempt: 1 }).retry, true);
assert.equal(getRemixRetryDecision({ category: 'provider_timeout', attempt: 1 }).retry, true);
assert.equal(getRemixRetryDecision({ category: 'provider_transport', attempt: 1 }).retry, true);

const legacyResolution = resolveWorkspaceGenerationBrand({ productBrandBrain: productBrand, brief: legacyBrief }, {});
assert.deepEqual(legacyResolution.brandSnapshot, productResolution.brandSnapshot, 'new and legacy route resolution must share a snapshot');
assert.equal(legacyResolution.generationBrandKey, productResolution.generationBrandKey, 'identical Product Brand resolution must share a key');

const productionScript = {
  title: 'Production script',
  hook: 'Show the proof first.',
  visualFlow: [{ timeframe: '0:00-0:03', actionDescription: 'Show the empty board.', onScreenText: 'BEFORE', audioVoiceover: 'Почни з доказу.' }],
  cta: 'Напиши СХЕМА.',
};
const persistedAdaptation = clone({
  sourceContext: youtubeSource,
  brandSnapshot: productResolution.brandSnapshot,
  result: { remixes: [productionScript] },
});
assert.deepEqual(persistedAdaptation.sourceContext, youtubeSource);
assert.deepEqual(persistedAdaptation.brandSnapshot, productResolution.brandSnapshot);
assert.deepEqual(persistedAdaptation.result.remixes[0], productionScript);

(async () => {
  let optionalProjectionProviderCalled = false;
  await generateProductLiveRemix({
    sourceContext: youtubeSource,
    brandResolution: sourceCompleteWithOptionalNicheMarket,
    generator: async () => {
      optionalProjectionProviderCalled = true;
      return { remixes: [] };
    },
  });
  assert.equal(optionalProjectionProviderCalled, true, 'missing optional niche and market must not block generation');
  console.log('product live remix core contract tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
