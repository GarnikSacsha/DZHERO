const assert = require('node:assert/strict');
const { getAllowedBatchSize } = require('../backend/services/usageLimits.cjs');

assert.equal(
  getAllowedBatchSize({ requested: 8, limit: 3, used: 0, unlimited: false }),
  3,
  'batch imports should be capped to the remaining plan allowance',
);

assert.equal(
  getAllowedBatchSize({ requested: 8, limit: 30, used: 28, unlimited: false }),
  2,
  'batch imports should respect partially used limits',
);

assert.equal(
  getAllowedBatchSize({ requested: 8, limit: 3, used: 3, unlimited: false }),
  0,
  'batch imports should return zero when no allowance remains',
);

assert.equal(
  getAllowedBatchSize({ requested: 8, limit: 3, used: 3, unlimited: true }),
  8,
  'unlimited plans should keep the requested batch size',
);

console.log('usage limit tests passed');
