import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  persistProductBrand,
  resolveWorkspaceDiscoveryBrand,
} = require('../backend/services/productBrandBrain.cjs');
const {
  buildDiscoveryInputs,
  executeAutomaticDiscovery,
  prepareAutomaticDiscovery,
} = require('../backend/services/automaticSignalDiscovery.js');

const now = new Date('2026-07-31T12:00:00.000Z');
const workspaceId = 'ws_product_integration';
const workspace = {
  id: workspaceId,
  brief: {
    businessType: 'demo fallback niche',
    niche: 'demo fallback niche',
    product: 'demo fallback product',
    audience: 'demo fallback audience',
    location: 'demo fallback market',
  },
  discoverySettings: {
    enabled: true,
    dailyBudgetUsd: 0.8,
    viralScoreThreshold: 70,
    platforms: ['tiktok'],
  },
};

const productBrand = persistProductBrand(workspace, {
  id: 'brand-ai-studio',
  name: 'AI Studio',
  brain: {
    profileDescription: 'A practical AI workflow studio for small product teams.',
    audience: 'Founders and product builders',
    niche: 'AI workflow automation',
    market: 'Ukraine and Europe',
    instagramUrl: 'https://instagram.com/ai.studio',
  },
}, now);
assert.equal(productBrand.id, 'brand-ai-studio');
assert.equal(productBrand.brain.niche, 'AI workflow automation');

const restored = resolveWorkspaceDiscoveryBrand(workspace, {
  requireProductBrandBrain: true,
  activeBrandId: productBrand.id,
});
assert.equal(restored.complete, true);
assert.equal(restored.source, 'product_redesign');
assert.equal(restored.brief.niche, 'AI workflow automation');
assert.notEqual(restored.brief.niche, workspace.brief.niche, 'demo fallback must not replace the active redesign Brand Brain');

const incompleteWorkspace = {
  ...workspace,
  productBrandBrain: {
    ...productBrand,
    brain: { ...productBrand.brain, niche: '', market: '' },
  },
};
assert.throws(
  () => prepareAutomaticDiscovery({
    state: {
      workspaces: [incompleteWorkspace],
      sources: [],
      competitors: [],
      reels: [],
      discoveryRuns: [],
    },
    workspaceId,
    now,
    force: true,
    requireProductBrandBrain: true,
    activeBrandId: productBrand.id,
  }),
  (error) => error?.message === 'automatic_discovery_brand_brain_incomplete'
    && error?.status === 422
    && error?.payload?.missingFields?.includes('niche')
    && error?.payload?.missingFields?.includes('market'),
);

const state = {
  workspaces: [workspace],
  sources: [],
  competitors: [],
  reels: [],
  discoveryRuns: [],
};
const activeInputs = buildDiscoveryInputs(state, workspaceId, { brandBrain: restored.brief });
const serializedInputs = JSON.stringify(activeInputs).toLowerCase();
assert.match(serializedInputs, /ai workflow automation/);
assert.doesNotMatch(serializedInputs, /demo fallback niche/);

const prepared = prepareAutomaticDiscovery({
  state,
  workspaceId,
  now,
  force: true,
  requireProductBrandBrain: true,
  activeBrandId: productBrand.id,
});
assert.equal(prepared.execution.plannedCalls.length, 1);
assert.equal(prepared.execution.maxWinners, 1);
assert.equal(prepared.execution.maxWinnerDownloads, 1);
assert.equal(prepared.run.auditTrace.plan.maxMetadataCalls, 1);
assert.equal(prepared.run.auditTrace.workspace.brandBrainRef.activeBrandId, productBrand.id);

const sourceUrl = 'https://www.tiktok.com/@chatcut/video/123456789';
function candidate(downloaded = false) {
  const videoUrl = downloaded ? 'https://cdn.example.test/chatcut.mp4' : '';
  return {
    id: 'chatcut',
    workspaceId,
    sourceHandle: '@chatcut',
    handle: '@chatcut',
    sourceUrl,
    sourceStatus: downloaded ? 'apify_video' : 'apify_metadata',
    sourceType: 'TikTok',
    market: 'ukraine',
    title: 'Build a useful AI workflow',
    caption: 'A concrete workflow walkthrough.',
    videoUrl,
    views: 100_000,
    likes: 8_000,
    comments: 120,
    shares: 2_000,
    saves: 3_000,
    score: 90,
    duration: 30,
    importedMetadata: {
      provider: 'fixture',
      platform: 'tiktok',
      externalId: '123456789',
      tiktokVideoId: '123456789',
      url: sourceUrl,
      videoUrl,
      mediaUrls: videoUrl ? [videoUrl] : [],
      duration: 30,
      stats: { views: 100_000, likes: 8_000, comments: 120, shares: 2_000, saves: 3_000 },
    },
  };
}

let metadataCalls = 0;
let downloadCalls = 0;
let analysisCalls = 0;
const result = await executeAutomaticDiscovery({
  state,
  workspaceId,
  now,
  prepared,
  fetchSignals: async (call) => {
    if (call.downloadVideo || call.downloadVideos) {
      downloadCalls += 1;
      return [candidate(true)];
    }
    metadataCalls += 1;
    return [candidate(false)];
  },
  maxQualityEvaluations: 99,
  qualityGateConfig: { version: 3.1, borderlineReview: { maxRechecksPerRun: 0 } },
  evaluateSignalQuality: async ({ workspace: receivedWorkspace }) => {
    analysisCalls += 1;
    assert.equal(receivedWorkspace.brief.niche, 'AI workflow automation');
    return {
      policyVersion: 3.1,
      decision: 'accept',
      admittedToBank: true,
      qualityScore: 72,
      brandRelevance: 68,
      rejectionReasons: [],
      uncertaintyReasons: [],
      auditTrace: {
        mediaSha256: 'a'.repeat(64),
        rawResponse: { interaction: 'fixture-raw-response' },
        parsedResult: { accessible: true, summary: 'fixture parsed result' },
        usage: { inputTokens: 10, outputTokens: 5 },
        estimatedCostUsd: 0.001,
      },
    };
  },
});

assert.equal(metadataCalls, 1);
assert.equal(downloadCalls, 1);
assert.equal(analysisCalls, 1);
assert.equal(result.acceptedSignals.length, 1);
assert.equal(result.acceptedSignals[0].rankingVersion, 'b_soft_v1');
assert.equal(result.acceptedSignals[0].importedMetadata.qualityGate.decision, 'accept');
assert.equal(result.acceptedSignals[0].importedMetadata.qualityGate.admittedToBank, true);
assert.ok(result.run.auditTrace.rawMetadataCandidates.length > 0);
assert.ok(result.run.auditTrace.normalizedEligibleCandidates.length > 0);
assert.equal(result.run.auditTrace.topCandidates[0].rankingVersion, 'b_soft_v1');
assert.equal(result.run.auditTrace.selectedTopCandidate.id, 'chatcut');
assert.equal(result.run.auditTrace.download.mediaSha256, 'a'.repeat(64));
assert.deepEqual(result.run.auditTrace.gemini.rawResponse, { interaction: 'fixture-raw-response' });
assert.equal(result.run.auditTrace.gemini.parsedResult.summary, 'fixture parsed result');
assert.equal(result.run.auditTrace.signalFilter.decision, 'accept');
assert.equal(result.run.auditTrace.signalFilter.admittedToBank, true);
assert.equal(result.run.auditTrace.providerCost.geminiEstimatedUsd, 0.001);

console.log('MVP discovery integration checks passed.');
