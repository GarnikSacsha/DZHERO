const assert = require('node:assert/strict');
const {
  BRAND_BRAIN_SCHEMA_VERSION,
  REQUIRED_BRAND_ANSWER_FIELDS,
  normalizeBrandAnswers,
  getMissingBrandAnswers,
  isBrandBrainV2Complete,
  normalizeBrandBrainDraft,
  projectBrandBrainCompatibility,
  isBrandContextComplete,
  buildBrandAnswerFingerprint,
} = require('../backend/services/brandBrainV2.cjs');

assert.equal(BRAND_BRAIN_SCHEMA_VERSION, 2);
assert.deepEqual(REQUIRED_BRAND_ANSWER_FIELDS, [
  'profileDescription',
  'audience',
  'niche',
  'market',
]);

const answers = normalizeBrandAnswers({
  profileDescription: '  Coffee and breakfast for busy mornings  ',
  audience: 'Kyiv commuters',
  niche: 'Coffee shop',
  market: 'Kyiv, Ukraine',
  instagramUrl: 'https://instagram.com/northstar',
});
assert.equal(answers.profileDescription, 'Coffee and breakfast for busy mornings');
assert.equal(answers.instagramUrl, 'https://instagram.com/northstar');
assert.deepEqual(normalizeBrandAnswers({
  profileDescription: 123,
  audience: true,
  niche: null,
  market: false,
}), {
  profileDescription: '',
  audience: '',
  niche: '',
  market: '',
  instagramUrl: '',
});
assert.equal(
  normalizeBrandAnswers({ instagramUrl: 'https://instagram.com/northstar#about' }).instagramUrl,
  'https://instagram.com/northstar',
);
assert.equal(normalizeBrandAnswers({ instagramUrl: 'https://example.com/northstar' }).instagramUrl, '');
assert.equal(normalizeBrandAnswers({ instagramUrl: 'ftp://instagram.com/northstar' }).instagramUrl, '');
assert.deepEqual(getMissingBrandAnswers(answers), []);
assert.equal(isBrandBrainV2Complete({ schemaVersion: 2, answers }), true);
assert.equal(isBrandBrainV2Complete({
  schemaVersion: 2,
  answers: { ...answers, market: '' },
}), false);

const draft = normalizeBrandBrainDraft({
  currentStep: 9,
  answers: { profileDescription: 'Coffee', instagramUrl: 'not-a-url' },
});
assert.equal(draft.currentStep, 4);
assert.equal(draft.answers.instagramUrl, '');
assert.equal(isBrandContextComplete({ brandBrainDraft: draft }), false);

const legacy = {
  businessType: 'Coffee shop',
  product: 'Coffee and breakfast',
  audience: 'Kyiv commuters',
  offer: 'Breakfast set',
  cta: 'Visit before work',
  toneOfVoice: 'Warm',
  location: 'Kyiv',
};
assert.equal(isBrandContextComplete(legacy), true);

const projected = projectBrandBrainCompatibility({
  schemaVersion: 2,
  answers,
  derivedBrief: {
    offer: 'A clear breakfast option',
    cta: 'Visit this morning',
    toneOfVoice: 'Warm and concise',
  },
});
assert.equal(projected.product, answers.profileDescription);
assert.equal(projected.businessType, answers.niche);
assert.equal(projected.location, answers.market);
assert.equal(projected.offer, 'A clear breakfast option');

assert.equal(
  buildBrandAnswerFingerprint(answers),
  buildBrandAnswerFingerprint({ ...answers }),
);
assert.notEqual(
  buildBrandAnswerFingerprint(answers),
  buildBrandAnswerFingerprint({ ...answers, market: 'Lviv, Ukraine' }),
);
assert.equal(
  buildBrandAnswerFingerprint({ ...answers, instagramUrl: 'https://instagram.com/northstar#about' }),
  buildBrandAnswerFingerprint({ ...answers, instagramUrl: 'https://instagram.com/northstar' }),
);

console.log('Brand Brain V2 contract tests passed');
