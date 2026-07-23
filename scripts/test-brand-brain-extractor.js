const assert = require('node:assert/strict');
const {
  buildBrandBrainEnrichment,
  buildDerivedBrandBrainV2,
  buildGeminiBrandBrainPrompt,
  shouldUseApifyForBrandScan,
} = require('../backend/services/brandBrainExtractor.cjs');

async function testSparseInstagramProfileDoesNotInventBrandFacts() {
  const result = await buildBrandBrainEnrichment({
    input: 'https://www.instagram.com/car_finder_/',
    metadata: { source: { tone: 'instagram' }, sourceStatus: 'instagram_web_profile', handle: '@car_finder_', title: '1,642 Followers, 55 Following, 322 Posts - See Instagram photos and videos', stats: { followers: '1,642', following: '55', posts: '322' } },
    geminiClient: async () => 'not json',
  });
  assert.equal(result.brief.brandName, '@car_finder_');
  for (const field of ['businessType', 'product', 'audience', 'offer', 'cta', 'toneOfVoice']) assert.equal(result.brief[field], '');
  assert.match(result.brief.proof, /1,642 followers/);
  assert.deepEqual(result.missingFields, ['businessType', 'product', 'audience', 'offer', 'cta', 'toneOfVoice']);
  assert.deepEqual(result.brief.sourceLinks, ['https://www.instagram.com/car_finder_/']);
}

async function testGeminiRequiredFactsNeedSubmittedEvidence() {
  const base = { input: 'https://example.com/shop https://EXAMPLE.com/shop#about', metadata: { description: 'Acme sells coffee. Visit Acme today.' } };
  const unsupported = await buildBrandBrainEnrichment({ ...base, geminiClient: async () => JSON.stringify({ businessType: 'coffee shop', product: 'coffee', audience: 'office workers', offer: 'discount', cta: 'Visit Acme today', toneOfVoice: 'warm', evidenceByField: { cta: ['Visit Acme today'] } }) });
  assert.match(unsupported.brief.businessType, /coffee|кафе/i);
  assert.equal(unsupported.brief.audience, '');
  assert.equal(unsupported.brief.cta, 'Visit Acme today');
  assert.deepEqual(unsupported.brief.sourceLinks, ['https://example.com/shop']);
  assert.deepEqual(unsupported.missingFields, ['product', 'audience', 'offer', 'toneOfVoice']);

  const grounded = await buildBrandBrainEnrichment({ ...base, geminiClient: async () => JSON.stringify({ businessType: 'coffee shop', evidenceByField: { businessType: ['Acme sells coffee'] } }) });
  assert.equal(grounded.brief.businessType, 'coffee shop');
}

async function testGeminiRejectsSocialProofAsBusinessFact() {
  const result = await buildBrandBrainEnrichment({
    input: 'https://instagram.com/acme',
    metadata: { description: '10K views on Instagram' },
    geminiClient: async () => JSON.stringify({
      product: '10K views',
      evidenceByField: { product: ['10K views'] },
    }),
  });
  assert.equal(result.brief.product, '');
  assert.ok(result.missingFields.includes('product'));
}

async function testGeminiRejectsLabelFirstMetricsAndPlatformBoilerplate() {
  for (const [source, product] of [
    ['Followers: 10K', 'Followers: 10K'],
    ['Instagram profile', 'Instagram profile'],
    ['YouTube Channel', 'YouTube Channel'],
  ]) {
    const result = await buildBrandBrainEnrichment({
      input: 'https://instagram.com/acme',
      metadata: { description: source },
      geminiClient: async () => JSON.stringify({ product, evidenceByField: { product: [source] } }),
    });
    assert.equal(result.brief.product, '');
    assert.ok(result.missingFields.includes('product'));
  }
}

async function testGeminiDoesNotTreatSubmittedUrlOrHandleAsEvidence() {
  const result = await buildBrandBrainEnrichment({
    input: 'https://www.instagram.com/car_finder_/',
    metadata: { handle: '@car_finder_', title: 'car_finder_', description: 'Public profile' },
    geminiClient: async () => JSON.stringify({
      product: 'car_finder_',
      evidenceByField: { product: ['car_finder_'] },
    }),
  });
  assert.equal(result.brief.product, '');
  assert.ok(result.missingFields.includes('product'));
}

async function testGeminiAcceptsGroundedManualDescriptionEvidence() {
  const result = await buildBrandBrainEnrichment({
    input: 'Kyiv coffee shop with breakfasts; book via Direct',
    metadata: { sourceStatus: 'manual_text' },
    geminiClient: async () => JSON.stringify({
      businessType: 'coffee shop',
      product: 'breakfasts',
      cta: 'book via Direct',
      audience: 'office workers',
      evidenceByField: {
        businessType: ['Kyiv coffee shop'],
        product: ['breakfasts'],
        cta: ['book via Direct'],
      },
    }),
  });
  assert.equal(result.brief.businessType, 'coffee shop');
  assert.equal(result.brief.product, 'breakfasts');
  assert.equal(result.brief.cta, 'book via Direct');
  assert.equal(result.brief.audience, '');
}

async function testGeminiUsesSanitizedAnalysisTextAsGroundedEvidence() {
  let prompt = '';
  const result = await buildBrandBrainEnrichment({
    input: 'https://www.instagram.com/car_finder_/',
    metadata: {
      handle: '@car_finder_',
      analysisText: 'Kyiv coffee shop with breakfasts; book via Direct. https://example.com/hidden @car_finder_ car_finder_',
    },
    geminiClient: async (candidate) => {
      prompt = candidate;
      return JSON.stringify({
        businessType: 'coffee shop',
        product: 'breakfasts',
        cta: 'book via Direct',
        evidenceByField: {
          businessType: ['Kyiv coffee shop'],
          product: ['breakfasts'],
          cta: ['book via Direct'],
        },
      });
    },
  });
  assert.match(prompt, /Kyiv coffee shop with breakfasts; book via Direct/i);
  assert.doesNotMatch(prompt, /https:\/\/example\.com\/hidden|@car_finder_|car_finder_/i);
  assert.equal(result.brief.businessType, 'coffee shop');
  assert.equal(result.brief.product, 'breakfasts');
  assert.equal(result.brief.cta, 'book via Direct');
}

function testPromptAndApifyGuards() {
  const prompt = buildGeminiBrandBrainPrompt({ input: '@acme', metadata: { description: 'coffee' } });
  assert.match(prompt, /evidenceByField/);
  assert.match(prompt, /exact snippet/i);
  assert.equal(shouldUseApifyForBrandScan('https://www.instagram.com/acme/', { sourceStatus: 'url_only' }), true);
  assert.equal(shouldUseApifyForBrandScan('https://www.instagram.com/reel/abc/', { sourceStatus: 'url_only' }), false);
  assert.equal(shouldUseApifyForBrandScan('manual business text', { sourceStatus: 'manual_text' }), false);
}

async function testVersion2DerivedContextNeedsGroundedEvidence() {
  let sanitizedPrompt = null;
  const derived = await buildDerivedBrandBrainV2({
    answers: {
      profileDescription: 'Coffee and fast breakfasts',
      audience: 'Busy commuters',
      niche: 'Coffee shop',
      market: 'Kyiv',
      instagramUrl: 'https://instagram.com/raw_handle',
    },
    instagramMetadata: {
      handle: '@raw_handle',
      description: 'Verified Kyiv coffee and breakfasts @raw_handle',
    },
    geminiClient: async (prompt) => {
      sanitizedPrompt = JSON.parse(prompt);
      return JSON.stringify({
        summary: 'Kyiv coffee and breakfast for commuters',
        offer: 'A fast breakfast option',
        cta: 'Visit before work',
        toneOfVoice: 'Warm and concise',
        evidenceByField: {
          summary: ['Coffee and fast breakfasts', 'Busy commuters', 'Kyiv'],
          offer: ['fast breakfasts'],
          cta: [],
          toneOfVoice: [],
        },
      });
    },
  });
  assert.deepEqual(Object.keys(sanitizedPrompt.answers).sort(), [
    'audience',
    'market',
    'niche',
    'profileDescription',
  ]);
  assert.doesNotMatch(JSON.stringify(sanitizedPrompt), /instagram\.com\/raw_handle|@raw_handle/);
  assert.equal(derived.summary, 'Kyiv coffee and breakfast for commuters');
  assert.equal(derived.offer, 'A fast breakfast option');
  assert.equal(derived.cta, '');
  assert.equal(derived.toneOfVoice, '');

  const ungroundedOffer = await buildDerivedBrandBrainV2({
    answers: {
      profileDescription: 'Coffee and fast breakfasts',
      audience: 'Busy commuters',
      niche: 'Coffee shop',
      market: 'Kyiv',
      instagramUrl: '',
    },
    geminiClient: async () => JSON.stringify({
      offer: 'Free cars for every customer',
      evidenceByField: { offer: ['Coffee'] },
    }),
  });
  assert.equal(ungroundedOffer.offer, '');
  assert.deepEqual(ungroundedOffer.evidenceByField, {});

  const undercoveredOffer = await buildDerivedBrandBrainV2({
    answers: {
      profileDescription: 'Coffee and fast breakfasts',
      audience: 'Busy commuters',
      niche: 'Coffee shop',
      market: 'Kyiv',
      instagramUrl: '',
    },
    geminiClient: async () => JSON.stringify({
      offer: 'Coffee shop gives every customer a free car',
      evidenceByField: { offer: ['Coffee shop'] },
    }),
  });
  assert.equal(undercoveredOffer.offer, '');
  assert.deepEqual(undercoveredOffer.evidenceByField, {});
}

(async () => {
  await testSparseInstagramProfileDoesNotInventBrandFacts();
  await testGeminiRequiredFactsNeedSubmittedEvidence();
  await testGeminiRejectsSocialProofAsBusinessFact();
  await testGeminiRejectsLabelFirstMetricsAndPlatformBoilerplate();
  await testGeminiDoesNotTreatSubmittedUrlOrHandleAsEvidence();
  await testGeminiAcceptsGroundedManualDescriptionEvidence();
  await testGeminiUsesSanitizedAnalysisTextAsGroundedEvidence();
  await testVersion2DerivedContextNeedsGroundedEvidence();
  testPromptAndApifyGuards();
  console.log('brand brain extractor tests passed');
})();
