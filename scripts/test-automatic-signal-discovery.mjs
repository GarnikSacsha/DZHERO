import assert from 'node:assert/strict';
import discovery from '../backend/services/automaticSignalDiscovery.js';

const {
  defaultDiscoverySettings,
  buildDiscoveryInputs,
  isDiscoveryDue,
  getDailyAutomaticSpend,
  canStartDiscoveryRun,
  claimDiscoveryRun,
} = discovery;

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
    accounts: ['@fitlab', '@coach_mila', '@stretchflow'],
    keywords: ['pilates', 'workout tips'],
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

console.log('automatic signal discovery policy tests passed');
