import assert from 'node:assert/strict';

import {
  DEFAULT_CHANNEL_FILTERS,
  buildChannelRecommendations,
  filterChannelRecords,
  readStoredChannelIds,
  sortChannelRecords,
} from '../src/channelViewState.mjs';

const channels = [
  {
    id: 'tech',
    collectedId: 'collected-tech',
    name: 'Tech Daily',
    handle: '@tech',
    platform: 'youtube',
    niche: 'technology',
    language: 'en',
    market: 'us',
    avgViewsValue: 750_000,
    aiMatchValue: 88,
    collectedAt: '2026-07-28T10:00:00Z',
    taxonomy: { niches: ['technology'], languages: ['en'], markets: ['us'], mechanics: ['tutorial'] },
  },
  {
    id: 'food',
    collectedId: 'collected-food',
    name: 'Food Lab',
    handle: '@food',
    platform: 'tiktok',
    niche: 'food',
    language: 'uk',
    market: 'ua',
    avgViewsValue: 220_000,
    aiMatchValue: 93,
    collectedAt: '2026-07-29T10:00:00Z',
    rising: true,
    taxonomy: { niches: ['food'], languages: ['uk'], markets: ['ua'], mechanics: ['recipe'] },
  },
  { id: 'invented-without-collected-id', name: 'Do not render', platform: 'youtube' },
];

assert.deepEqual(filterChannelRecords(channels).map(({ id }) => id), ['tech', 'food']);
assert.deepEqual(filterChannelRecords(channels, { ...DEFAULT_CHANNEL_FILTERS, platform: 'tiktok' }).map(({ id }) => id), ['food']);
assert.deepEqual(filterChannelRecords(channels, { ...DEFAULT_CHANNEL_FILTERS, niche: 'technology' }).map(({ id }) => id), ['tech']);
assert.deepEqual(filterChannelRecords(channels, { ...DEFAULT_CHANNEL_FILTERS, aiMatch: 'match90' }).map(({ id }) => id), ['food']);
assert.deepEqual(filterChannelRecords(channels, { ...DEFAULT_CHANNEL_FILTERS, avgViews: 'views500k' }).map(({ id }) => id), ['tech']);
assert.deepEqual(filterChannelRecords(channels, DEFAULT_CHANNEL_FILTERS, { activeTab: 'following', trackedIds: new Set(['tech']) }).map(({ id }) => id), ['tech']);
assert.deepEqual(filterChannelRecords(channels, DEFAULT_CHANNEL_FILTERS, { activeTab: 'favorites', favoriteIds: new Set(['food']) }).map(({ id }) => id), ['food']);
assert.deepEqual(filterChannelRecords(channels, DEFAULT_CHANNEL_FILTERS, { activeTab: 'trending' }).map(({ id }) => id), ['food']);
assert.deepEqual(filterChannelRecords(channels, DEFAULT_CHANNEL_FILTERS, { query: 'lab' }).map(({ id }) => id), ['food']);

assert.deepEqual(sortChannelRecords(channels.slice(0, 2), 'avgViews').map(({ id }) => id), ['tech', 'food']);
assert.deepEqual(sortChannelRecords(channels.slice(0, 2), 'aiMatch').map(({ id }) => id), ['food', 'tech']);
assert.deepEqual(sortChannelRecords(channels.slice(0, 2), 'newest').map(({ id }) => id), ['food', 'tech']);

const recommendations = buildChannelRecommendations(channels, {
  niche: 'technology',
  language: 'en',
  market: 'us',
  mechanics: ['tutorial'],
});
assert.equal(recommendations.status, 'ready');
assert.deepEqual(recommendations.recommendations.map(({ channelId }) => channelId), ['tech']);
assert.equal(recommendations.recommendations[0].reason, 'nicheOverlap');
assert.equal(buildChannelRecommendations(channels, null).status, 'insufficient');
assert.equal(buildChannelRecommendations([], { niche: 'food' }).status, 'insufficient');

const storage = {
  getItem: () => JSON.stringify(['tech', 'invented-without-collected-id', 'missing']),
};
assert.deepEqual([...readStoredChannelIds(storage, 'key', ['tech', 'food'])], ['tech']);

console.log('Channel view-state and recommendation checks passed.');
