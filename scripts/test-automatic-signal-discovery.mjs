import assert from 'node:assert/strict';
import discovery from '../backend/services/automaticSignalDiscovery.js';
import provider from '../backend/services/apifySignalProvider.js';

const {
  defaultDiscoverySettings,
  buildDiscoveryInputs,
  isDiscoveryDue,
  getDailyAutomaticSpend,
  canStartDiscoveryRun,
  claimDiscoveryRun,
  executeAutomaticDiscovery,
} = discovery;
const { mapTikTokApifyItem } = provider;

const now = new Date('2026-07-08T00:00:00.000Z');
const sixHoursLater = new Date('2026-07-08T06:00:00.000Z');
const twelveHoursLater = new Date('2026-07-08T12:00:00.000Z');

const settings = defaultDiscoverySettings(now);

assert.equal(settings.dailyBudgetUsd, 0.8);
assert.equal(settings.viralScoreThreshold, 70);
assert.equal(settings.accountIntervalMs, 6 * 60 * 60 * 1000);
assert.equal(settings.discoveryIntervalMs, 12 * 60 * 60 * 1000);
assert.equal(settings.nextRunAt.accounts, sixHoursLater.toISOString());
assert.equal(settings.nextRunAt.trends, twelveHoursLater.toISOString());
assert.equal(isDiscoveryDue(settings, 'accounts', sixHoursLater), true);
assert.equal(isDiscoveryDue(settings, 'trends', twelveHoursLater), true);

const runs = [
  {
    id: 'run-1',
    workspaceId: 'ws-1',
    lane: 'accounts',
    status: 'completed',
    actualCostUsd: 0.42,
    completedAt: '2026-07-08T02:00:00.000Z',
  },
  {
    id: 'run-2',
    workspaceId: 'ws-1',
    lane: 'trends',
    status: 'running',
    estimatedCostUsd: 0.30,
    actualCostUsd: 0,
    startedAt: '2026-07-08T10:00:00.000Z',
  },
  {
    id: 'run-3',
    workspaceId: 'ws-1',
    lane: 'hashtags',
    status: 'completed',
    actualCostUsd: 0.99,
    completedAt: '2026-07-07T23:30:00.000Z',
  },
  {
    id: 'run-4',
    workspaceId: 'ws-2',
    lane: 'accounts',
    status: 'completed',
    actualCostUsd: 0.5,
    completedAt: '2026-07-08T04:00:00.000Z',
  },
];

assert.equal(getDailyAutomaticSpend(runs, 'ws-1', now), 0.72);
assert.equal(
  canStartDiscoveryRun({
    spentUsd: 0.72,
    budgetUsd: 0.8,
    estimatedCostUsd: 0.01,
    platform: 'tiktok',
    limit: 5,
    downloadVideo: true,
    discoveryInputs: {
      accounts: ['@fitlab', '@coach_mila', '@stretchflow'],
      keywords: ['pilates', 'workout tips'],
    },
  }),
  false
);
assert.equal(
  canStartDiscoveryRun({
    spentUsd: 0.78,
    budgetUsd: 4,
    estimatedCostUsd: 0.03,
    platform: 'instagram',
    limit: 1,
    discoveryInputs: {
      keywords: ['pilates'],
    },
  }),
  false
);

const state = {
  workspaces: [
    {
      id: 'ws-1',
      brief: {
        businessType: 'fitness wellness',
        niche: 'pilates',
        product: 'starter workouts',
        marketFocus: ['ua', 'us'],
        location: 'Ukraine',
        contentFocus: 'workout tips',
        goals: ['lead generation', 'retention'],
      },
    },
  ],
  sources: [
    { id: 'src-1', workspaceId: 'ws-1', handle: '@fitlab', label: 'Fit Lab', type: 'instagram' },
    { id: 'src-2', workspaceId: 'ws-1', handle: '@fitlab', label: 'Duplicate Fit Lab', type: 'tiktok' },
    { id: 'src-3', workspaceId: 'ws-1', handle: '@coach_mila', label: 'Coach Mila', type: 'instagram' },
    { id: 'src-4', workspaceId: 'ws-1', handle: '@stretchflow', label: 'Stretch Flow', type: 'tiktok' },
    { id: 'src-5', workspaceId: 'ws-2', handle: '@ignored', label: 'Other workspace', type: 'instagram' },
  ],
  competitors: [
    { id: 'cmp-1', workspaceId: 'ws-1', handle: '@pulseclub', niche: 'pilates', market: 'ua', status: 'active' },
    { id: 'cmp-2', workspaceId: 'ws-1', handle: '@pulseclub', niche: 'pilates', market: 'ua', status: 'active' },
    { id: 'cmp-3', workspaceId: 'ws-1', handle: '@reformer_daily', niche: 'reformer', market: 'us', status: 'active' },
    { id: 'cmp-4', workspaceId: 'ws-2', handle: '@unused', niche: 'ignored', market: 'us', status: 'active' },
  ],
  reels: [
    {
      id: 'reel-1',
      workspaceId: 'ws-1',
      sourceHandle: '@coach_mila',
      handle: '@coach_mila',
      sourceUrl: 'https://www.instagram.com/reel/abc123/',
      importedMetadata: { platform: 'instagram', shortCode: 'abc123', externalId: 'abc123' },
    },
    {
      id: 'reel-2',
      workspaceId: 'ws-1',
      sourceHandle: '@archive_account',
      handle: '@archive_account',
      sourceUrl: 'https://www.tiktok.com/@archive_account/video/123456789',
      importedMetadata: { platform: 'tiktok', tiktokVideoId: '123456789', url: 'https://www.tiktok.com/@archive_account/video/123456789' },
    },
  ],
};

const inputs = buildDiscoveryInputs(state, 'ws-1');

assert.deepEqual(Object.keys(inputs).sort(), ['instagram', 'tiktok']);

for (const platform of ['instagram', 'tiktok']) {
  const platformInputs = inputs[platform];
  assert.ok(platformInputs.accounts.length <= 10);
  assert.ok(platformInputs.keywords.length <= 10);
  assert.ok(platformInputs.hashtags.length <= 10);
  assert.ok(platformInputs.trends.length <= 10);
  assert.equal(new Set(platformInputs.accounts).size, platformInputs.accounts.length);
  assert.equal(new Set(platformInputs.keywords).size, platformInputs.keywords.length);
  assert.equal(new Set(platformInputs.hashtags).size, platformInputs.hashtags.length);
  assert.equal(new Set(platformInputs.trends).size, platformInputs.trends.length);
}

assert.ok(inputs.instagram.accounts.includes('@fitlab'));
assert.ok(inputs.instagram.accounts.includes('@pulseclub'));
assert.ok(inputs.instagram.accounts.includes('@stretchflow'));
assert.ok(!inputs.instagram.accounts.includes('@coach_mila'));

assert.ok(inputs.instagram.keywords.some((value) => value.includes('fitness')));
assert.ok(inputs.instagram.hashtags.every((value) => value.startsWith('#')));
assert.ok(inputs.instagram.trends.some((value) => value.includes('pilates')));

assert.ok(inputs.tiktok.accounts.includes('@fitlab'));
assert.ok(inputs.tiktok.accounts.includes('@reformer_daily'));
assert.ok(inputs.tiktok.keywords.some((value) => value.includes('workout')));
assert.ok(inputs.tiktok.hashtags.every((value) => value.startsWith('#')));
assert.ok(inputs.tiktok.trends.some((value) => value.includes('ukraine')));

const claimState = { discoveryRuns: [] };
const firstClaim = claimDiscoveryRun(claimState, {
  workspaceId: 'ws-1',
  lane: 'accounts',
  now,
  spentUsd: 0,
  budgetUsd: 2,
  platform: 'tiktok',
  limit: 5,
  downloadVideo: true,
  discoveryInputs: {
    accounts: ['@fitlab', '@coach_mila'],
  },
  estimatedCostUsd: 0.01,
});

assert.equal(firstClaim.status, 'running');
assert.equal(firstClaim.workspaceId, 'ws-1');
assert.equal(firstClaim.lane, 'accounts');
assert.equal(firstClaim.dayKey, '2026-07-08');
assert.ok(firstClaim.estimatedCostUsd > 0.01);
assert.equal(claimState.discoveryRuns.length, 1);

const blockedClaim = claimDiscoveryRun(claimState, {
  workspaceId: 'ws-1',
  lane: 'accounts',
  now: new Date('2026-07-08T00:30:00.000Z'),
  spentUsd: 0.72,
  budgetUsd: 0.8,
  platform: 'tiktok',
  limit: 5,
  downloadVideo: true,
  discoveryInputs: {
    accounts: ['@fitlab', '@coach_mila', '@stretchflow'],
    keywords: ['pilates', 'workout tips'],
  },
  estimatedCostUsd: 0.01,
});

assert.equal(blockedClaim, null);
assert.equal(claimState.discoveryRuns.length, 1);

const hardCapBlockedClaim = claimDiscoveryRun(claimState, {
  workspaceId: 'ws-1',
  lane: 'keywords',
  now: new Date('2026-07-08T00:45:00.000Z'),
  spentUsd: 0.78,
  budgetUsd: 4,
  platform: 'instagram',
  limit: 1,
  discoveryInputs: {
    keywords: ['pilates'],
  },
  estimatedCostUsd: 0.03,
});

assert.equal(hardCapBlockedClaim, null);
assert.equal(claimState.discoveryRuns.length, 1);

const trendClaim = claimDiscoveryRun(claimState, {
  workspaceId: 'ws-1',
  lane: 'trends',
  now: new Date('2026-07-08T00:30:00.000Z'),
  spentUsd: 0,
  budgetUsd: 2,
  platform: 'instagram',
  limit: 2,
  downloadVideo: false,
  discoveryInputs: {
    trends: ['instagram pilates trends', 'instagram workout ideas'],
  },
  estimatedCostUsd: 0.01,
});

assert.equal(trendClaim.status, 'running');
assert.equal(claimState.discoveryRuns.length, 2);

const createMappedTikTokReel = (item, suffix) => mapTikTokApifyItem(item, {
  workspaceId: 'ws-1',
  market: 'ua',
  createId: (prefix) => `${prefix}_${suffix}`,
});

const lowScoreCandidate = createMappedTikTokReel({
  'authorMeta.avatar': 'https://example.com/low.jpg',
  'authorMeta.name': 'slowcoach',
  text: 'Old and quiet.',
  diggCount: 12,
  shareCount: 1,
  playCount: 400,
  commentCount: 2,
  collectCount: 0,
  createTimeISO: '2025-01-05T12:00:00.000Z',
  webVideoUrl: 'https://www.tiktok.com/@slowcoach/video/1111111111111111111',
  mediaUrls: [],
}, 'low');

const qualifyingMetadataCandidate = createMappedTikTokReel({
  'authorMeta.avatar': 'https://example.com/winner.jpg',
  'authorMeta.name': 'winnercoach',
  text: 'Three beginner reformer mistakes.',
  diggCount: 48000,
  shareCount: 12000,
  playCount: 520000,
  commentCount: 4100,
  collectCount: 8600,
  createTimeISO: '2026-07-08T10:00:00.000Z',
  webVideoUrl: 'https://www.tiktok.com/@winnercoach/video/7659094629786193183',
  mediaUrls: [],
}, 'winner_meta');

const qualifyingDownloadedCandidateBase = createMappedTikTokReel({
  'authorMeta.avatar': 'https://example.com/winner.jpg',
  'authorMeta.name': 'winnercoach',
  text: 'Three beginner reformer mistakes.',
  diggCount: 48000,
  shareCount: 12000,
  playCount: 520000,
  commentCount: 4100,
  collectCount: 8600,
  createTimeISO: '2026-07-08T10:00:00.000Z',
  webVideoUrl: 'https://www.tiktok.com/@winnercoach/video/7659094629786193183',
  mediaUrls: ['https://cdn.example.com/winner.mp4'],
}, 'winner_download');

const qualifyingDownloadedCandidate = {
  ...qualifyingDownloadedCandidateBase,
  sourceUrl: '',
  importedMetadata: {
    ...qualifyingDownloadedCandidateBase.importedMetadata,
    url: '',
    videoUrl: 'https://cdn.example.com/winner.mp4',
    mediaUrls: ['https://cdn.example.com/winner.mp4'],
  },
};

const duplicateCandidate = createMappedTikTokReel({
  'authorMeta.avatar': 'https://example.com/dup.jpg',
  'authorMeta.name': 'dupcoach',
  text: 'Already imported, but fresher metrics.',
  diggCount: 2500,
  shareCount: 430,
  playCount: 98000,
  commentCount: 220,
  collectCount: 510,
  createTimeISO: '2026-07-08T11:00:00.000Z',
  webVideoUrl: 'https://www.tiktok.com/@dupcoach/video/1234567890123456789',
  mediaUrls: [],
}, 'dup');

const automaticState = {
  workspaces: [
    {
      id: 'ws-1',
      brief: {
        businessType: 'fitness',
        niche: 'pilates',
        product: 'reformer workouts',
        location: 'Ukraine',
        contentFocus: 'pilates form',
        goals: ['lead generation'],
      },
      discoverySettings: {
        enabled: true,
        dailyBudgetUsd: 4,
        viralScoreThreshold: 70,
        platforms: ['instagram', 'tiktok'],
        lastRunAt: {
          accounts: '2026-07-08T00:00:00.000Z',
          keywords: '2026-07-07T12:00:00.000Z',
          hashtags: '2026-07-08T00:00:00.000Z',
          trends: '2026-07-08T00:00:00.000Z',
        },
        nextRunAt: {
          accounts: '2026-07-08T06:00:00.000Z',
          keywords: '2026-07-08T00:00:00.000Z',
          hashtags: '2026-07-08T12:00:00.000Z',
          trends: '2026-07-08T12:00:00.000Z',
        },
      },
    },
  ],
  sources: [
    { id: 'src-1', workspaceId: 'ws-1', handle: '@fitlab', label: 'Fit Lab', type: 'instagram' },
  ],
  competitors: [
    { id: 'cmp-1', workspaceId: 'ws-1', handle: '@winnercoach', niche: 'pilates', market: 'ua' },
  ],
  reels: [
    {
      id: 'reel_duplicate_existing',
      workspaceId: 'ws-1',
      sourceHandle: '@dupcoach',
      handle: '@dupcoach',
      sourceUrl: 'https://www.tiktok.com/@dupcoach/video/1234567890123456789',
      videoUrl: '',
      image: 'https://example.com/dup-old.jpg',
      views: 1200,
      likes: 110,
      comments: 12,
      shares: 2,
      saves: 1,
      importedMetadata: {
        provider: 'apify',
        platform: 'tiktok',
        externalId: '1234567890123456789',
        tiktokVideoId: '1234567890123456789',
        url: 'https://www.tiktok.com/@dupcoach/video/1234567890123456789',
        handle: '@dupcoach',
        source: { label: 'TikTok', tone: 'tiktok' },
      },
    },
  ],
  discoveryRuns: [],
};

const createFetchSignalsStub = () => {
  const calls = [];
  const stub = async (call) => {
    calls.push({
      platform: call.platform,
      mode: call.mode ?? call.inputType,
      input: call.input ?? call.inputValue,
      downloadVideos: Boolean(call.downloadVideos ?? call.downloadVideo),
      limit: call.limit,
    });
    if (call.platform === 'instagram') {
      throw Object.assign(new Error('instagram_actor_failed'), { status: 502 });
    }
    const mode = call.mode ?? call.inputType;
    const input = call.input ?? call.inputValue;
    const wantsDownload = Boolean(call.downloadVideos ?? call.downloadVideo);

    if (wantsDownload) {
      if (input === qualifyingMetadataCandidate.sourceUrl) {
        return [qualifyingDownloadedCandidate];
      }
      return [];
    }

    if (mode === 'search' && input === 'pilates') {
      return [lowScoreCandidate, qualifyingMetadataCandidate, duplicateCandidate];
    }

    return [];
  };
  stub.calls = calls;
  return stub;
};

const fetchSignals = createFetchSignalsStub();
const automaticResult = await executeAutomaticDiscovery({
  state: automaticState,
  workspaceId: 'ws-1',
  token: 'test-token',
  now,
  fetchSignals,
});

assert.equal(automaticResult.acceptedSignals.length, 1);
assert.equal(automaticResult.updatedSignals.length, 1);
assert.equal(automaticResult.run.status, 'completed');
assert.equal(automaticResult.run.acceptedCount, 1);
assert.equal(automaticResult.run.duplicateCount, 1);
assert.equal(automaticResult.run.budgetUsd, 0.8);
assert.ok(automaticResult.run.errors.some((entry) => entry.platform === 'instagram'));
assert.equal(automaticState.workspaces[0].discoverySettings.lastRunAt.keywords, now.toISOString());
assert.equal(automaticState.workspaces[0].discoverySettings.nextRunAt.keywords, twelveHoursLater.toISOString());

const [acceptedSignal] = automaticResult.acceptedSignals;
assert.equal(acceptedSignal.videoUrl, 'https://cdn.example.com/winner.mp4');
assert.equal(acceptedSignal.sourceUrl, qualifyingMetadataCandidate.sourceUrl);

const [updatedSignal] = automaticResult.updatedSignals;
assert.equal(updatedSignal.id, 'reel_duplicate_existing');
assert.equal(updatedSignal.views, duplicateCandidate.views);
assert.equal(updatedSignal.likes, duplicateCandidate.likes);

const downloadCalls = fetchSignals.calls.filter((call) => call.downloadVideos === true);
assert.equal(downloadCalls.length, 1);
assert.equal(downloadCalls[0].input, qualifyingMetadataCandidate.sourceUrl);
assert.equal(downloadCalls[0].mode, 'url');
assert.equal(fetchSignals.calls.some((call) => call.downloadVideos === true), true);

const rerunCalls = [];
const rerunResult = await executeAutomaticDiscovery({
  state: automaticState,
  workspaceId: 'ws-1',
  token: 'test-token',
  now,
  fetchSignals: async (call) => {
    rerunCalls.push({
      platform: call.platform,
      mode: call.mode ?? call.inputType,
      input: call.input ?? call.inputValue,
    });
    return [];
  },
});

assert.equal(rerunCalls.length, 0);
assert.equal(rerunResult.run.requestedCount, 0);

const laneScheduleState = {
  workspaces: [
    {
      id: 'ws_schedule',
      brief: {
        businessType: 'fitness',
        niche: 'pilates',
        product: 'reformer workouts',
        location: 'Ukraine',
        contentFocus: 'pilates form',
        goals: ['lead generation'],
      },
      discoverySettings: {
        enabled: true,
        dailyBudgetUsd: 0.8,
        viralScoreThreshold: 70,
        platforms: ['instagram', 'tiktok'],
        lastRunAt: {
          accounts: '2026-07-07T18:00:00.000Z',
          keywords: '2026-07-08T00:00:00.000Z',
          hashtags: '2026-07-08T00:00:00.000Z',
          trends: '2026-07-08T00:00:00.000Z',
        },
        nextRunAt: {
          accounts: '2026-07-08T00:00:00.000Z',
          keywords: '2026-07-08T12:00:00.000Z',
          hashtags: '2026-07-08T12:00:00.000Z',
          trends: '2026-07-08T12:00:00.000Z',
        },
      },
    },
  ],
  sources: [
    { id: 'src_schedule_1', workspaceId: 'ws_schedule', handle: '@fitlab', label: 'Fit Lab', type: 'instagram' },
  ],
  competitors: [],
  reels: [],
  discoveryRuns: [],
};

const scheduledFetchCalls = [];
const scheduledResult = await executeAutomaticDiscovery({
  state: laneScheduleState,
  workspaceId: 'ws_schedule',
  token: 'test-token',
  now,
  fetchSignals: async (call) => {
    scheduledFetchCalls.push({
      platform: call.platform,
      mode: call.mode ?? call.inputType,
      input: call.input ?? call.inputValue,
    });
    return [];
  },
});

assert.equal(scheduledFetchCalls.length, 2);
assert.equal(scheduledFetchCalls.every((call) => call.mode === 'profile'), true);
assert.equal(laneScheduleState.workspaces[0].discoverySettings.lastRunAt.accounts, now.toISOString());
assert.equal(laneScheduleState.workspaces[0].discoverySettings.nextRunAt.accounts, sixHoursLater.toISOString());
assert.equal(laneScheduleState.workspaces[0].discoverySettings.nextRunAt.keywords, '2026-07-08T12:00:00.000Z');
assert.equal(scheduledResult.run.actualCostUsd > 0, true);

const forcedFetchCalls = [];
await executeAutomaticDiscovery({
  state: laneScheduleState,
  workspaceId: 'ws_schedule',
  token: 'test-token',
  now,
  force: true,
  fetchSignals: async (call) => {
    forcedFetchCalls.push({
      platform: call.platform,
      mode: call.mode ?? call.inputType,
      input: call.input ?? call.inputValue,
    });
    return [];
  },
});

assert.equal(forcedFetchCalls.some((call) => call.mode === 'search'), true);
assert.equal(forcedFetchCalls.some((call) => call.mode === 'hashtag'), true);

const pausedState = {
  workspaces: [
    {
      id: 'ws_paused',
      brief: {
        businessType: 'fitness',
        niche: 'pilates',
        location: 'Ukraine',
      },
      discoverySettings: {
        enabled: false,
        dailyBudgetUsd: 4,
      },
    },
  ],
  sources: [
    { id: 'src_paused_1', workspaceId: 'ws_paused', handle: '@fitlab', label: 'Fit Lab', type: 'instagram' },
  ],
  competitors: [],
  reels: [],
  discoveryRuns: [],
};

const pausedResult = await executeAutomaticDiscovery({
  state: pausedState,
  workspaceId: 'ws_paused',
  token: 'test-token',
  now,
  fetchSignals: async () => {
    throw new Error('paused discovery should not fetch');
  },
});

assert.equal(pausedResult.run.status, 'paused');
assert.equal(pausedResult.run.estimatedCostUsd, 0);
assert.equal(pausedResult.run.actualCostUsd, 0);
assert.equal(getDailyAutomaticSpend(pausedState.discoveryRuns, 'ws_paused', now), 0);

const notDueState = {
  workspaces: [
    {
      id: 'ws_not_due',
      brief: {
        businessType: 'fitness',
        niche: 'pilates',
        location: 'Ukraine',
      },
      discoverySettings: {
        enabled: true,
        dailyBudgetUsd: 0.8,
        platforms: ['instagram', 'tiktok'],
        lastRunAt: {
          accounts: '2026-07-08T00:00:00.000Z',
          keywords: '2026-07-08T00:00:00.000Z',
          hashtags: '2026-07-08T00:00:00.000Z',
          trends: '2026-07-08T00:00:00.000Z',
        },
        nextRunAt: {
          accounts: '2026-07-08T06:00:00.000Z',
          keywords: '2026-07-08T12:00:00.000Z',
          hashtags: '2026-07-08T12:00:00.000Z',
          trends: '2026-07-08T12:00:00.000Z',
        },
      },
    },
  ],
  sources: [
    { id: 'src_not_due_1', workspaceId: 'ws_not_due', handle: '@fitlab', label: 'Fit Lab', type: 'instagram' },
  ],
  competitors: [],
  reels: [],
  discoveryRuns: [],
};

const notDueResult = await executeAutomaticDiscovery({
  state: notDueState,
  workspaceId: 'ws_not_due',
  token: 'test-token',
  now,
  fetchSignals: async () => {
    throw new Error('not-due discovery should not fetch');
  },
});

assert.equal(notDueResult.run.estimatedCostUsd, 0);
assert.equal(notDueResult.run.actualCostUsd, 0);
assert.equal(notDueResult.run.requestedCount, 0);
assert.equal(getDailyAutomaticSpend(notDueState.discoveryRuns, 'ws_not_due', now), 0);

const budgetBlockedState = {
  workspaces: [
    {
      id: 'ws_budget',
      brief: {
        businessType: 'fitness',
        niche: 'pilates',
        location: 'Ukraine',
      },
      discoverySettings: {
        enabled: true,
        dailyBudgetUsd: 4,
        platforms: ['instagram'],
        lastRunAt: {
          accounts: '2026-07-07T18:00:00.000Z',
          keywords: '2026-07-07T12:00:00.000Z',
          hashtags: '2026-07-07T12:00:00.000Z',
          trends: '2026-07-07T12:00:00.000Z',
        },
        nextRunAt: {
          accounts: '2026-07-08T00:00:00.000Z',
          keywords: '2026-07-08T00:00:00.000Z',
          hashtags: '2026-07-08T00:00:00.000Z',
          trends: '2026-07-08T00:00:00.000Z',
        },
      },
    },
  ],
  sources: [
    { id: 'src_budget_1', workspaceId: 'ws_budget', handle: '@fitlab', label: 'Fit Lab', type: 'instagram' },
  ],
  competitors: [],
  reels: [],
  discoveryRuns: [
    {
      id: 'budget_spend_existing',
      workspaceId: 'ws_budget',
      lane: 'accounts',
      status: 'completed',
      actualCostUsd: 0.79,
      completedAt: '2026-07-08T00:10:00.000Z',
    },
  ],
};

const budgetBlockedResult = await executeAutomaticDiscovery({
  state: budgetBlockedState,
  workspaceId: 'ws_budget',
  token: 'test-token',
  now,
  fetchSignals: async () => {
    throw new Error('budget-blocked discovery should not fetch');
  },
});

assert.equal(budgetBlockedResult.run.status, 'blocked_budget');
assert.equal(budgetBlockedResult.run.budgetUsd, 0.8);
assert.equal(budgetBlockedResult.run.estimatedCostUsd, 0);
assert.equal(budgetBlockedResult.run.actualCostUsd, 0);
assert.equal(getDailyAutomaticSpend(budgetBlockedState.discoveryRuns, 'ws_budget', now), 0.79);

console.log('automatic signal discovery policy tests passed');
