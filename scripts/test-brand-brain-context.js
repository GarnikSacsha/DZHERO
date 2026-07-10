const assert = require('node:assert/strict');
const {
  normalizeBrandBrain,
  buildBrandBrainPromptBlock,
  buildBusinessBriefFromBrandBrain,
} = require('../backend/services/brandBrainContext.cjs');
const {
  buildBusinessContext,
  buildAgentSystemInstruction,
} = require('../backend/services/agentEngine');
const { generateHighFidelityFallback } = require('../backend/services/remixEngine');

const readyBrief = {
  businessType: 'pilates studio',
  product: 'first trial class',
  audience: 'busy women in Kyiv who want a gentle start',
  location: 'Kyiv',
  toneOfVoice: 'calm, expert, warm',
  goals: ['book trials', 'build trust'],
  stopTopics: 'fake transformations, medical promises',
  contentFocus: 'short proof-first Reels',
  cta: 'write START in Direct',
  proof: 'real studio process and client questions',
};

const brandBrain = normalizeBrandBrain(readyBrief);
assert.equal(brandBrain.ready, true);
assert.equal(brandBrain.mode, 'brand');
assert.equal(brandBrain.product, 'first trial class');
assert.deepEqual(brandBrain.stopTopics, ['fake transformations', 'medical promises']);

const brief = buildBusinessBriefFromBrandBrain(readyBrief);
assert.equal(brief.niche, 'pilates studio');
assert.equal(brief.product, 'first trial class');
assert.equal(brief.brandBrainReady, true);

const block = buildBrandBrainPromptBlock(readyBrief);
assert.match(block, /Mode: brand/);
assert.match(block, /first trial class/);
assert.match(block, /write START in Direct/);

const empty = normalizeBrandBrain({});
assert.equal(empty.ready, false);
assert.equal(empty.mode, 'consultant');
assert.ok(empty.missing.includes('businessType'));
assert.match(buildBrandBrainPromptBlock({}), /Mode: consultant/);

const agentContext = buildBusinessContext({ brief: readyBrief }, { reels: [], ideas: [], sources: [] });
assert.equal(agentContext.brand.product, 'first trial class');
assert.equal(agentContext.brandBrain.ready, true);
assert.match(buildAgentSystemInstruction(agentContext), /BRAND BRAIN MODE/);
assert.match(buildAgentSystemInstruction(agentContext), /pilates studio/);

const agentEmpty = buildBusinessContext({ brief: {} }, {});
assert.equal(agentEmpty.brandBrain.mode, 'consultant');
assert.equal(agentEmpty.brand.product, '');
assert.match(buildAgentSystemInstruction(agentEmpty), /Do not pretend that default demo values are real user facts/);

const fallback = generateHighFidelityFallback({
  title: 'creator shows a surprising flexibility move',
  hook: 'daily routine changed everything',
  script: 'visual proof -> simple routine -> comment CTA',
  marketingMechanics: 'visual proof -> routine -> CTA',
}, brief);

const serialized = JSON.stringify(fallback);
assert.match(serialized, /pilates studio|first trial class|Kyiv/);
assert.doesNotMatch(serialized, /Cafe|restaurant/i);

console.log('brand brain context tests passed');
