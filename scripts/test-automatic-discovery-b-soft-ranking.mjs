import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const discovery = require('../backend/services/automaticSignalDiscovery.js');
const { mapTikTokApifyItem } = require('../backend/services/apifySignalProvider.js');
const { loadSignalQualityGateConfig } = require('../backend/services/signalQualityGate.cjs');

const now = new Date('2026-07-31T12:00:00.000Z');
const qualityGateConfig = loadSignalQualityGateConfig();
const policy = {
  dailyBudgetUsd: 0.8,
  dailyTarget: 10,
  maxBudgetedRunsPerDay: 1,
  resultLimitPerPlatform: 10,
  maxPlannedCalls: 1,
};
const networkAudit = { attempts: 0 };
globalThis.fetch = async () => {
  networkAudit.attempts += 1;
  throw new Error('network_forbidden_in_b_soft_production_regression');
};

const sixCandidateSnapshot = [
  { key: 'creative', stableId: '7659411879730629920', handle: '@creativeinezz', views: 26_300_000, likes: 3_800_000, shares: 140_800, saves: 178_699, duration: 24 },
  { key: 'programmer', stableId: '7658915994626297109', handle: '@myfriendisaprogrammer', views: 177_900, likes: 11_100, shares: 1_155, saves: 4_891, duration: 27 },
  { key: 'chatcut', stableId: '7668237339872759053', handle: '@chatcutapp', views: 8_363, likes: 390, shares: 113, saves: 460, duration: 44 },
  { key: 'solvex', stableId: '7668377549562580232', handle: '@solvexhq', views: 61, likes: 2, shares: 14, saves: 2, duration: 10 },
  { key: 'lemyn', stableId: '7616362408335985927', handle: '@lemynsu', views: 294_900, likes: 21_100, shares: 593, saves: 5_630, duration: 13 },
  { key: 'carol', stableId: '7668097502750477581', handle: '@carol.yaps', views: 80_700, likes: 11_800, shares: 450, saves: 3_093, duration: 105 },
];
const expectedOrder = [
  '7668237339872759053',
  '7658915994626297109',
  '7668377549562580232',
  '7616362408335985927',
  '7659411879730629920',
  '7668097502750477581',
];
const auditSupportedIds = new Set([
  '7658915994626297109',
  '7668237339872759053',
  '7668097502750477581',
]);

function createState(workspaceId) {
  return {
    workspaces: [{
      id: workspaceId,
      brief: { businessType: 'AI tools', niche: 'vibe coding', product: 'DZHERO', location: 'global' },
      discoverySettings: {
        enabled: true,
        dailyBudgetUsd: 0.8,
        viralScoreThreshold: 70,
        platforms: ['tiktok'],
      },
    }],
    sources: [],
    competitors: [],
    reels: [],
    discoveryRuns: [],
  };
}

function toRaw(candidate, { downloaded = false } = {}) {
  return {
    'authorMeta.name': candidate.handle.replace(/^@/, ''),
    text: `B-soft fixture ${candidate.key}`,
    diggCount: candidate.likes ?? 0,
    shareCount: candidate.shares,
    playCount: candidate.views,
    commentCount: 0,
    collectCount: candidate.saves,
    createTimeISO: '',
    webVideoUrl: `https://www.tiktok.com/${candidate.handle}/video/${candidate.stableId}`,
    videoMeta: candidate.duration === undefined ? {} : { duration: candidate.duration },
    mediaUrls: downloaded ? [`https://cdn.example.test/${candidate.stableId}.mp4`] : [],
  };
}

function mapCandidate(candidate, workspaceId, options = {}) {
  return mapTikTokApifyItem(toRaw(candidate, options), { workspaceId, market: 'global', now });
}

function stableId(signal) {
  return String(signal?.importedMetadata?.tiktokVideoId || signal?.importedMetadata?.externalId || '');
}

function qualityResult(decision, admittedToBank) {
  return {
    policyVersion: qualityGateConfig.version,
    decision,
    admittedToBank,
    qualityScore: decision === 'accept' ? 88 : decision === 'reject' ? 20 : 50,
    brandRelevance: 80,
    rejectionReasons: decision === 'reject' ? ['b_soft_test_reject'] : [],
    uncertaintyReasons: decision === 'uncertain' ? ['b_soft_test_uncertain'] : [],
  };
}

async function runSixCandidateIntegration(label, order, decision = 'reject', admittedToBank = false) {
  const workspaceId = `ws_b_soft_${label}`;
  const state = createState(workspaceId);
  const downloads = [];
  const evaluations = [];
  let metadataMockCalls = 0;
  const result = await discovery.executeAutomaticDiscovery({
    state,
    workspaceId,
    token: 'offline-network-mock',
    now,
    force: true,
    policy,
    maxQualityEvaluations: qualityGateConfig.maxVideoAnalysesPerRun,
    qualityGateConfig: {
      ...qualityGateConfig,
      borderlineReview: { ...(qualityGateConfig.borderlineReview || {}), enabled: false },
    },
    fetchSignals: async (call) => {
      const wantsDownload = Boolean(call.downloadVideos ?? call.downloadVideo);
      if (wantsDownload) {
        downloads.push(call.inputValue);
        const selected = sixCandidateSnapshot.find((candidate) => (
          call.inputValue.endsWith(`/video/${candidate.stableId}`)
        ));
        return selected ? [mapCandidate(selected, workspaceId, { downloaded: true })] : [];
      }
      metadataMockCalls += 1;
      return order.map((candidate) => mapCandidate(candidate, workspaceId));
    },
    evaluateSignalQuality: async ({ signal }) => {
      evaluations.push(signal);
      return qualityResult(decision, admittedToBank);
    },
  });
  assert.equal(metadataMockCalls, 1, `${label}: one metadata mock call`);
  assert.equal(downloads.length, 1, `${label}: at most one winner download`);
  assert.equal(evaluations.length, 1, `${label}: at most one quality evaluation`);
  assert.equal(result.run.qualityEvaluatedCount, 1, `${label}: run records one evaluation`);
  assert.deepEqual(
    Object.keys(result).sort(),
    ['acceptedSignals', 'run', 'updatedSignals'],
    `${label}: executeAutomaticDiscovery return contract remains stable`,
  );
  return { state, result, winner: evaluations[0], downloads, evaluations };
}

function metricCandidate(stableIdValue, protectedIntent, duration, extra = {}) {
  const views = extra.views ?? 10_000;
  return {
    id: `fixture_${stableIdValue || extra.key || 'missing'}`,
    handle: extra.handle || `@fixture-${stableIdValue || extra.key || 'missing'}`,
    sourceUrl: stableIdValue ? `https://www.tiktok.com/@fixture/video/${stableIdValue}` : '',
    views,
    shares: extra.shares ?? protectedIntent * views / 4,
    saves: extra.saves ?? 0,
    score: extra.uiScore ?? 73,
    importedMetadata: {
      platform: 'tiktok',
      externalId: stableIdValue || '',
      tiktokVideoId: stableIdValue || '',
      handle: extra.handle || `@fixture-${stableIdValue || extra.key || 'missing'}`,
      duration,
      ...(extra.importedMetadata || {}),
    },
    signalFilterScore: extra.signalFilterScore,
    providerPass: extra.providerPass,
    brandBrainMatch: extra.brandBrainMatch,
    admittedToBank: extra.admittedToBank,
  };
}

function rankedIds(candidates) {
  return discovery.rankSignalsByBSoft(candidates).map(stableId);
}

function permutations(values) {
  if (values.length < 2) return [values];
  const result = [];
  for (let index = 0; index < values.length; index += 1) {
    const remainder = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const tail of permutations(remainder)) result.push([values[index], ...tail]);
  }
  return result;
}

function position(ranked, id) {
  return ranked.findIndex((candidate) => stableId(candidate) === id) + 1;
}

function assertFiniteScores(ranked, label) {
  for (const candidate of ranked) {
    assert.equal(Number.isFinite(candidate.rankingScore), true, `${label}: finite rankingScore`);
    assert.equal(candidate.rankingScore >= 0, true, `${label}: non-negative rankingScore`);
  }
}

const initialIntegration = await runSixCandidateIntegration('red_green', sixCandidateSnapshot);
console.log(JSON.stringify({
  redGreenWinner: {
    handle: initialIntegration.winner.handle,
    stableId: stableId(initialIntegration.winner),
    score: initialIntegration.winner.score,
    rankingScore: initialIntegration.winner.rankingScore ?? null,
  },
}, null, 2));
assert.equal(
  stableId(initialIntegration.winner),
  expectedOrder[0],
  'production metadata ranking must select @chatcutapp before the sole download and quality evaluation',
);

assert.equal(typeof discovery.rankSignalsByBSoft, 'function', 'production B-soft ranker must be exported for regression coverage');
const mappedSix = sixCandidateSnapshot.map((candidate) => mapCandidate(candidate, 'ws_b_soft_unit'));
const baseline = discovery.rankSignalsByBSoft(mappedSix);
assert.deepEqual(baseline.map(stableId), expectedOrder, 'immutable six-candidate B-soft order');
assert.equal(baseline[0].handle, '@chatcutapp');
assert.equal(auditSupportedIds.has(stableId(baseline[0])), true, 'top-1 is audit-supported');
assert.equal(baseline.slice(0, 3).filter((candidate) => auditSupportedIds.has(stableId(candidate))).length >= 2, true);
assert.notEqual(baseline[0].handle, '@solvexhq');
assert.deepEqual(rankedIds(mappedSix), expectedOrder, 'repeat determinism');

const allPermutations = permutations(mappedSix);
for (const candidateOrder of allPermutations) {
  assert.deepEqual(rankedIds(candidateOrder), expectedOrder, 'all 720 permutations preserve order');
}
for (const candidateOrder of [mappedSix, [...mappedSix].reverse()]) {
  const map = new Map(candidateOrder.map((candidate) => [stableId(candidate), candidate]));
  assert.deepEqual(rankedIds([...map.values()]), expectedOrder, 'Map insertion order is not a ranking signal');
}

const tie = discovery.rankSignalsByBSoft([
  metricCandidate('200', 0.1, 44),
  metricCandidate('100', 0.1, 44),
]);
assert.deepEqual(tie.map(stableId), ['100', '200'], 'stable ID is the final tie-break');
assert.equal(tie[0].rankingScore, tie[1].rankingScore, 'tie fixture scores are exactly equal');

const noIdentityA = metricCandidate('', 0.1, 44, { key: 'z', handle: '@z-fallback' });
const noIdentityB = metricCandidate('', 0.1, 44, { key: 'a', handle: '@a-fallback' });
assert.deepEqual(
  discovery.rankSignalsByBSoft([noIdentityA, noIdentityB]).map((candidate) => candidate.handle),
  ['@a-fallback', '@z-fallback'],
  'missing canonical ID uses deterministic metadata fallback',
);

const separationBase = mappedSix.map((candidate) => ({
  ...candidate,
  signalFilterScore: 0,
  providerPass: false,
  brandBrainMatch: 0,
  admittedToBank: false,
}));
const separationChanged = separationBase.map((candidate) => ({
  ...candidate,
  signalFilterScore: 100,
  providerPass: true,
  brandBrainMatch: 100,
  admittedToBank: true,
}));
assert.deepEqual(rankedIds(separationBase), rankedIds(separationChanged), 'quality/provider/brand/admission fields do not rank metadata');

const originalRandom = Math.random;
let randomCalls = 0;
Math.random = () => {
  randomCalls += 1;
  throw new Error('random_selection_forbidden');
};
try {
  discovery.rankSignalsByBSoft(mappedSix);
} finally {
  Math.random = originalRandom;
}
assert.equal(randomCalls, 0, 'ranking never uses random selection');

const numericAnchor = metricCandidate('5000', 0.1, 44);
const numericCases = [
  metricCandidate('5001', 0, 44, { views: 0, shares: 1, saves: 1 }),
  { ...metricCandidate('5002', 0, 44, { shares: 1, saves: 1 }), views: undefined },
  { ...metricCandidate('5003', 0, 44, { saves: 10 }), shares: undefined },
  { ...metricCandidate('5004', 0, 44, { shares: 10 }), saves: undefined },
  metricCandidate('5005', 0, Number.NaN, { views: Number.NaN, shares: Number.NaN, saves: Number.NaN }),
  metricCandidate('5006', 0, -1, { views: -10, shares: -10, saves: -10 }),
  metricCandidate('5007', 0, 44, { views: 1, shares: Number.POSITIVE_INFINITY, saves: Number.MAX_VALUE }),
];
for (const [index, candidate] of numericCases.entries()) {
  const ranked = discovery.rankSignalsByBSoft([numericAnchor, candidate]);
  assertFiniteScores(ranked, `numeric case ${index}`);
  if (index < 2) assert.notEqual(stableId(ranked[0]), stableId(candidate), 'zero/missing views fixture does not win');
}

const boundaryAt = (duration) => discovery.rankSignalsByBSoft([
  metricCandidate('100', 0.2, 44),
  metricCandidate('200', 0.3, duration),
  metricCandidate('300', 0.1, 44),
]);
assert.equal(Math.abs(position(boundaryAt(11.9), '200') - position(boundaryAt(12), '200')) < 2, true, '11.9/12.0 has no position jump');
assert.equal(Math.abs(position(boundaryAt(60), '200') - position(boundaryAt(60.1), '200')) < 2, true, '60.0/60.1 has no position jump');

const weakAnchors = [
  metricCandidate('100', 0.01, 44),
  metricCandidate('200', 0.02, 44),
  metricCandidate('300', 0.03, 44),
];
assert.equal(position(discovery.rankSignalsByBSoft([...weakAnchors, metricCandidate('400', 0.15, 9)]), '400') <= 3, true, 'short supported fixture remains top-3');
assert.equal(position(discovery.rankSignalsByBSoft([...weakAnchors, metricCandidate('500', 0.15, 105)]), '500') <= 3, true, 'long supported fixture remains top-3');

const lowView = discovery.rankSignalsByBSoft([
  metricCandidate('600', 0.1, 44),
  metricCandidate('700', 0, 44, { views: 100, shares: 4, saves: 3 }),
]);
assert.notEqual(stableId(lowView[0]), '700', 'low-view anomaly is not winner');
const viral = discovery.rankSignalsByBSoft([
  metricCandidate('800', 0.05, 44),
  metricCandidate('900', 0.001, 44, { views: 10_000_000 }),
]);
assert.notEqual(stableId(viral[0]), '900', 'viral spectacle with weak intent is not winner');
const missingDuration = discovery.rankSignalsByBSoft([
  metricCandidate('1000', 0.05, 44),
  metricCandidate('1100', 0.2, undefined),
]);
assert.equal(stableId(missingDuration[0]), '1100', 'missing duration is not hard-excluded');
assert.equal(missingDuration[0].rankingComponents.missingDuration, true);

for (const shareScale of [0.8, 1, 1.2]) {
  for (const saveScale of [0.8, 1, 1.2]) {
    const sensitivity = mappedSix.map((candidate) => ({
      ...candidate,
      shares: candidate.shares * shareScale,
      saves: candidate.saves * saveScale,
    }));
    const ranked = discovery.rankSignalsByBSoft(sensitivity);
    assert.equal(auditSupportedIds.has(stableId(ranked[0])), true, 'coefficient sensitivity keeps supported top-1');
    assert.notEqual(stableId(ranked[0]), '7668377549562580232', 'coefficient sensitivity keeps Solvex from top-1');
  }
}

const allMissing = discovery.rankSignalsByBSoft([
  metricCandidate('1200', 0.1, undefined),
  metricCandidate('1300', 0.2, undefined),
]);
assert.equal(allMissing.every((candidate) => candidate.rankingComponents.durationPrior === 1), true, 'all missing durations use prior=1');
const oneKnown = discovery.rankSignalsByBSoft([
  metricCandidate('1400', 0.1, 6),
  metricCandidate('1500', 0.2, undefined),
  metricCandidate('1600', 0.3, undefined),
]);
assert.equal(oneKnown.find((candidate) => stableId(candidate) === '1500').rankingComponents.durationPrior, 2 / 3, 'one known prior is median for all missing durations');
assert.equal(oneKnown.find((candidate) => stableId(candidate) === '1600').rankingComponents.durationPrior, 2 / 3);
const negativeDuration = discovery.rankSignalsByBSoft([metricCandidate('1700', 0.1, -1), metricCandidate('1800', 0.1, 44)]);
assert.equal(negativeDuration.find((candidate) => stableId(candidate) === '1700').rankingComponents.missingDuration, true, 'negative duration is invalid/missing');
const zeroDuration = discovery.rankSignalsByBSoft([metricCandidate('1900', 0.1, 0)]);
assert.equal(zeroDuration[0].rankingComponents.missingDuration, false, 'duration=0 is known');
assert.equal(zeroDuration[0].rankingComponents.durationDistance, 12);
assert.equal(zeroDuration[0].rankingComponents.durationPrior, 0.5);
const mappedZeroDuration = mapCandidate({
  key: 'duration-zero', stableId: '1950', handle: '@duration-zero', views: 10_000, likes: 1, shares: 10, saves: 10, duration: 0,
}, 'ws_b_soft_duration_zero');
assert.equal(mappedZeroDuration.importedMetadata.duration, 0, 'Apify normalization preserves duration=0');
assert.equal(discovery.rankSignalsByBSoft([mappedZeroDuration])[0].rankingComponents.durationPrior, 0.5);
const mappedNegativeDuration = mapCandidate({
  key: 'duration-negative', stableId: '1960', handle: '@duration-negative', views: 10_000, likes: 1, shares: 10, saves: 10, duration: -1,
}, 'ws_b_soft_duration_negative');
assert.equal(discovery.rankSignalsByBSoft([mappedNegativeDuration])[0].rankingComponents.missingDuration, true, 'Apify-normalized negative duration is invalid/missing');

const immutableInput = mappedSix.map((candidate) => structuredClone(candidate));
const immutableSnapshot = structuredClone(immutableInput);
discovery.rankSignalsByBSoft(immutableInput);
assert.deepEqual(immutableInput, immutableSnapshot, 'ranker does not mutate input candidates');
assert.equal(baseline.every((candidate) => candidate.score >= 55 && candidate.score <= 96), true, 'UI-facing score is preserved');
assert.equal(baseline.every((candidate) => candidate.rankingVersion === 'b_soft_v1'), true);
assertFiniteScores(baseline, 'six-candidate baseline');

async function runDuplicateMedianIntegration(includeDuplicate) {
  const workspaceId = `ws_b_soft_duplicate_${includeDuplicate}`;
  const state = createState(workspaceId);
  const candidates = [
    metricCandidate('2100', 0.01, 12),
    metricCandidate('2200', 0.01, 72),
    metricCandidate('2300', 0.2, undefined),
  ];
  if (includeDuplicate) candidates.push(structuredClone(candidates[1]));
  let evaluated;
  await discovery.executeAutomaticDiscovery({
    state,
    workspaceId,
    token: 'offline-network-mock',
    now,
    force: true,
    policy,
    maxQualityEvaluations: 1,
    qualityGateConfig: { ...qualityGateConfig, borderlineReview: { enabled: false } },
    fetchSignals: async (call) => {
      if (Boolean(call.downloadVideos ?? call.downloadVideo)) {
        const selected = candidates.find((candidate) => candidate.sourceUrl === call.inputValue);
        return [{ ...selected, videoUrl: `https://cdn.example.test/${stableId(selected)}.mp4`, importedMetadata: { ...selected.importedMetadata, videoUrl: `https://cdn.example.test/${stableId(selected)}.mp4` } }];
      }
      return candidates;
    },
    evaluateSignalQuality: async ({ signal }) => {
      evaluated = signal;
      return qualityResult('reject', false);
    },
  });
  return evaluated;
}
const withoutDuplicate = await runDuplicateMedianIntegration(false);
const withDuplicate = await runDuplicateMedianIntegration(true);
assert.equal(stableId(withoutDuplicate), '2300');
assert.equal(stableId(withDuplicate), '2300');
assert.equal(withoutDuplicate.rankingComponents.durationPrior, 0.75);
assert.equal(withDuplicate.rankingComponents.durationPrior, 0.75, 'duplicates do not affect median duration prior');

const reversedIntegration = await runSixCandidateIntegration('reversed', [...sixCandidateSnapshot].reverse());
assert.equal(stableId(reversedIntegration.winner), expectedOrder[0], 'provider order does not change winner');
const accepted = await runSixCandidateIntegration('accept', sixCandidateSnapshot, 'accept', true);
assert.equal(accepted.state.reels.length, 1, 'accept + admittedToBank=true enters the bank');
assert.equal(accepted.result.acceptedSignals.length, 1);
assert.equal(accepted.state.reels[0].rankingScore, baseline[0].rankingScore, 'rankingScore survives into admitted signal');
assert.equal(accepted.state.reels[0].importedMetadata.qualityGate.qualityScore, 88, 'qualityScore remains separate');
assert.notEqual(accepted.state.reels[0].score, accepted.state.reels[0].rankingScore, 'UI score is not replaced by rankingScore');
const rejected = await runSixCandidateIntegration('reject', sixCandidateSnapshot, 'reject', true);
assert.equal(rejected.state.reels.length, 0, 'reject never enters the bank');
assert.equal(rejected.result.run.qualityDecisions[0].admittedToBank, false);
const uncertain = await runSixCandidateIntegration('uncertain', sixCandidateSnapshot, 'uncertain', true);
assert.equal(uncertain.state.reels.length, 0, 'uncertain never enters the bank');
assert.equal(uncertain.result.run.qualityDecisions[0].admittedToBank, false);

console.log(JSON.stringify({
  status: 'PASS',
  rankingVersion: 'b_soft_v1',
  sixCandidateOrder: baseline.map((candidate, index) => ({
    rank: index + 1,
    handle: candidate.handle,
    stableId: stableId(candidate),
    score: candidate.score,
    rankingScore: candidate.rankingScore,
  })),
  permutations: allPermutations.length,
  maxVideoAnalysesPerRun: qualityGateConfig.maxVideoAnalysesPerRun,
  externalProviderCalls: 0,
  networkAttempts: networkAudit.attempts,
}, null, 2));
assert.equal(networkAudit.attempts, 0);
console.log('Automatic discovery B-soft production regression passed');
