import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  executeAutomaticDiscovery,
} = require('../backend/services/automaticSignalDiscovery.js');
const {
  mapTikTokApifyItem,
} = require('../backend/services/apifySignalProvider.js');
const {
  loadSignalQualityGateConfig,
} = require('../backend/services/signalQualityGate.cjs');

const now = new Date('2026-07-31T12:00:00.000Z');
const qualityGateConfig = loadSignalQualityGateConfig();
const policy = {
  dailyBudgetUsd: 0.8,
  dailyTarget: 2,
  maxBudgetedRunsPerDay: 1,
  resultLimitPerPlatform: 2,
  maxPlannedCalls: 1,
};

const rawCandidates = {
  creativeinezz: {
    'authorMeta.name': 'creativeinezz',
    text: 'Live-test ranking candidate A.',
    diggCount: 3_800_000,
    shareCount: 140_800,
    playCount: 26_300_000,
    commentCount: 0,
    collectCount: 178_699,
    createTimeISO: '',
    webVideoUrl: 'https://www.tiktok.com/@creativeinezz/video/7659411879730629920',
    videoMeta: { duration: 24 },
    mediaUrls: [],
  },
  myfriendisaprogrammer: {
    'authorMeta.name': 'myfriendisaprogrammer',
    text: 'Live-test ranking candidate B.',
    diggCount: 11_100,
    shareCount: 1_155,
    playCount: 177_900,
    commentCount: 0,
    collectCount: 4_891,
    createTimeISO: '',
    webVideoUrl: 'https://www.tiktok.com/@myfriendisaprogrammer/video/7658915994626297109',
    videoMeta: { duration: 27 },
    mediaUrls: [],
  },
};

function createState(workspaceId) {
  return {
    workspaces: [{
      id: workspaceId,
      brief: {
        businessType: 'AI tools',
        niche: 'vibe coding',
        product: 'DZHERO',
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

function mapMetadataCandidate(raw, workspaceId) {
  return mapTikTokApifyItem(raw, {
    workspaceId,
    market: 'global',
    now,
  });
}

function mapDownloadedCandidate(raw, workspaceId) {
  const videoId = raw.webVideoUrl.match(/\/video\/(\d+)/)?.[1];
  return mapTikTokApifyItem({
    ...raw,
    mediaUrls: [`https://cdn.example.test/${videoId}.mp4`],
  }, {
    workspaceId,
    market: 'global',
    now,
  });
}

function stableTikTokId(signal) {
  return signal?.importedMetadata?.tiktokVideoId
    || signal?.importedMetadata?.externalId
    || '';
}

async function runPermutation(label, candidateOrder) {
  const workspaceId = `ws_ranking_order_${label}`;
  const state = createState(workspaceId);
  const qualityEvaluations = [];
  const downloadSelections = [];
  let metadataCalls = 0;

  const fetchSignals = async (call) => {
    const wantsDownload = Boolean(call.downloadVideos ?? call.downloadVideo);
    if (wantsDownload) {
      downloadSelections.push(call.inputValue);
      const selectedRaw = candidateOrder
        .map((key) => rawCandidates[key])
        .find((raw) => raw.webVideoUrl === call.inputValue);
      return selectedRaw ? [mapDownloadedCandidate(selectedRaw, workspaceId)] : [];
    }

    metadataCalls += 1;
    return candidateOrder.map((key) => mapMetadataCandidate(rawCandidates[key], workspaceId));
  };

  const result = await executeAutomaticDiscovery({
    state,
    workspaceId,
    token: 'network-mocked',
    now,
    force: true,
    policy,
    fetchSignals,
    maxQualityEvaluations: qualityGateConfig.maxVideoAnalysesPerRun,
    qualityGateConfig,
    evaluateSignalQuality: async ({ signal }) => {
      qualityEvaluations.push({
        stableTikTokId: stableTikTokId(signal),
        sourceUrl: signal.sourceUrl,
        score: signal.score,
      });
      return {
        policyVersion: qualityGateConfig.version,
        decision: 'reject',
        admittedToBank: false,
        qualityScore: 0,
        brandRelevance: 0,
        rejectionReasons: ['ranking_order_reproducer'],
        uncertaintyReasons: [],
      };
    },
  });

  const mappedCandidates = candidateOrder.map((key) => (
    mapMetadataCandidate(rawCandidates[key], workspaceId)
  ));

  assert.equal(metadataCalls, 1, `${label}: expected exactly one metadata call`);
  assert.equal(downloadSelections.length, 1, `${label}: expected exactly one winner download`);
  assert.equal(qualityEvaluations.length, 1, `${label}: expected exactly one quality evaluation`);
  assert.equal(result.run.qualityEvaluatedCount, 1, `${label}: run must record one quality evaluation`);
  assert.deepEqual(
    mappedCandidates.map((candidate) => candidate.score),
    [96, 96],
    `${label}: both live-derived candidates must reach the real score cap`,
  );

  return {
    label,
    providerOrder: mappedCandidates.map(stableTikTokId),
    scores: mappedCandidates.map((candidate) => candidate.score),
    downloadedUrl: downloadSelections[0],
    winner: qualityEvaluations[0],
  };
}

const forward = await runPermutation(
  'forward',
  ['creativeinezz', 'myfriendisaprogrammer'],
);
const reversed = await runPermutation(
  'reversed',
  ['myfriendisaprogrammer', 'creativeinezz'],
);

console.log(JSON.stringify({ forward, reversed }, null, 2));

assert.equal(
  forward.winner.stableTikTokId,
  reversed.winner.stableTikTokId,
  'The same normalized candidate set must select the same sole download and quality-evaluation winner regardless of provider order',
);

console.log('Automatic discovery ranking order invariance test passed');
