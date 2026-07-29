import assert from 'node:assert/strict';

import {
  MINIMUM_SIGNAL_COMPARABLES,
  buildSignalStrengthEvidence,
  getSignalAgeBucket,
  selectSignalComparables,
} from '../src/signalIntelligenceState.mjs';

assert.equal(getSignalAgeBucket(0), 'launch');
assert.equal(getSignalAgeBucket(6), 'launch');
assert.equal(getSignalAgeBucket(6.1), 'day');
assert.equal(getSignalAgeBucket(24), 'day');
assert.equal(getSignalAgeBucket(24.1), 'early');
assert.equal(getSignalAgeBucket(72.1), 'mature');
assert.equal(getSignalAgeBucket(undefined), 'unknown');

const signal = {
  id: 'target',
  creatorId: 'creator-a',
  platformId: 'youtube',
  niche: 'technology',
  ageHours: 4,
  viewsValue: 1_200,
  likesValue: 120,
  commentsValue: 30,
  sharesValue: 12,
  viewVelocity: 300,
};
const creatorHistory = [
  { id: 'a1', creatorId: 'creator-a', platformId: 'youtube', niche: 'technology', ageHours: 2, viewsValue: 600, likesValue: 60, commentsValue: 10, sharesValue: 6, viewVelocity: 150 },
  { id: 'a2', creatorId: 'creator-a', platformId: 'youtube', niche: 'technology', ageHours: 5, viewsValue: 800, likesValue: 80, commentsValue: 20, sharesValue: 8, viewVelocity: 200 },
  { id: 'a3', creatorId: 'creator-a', platformId: 'youtube', niche: 'technology', ageHours: 6, viewsValue: 1_000, likesValue: 100, commentsValue: 25, sharesValue: 10, viewVelocity: 250 },
  { id: 'wrong-platform', creatorId: 'creator-a', platformId: 'tiktok', niche: 'technology', ageHours: 4, viewsValue: 20_000, viewVelocity: 5_000 },
  { id: 'wrong-age', creatorId: 'creator-a', platformId: 'youtube', niche: 'technology', ageHours: 20, viewsValue: 30_000, viewVelocity: 1_500 },
];

const creatorComparison = selectSignalComparables(signal, creatorHistory);
assert.equal(creatorComparison.scope, 'creator');
assert.deepEqual(creatorComparison.comparables.map(({ id }) => id), ['a1', 'a2', 'a3']);

const creatorEvidence = buildSignalStrengthEvidence(signal, creatorHistory);
assert.equal(creatorEvidence.status, 'ready');
assert.equal(creatorEvidence.confidence, 'low');
assert.equal(creatorEvidence.comparableCount, MINIMUM_SIGNAL_COMPARABLES);
assert.equal(creatorEvidence.medians.viewsValue, 800);
assert.equal(creatorEvidence.lifts.viewsValue, 1.5);
assert.equal(creatorEvidence.lifts.viewVelocity, 1.5);
assert.equal(creatorEvidence.medians.savesValue, null);

const cohortHistory = [
  { id: 'b1', creatorId: 'creator-b', platformId: 'youtube', niche: 'technology', ageHours: 2 },
  { id: 'c1', creatorId: 'creator-c', platformId: 'youtube', niche: 'technology', ageHours: 3 },
  { id: 'd1', creatorId: 'creator-d', platformId: 'youtube', niche: 'technology', ageHours: 5 },
];
assert.equal(selectSignalComparables(signal, cohortHistory).scope, 'cohort');

const insufficient = buildSignalStrengthEvidence(signal, []);
assert.equal(insufficient.status, 'insufficient');
assert.equal(insufficient.confidence, 'none');
assert.equal(insufficient.comparableCount, 0);
assert.ok(insufficient.missing.includes('reachBaseline'));
assert.ok(insufficient.missing.includes('velocityBaseline'));
assert.ok(insufficient.missing.includes('intentBaseline'));

console.log('Signal intelligence normalization checks passed.');
