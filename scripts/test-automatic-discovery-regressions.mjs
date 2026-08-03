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
assert.deepEqual(firstRotationCalls, ['@one']);
assert.equal(rotationState.workspaces[0].discoverySettings.sourceCheckpoints.instagram.accounts, 1);

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
assert.deepEqual(secondRotationCalls, ['@two']);

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
assert.equal(mergeResult.updatedSignals.length, 0, 'blocked ranking must not write duplicate refreshes');
assert.equal(mergeResult.run.status, 'failed');
assert.equal(mergeResult.run.classifiedFailure.code, 'insufficient_ranking_metadata');
assert.equal(mergeState.reels[0].views, 1000);
assert.equal(mergeState.reels[0].likes, 100);
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

const uncertainMemoryWorkspaceId = 'ws_uncertain_memory';
const uncertainCandidateAId = '7000000000000000001';
const uncertainCandidateBId = '7000000000000000002';
const uncertainMemoryQualityConfig = {
  version: 3.1,
  maxVideoAnalysesPerRun: 1,
  rejectionMemory: {
    enabled: true,
    ttlDays: 30,
  },
  borderlineReview: {
    enabled: false,
    maxRechecksPerRun: 0,
  },
};
const uncertainMemoryPolicy = {
  dailyBudgetUsd: 0.8,
  dailyTarget: 10,
  maxBudgetedRunsPerDay: 3,
  resultLimitPerPlatform: 2,
  maxPlannedCalls: 1,
};
function createUncertainMemoryState(workspaceId = uncertainMemoryWorkspaceId) {
  return {
    workspaces: [{
      id: workspaceId,
      brief: {
        businessType: 'AI tools',
        niche: 'vibe coding',
        product: 'DZHERO',
        audience: 'AI builders',
        location: 'global',
      },
      discoverySettings: {
        enabled: true,
        dailyBudgetUsd: 0.8,
        viralScoreThreshold: 70,
        platforms: ['tiktok'],
      },
    }],
    sources: [{
      id: `source_${workspaceId}`,
      workspaceId,
      type: 'tiktok',
      handle: '@uncertain-memory-fixture',
    }],
    competitors: [],
    instagramAccounts: [],
    tiktokAccounts: [],
    reels: [],
    discoveryRuns: [],
  };
}
const uncertainMemoryState = createUncertainMemoryState();

function createUncertainMemoryCandidate(stableId, { downloaded = false } = {}) {
  const isCandidateA = stableId === uncertainCandidateAId;
  const sourceUrl = `https://www.tiktok.com/@uncertain-memory-fixture/video/${stableId}`;
  const videoUrl = downloaded ? `https://offline.invalid/${stableId}.mp4` : '';
  return {
    id: `uncertain_memory_${stableId}`,
    workspaceId: uncertainMemoryWorkspaceId,
    handle: '@uncertain-memory-fixture',
    sourceHandle: '@uncertain-memory-fixture',
    sourceUrl,
    sourceStatus: downloaded ? 'mock_video' : 'mock_metadata',
    sourceType: 'TikTok',
    views: 10_000,
    likes: isCandidateA ? 900 : 600,
    comments: isCandidateA ? 80 : 50,
    shares: isCandidateA ? 200 : 100,
    saves: isCandidateA ? 300 : 150,
    videoUrl,
    importedMetadata: {
      provider: 'offline_mock',
      platform: 'tiktok',
      externalId: stableId,
      tiktokVideoId: stableId,
      url: sourceUrl,
      videoUrl,
      mediaUrls: videoUrl ? [videoUrl] : [],
      handle: '@uncertain-memory-fixture',
      duration: 44,
      sourceRelationship: 'exact_owner',
    },
  };
}

function getUncertainMemoryStableId(signal) {
  return String(signal?.importedMetadata?.tiktokVideoId || signal?.importedMetadata?.externalId || '');
}

const uncertainMemoryCandidates = [
  createUncertainMemoryCandidate(uncertainCandidateAId),
  createUncertainMemoryCandidate(uncertainCandidateBId),
];
const uncertainMemoryAudit = {
  networkAttempts: 0,
  metadataMockCalls: 0,
  downloadMockCandidateIds: [],
  qualityMockCandidateIds: [],
  apifyCalls: 0,
  geminiCalls: 0,
  geminiUploads: 0,
  realDownloads: 0,
  paidCostUsd: 0,
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  uncertainMemoryAudit.networkAttempts += 1;
  throw new Error('network_forbidden_in_uncertain_memory_reproducer');
};

async function runUncertainMemoryDiscovery(now, qualityConfig = uncertainMemoryQualityConfig) {
  return executeAutomaticDiscovery({
    state: uncertainMemoryState,
    workspaceId: uncertainMemoryWorkspaceId,
    token: 'offline-mock-only',
    now,
    force: true,
    policy: uncertainMemoryPolicy,
    maxQualityEvaluations: qualityConfig.maxVideoAnalysesPerRun,
    qualityGateConfig: qualityConfig,
    fetchSignals: async (call) => {
      const wantsDownload = Boolean(call.downloadVideos ?? call.downloadVideo);
      if (!wantsDownload) {
        uncertainMemoryAudit.metadataMockCalls += 1;
        return {
          actualCostUsd: 0,
          signals: uncertainMemoryCandidates.map((candidate) => structuredClone(candidate)),
        };
      }
      const selected = uncertainMemoryCandidates.find((candidate) => candidate.sourceUrl === call.inputValue);
      const selectedId = getUncertainMemoryStableId(selected);
      uncertainMemoryAudit.downloadMockCandidateIds.push(selectedId);
      return {
        actualCostUsd: 0,
        signals: selected ? [createUncertainMemoryCandidate(selectedId, { downloaded: true })] : [],
      };
    },
    evaluateSignalQuality: async ({ signal }) => {
      const stableId = getUncertainMemoryStableId(signal);
      uncertainMemoryAudit.qualityMockCandidateIds.push(stableId);
      return stableId === uncertainCandidateAId
        ? {
            policyVersion: qualityConfig.version,
            decision: 'uncertain',
            admittedToBank: false,
            qualityScore: 50,
            brandRelevance: 80,
            rejectionReasons: ['no_qualifying_evidence_mode'],
            uncertaintyReasons: ['ambiguous_or_invalid_evidence_chain'],
          }
        : {
            policyVersion: qualityConfig.version,
            decision: 'reject',
            admittedToBank: false,
            qualityScore: 20,
            brandRelevance: 80,
            rejectionReasons: ['offline_second_candidate_reject'],
            uncertaintyReasons: [],
          };
    },
  });
}

try {
  const firstUncertainMemoryRun = await runUncertainMemoryDiscovery(
    new Date('2026-08-03T10:00:00.000Z'),
  );
  assert.equal(firstUncertainMemoryRun.run.status, 'completed');
  assert.equal(firstUncertainMemoryRun.run.qualityEvaluatedCount, 1);
  assert.equal(firstUncertainMemoryRun.run.qualityDecisions[0].decision, 'uncertain');
  assert.equal(firstUncertainMemoryRun.run.qualityDecisions[0].admittedToBank, false);
  assert.deepEqual(uncertainMemoryAudit.downloadMockCandidateIds, [uncertainCandidateAId]);
  assert.deepEqual(uncertainMemoryAudit.qualityMockCandidateIds, [uncertainCandidateAId]);
  assert.equal(uncertainMemoryState.reels.length, 0, 'uncertain A must not write to Bank/Collection');

  const secondUncertainMemoryRun = await runUncertainMemoryDiscovery(
    new Date('2026-08-03T10:01:00.000Z'),
  );
  assert.equal(secondUncertainMemoryRun.run.status, 'completed');
  assert.equal(secondUncertainMemoryRun.run.qualityEvaluatedCount, 1);
  assert.equal(uncertainMemoryAudit.metadataMockCalls, 2);
  assert.equal(uncertainMemoryState.reels.length, 0, 'uncertain A must never create a Bank write');
  assert.equal(uncertainMemoryAudit.networkAttempts, 0);
  assert.equal(uncertainMemoryAudit.apifyCalls, 0);
  assert.equal(uncertainMemoryAudit.geminiCalls, 0);
  assert.equal(uncertainMemoryAudit.geminiUploads, 0);
  assert.equal(uncertainMemoryAudit.realDownloads, 0);
  assert.equal(uncertainMemoryAudit.paidCostUsd, 0);
  assert.deepEqual(
    uncertainMemoryAudit.downloadMockCandidateIds,
    [uncertainCandidateAId, uncertainCandidateBId],
    'immediate repeat must suppress unchanged uncertain A and download lower-ranked valid B',
  );
  assert.deepEqual(
    uncertainMemoryAudit.qualityMockCandidateIds,
    [uncertainCandidateAId, uncertainCandidateBId],
    'immediate repeat must reuse uncertain A and analyze B exactly once',
  );
  assert.equal(secondUncertainMemoryRun.run.qualityCacheHitCount, 1);

  const bumpedUncertainMemoryQualityConfig = {
    ...uncertainMemoryQualityConfig,
    version: 3.2,
  };
  const policyVersionRetryRun = await runUncertainMemoryDiscovery(
    new Date('2026-08-03T10:02:00.000Z'),
    bumpedUncertainMemoryQualityConfig,
  );
  assert.equal(policyVersionRetryRun.run.qualityCacheHitCount, 0);
  assert.deepEqual(
    uncertainMemoryAudit.downloadMockCandidateIds,
    [uncertainCandidateAId, uncertainCandidateBId, uncertainCandidateAId],
    'a new Signal Filter policy version must make uncertain A eligible again',
  );

  const expiredUncertainMemoryRun = await runUncertainMemoryDiscovery(
    new Date('2026-09-03T10:00:00.000Z'),
  );
  assert.equal(expiredUncertainMemoryRun.run.qualityCacheHitCount, 0);
  assert.deepEqual(
    uncertainMemoryAudit.downloadMockCandidateIds,
    [
      uncertainCandidateAId,
      uncertainCandidateBId,
      uncertainCandidateAId,
      uncertainCandidateAId,
    ],
    'expired decision suppression must make uncertain A eligible again',
  );

  const malformedState = createUncertainMemoryState('ws_malformed_memory');
  const malformedDownloadIds = [];
  let malformedQualityAttempts = 0;
  async function runMalformedDiscovery(now) {
    return executeAutomaticDiscovery({
      state: malformedState,
      workspaceId: 'ws_malformed_memory',
      token: 'offline-mock-only',
      now,
      force: true,
      policy: uncertainMemoryPolicy,
      maxQualityEvaluations: 1,
      qualityGateConfig: uncertainMemoryQualityConfig,
      fetchSignals: async (call) => {
        if (!Boolean(call.downloadVideos ?? call.downloadVideo)) {
          return {
            actualCostUsd: 0,
            signals: uncertainMemoryCandidates.map((candidate) => structuredClone(candidate)),
          };
        }
        const selected = uncertainMemoryCandidates.find((candidate) => candidate.sourceUrl === call.inputValue);
        const selectedId = getUncertainMemoryStableId(selected);
        malformedDownloadIds.push(selectedId);
        return {
          actualCostUsd: 0,
          signals: selected ? [createUncertainMemoryCandidate(selectedId, { downloaded: true })] : [],
        };
      },
      evaluateSignalQuality: async () => {
        malformedQualityAttempts += 1;
        if (malformedQualityAttempts === 1) {
          const error = new Error('gemini_schema_validation_failed');
          error.code = 'gemini_schema_validation_failed';
          throw error;
        }
        return {
          policyVersion: uncertainMemoryQualityConfig.version,
          decision: 'reject',
          admittedToBank: false,
          qualityScore: 10,
          rejectionReasons: ['offline_retry_after_malformed_result'],
          uncertaintyReasons: [],
        };
      },
    });
  }
  const malformedFirstRun = await runMalformedDiscovery(new Date('2026-08-04T10:00:00.000Z'));
  assert.equal(malformedFirstRun.run.qualityDecisions.length, 0);
  const malformedRetryRun = await runMalformedDiscovery(new Date('2026-08-04T10:01:00.000Z'));
  assert.equal(malformedRetryRun.run.qualityCacheHitCount, 0);
  assert.deepEqual(
    malformedDownloadIds,
    [uncertainCandidateAId, uncertainCandidateAId],
    'provider/schema failure must not suppress a future attempt',
  );

  const downloadErrorState = createUncertainMemoryState('ws_download_error_memory');
  const downloadErrorCandidateIds = [];
  let failFirstDownload = true;
  let downloadErrorQualityAttempts = 0;
  async function runDownloadErrorDiscovery(now) {
    return executeAutomaticDiscovery({
      state: downloadErrorState,
      workspaceId: 'ws_download_error_memory',
      token: 'offline-mock-only',
      now,
      force: true,
      policy: uncertainMemoryPolicy,
      maxQualityEvaluations: 1,
      qualityGateConfig: uncertainMemoryQualityConfig,
      fetchSignals: async (call) => {
        if (!Boolean(call.downloadVideos ?? call.downloadVideo)) {
          return {
            actualCostUsd: 0,
            signals: uncertainMemoryCandidates.map((candidate) => structuredClone(candidate)),
          };
        }
        const selected = uncertainMemoryCandidates.find((candidate) => candidate.sourceUrl === call.inputValue);
        const selectedId = getUncertainMemoryStableId(selected);
        downloadErrorCandidateIds.push(selectedId);
        if (failFirstDownload) {
          failFirstDownload = false;
          const error = new Error('offline_download_failed');
          error.actualCostUsd = 0;
          throw error;
        }
        return {
          actualCostUsd: 0,
          signals: selected ? [createUncertainMemoryCandidate(selectedId, { downloaded: true })] : [],
        };
      },
      evaluateSignalQuality: async () => {
        downloadErrorQualityAttempts += 1;
        return {
          policyVersion: uncertainMemoryQualityConfig.version,
          decision: 'reject',
          admittedToBank: false,
          qualityScore: 10,
          rejectionReasons: ['offline_retry_after_download_error'],
          uncertaintyReasons: [],
        };
      },
    });
  }
  const downloadErrorFirstRun = await runDownloadErrorDiscovery(new Date('2026-08-05T10:00:00.000Z'));
  assert.equal(downloadErrorFirstRun.run.qualityDecisions.length, 0);
  assert.equal(downloadErrorQualityAttempts, 0, 'download errors must stop before Gemini/Signal Filter');
  assert.equal(downloadErrorState.reels.length, 0);
  const downloadErrorRetryRun = await runDownloadErrorDiscovery(new Date('2026-08-05T10:01:00.000Z'));
  assert.equal(downloadErrorRetryRun.run.qualityCacheHitCount, 0);
  assert.equal(downloadErrorQualityAttempts, 1);
  assert.deepEqual(
    downloadErrorCandidateIds,
    [uncertainCandidateAId, uncertainCandidateAId],
    'download failure must not suppress a future attempt',
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('automatic discovery regression tests passed');
