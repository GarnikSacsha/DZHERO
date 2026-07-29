import assert from 'node:assert/strict';

import {
  DEFAULT_SIGNAL_FILTERS,
  filterSignalCards,
  findSignalBySourceUrl,
  getSupportedSignalPlatform,
  sortSignalCards,
} from '../src/productSignalsViewState.mjs';

const cards = [
  {
    id: 'first',
    platformId: 'youtube',
    niche: 'technology',
    matchValue: 98,
    viewsValue: 1_200_000,
    likesValue: 45_000,
    ageHours: 2,
    publishedOrder: 3,
    sourceUrl: 'https://youtube.com/shorts/first',
  },
  {
    id: 'second',
    platformId: 'instagram',
    niche: 'lifestyle',
    matchValue: 89,
    viewsValue: 850_000,
    likesValue: 120_000,
    ageHours: 8,
    publishedOrder: 2,
    sourceUrl: 'https://instagram.com/reel/second/',
  },
  {
    id: 'unknown',
    platformId: 'tiktok',
    niche: 'food',
    matchValue: 74,
    viewsValue: undefined,
    likesValue: 890_000,
    ageHours: 28,
    publishedOrder: 1,
    sourceUrl: 'https://tiktok.com/@creator/video/123',
  },
];

assert.deepEqual(filterSignalCards(cards).map(({ id }) => id), ['first', 'second', 'unknown']);
assert.deepEqual(filterSignalCards(cards, { ...DEFAULT_SIGNAL_FILTERS, platform: 'instagram' }).map(({ id }) => id), ['second']);
assert.deepEqual(filterSignalCards(cards, { ...DEFAULT_SIGNAL_FILTERS, niche: 'technology' }).map(({ id }) => id), ['first']);
assert.deepEqual(filterSignalCards(cards, { ...DEFAULT_SIGNAL_FILTERS, aiMatch: 'match90' }).map(({ id }) => id), ['first']);
assert.deepEqual(filterSignalCards(cards, { ...DEFAULT_SIGNAL_FILTERS, views: 'views1m' }).map(({ id }) => id), ['first']);
assert.deepEqual(filterSignalCards(cards, { ...DEFAULT_SIGNAL_FILTERS, likes: 'likes500k' }).map(({ id }) => id), ['unknown']);
assert.deepEqual(filterSignalCards(cards, { ...DEFAULT_SIGNAL_FILTERS, date: 'last6h' }).map(({ id }) => id), ['first']);
assert.deepEqual(filterSignalCards(cards, { ...DEFAULT_SIGNAL_FILTERS, creator: 'second' }).map(({ id }) => id), ['second']);
assert.deepEqual(
  filterSignalCards(cards, { ...DEFAULT_SIGNAL_FILTERS, status: 'saved' }, { savedIds: new Set(['second']) }).map(({ id }) => id),
  ['second'],
);
assert.deepEqual(filterSignalCards(cards, DEFAULT_SIGNAL_FILTERS, { directSignalId: 'unknown' }).map(({ id }) => id), ['unknown']);

assert.deepEqual(sortSignalCards(cards, 'match').map(({ id }) => id), ['first', 'second', 'unknown']);
assert.deepEqual(sortSignalCards(cards, 'views').map(({ id }) => id), ['first', 'second', 'unknown']);
assert.deepEqual(sortSignalCards(cards, 'likes').map(({ id }) => id), ['unknown', 'second', 'first']);
assert.deepEqual(sortSignalCards(cards, 'newest').map(({ id }) => id), ['first', 'second', 'unknown']);

assert.equal(getSupportedSignalPlatform('https://instagram.com/reel/second/'), 'instagram');
assert.equal(getSupportedSignalPlatform('https://youtube.com/shorts/first'), 'youtube');
assert.equal(getSupportedSignalPlatform('https://tiktok.com/@creator/video/123'), 'tiktok');
assert.equal(getSupportedSignalPlatform('https://youtube.com/watch?v=first'), '');
assert.equal(getSupportedSignalPlatform('not a url'), '');

assert.equal(findSignalBySourceUrl(cards, 'https://www.instagram.com/reel/second/?utm_source=test')?.id, 'second');
assert.equal(findSignalBySourceUrl(cards, 'https://youtube.com/shorts/missing'), null);

console.log('Product Signals view-state checks passed.');
