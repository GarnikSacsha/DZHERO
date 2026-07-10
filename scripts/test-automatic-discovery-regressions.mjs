import assert from 'node:assert/strict';
import discovery from '../backend/services/automaticSignalDiscovery.js';

const {
  buildDiscoveryInputs,
  canonicalizeSignalUrl,
  ensureWorkspaceDiscoverySettings,
  executeAutomaticDiscovery,
  getDailyAutomaticSpendSummary,
  prepareAutomaticDiscovery,
  recoverStaleRunningRuns,
} = discovery;

const HOUR_MS = 60 * 60 * 1000;
const start = new Date('2026-07-09T00:00:00.000Z');

const untouchedState = {
  workspaces: [{
    id: 'ws_untouched',
    createdAt: start.toISOString(),
    brief: { niche: 'fitness' },
  }],
  sources: [{
    id: 'source_untouched',
    workspaceId: 'ws_untouched',
    type: 'instagram',
    handle: '@fitlab',
  }],
  competitors: [],
  instagramAccounts: [],
  tiktokAccounts: [],
  reels: [],
  discoveryRuns: [],
};

const persistedDefaults = ensureWorkspaceDiscoverySettings(untouchedState.workspaces[0], start);
assert.equal(untouchedState.workspaces[0].discoverySettings, persistedDefaults);
assert.equal(persistedDefaults.nextRunAt.accounts, '2026-07-09T06:00:00.000Z');
assert.equal(
  ensureWorkspaceDiscoverySettings(untouchedState.workspaces[0], new Date(start.getTime() + HOUR_MS)),
  persistedDefaults,
  'initial settings must be persisted exactly once',
);

const earlyTick = prepareAutomaticDiscovery({
  state: untouchedState,
  workspaceId: 'ws_untouched',
  now: new Date(start.getTime() + HOUR_MS),
});
assert.equal(earlyTick.run, null);
assert.equal(untouchedState.discoveryRuns.length, 0);

const dueTick = prepareAutomaticDiscovery({
  state: untouchedState,
  workspaceId: 'ws_untouched',
  now: new Date(start.getTime() + 6 * HOUR_MS),
});
assert.equal(dueTick.run?.status, 'running');
assert.ok(dueTick.execution);

const repeatedDueTick = prepareAutomaticDiscovery({
  state: untouchedState,
  workspaceId: 'ws_untouched',
  now: new Date(start.getTime() + 6 * HOUR_MS + 60_000),
});
assert.equal(repeatedDueTick.run, null);
assert.equal(untouchedState.discoveryRuns.length, 1);

const emptyState = {
  workspaces: [{
    id: 'ws_empty',
    createdAt: start.toISOString(),
    brief: {},
    discoverySettings: {
      ...discovery.defaultDiscoverySettings(start),
      nextRunAt: {
        accounts: start.toISOString(),
        keywords: '2026-07-10T00:00:00.000Z',
        hashtags: '2026-07-10T00:00:00.000Z',
        trends: '2026-07-10T00:00:00.000Z',
      },
    },
  }],
  sources: [],
  competitors: [],
  instagramAccounts: [],
  tiktokAccounts: [],
  reels: [],
  discoveryRuns: [],
};

const emptyTick = prepareAutomaticDiscovery({
  state: emptyState,
  workspaceId: 'ws_empty',
  now: start,
});
assert.equal(emptyTick.run, null);
assert.equal(emptyState.discoveryRuns.length, 0);
assert.equal(emptyState.workspaces[0].discoverySettings.nextRunAt.accounts, '2026-07-09T06:00:00.000Z');

const repeatedEmptyTick = prepareAutomaticDiscovery({
  state: emptyState,
  workspaceId: 'ws_empty',
  now: new Date(start.getTime() + 60_000),
});
assert.equal(repeatedEmptyTick.run, null);
assert.equal(emptyState.discoveryRuns.length, 0);

const sourceState = {
  workspaces: [{
    id: 'ws_sources',
    discoverySettings: {
      ...discovery.defaultDiscoverySettings(start),
      sourceCheckpoints: {
        instagram: { accounts: 3 },
        tiktok: { accounts: 1 },
      },
    },
  }],
  sources: [
    { id: 'ig_1', workspaceId: 'ws_sources', type: 'instagram', handle: '@ig_one' },
    { id: 'ig_2', workspaceId: 'ws_sources', type: 'instagram_profile', url: 'https://instagram.com/ig_two/?utm_source=x' },
    { id: 'tt_1', workspaceId: 'ws_sources', type: 'tiktok', handle: '@tt_one' },
    { id: 'web_1', workspaceId: 'ws_sources', type: 'website', url: 'https://example.com/company' },
  ],
  competitors: [
    { id: 'ig_cmp', workspaceId: 'ws_sources', platform: 'instagram', handle: '@ig_competitor' },
    { id: 'tt_cmp', workspaceId: 'ws_sources', platform: 'tiktok', handle: '@tt_competitor' },
  ],
  instagramAccounts: [
    { id: 'ig_connected', workspaceId: 'ws_sources', status: 'connected', username: 'ig_connected' },
  ],
  tiktokAccounts: [
    {
      id: 'tt_connected',
      workspaceId: 'ws_sources',
      status: 'connected',
      profileDeepLink: 'https://www.tiktok.com/@tt_connected',
    },
  ],
  reels: [],
};

const sourceInputs = buildDiscoveryInputs(sourceState, 'ws_sources');
assert.ok(sourceInputs.instagram.accounts.includes('@ig_connected'));
assert.ok(sourceInputs.tiktok.accounts.includes('@tt_connected'));
assert.ok(!sourceInputs.instagram.accounts.includes('@tt_one'));
assert.ok(!sourceInputs.tiktok.accounts.includes('@ig_one'));
assert.ok(!sourceInputs.instagram.accounts.some((value) => value.includes('example.com')));
assert.equal(sourceInputs.instagram.accounts[0], '@ig_connected');
assert.equal(sourceInputs.tiktok.accounts[0], '@tt_competitor');

const rotationState = {
  workspaces: [{
    id: 'ws_rotation',
    discoverySettings: {
      ...discovery.defaultDiscoverySettings(start),
      platforms: ['instagram'],
      nextRunAt: {
        accounts: start.toISOString(),
        keywords: '2026-07-10T00:00:00.000Z',
        hashtags: '2026-07-10T00:00:00.000Z',
        trends: '2026-07-10T00:00:00.000Z',
      },
    },
  }],
  sources: ['one', 'two', 'three', 'four'].map((handle) => ({
    id: `rotation_${handle}`,
    workspaceId: 'ws_rotation',
    type: 'instagram',
    handle: `@${handle}`,
  })),
  competitors: [],
  instagramAccounts: [],
  tiktokAccounts: [],
  reels: [],
  discoveryRuns: [],
};
const firstRotationCalls = [];
await executeAutomaticDiscovery({
  state: rotationState,
  workspaceId: 'ws_rotation',
  now: start,
  fetchSignals: async (call) => {
    firstRotationCalls.push(call.inputValue);
    const result = [];
    result.actualCostUsd = 0;
    return result;
  },
});
assert.deepEqual(firstRotationCalls, ['@one', '@two', '@three']);
assert.equal(rotationState.workspaces[0].discoverySettings.sourceCheckpoints.instagram.accounts, 3);

const secondRotationCalls = [];
await executeAutomaticDiscovery({
  state: rotationState,
  workspaceId: 'ws_rotation',
  now: new Date(start.getTime() + 6 * HOUR_MS),
  fetchSignals: async (call) => {
    secondRotationCalls.push(call.inputValue);
    const result = [];
    result.actualCostUsd = 0;
    return result;
  },
});
assert.deepEqual(secondRotationCalls, ['@four', '@one', '@two']);

assert.equal(
  canonicalizeSignalUrl('HTTPS://WWW.Instagram.com/reel/ABC123/?utm_source=test#comments'),
  'https://instagram.com/reel/ABC123',
);
assert.equal(
  canonicalizeSignalUrl('https://instagram.com/reel/ABC123'),
  'https://instagram.com/reel/ABC123',
);
assert.notEqual(
  canonicalizeSignalUrl('https://www.youtube.com/watch?v=AAA111&utm_source=test'),
  canonicalizeSignalUrl('https://youtube.com/watch?v=BBB222'),
  'different YouTube watch videos must not share a discovery identity',
);

const mergeState = {
  workspaces: [{
    id: 'ws_merge',
    discoverySettings: {
      ...discovery.defaultDiscoverySettings(start),
      viralScoreThreshold: 55,
      platforms: ['instagram'],
      nextRunAt: {
        accounts: start.toISOString(),
        keywords: '2026-07-10T00:00:00.000Z',
        hashtags: '2026-07-10T00:00:00.000Z',
        trends: '2026-07-10T00:00:00.000Z',
      },
    },
  }],
  sources: [{ id: 'merge_source', workspaceId: 'ws_merge', type: 'instagram', handle: '@creator' }],
  competitors: [],
  instagramAccounts: [],
  tiktokAccounts: [],
  discoveryRuns: [],
  reels: [{
    id: 'existing_reel',
    workspaceId: 'ws_merge',
    sourceUrl: 'https://instagram.com/reel/ABC123',
    views: 1000,
    likes: 100,
    comments: 10,
    shares: 5,
    saves: 4,
    importedMetadata: {
      provider: 'apify',
      platform: 'instagram',
      url: 'https://instagram.com/reel/ABC123',
      snapshotAt: '2026-07-09T00:00:00.000Z',
    },
  }],
};

const mergeResult = await executeAutomaticDiscovery({
  state: mergeState,
  workspaceId: 'ws_merge',
  now: start,
  fetchSignals: async () => ({
    actualCostUsd: 0.02,
    signals: [{
      id: 'incoming_reel',
      workspaceId: 'ws_merge',
      sourceUrl: 'https://WWW.instagram.com/reel/ABC123/?ref=profile#top',
      views: 100,
      likes: 10,
      comments: 1,
      shares: 0,
      saves: 0,
      importedMetadata: {
        provider: 'apify',
        platform: 'instagram',
        url: 'https://WWW.instagram.com/reel/ABC123/?ref=profile#top',
        snapshotAt: '2026-07-08T23:00:00.000Z',
      },
    }],
  }),
});
assert.equal(mergeResult.updatedSignals.length, 1);
assert.equal(mergeResult.updatedSignals[0].views, 1000);
assert.equal(mergeResult.updatedSignals[0].likes, 100);
assert.equal(mergeState.reels.length, 1);
assert.equal(mergeResult.run.actualCostUsd, 0.02);

const failedState = {
  workspaces: [{
    id: 'ws_failed',
    discoverySettings: {
      ...discovery.defaultDiscoverySettings(start),
      platforms: ['instagram'],
      nextRunAt: {
        accounts: start.toISOString(),
        keywords: '2026-07-10T00:00:00.000Z',
        hashtags: '2026-07-10T00:00:00.000Z',
        trends: '2026-07-10T00:00:00.000Z',
      },
    },
  }],
  sources: [{ id: 'failed_source', workspaceId: 'ws_failed', type: 'instagram', handle: '@failed' }],
  competitors: [],
  instagramAccounts: [],
  tiktokAccounts: [],
  reels: [],
  discoveryRuns: [],
};

const progressTimes = [
  new Date('2026-07-09T00:01:00.000Z'),
  new Date('2026-07-09T00:02:00.000Z'),
  new Date('2026-07-09T00:03:00.000Z'),
];
const progressUpdates = [];
const failedResult = await executeAutomaticDiscovery({
  state: failedState,
  workspaceId: 'ws_failed',
  now: start,
  getCurrentTime: () => progressTimes.shift() || new Date('2026-07-09T00:03:00.000Z'),
  onProgress: async (run) => {
    progressUpdates.push(run.updatedAt);
  },
  fetchSignals: async () => {
    throw new Error('provider_failed');
  },
});
assert.equal(failedResult.run.status, 'failed');
assert.equal(failedResult.run.actualCostUsd, null);
assert.ok(progressUpdates.length >= 2);
const failedRetryAt = Date.parse(failedState.workspaces[0].discoverySettings.nextRunAt.accounts);
assert.ok(failedRetryAt >= start.getTime() + 30 * 60 * 1000);
assert.ok(failedRetryAt <= start.getTime() + 6 * HOUR_MS);

const failedRepeat = prepareAutomaticDiscovery({
  state: failedState,
  workspaceId: 'ws_failed',
  now: new Date(start.getTime() + 60_000),
});
assert.equal(failedRepeat.run, null);
assert.equal(failedState.discoveryRuns.length, 1);

const heartbeatState = {
  discoveryRuns: [{
    id: 'active_run',
    workspaceId: 'ws_heartbeat',
    lane: 'automatic',
    status: 'running',
    claimedAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:50:00.000Z',
  }, {
    id: 'stale_run',
    workspaceId: 'ws_stale',
    lane: 'automatic',
    status: 'running',
    claimedAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
  }],
};
assert.equal(recoverStaleRunningRuns(heartbeatState, {
  workspaceId: 'ws_heartbeat',
  lane: 'automatic',
  now: new Date('2026-07-09T01:00:00.000Z'),
}).length, 0);
assert.equal(recoverStaleRunningRuns(heartbeatState, {
  workspaceId: 'ws_stale',
  lane: 'automatic',
  now: new Date('2026-07-09T01:00:00.000Z'),
}).length, 1);

const spendSummary = getDailyAutomaticSpendSummary([
  {
    workspaceId: 'ws_spend',
    status: 'completed',
    actualCostUsd: null,
    reservedCostUsd: 0.12,
    estimatedCostUsd: 0.1,
    attemptedCallCount: 1,
    claimedAt: start.toISOString(),
  },
  {
    workspaceId: 'ws_spend',
    status: 'completed',
    actualCostUsd: 0.04,
    reservedCostUsd: 0.09,
    estimatedCostUsd: 0.09,
    attemptedCallCount: 1,
    claimedAt: start.toISOString(),
  },
], 'ws_spend', start);
assert.deepEqual(spendSummary, { amountUsd: 0.16, isEstimated: true });

const budgetState = {
  workspaces: [{
    id: 'ws_budget_retry',
    discoverySettings: {
      ...discovery.defaultDiscoverySettings(start),
      platforms: ['instagram'],
      nextRunAt: {
        accounts: start.toISOString(),
        keywords: '2026-07-09T12:00:00.000Z',
        hashtags: '2026-07-10T00:00:00.000Z',
        trends: '2026-07-10T00:00:00.000Z',
      },
    },
  }],
  sources: [{ id: 'budget_source', workspaceId: 'ws_budget_retry', type: 'instagram', handle: '@budget' }],
  competitors: [],
  instagramAccounts: [],
  tiktokAccounts: [],
  reels: [],
  discoveryRuns: [{
    id: 'spent',
    workspaceId: 'ws_budget_retry',
    status: 'completed',
    actualCostUsd: 0.79,
    attemptedCallCount: 1,
    claimedAt: start.toISOString(),
  }],
};
const budgetTick = prepareAutomaticDiscovery({
  state: budgetState,
  workspaceId: 'ws_budget_retry',
  now: start,
});
assert.equal(budgetTick.run?.status, 'blocked_budget');
assert.equal(budgetState.workspaces[0].discoverySettings.nextRunAt.accounts, '2026-07-10T00:00:00.000Z');
assert.equal(budgetState.workspaces[0].discoverySettings.nextRunAt.keywords, '2026-07-10T00:00:00.000Z');
const budgetRepeat = prepareAutomaticDiscovery({
  state: budgetState,
  workspaceId: 'ws_budget_retry',
  now: new Date(start.getTime() + 60_000),
});
assert.equal(budgetRepeat.run, null);
assert.equal(budgetState.discoveryRuns.filter((run) => run.status === 'blocked_budget').length, 1);

console.log('automatic discovery regression tests passed');
