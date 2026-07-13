const assert = require('node:assert/strict');

const {
  hasStoredBrandBrain,
  shouldChargeBrandBrainSave,
} = require('../backend/services/brandBrainPersistence.cjs');

assert.equal(hasStoredBrandBrain({}), false);
assert.equal(hasStoredBrandBrain({ updatedAt: '2026-07-13T00:00:00.000Z' }), false);
assert.equal(hasStoredBrandBrain({ product: 'десерти' }), true);
assert.equal(hasStoredBrandBrain({ stopTopics: ['не вигадувати цифри'] }), true);

assert.equal(
  shouldChargeBrandBrainSave({ existingBrief: {}, nextBrief: { product: 'десерти' } }),
  true,
  'first useful Brand Brain save should consume the plan save',
);

assert.equal(
  shouldChargeBrandBrainSave({
    existingBrief: { product: 'старий продукт', updatedAt: '2026-07-13T00:00:00.000Z' },
    nextBrief: { product: 'десерти', audience: 'Чернівці' },
  }),
  false,
  'editing an existing Brand Brain must not be blocked by the one-time save limit',
);

assert.equal(
  shouldChargeBrandBrainSave({ existingBrief: {}, nextBrief: { updatedAt: '2026-07-13T00:00:00.000Z' } }),
  false,
  'empty payload metadata should not consume usage',
);

console.log('brand brain persistence tests passed');
