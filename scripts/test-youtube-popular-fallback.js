const assert = require('node:assert/strict');
const {
  getYouTubeShortsSearchQueries,
  shouldRetryPopularWithoutCategory,
} = require('../backend/services/youtubePopularFallback.cjs');

const notFound = new Error('Requested entity was not found.');
notFound.status = 404;
notFound.payload = {
  error: {
    code: 404,
    message: 'Requested entity was not found.',
    errors: [{ reason: 'videoChartNotFound', message: 'Requested entity was not found.' }],
  },
};

assert.equal(
  shouldRetryPopularWithoutCategory(notFound, '27'),
  true,
  'YouTube mostPopular category 404 should retry without category',
);

assert.equal(
  shouldRetryPopularWithoutCategory(notFound, ''),
  false,
  'requests without category should not retry endlessly',
);

const quotaError = new Error('The request cannot be completed because you have exceeded your quota.');
quotaError.status = 403;
quotaError.payload = { error: { errors: [{ reason: 'quotaExceeded' }] } };

assert.equal(
  shouldRetryPopularWithoutCategory(quotaError, '27'),
  false,
  'quota errors should not be hidden by category fallback',
);

assert.deepEqual(
  getYouTubeShortsSearchQueries('23'),
  ['funny shorts', 'comedy shorts', 'viral funny shorts'],
  'comedy category should search for actual Shorts queries',
);

assert.ok(
  getYouTubeShortsSearchQueries('').includes('viral shorts'),
  'fallback should still target Shorts, not generic videos',
);

console.log('youtube popular fallback tests passed');
