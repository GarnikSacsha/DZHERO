import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  executeAutomaticDiscovery,
} = require('../backend/services/automaticSignalDiscovery.js');
const {
  loadSignalQualityGateConfig,
} = require('../backend/services/signalQualityGate.cjs');

const now = new Date('2026-07-30T12:00:00.000Z');
const qualityGateConfig = loadSignalQualityGateConfig();
const policy = {
  dailyBudgetUsd: 0.8,
  dailyTarget: 10,
  maxBudgetedRunsPerDay: 1,
  resultLimitPerPlatform: 1,
  maxPlannedCalls: 1,
};

function createState(workspaceId) {
  return {
    workspaces: [{
      id: workspaceId,
      brief: {
        businessType: 'AI tools',
        niche: 'vibe coding',
        product: 'DZHERO',
        audience: 'builders using AI coding agents',
        location: 'global',
      },
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

function createCandidate(workspaceId, { downloaded = false } = {}) {
  const sourceUrl = 'https://www.tiktok.com/@axial.studio/video/7646239971480702239';
  const videoUrl = downloaded
    ? 'https://api.apify.com/v2/key-value-stores/example/records/video.mp4'
    : '';
  return {
    id: 'candidate_axial',
    workspaceId,
    sourceHandle: '@axial.studio',
    handle: '@axial.studio',
    sourceUrl,
    sourceStatus: downloaded ? 'apify_video' : 'apify_metadata',
    scanLabel: 'TikTok',
    sourceType: 'TikTok',
    market: 'global',
    title: 'The sims for managing AI agents',
    caption: 'A highly topical product teaser.',
    image: 'https://example.com/axial.jpg',
    videoUrl,
    views: 307500,
    likes: 16600,
    comments: 101,
    shares: 2053,
    saves: 8780,
    importedMetadata: {
      provider: 'apify',
      platform: 'tiktok',
      externalId: '7646239971480702239',
      tiktokVideoId: '7646239971480702239',
      url: sourceUrl,
      videoUrl,
      mediaUrls: videoUrl ? [videoUrl] : [],
      handle: '@axial.studio',
      publishedAt: '2026-06-01T01:56:30.000Z',
      sourceStatus: downloaded ? 'apify_video' : 'apify_metadata',
    },
  };
}

function createFetchSignals(workspaceId) {
  return async (call) => {
    if (Boolean(call.downloadVideos ?? call.downloadVideo)) {
      return [createCandidate(workspaceId, { downloaded: true })];
    }
    return [createCandidate(workspaceId)];
  };
}

const rejectedState = createState('ws_quality_reject');
let rejectedProviderCalls = 0;
let rejectedQualityCalls = 0;
const rejectedResult = await executeAutomaticDiscovery({
  state: rejectedState,
  workspaceId: 'ws_quality_reject',
  token: 'test-token',
  now,
  force: true,
  policy,
  fetchSignals: async (call) => {
    rejectedProviderCalls += 1;
    return createFetchSignals('ws_quality_reject')(call);
  },
  maxQualityEvaluations: 1,
  qualityGateConfig,
  evaluateSignalQuality: async ({ signal }) => {
    rejectedQualityCalls += 1;
    assert.match(signal.videoUrl, /api\.apify\.com/);
    return {
      policyVersion: qualityGateConfig.version,
      policy: 'universal_signal_bank',
      generatedContentPolicy: 'ignore_origin',
      decision: 'reject',
      admittedToBank: true,
      qualityScore: 25,
      brandRelevance: 96,
      scores: {
        contentValue: 18,
        adaptability: 8,
        topicClarity: 91,
        hookStrength: 54,
        payoffStrength: 12,
        brandRelevance: 96,
      },
      evidenceConfidence: 0.9,
      summary: 'Topical product teaser without a useful progression or payoff.',
      centralIdea: '',
      contentMechanic: '',
      visualExecution: 'Handheld footage of dashboard screens.',
      adaptationTemplate: '',
      contentMechanicEvidenceIds: [],
      transferableMechanic: '',
      slopIndicators: ['decorative_product_tease'],
      rejectionReasons: ['no_central_idea', 'no_transferable_mechanic', 'low_content_value'],
      unknowns: [],
    };
  },
});

assert.equal(rejectedResult.acceptedSignals.length, 0);
assert.equal(rejectedState.reels.length, 0);
assert.equal(rejectedResult.run.qualityEvaluatedCount, 1);
assert.equal(rejectedResult.run.qualityAcceptedCount, 0);
assert.equal(rejectedResult.run.qualityRejectedCount, 1);
assert.equal(rejectedResult.run.qualityDecisions[0].decision, 'reject');
assert.equal(rejectedResult.run.qualityDecisions[0].admittedToBank, false);
assert.equal(rejectedResult.run.qualityDecisions[0].brandRelevance, 96);
assert.equal(rejectedResult.run.qualityDecisions[0].policyVersion, qualityGateConfig.version);
assert.match(rejectedResult.run.qualityDecisions[0].cachedUntil, /^2026-/);
assert.equal(rejectedProviderCalls, 2);
assert.equal(rejectedQualityCalls, 1);

const cachedRejectedResult = await executeAutomaticDiscovery({
  state: rejectedState,
  workspaceId: 'ws_quality_reject',
  token: 'test-token',
  now: new Date('2026-07-31T12:00:00.000Z'),
  force: true,
  policy,
  fetchSignals: async (call) => {
    rejectedProviderCalls += 1;
    return createFetchSignals('ws_quality_reject')(call);
  },
  maxQualityEvaluations: 1,
  qualityGateConfig,
  evaluateSignalQuality: async () => {
    rejectedQualityCalls += 1;
    throw new Error('cached rejection must not reach quality evaluation');
  },
});

assert.equal(cachedRejectedResult.acceptedSignals.length, 0);
assert.equal(cachedRejectedResult.run.qualityCacheHitCount, 1);
assert.equal(cachedRejectedResult.run.qualityEvaluatedCount, 0);
assert.equal(rejectedProviderCalls, 3);
assert.equal(rejectedQualityCalls, 1);

const bumpedPolicyConfig = {
  ...qualityGateConfig,
  version: qualityGateConfig.version + 1,
  borderlineReview: {
    ...(qualityGateConfig.borderlineReview || {}),
    enabled: false,
  },
};
const policyBumpResult = await executeAutomaticDiscovery({
  state: rejectedState,
  workspaceId: 'ws_quality_reject',
  token: 'test-token',
  now: new Date('2026-08-01T12:00:00.000Z'),
  force: true,
  policy,
  fetchSignals: async (call) => {
    rejectedProviderCalls += 1;
    return createFetchSignals('ws_quality_reject')(call);
  },
  maxQualityEvaluations: 1,
  qualityGateConfig: bumpedPolicyConfig,
  evaluateSignalQuality: async () => {
    rejectedQualityCalls += 1;
    return {
      policyVersion: bumpedPolicyConfig.version,
      decision: 'reject',
      qualityScore: 25,
      brandRelevance: 96,
      scores: {
        contentValue: 18,
        adaptability: 8,
        topicClarity: 91,
      },
      slopIndicators: ['decorative_product_tease'],
      rejectionReasons: ['low_content_value'],
    };
  },
});

assert.equal(policyBumpResult.run.qualityCacheHitCount, 0);
assert.equal(policyBumpResult.run.qualityEvaluatedCount, 1);
assert.equal(rejectedProviderCalls, 5);
assert.equal(rejectedQualityCalls, 2);

const acceptedState = createState('ws_quality_accept');
const acceptedResult = await executeAutomaticDiscovery({
  state: acceptedState,
  workspaceId: 'ws_quality_accept',
  token: 'test-token',
  now,
  force: true,
  policy,
  fetchSignals: createFetchSignals('ws_quality_accept'),
  maxQualityEvaluations: 1,
  qualityGateConfig,
  evaluateSignalQuality: async ({ signal }) => ({
    policyVersion: qualityGateConfig.version,
    policy: 'universal_signal_bank',
    generatedContentPolicy: 'ignore_origin',
    decision: 'accept',
    admittedToBank: true,
    admissionMode: 'process_demo',
    passedModes: ['process_demo'],
    modeResults: [{
      mode: 'process_demo',
      passed: true,
      evidenceIds: ['obs_1'],
      missingRequirements: [],
    }],
    qualityScore: 88,
    brandRelevance: 93,
    scores: {
      contentValue: 88,
      adaptability: 91,
      topicClarity: 94,
      hookStrength: 82,
      payoffStrength: 86,
      brandRelevance: 93,
    },
    evidenceConfidence: 0.92,
    summary: 'A grounded workflow demonstration with a visible outcome.',
    centralIdea: 'Replace a repeated manual task with a supervised agent workflow.',
    contentMechanic: 'Show a repeated task, replace it with a workflow, and prove the result.',
    visualExecution: 'A narrated screen recording.',
    adaptationTemplate: '[manual task] → [workflow setup] → [visible result]',
    contentMechanicEvidenceIds: ['obs_1'],
    transferableMechanic: 'Show the task, build the workflow, and reveal the result.',
    derivedClaims: {
      centralIdea: {
        text: 'Replace a repeated manual task with a supervised agent workflow.',
        evidenceIds: ['obs_1'],
        supportLevel: 'demonstrated',
      },
      contentMechanic: {
        text: 'Show a repeated task, replace it with a workflow, and prove the result.',
        evidenceIds: ['obs_1'],
        supportLevel: 'demonstrated',
      },
      visualExecution: {
        text: 'A narrated screen recording.',
        evidenceIds: ['obs_1'],
        supportLevel: 'demonstrated',
      },
      adaptationTemplate: {
        text: '[manual task] → [workflow setup] → [visible result]',
        evidenceIds: ['obs_1'],
        supportLevel: 'inferred',
      },
    },
    slopIndicators: [],
    rejectionReasons: [],
    observations: [{
      id: 'obs_1',
      timestamp: '00:02-00:18',
      source: 'visual',
      kind: 'process',
      description: 'The workflow and completed result are visible.',
      confidence: 0.92,
    }],
    unknowns: [],
    sourceUrl: signal.sourceUrl,
  }),
});

assert.equal(acceptedResult.acceptedSignals.length, 1);
assert.equal(acceptedState.reels.length, 1);
assert.equal(acceptedResult.run.qualityEvaluatedCount, 1);
assert.equal(acceptedResult.run.qualityAcceptedCount, 1);
assert.equal(acceptedResult.run.qualityRejectedCount, 0);
assert.equal(acceptedResult.acceptedSignals[0].importedMetadata.qualityGate.decision, 'accept');
assert.equal(acceptedResult.acceptedSignals[0].importedMetadata.qualityGate.admittedToBank, true);
assert.equal(acceptedResult.acceptedSignals[0].importedMetadata.qualityGate.qualityScore, 88);
assert.equal(acceptedResult.acceptedSignals[0].importedMetadata.qualityGate.brandRelevance, 93);
assert.equal(acceptedResult.acceptedSignals[0].importedMetadata.qualityGate.generatedContentPolicy, 'ignore_origin');
assert.equal(acceptedResult.acceptedSignals[0].importedMetadata.qualityGate.admissionMode, 'process_demo');
assert.match(
  acceptedResult.acceptedSignals[0].importedMetadata.qualityGate.contentMechanic,
  /repeated task/i,
);
assert.equal(
  acceptedResult.acceptedSignals[0].importedMetadata.qualityGate.observations[0].id,
  'obs_1',
);

const uncertainState = createState('ws_quality_uncertain');
const uncertainResult = await executeAutomaticDiscovery({
  state: uncertainState,
  workspaceId: 'ws_quality_uncertain',
  token: 'test-token',
  now,
  force: true,
  policy,
  fetchSignals: createFetchSignals('ws_quality_uncertain'),
  maxQualityEvaluations: 1,
  qualityGateConfig,
  evaluateSignalQuality: async () => ({
    policyVersion: qualityGateConfig.version,
    decision: 'uncertain',
    admittedToBank: true,
    qualityScore: 90,
    brandRelevance: 90,
    scores: {
      contentValue: 90,
      adaptability: 90,
      topicClarity: 90,
      hookStrength: 90,
      payoffStrength: 90,
      brandRelevance: 90,
    },
    rejectionReasons: ['no_qualifying_evidence_mode'],
    uncertaintyReasons: ['ambiguous_or_invalid_evidence_chain'],
  }),
});

assert.equal(uncertainResult.acceptedSignals.length, 0);
assert.equal(uncertainState.reels.length, 0);
assert.equal(uncertainResult.run.qualityAcceptedCount, 0);
assert.equal(uncertainResult.run.qualityRejectedCount, 0);
assert.equal(uncertainResult.run.qualityUncertainCount, 1);
assert.equal(uncertainResult.run.qualityDecisions[0].decision, 'uncertain');
assert.equal(uncertainResult.run.qualityDecisions[0].admittedToBank, false);
assert.deepEqual(
  uncertainResult.run.qualityDecisions[0].uncertaintyReasons,
  ['ambiguous_or_invalid_evidence_chain'],
);

const borderlineState = createState('ws_quality_borderline');
let borderlineQualityCalls = 0;
const borderlineResult = await executeAutomaticDiscovery({
  state: borderlineState,
  workspaceId: 'ws_quality_borderline',
  token: 'test-token',
  now,
  force: true,
  policy,
  fetchSignals: createFetchSignals('ws_quality_borderline'),
  maxQualityEvaluations: 1,
  qualityGateConfig,
  evaluateSignalQuality: async () => {
    borderlineQualityCalls += 1;
    return {
      policyVersion: qualityGateConfig.version,
      policy: 'universal_signal_bank',
      generatedContentPolicy: 'ignore_origin',
      decision: 'accept',
      admittedToBank: true,
      qualityScore: borderlineQualityCalls === 1 ? 66 : 67,
      brandRelevance: 60,
      scores: {
        contentValue: borderlineQualityCalls === 1 ? 66 : 67,
        adaptability: 63,
        topicClarity: 72,
        hookStrength: 64,
        payoffStrength: 65,
        brandRelevance: 60,
      },
      evidenceConfidence: 0.9,
      summary: 'A useful but threshold-adjacent workflow.',
      centralIdea: 'Make a complex workflow approachable for beginners.',
      contentMechanic: 'Start with a difficult task, reveal ready modules, then show the result.',
      visualExecution: 'A UI walkthrough.',
      adaptationTemplate: '[difficult task] → [ready modules] → [result]',
      contentMechanicEvidenceIds: ['obs_1'],
      transferableMechanic: 'Start with a difficult task, reveal ready modules, then show the result.',
      slopIndicators: [],
      rejectionReasons: [],
      observations: [{
        id: 'obs_1',
        sourceType: 'video_observation',
        text: 'The video moves from the difficult task through ready modules to a result.',
        timestamp: '00:01-00:20',
        confidence: 0.9,
      }],
      unknowns: [],
    };
  },
});

assert.equal(borderlineQualityCalls, 1);
assert.equal(borderlineResult.run.qualityEvaluatedCount, 1);
assert.equal(borderlineResult.run.qualityInteractionCount, 1);
assert.equal(borderlineResult.run.qualityRecheckCount, 0);
assert.equal(borderlineResult.acceptedSignals.length, 1);
assert.equal(borderlineResult.acceptedSignals[0].importedMetadata.qualityGate.review, null);

console.log('automatic discovery quality gate integration tests passed');
