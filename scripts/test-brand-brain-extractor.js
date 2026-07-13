const assert = require('node:assert/strict');

const {
  buildBrandBrainEnrichment,
  buildGeminiBrandBrainPrompt,
  shouldUseApifyForBrandScan,
} = require('../backend/services/brandBrainExtractor.cjs');

const apifySignals = [
  {
    title: 'Ранкова кава + круасан біля ратуші',
    caption: 'Сніданки щодня з 8:00. Напиши в Direct, щоб забронювати столик у Чернівцях.',
    views: 12400,
    likes: 880,
    comments: 42,
    sourceUrl: 'https://www.instagram.com/reel/abc/',
    importedMetadata: {
      handle: '@bacara_coffee',
      stats: { views: 12400, likes: 880, comments: 42 },
      description: 'міське кафе, кава, сніданки, десерти',
    },
  },
  {
    title: 'Матча, десерти і тихий дворик',
    caption: 'Коли хочеться кави без поспіху. Збережи, щоб не загубити Bacara у Чернівцях.',
    views: 7300,
    likes: 410,
    comments: 19,
    sourceUrl: 'https://www.instagram.com/reel/def/',
    importedMetadata: {
      handle: '@bacara_coffee',
      stats: { views: 7300, likes: 410, comments: 19 },
    },
  },
];

async function testGeminiStructuredDraftWins() {
  const result = await buildBrandBrainEnrichment({
    input: 'https://www.instagram.com/bacara_coffee/',
    metadata: {
      source: { label: 'Instagram', tone: 'instagram' },
      sourceStatus: 'instagram_web_profile',
      handle: '@bacara_coffee',
      title: 'Bacara Coffee • Instagram',
      description: 'міське кафе у Чернівцях: кава, сніданки, десерти',
      stats: { followers: '7.5K', posts: '421' },
    },
    apifySignals,
    geminiClient: async (prompt) => {
      assert.match(prompt, /Return only valid JSON/i);
      assert.match(prompt, /Ранкова кава/);
      return JSON.stringify({
        brandName: 'Bacara Coffee',
        businessType: 'міське кафе у Чернівцях',
        product: 'кава, сніданки, десерти і бронювання столика',
        audience: 'люди у Чернівцях, які шукають затишне кафе для сніданку, кави або зустрічі',
        location: 'Чернівці',
        offer: 'зайти на сніданок, каву або десерт у міське кафе без поспіху',
        cta: 'написати в Direct, щоб забронювати столик або уточнити меню',
        toneOfVoice: 'тепло, конкретно, спокійно, без перебільшень',
        proof: '7.5K followers; reels про сніданки і каву мають тисячі переглядів',
        contentPillars: ['сніданки', 'кава', 'атмосфера', 'десерти'],
        keywords: ['кава Чернівці', 'сніданки Чернівці', 'міське кафе'],
        stopTopics: ['не обіцяти найкращу каву без доказів'],
        confidence: 0.86,
        missingFields: ['ціни', 'адреса'],
      });
    },
  });

  assert.equal(result.brief.businessType, 'міське кафе у Чернівцях');
  assert.equal(result.brief.product, 'кава, сніданки, десерти і бронювання столика');
  assert.equal(result.brief.location, 'Чернівці');
  assert.deepEqual(result.brief.contentPillars, ['сніданки', 'кава', 'атмосфера', 'десерти']);
  assert.equal(result.confidence, 0.86);
  assert.deepEqual(result.missingFields, ['ціни', 'адреса']);
  assert.equal(result.sourceStatus, 'brand_brain_gemini');
  assert.equal(result.evidence.apifySignalsUsed, 2);
}

async function testHeuristicFallbackUsesApifyEvidence() {
  const result = await buildBrandBrainEnrichment({
    input: 'https://www.instagram.com/bacara_coffee/',
    metadata: {
      source: { label: 'Instagram', tone: 'instagram' },
      sourceStatus: 'url_only',
      handle: '@bacara_coffee',
      stats: { followers: '7.5K' },
    },
    apifySignals,
    geminiClient: async () => 'not json',
  });

  assert.equal(result.brief.businessType, 'кафе / їжа');
  assert.match(result.brief.product, /кава|сніданки|десерти/i);
  assert.match(result.brief.audience, /Чернівцях|кафе/i);
  assert.match(result.brief.cta, /Direct/i);
  assert.match(result.brief.proof, /7.5K followers/);
  assert.equal(result.sourceStatus, 'brand_brain_heuristic');
  assert.ok(result.confidence < 0.75);
}

function testPromptContainsSourceBoundaries() {
  const prompt = buildGeminiBrandBrainPrompt({
    input: '@bacara_coffee',
    metadata: { handle: '@bacara_coffee', description: 'кава і сніданки' },
    apifySignals,
  });

  assert.match(prompt, /Do not invent facts/i);
  assert.match(prompt, /contentPillars/);
  assert.match(prompt, /@bacara_coffee/);
}

function testApifyRoutingGuard() {
  assert.equal(shouldUseApifyForBrandScan('https://www.instagram.com/bacara_coffee/', { sourceStatus: 'url_only' }), true);
  assert.equal(shouldUseApifyForBrandScan('https://www.instagram.com/reel/abc/', { sourceStatus: 'url_only' }), false);
  assert.equal(shouldUseApifyForBrandScan('кавʼярня у Чернівцях', { sourceStatus: 'manual_text' }), false);
}

(async () => {
  await testGeminiStructuredDraftWins();
  await testHeuristicFallbackUsesApifyEvidence();
  testPromptContainsSourceBoundaries();
  testApifyRoutingGuard();
  console.log('brand brain extractor tests passed');
})();
