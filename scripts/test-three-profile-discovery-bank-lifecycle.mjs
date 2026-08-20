import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { mapQualityAcceptedSignalsToProductCards } from '../src/productSignalsViewState.mjs';

const require = createRequire(import.meta.url);
const { persistProductBrand, resolveWorkspaceDiscoveryBrand } = require('../backend/services/productBrandBrain.cjs');
const { buildDiscoveryInputs, executeAutomaticDiscovery, prepareAutomaticDiscovery } = require('../backend/services/automaticSignalDiscovery.js');
const { evaluateSignalQuality, loadSignalQualityGateConfig } = require('../backend/services/signalQualityGate.cjs');

const policy = { dailyBudgetUsd: 0.8, dailyTarget: 5, maxBudgetedRunsPerDay: 1, resultLimitPerPlatform: 5, maxPlannedCalls: 1 };
const qualityGateConfig = loadSignalQualityGateConfig();
assert.equal(qualityGateConfig.version, 3.1);
assert.equal(qualityGateConfig.maxVideoAnalysesPerRun, 1);

const originalFetch = globalThis.fetch;
let networkTripwireCalls = 0;
const queryExamples = new Map();
globalThis.fetch = async () => {
  networkTripwireCalls += 1;
  throw new Error('network_tripwire_triggered');
};

const longAiDescription = `${'Educational AI content for practical marketing teams that need trustworthy workflow demonstrations, clear before and after evidence, and repeatable campaign operations. '.repeat(3)}This profile intentionally exceeds the compact discovery-query boundary while remaining valid onboarding free text.`;
assert.ok(longAiDescription.length >= 429);
const profiles = [
  { id: 'ai', workspaceId: 'ws_three_profile_ai', allowedQueries: ['ai workflow tutorials and demonstrations'], brand: { name: 'AI Learning Lab', profileDescription: longAiDescription, audience: 'Marketing teams learning practical AI workflows', contentFocus: 'AI workflow tutorials and demonstrations' } },
  { id: 'fitness', workspaceId: 'ws_three_profile_fitness', allowedQueries: ['simple home-training demonstrations', 'practical fitness and home-training content for consistent routines.'], brand: { name: 'Move At Home', profileDescription: 'Practical fitness and home-training content for consistent routines.', audience: 'Beginners and busy people', contentFocus: 'Simple home-training demonstrations' } },
  { id: 'cafe', workspaceId: 'ws_three_profile_cafe', allowedQueries: ['coffee, breakfast, and neighbourhood food rituals', 'local café and restaurant content for kyiv breakfast and coffee rituals.'], brand: { name: 'Kyiv Morning Cafe', profileDescription: 'Local café and restaurant content for Kyiv breakfast and coffee rituals.', audience: 'Nearby Kyiv residents and visitors', contentFocus: 'Coffee, breakfast, and neighbourhood food rituals' } },
];

function createWorkspace(profile, now) {
  const workspace = {
    id: profile.workspaceId,
    brief: { businessType: 'legacy fallback that must not drive product discovery' },
    discoverySettings: { enabled: true, dailyBudgetUsd: 0.8, viralScoreThreshold: 70, platforms: ['tiktok'] },
  };
  persistProductBrand(workspace, { id: `brand_${profile.id}`, name: profile.brand.name, brain: profile.brand }, now);
  return workspace;
}

function createCandidate(profile, ordinal, { downloaded = false, duplicate = false } = {}) {
  const suffix = duplicate ? 1 : ordinal;
  const externalId = `${profile.id}-video-${suffix}`;
  const sourceUrl = `https://www.tiktok.com/@${profile.id}_creator/video/${externalId}`;
  const videoUrl = downloaded ? `https://media.fixture.invalid/${externalId}.mp4` : '';
  return {
    id: `${profile.id}_candidate_${suffix}`, workspaceId: profile.workspaceId,
    sourceHandle: `@${profile.id}_creator`, handle: `@${profile.id}_creator`, sourceUrl,
    sourceStatus: downloaded ? 'fixture_video' : 'fixture_metadata', sourceType: 'TikTok',
    title: `${profile.brand.profileDescription}: demonstrated transferable technique ${suffix}`,
    caption: `${profile.brand.contentFocus}; practical result ${suffix}.`, videoUrl,
    views: 150_000 + ordinal, likes: 9_000, comments: 300, shares: 2_200, saves: 2_800, duration: 30,
    importedMetadata: {
      provider: 'provider-free-fixture', platform: 'tiktok', externalId, tiktokVideoId: externalId,
      url: sourceUrl, videoUrl, mediaUrls: videoUrl ? [videoUrl] : [], duration: 30,
      stats: { views: 150_000 + ordinal, likes: 9_000, comments: 300, shares: 2_200, saves: 2_800 },
    },
  };
}

function blankClaim() {
  return { text: '', evidenceIds: [], supportLevel: 'inferred' };
}

function rawAssessment(profile, outcome) {
  if (outcome === 'uncertain') {
    return {
      accessible: false, summary: 'Fixture video evidence is unavailable.',
      derivedClaims: { centralIdea: blankClaim(), contentMechanic: blankClaim(), visualExecution: blankClaim(), adaptationTemplate: blankClaim() },
      scores: { contentValue: 0, adaptability: 0, topicClarity: 0, hookStrength: 0, payoffStrength: 0, brandRelevance: 0 },
      evidenceConfidence: 0, slopIndicators: [], observations: [], evidenceChains: [], unknowns: ['Fixture video was unavailable.'],
    };
  }
  if (outcome === 'reject') {
    return {
      accessible: true, summary: 'A decorative teaser does not demonstrate a transferable result.',
      derivedClaims: {
        centralIdea: blankClaim(), contentMechanic: blankClaim(),
        visualExecution: { text: 'Fast logo animation.', evidenceIds: ['obs_visual'], supportLevel: 'demonstrated' }, adaptationTemplate: blankClaim(),
      },
      scores: { contentValue: 2, adaptability: 2, topicClarity: 3, hookStrength: 3, payoffStrength: 1, brandRelevance: 8 },
      evidenceConfidence: 0.8, slopIndicators: [],
      observations: [{ id: 'obs_visual', timestamp: '00:02', source: 'visual', kind: 'visual_device', description: 'A logo animation fills the frame.', confidence: 0.9 }],
      evidenceChains: [], unknowns: [],
    };
  }
  return {
    accessible: true, summary: `${profile.brand.profileDescription} demonstrates a visible before, action, and result.`,
    derivedClaims: {
      centralIdea: { text: 'Replace a repeated manual task with a practical workflow.', evidenceIds: ['obs_before', 'obs_action', 'obs_after'], supportLevel: 'demonstrated' },
      contentMechanic: { text: 'Show the initial task, the action, and the visible result.', evidenceIds: ['obs_before', 'obs_action', 'obs_after'], supportLevel: 'demonstrated' },
      visualExecution: { text: 'A direct step-by-step demonstration.', evidenceIds: ['obs_before', 'obs_action', 'obs_after'], supportLevel: 'demonstrated' },
      adaptationTemplate: { text: '[before] → [action] → [result]', evidenceIds: ['obs_before', 'obs_action', 'obs_after'], supportLevel: 'inferred' },
    },
    scores: { contentValue: 8, adaptability: 8, topicClarity: 8, hookStrength: 7, payoffStrength: 8, brandRelevance: 8 }, evidenceConfidence: 0.93, slopIndicators: [],
    observations: [
      { id: 'obs_before', timestamp: '00:02', source: 'visual', kind: 'setup', description: 'The repeated manual task is visible.', confidence: 0.94 },
      { id: 'obs_action', timestamp: '00:08', source: 'visual', kind: 'process', description: 'The creator performs the practical workflow action.', confidence: 0.94 },
      { id: 'obs_after', timestamp: '00:20', source: 'visual', kind: 'result', description: 'The completed result is visibly shown.', confidence: 0.94 },
    ],
    evidenceChains: [{ mode: 'process_demo', beforeEvidenceId: 'obs_before', actionEvidenceId: 'obs_action', afterEvidenceId: 'obs_after', subject: 'the practical task', beforeState: 'The manual task is incomplete.', afterState: 'The completed result is visible.', supportLevel: 'demonstrated', directlyObserved: true, ambiguityReasons: [] }],
    unknowns: [],
  };
}

async function runProfile(profile, state, startedAt) {
  const workspace = state.workspaces.find((item) => item.id === profile.workspaceId);
  const resolved = resolveWorkspaceDiscoveryBrand(workspace, { requireProductBrandBrain: true, activeBrandId: `brand_${profile.id}` });
  assert.equal(resolved.complete, true);
  assert.equal(resolved.brief.product, profile.brand.profileDescription);
  assert.equal(resolved.brief.audience, profile.brand.audience);
  assert.equal(resolved.brief.niche, '');

  const workspaceInputs = buildDiscoveryInputs(state, profile.workspaceId, { brandBrain: resolved.brief });
  const plannedQueries = workspaceInputs.tiktok.keywords;
  assert.ok(plannedQueries.length > 0);
  assert.ok(plannedQueries.every((query) => query.length <= 120 && query.split(/\s+/).length <= 16));
  assert.deepEqual(plannedQueries, profile.allowedQueries);
  assert.equal(plannedQueries.includes('ai tools'), false);
  queryExamples.set(profile.id, [...plannedQueries]);
  const compactQuery = profile.allowedQueries[0];
  const exactAudienceQuery = `${profile.brand.profileDescription.toLowerCase()} ${profile.brand.audience.toLowerCase()}`;
  const providerFixtures = new Map([[exactAudienceQuery, []]]);
  const outcomes = ['accept', 'accept', 'accept', 'reject', 'uncertain', 'reject'];
  let metadataCalls = 0;
  let downloadCalls = 0;
  let analysisCalls = 0;
  let exactLaneAttempts = 0;
  const analysisByIdentity = new Map();

  for (const [ordinal, outcome] of outcomes.entries()) {
    const now = new Date(startedAt.getTime() + ordinal * 24 * 60 * 60_000);
    const metadataCallsBefore = metadataCalls;
    const prepared = prepareAutomaticDiscovery({ state, workspaceId: profile.workspaceId, now, force: true, policy, requireProductBrandBrain: true, activeBrandId: `brand_${profile.id}` });
    assert.equal(prepared.execution.plannedCalls.length, 1);
    assert.equal(prepared.run.auditTrace.plan.maxVideoAnalyses, 1);
    const expectedOrdinal = ordinal === outcomes.length - 1 ? 4 : ordinal + 1;
    const result = await executeAutomaticDiscovery({
      state, workspaceId: profile.workspaceId, now, prepared, policy, qualityGateConfig, maxQualityEvaluations: 99,
      fetchSignals: async (call) => {
        assert.equal(call.workspaceId, profile.workspaceId);
        if (call.downloadVideo || call.downloadVideos) {
          downloadCalls += 1;
          return [createCandidate(profile, expectedOrdinal, { downloaded: true })];
        }
        metadataCalls += 1;
        if (providerFixtures.has(call.inputValue)) {
          exactLaneAttempts += 1;
          return providerFixtures.get(call.inputValue);
        }
        if (!profile.allowedQueries.includes(call.inputValue)) return [];
        if (ordinal === 0) {
          assert.equal(call.inputValue, compactQuery, 'the one bounded metadata call must prefer the compact topic');
          return [createCandidate(profile, expectedOrdinal), createCandidate(profile, expectedOrdinal, { duplicate: true })];
        }
        return [createCandidate(profile, expectedOrdinal)];
      },
      evaluateSignalQuality: async ({ signal, workspace: discoveryWorkspace }) => {
        analysisCalls += 1;
        assert.equal(discoveryWorkspace.brief.product, profile.brand.profileDescription);
        assert.equal(discoveryWorkspace.brief.audience, profile.brand.audience);
        const identity = signal.importedMetadata.externalId;
        analysisByIdentity.set(identity, (analysisByIdentity.get(identity) || 0) + 1);
        return evaluateSignalQuality({ signal, workspace: discoveryWorkspace, config: qualityGateConfig, analyzeVideo: async () => rawAssessment(profile, outcome) });
      },
    });
    assert.equal(metadataCalls - metadataCallsBefore, 1, 'the compact fallback must not create a second metadata provider call');
    assert.equal(result.run.qualityInteractionCount <= 1, true);
    if (ordinal === 0) {
      assert.deepEqual(providerFixtures.get(exactAudienceQuery), [], 'the full audience query is an explicit empty provider fixture');
      assert.equal(result.acceptedSignals.length, 1, 'the compact query admits a candidate in that same one-call run');
      assert.equal(result.run.duplicateCount, 1);
    }
    if (outcome === 'accept') assert.equal(result.acceptedSignals.length, 1);
    else assert.equal(result.acceptedSignals.length, 0);
    if (ordinal === 3) {
      assert.equal(result.run.qualityDecisions[0].decision, 'reject');
      assert.match(result.run.qualityDecisions[0].cachedUntil, /^2026-/);
    }
  }

  assert.equal(exactLaneAttempts, 0, 'a long audience phrase cannot monopolize the one planned call');
  assert.equal(metadataCalls, 6);
  assert.equal(downloadCalls, 5);
  assert.equal(analysisCalls, 5, 'replayed rejected identity must be suppressed before another analysis');
  assert.equal(analysisByIdentity.get(`${profile.id}-video-4`), 1);
  const profileBank = state.reels.filter((signal) => signal.workspaceId === profile.workspaceId);
  assert.equal(profileBank.length, 3);
  assert.ok(profileBank.every((signal) => signal.importedMetadata.qualityGate.decision === 'accept'));
  assert.ok(profileBank.every((signal) => signal.importedMetadata.qualityGate.admittedToBank === true));
  assert.equal(mapQualityAcceptedSignalsToProductCards(profileBank).length, 3);

  const replayNow = new Date(startedAt.getTime() + 8 * 24 * 60 * 60_000);
  const replayPrepared = prepareAutomaticDiscovery({ state, workspaceId: profile.workspaceId, now: replayNow, force: true, policy, requireProductBrandBrain: true, activeBrandId: `brand_${profile.id}` });
  const replay = await executeAutomaticDiscovery({
    state, workspaceId: profile.workspaceId, now: replayNow, prepared: replayPrepared, policy, qualityGateConfig,
    fetchSignals: async () => [createCandidate(profile, 1)],
    evaluateSignalQuality: async () => { throw new Error('existing admitted signal must not be analysed again'); },
  });
  assert.equal(replay.acceptedSignals.length, 0);
  assert.equal(state.reels.filter((signal) => signal.workspaceId === profile.workspaceId).length, 3);
}

const startedAt = new Date('2026-08-20T12:00:00.000Z');
const longOnlyProfile = {
  id: 'long_only', workspaceId: 'ws_three_profile_long_only',
  brand: { name: 'Long Only', profileDescription: longAiDescription, audience: 'Teams with long onboarding answers' },
};
const state = { workspaces: [...profiles, longOnlyProfile].map((profile) => createWorkspace(profile, startedAt)), sources: [], competitors: [], reels: [], discoveryRuns: [] };
const longOnlyWorkspace = state.workspaces.find((workspace) => workspace.id === longOnlyProfile.workspaceId);
const longOnlyBrand = resolveWorkspaceDiscoveryBrand(longOnlyWorkspace, { requireProductBrandBrain: true, activeBrandId: 'brand_long_only' });
const longOnlyInputs = buildDiscoveryInputs(state, longOnlyProfile.workspaceId, { brandBrain: longOnlyBrand.brief });
assert.ok(longOnlyInputs.tiktok.keywords.length > 0);
assert.ok(longOnlyInputs.tiktok.keywords.every((query) => query.length <= 120 && query.split(/\s+/).length <= 16 && query.length > 0));
queryExamples.set('long_only', [...longOnlyInputs.tiktok.keywords]);
const longOnlyPrepared = prepareAutomaticDiscovery({
  state, workspaceId: longOnlyProfile.workspaceId, now: new Date('2026-09-01T12:00:00.000Z'), force: true, policy,
  requireProductBrandBrain: true, activeBrandId: 'brand_long_only',
});
assert.equal(longOnlyPrepared.execution.plannedCalls.length, 1);
assert.ok(longOnlyPrepared.execution.plannedCalls.every((call) => (
  call.inputValue.length > 0
  && call.inputValue.length <= 120
  && call.inputValue.split(/\s+/).length <= 16
  && call.inputValue !== 'ai tools'
)));
const longOnlyResult = await executeAutomaticDiscovery({
  state, workspaceId: longOnlyProfile.workspaceId, now: new Date('2026-09-01T12:00:00.000Z'), prepared: longOnlyPrepared,
  policy, qualityGateConfig, fetchSignals: async () => [],
});
assert.equal(longOnlyResult.run.status, 'failed');
for (const profile of profiles) await runProfile(profile, state, startedAt);

assert.equal(state.reels.length, 9);
for (const profile of profiles) {
  const profileBank = state.reels.filter((signal) => signal.workspaceId === profile.workspaceId);
  assert.equal(profileBank.length, 3);
  assert.ok(profileBank.every((signal) => signal.title.includes(profile.brand.profileDescription)));
  assert.equal(mapQualityAcceptedSignalsToProductCards(profileBank).length, 3);
}
assert.deepEqual(new Set(state.reels.map((signal) => signal.workspaceId)), new Set(profiles.map((profile) => profile.workspaceId)));

const emptyResult = await executeAutomaticDiscovery({
  state, workspaceId: profiles[0].workspaceId, now: new Date('2026-09-20T12:00:00.000Z'), force: true, policy,
  requireProductBrandBrain: true, activeBrandId: 'brand_ai', fetchSignals: async () => [], qualityGateConfig,
});
assert.equal(emptyResult.run.status, 'failed');
assert.equal(emptyResult.run.classifiedFailure.code, 'insufficient_ranking_metadata');
assert.equal(state.reels.filter((signal) => signal.workspaceId === profiles[0].workspaceId).length, 3);

const errorResult = await executeAutomaticDiscovery({
  state, workspaceId: profiles[1].workspaceId, now: new Date('2026-09-21T12:00:00.000Z'), force: true, policy,
  requireProductBrandBrain: true, activeBrandId: 'brand_fitness', qualityGateConfig,
  fetchSignals: async () => { throw new Error('provider_fixture_unavailable'); },
});
assert.equal(errorResult.run.status, 'failed');
assert.match(errorResult.run.errors[0].message, /provider_fixture_unavailable/);
assert.equal(state.reels.filter((signal) => signal.workspaceId === profiles[1].workspaceId).length, 3);
assert.equal(networkTripwireCalls, 0);
globalThis.fetch = originalFetch;

const flattenedQueries = [...queryExamples.values()].flat();
console.log(JSON.stringify({
  status: 'PASS',
  queryExamples: Object.fromEntries(queryExamples),
  maximumMeasuredQueryLength: Math.max(...flattenedQueries.map((query) => query.length)),
  networkTripwireCalls,
}, null, 2));
console.log('Three-profile provider-free Discovery → real Signal Filter → bank lifecycle regression passed.');
