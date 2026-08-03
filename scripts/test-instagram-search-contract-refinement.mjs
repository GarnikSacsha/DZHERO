import assert from 'node:assert/strict';
import discovery from '../backend/services/automaticSignalDiscovery.js';
import {
  buildApifyActorRequest,
  fetchApifySignals,
} from '../backend/services/apifySignalProvider.js';

const now = new Date('2026-08-04T00:30:00.000Z');
const results = [];
let mockBoundaryCalls = 0;

async function check(name, test) {
  try {
    await test();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({
      name,
      status: 'RED',
      assertion: error?.message || String(error),
    });
  }
}

function createDiscoveryState(platforms) {
  return {
    workspaces: [{
      id: 'ws_contract_refinement',
      brief: {
        businessType: 'sports nutrition',
        niche: 'vibe coding',
        product: 'DZHERO',
        audience: 'AI builders',
        location: 'global',
      },
      discoverySettings: {
        ...discovery.defaultDiscoverySettings(now),
        enabled: true,
        platforms,
      },
    }],
    sources: [],
    competitors: [],
    instagramAccounts: [],
    tiktokAccounts: [],
    reels: [],
    discoveryRuns: [],
  };
}

function createKeywordOnlyState(platforms) {
  const state = createDiscoveryState(platforms);
  state.workspaces[0].discoverySettings.nextRunAt = {
    accounts: '2099-01-01T00:00:00.000Z',
    keywords: '2026-08-03T00:00:00.000Z',
    hashtags: '2099-01-01T00:00:00.000Z',
    trends: '2099-01-01T00:00:00.000Z',
  };
  return state;
}

const testerPolicy = {
  perRunBudgetUsd: 1.15,
  manualRefreshDailyBudgetUsd: 1.15,
  monthlyBudgetUsd: 11.5,
  metadataApifyHardCapUsd: 0.5,
  downloadApifyHardCapUsd: 0.5,
  geminiHardCapUsd: 0.15,
  maxBudgetedRunsPerDay: 1,
  resultLimitPerPlatform: 5,
  maxPlannedCalls: 1,
};

for (const keyword of ['ми продаємо спортивне харчування.', 'sports nutrition']) {
  await check(`Instagram keyword uses a keyword actor (${keyword})`, async () => {
    const request = buildApifyActorRequest({
      platform: 'instagram',
      inputType: 'search',
      inputValue: keyword,
      limit: 5,
      downloadVideo: false,
    });
    assert.equal(request.actorId, 'apify/instagram-search-scraper');
    assert.deepEqual(request.input, {
      search: keyword,
      searchType: 'popular',
      searchLimit: 5,
    });
  });
}

await check('Instagram hashtag keeps its separate actor contract', async () => {
  const request = buildApifyActorRequest({
    platform: 'instagram',
    inputType: 'hashtag',
    inputValue: '#aitools',
    limit: 5,
    downloadVideo: false,
  });
  assert.equal(request.actorId, 'apify/instagram-hashtag-scraper');
  assert.deepEqual(request.input.hashtags, ['aitools']);
  assert.equal(request.input.keywordSearch, false);
});

await check('Empty Instagram hashtag is rejected before provider boundary', async () => {
  assert.throws(
    () => buildApifyActorRequest({
      platform: 'instagram',
      inputType: 'hashtag',
      inputValue: '###',
      limit: 5,
      downloadVideo: false,
    }),
    /provider_input_unsupported|hashtag/i,
  );
});

await check('Unsupported Instagram search is blocked before Apify network boundary', async () => {
  let networkCalls = 0;
  await assert.rejects(
    fetchApifySignals({
      token: 'test-token',
      platform: 'instagram',
      inputType: 'search',
      inputValue: 'sports nutrition',
      limit: 5,
      fetchImpl: async () => {
        networkCalls += 1;
        throw new Error('network boundary must not be reached');
      },
    }),
    (error) => error?.code === 'provider_input_unsupported' && error?.status === 422,
  );
  assert.equal(networkCalls, 0);
});

await check('Unsupported Instagram search does not reserve budget or call provider', async () => {
  const state = createKeywordOnlyState(['instagram']);
  const providerCalls = [];
  const result = await discovery.executeAutomaticDiscovery({
    state,
    workspaceId: 'ws_contract_refinement',
    now,
    force: false,
    triggerMode: 'manual_refresh',
    policy: testerPolicy,
    fetchSignals: async (call) => {
      mockBoundaryCalls += 1;
      providerCalls.push(call);
      const emptySignals = [];
      Object.defineProperty(emptySignals, 'actualCostUsd', { value: 0, enumerable: false });
      return emptySignals;
    },
  });
  assert.equal(providerCalls.length, 0);
  assert.equal(Number(result.run?.attemptedCallCount || 0), 0);
  assert.equal(Number(result.run?.reservedCostUsd || 0), 0);
  assert.equal(result.run?.classifiedFailure?.code, 'provider_input_unsupported');
  assert.notEqual(result.run?.classifiedFailure?.code, 'insufficient_ranking_metadata');
});

await check('Planner selects TikTok as the single admissible search call', async () => {
  const state = createDiscoveryState(['instagram', 'tiktok']);
  const providerCalls = [];
  const result = await discovery.executeAutomaticDiscovery({
    state,
    workspaceId: 'ws_contract_refinement',
    now,
    force: true,
    triggerMode: 'manual_refresh',
    policy: testerPolicy,
    fetchSignals: async (call) => {
      mockBoundaryCalls += 1;
      providerCalls.push(call);
      const emptySignals = [];
      Object.defineProperty(emptySignals, 'actualCostUsd', { value: 0, enumerable: false });
      return emptySignals;
    },
  });
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].platform, 'tiktok');
  assert.equal(providerCalls[0].inputType, 'search');
  assert.equal(result.run?.auditTrace?.plan?.maxMetadataCalls, 1);
  assert.equal(result.run?.auditTrace?.plan?.retries, 0);
  assert.equal(result.run?.auditTrace?.plan?.fallbacks, 0);
});

await check('Unsupported Instagram search has a provider-input failure, not ranking failure', async () => {
  const state = createKeywordOnlyState(['instagram']);
  const result = await discovery.executeAutomaticDiscovery({
    state,
    workspaceId: 'ws_contract_refinement',
    now,
    force: false,
    triggerMode: 'manual_refresh',
    policy: testerPolicy,
    fetchSignals: async () => {
      const emptySignals = [];
      Object.defineProperty(emptySignals, 'actualCostUsd', { value: 0, enumerable: false });
      return emptySignals;
    },
  });
  assert.equal(result.run?.classifiedFailure?.code, 'provider_input_unsupported');
  assert.notEqual(result.run?.classifiedFailure?.code, 'insufficient_ranking_metadata');
});

await check('Allowed planner preserves one call, zero retries, zero fallbacks, and one analysis', async () => {
  const state = createDiscoveryState(['tiktok']);
  const result = await discovery.executeAutomaticDiscovery({
    state,
    workspaceId: 'ws_contract_refinement',
    now,
    force: true,
    triggerMode: 'manual_refresh',
    policy: testerPolicy,
    fetchSignals: async () => {
      const emptySignals = [];
      Object.defineProperty(emptySignals, 'actualCostUsd', { value: 0, enumerable: false });
      return emptySignals;
    },
  });
  assert.deepEqual({
    maxMetadataCalls: result.run?.auditTrace?.plan?.maxMetadataCalls,
    maxMediaDownloads: result.run?.auditTrace?.plan?.maxMediaDownloads,
    maxVideoAnalyses: result.run?.auditTrace?.plan?.maxVideoAnalyses,
    retries: result.run?.auditTrace?.plan?.retries,
    fallbacks: result.run?.auditTrace?.plan?.fallbacks,
  }, {
    maxMetadataCalls: 1,
    maxMediaDownloads: 1,
    maxVideoAnalyses: 1,
    retries: 0,
    fallbacks: 0,
  });
});

await check('TikTok search keeps shares/saves-capable path and no Instagram fallback', async () => {
  const request = buildApifyActorRequest({
    platform: 'tiktok',
    inputType: 'search',
    inputValue: 'sports nutrition',
    limit: 5,
    downloadVideo: false,
  });
  assert.equal(request.actorId, 'clockworks/tiktok-scraper');
  assert.deepEqual(request.input.searchQueries, ['sports nutrition']);
  assert.equal(request.input.hashtags, undefined);
});

const redCount = results.filter((result) => result.status === 'RED').length;
process.stdout.write(`${JSON.stringify({
  status: redCount === 0 ? 'PASS' : 'RED',
  providerCalls: 0,
  networkCalls: 0,
  mockBoundaryCalls,
  results,
}, null, 2)}\n`);
if (redCount > 0) process.exitCode = 1;
