'use strict';

const assert = require('node:assert/strict');
const discovery = require('../backend/services/automaticSignalDiscovery.js');
const apify = require('../backend/services/apifySignalProvider.js');
const signalQuality = require('../backend/services/signalQualityGate.cjs');

const now = new Date('2026-08-03T12:00:00.000Z');
const results = [];

async function check(name, test) {
  try {
    await test();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({
      name,
      status: 'FAIL',
      assertion: error?.message || String(error),
    });
  }
}

function createPausedState() {
  return {
    workspaces: [{
      id: 'ws_manual_refresh',
      brief: {
        businessType: 'AI tools',
        niche: 'vibe coding',
        product: 'DZHERO',
        audience: 'AI builders',
        location: 'global',
      },
      discoverySettings: {
        ...discovery.defaultDiscoverySettings(now),
        enabled: false,
        dailyBudgetUsd: 1.15,
        platforms: ['tiktok'],
      },
    }],
    sources: [{
      id: 'source_chatcut',
      workspaceId: 'ws_manual_refresh',
      type: 'tiktok',
      handle: '@chatcutapp',
    }],
    competitors: [],
    instagramAccounts: [],
    tiktokAccounts: [],
    reels: [],
    discoveryRuns: [],
  };
}

function createCandidate(workspaceId, stableId = '7668237339872759053', { downloaded = false } = {}) {
  const sourceUrl = `https://www.tiktok.com/@chatcutapp/video/${stableId}`;
  const videoUrl = downloaded
    ? `https://api.apify.com/media/${stableId}.mp4?signature=memory-only`
    : '';
  return {
    id: `candidate_${stableId}`,
    workspaceId,
    handle: '@chatcutapp',
    sourceHandle: '@chatcutapp',
    sourceUrl,
    sourceType: 'TikTok',
    sourceRelationship: 'exact_owner',
    title: 'Safe metadata title',
    caption: 'caption must never enter the trace',
    videoUrl,
    views: 8363,
    likes: 390,
    comments: 20,
    shares: 113,
    saves: 460,
    duration: 44,
    importedMetadata: {
      provider: 'offline_mock',
      platform: 'tiktok',
      externalId: stableId,
      tiktokVideoId: stableId,
      url: sourceUrl,
      videoUrl,
      mediaUrls: videoUrl ? [videoUrl] : [],
      duration: 44,
      sourceRelationship: 'exact_owner',
    },
  };
}

const pilotPolicy = {
  dailyBudgetUsd: 1.15,
  monthlyBudgetUsd: 11.5,
  perRunBudgetUsd: 1.15,
  dailyTarget: 1,
  maxBudgetedRunsPerDay: 1,
  resultLimitPerPlatform: 5,
  maxPlannedCalls: 1,
};

async function main() {

await check('manual refresh is independent from the disabled scheduler', async () => {
  const manualState = createPausedState();
  const manual = discovery.prepareAutomaticDiscovery({
    state: manualState,
    workspaceId: 'ws_manual_refresh',
    now,
    force: true,
    triggerMode: 'manual_refresh',
    policy: pilotPolicy,
  });
  assert.equal(manual.run?.status, 'running');
  assert.ok(manual.execution, 'manual_refresh must create exactly one executable run');
  assert.equal(manual.run?.triggerMode, 'manual_refresh');

  const scheduledState = createPausedState();
  const scheduled = discovery.prepareAutomaticDiscovery({
    state: scheduledState,
    workspaceId: 'ws_manual_refresh',
    now,
    force: false,
    triggerMode: 'scheduled',
    policy: pilotPolicy,
  });
  assert.equal(scheduled.run?.status, 'paused');
  assert.equal(scheduled.run?.triggerMode, 'scheduled');
  assert.equal(scheduled.execution, null);
});

await check('Apify caps and run identity reach the provider boundary', async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/acts/')) {
      return new Response(JSON.stringify({
        data: {
          id: 'run_metadata_guard',
          status: 'SUCCEEDED',
          usageTotalUsd: 0.01,
          defaultDatasetId: 'dataset_metadata_guard',
        },
      }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (String(url).includes('/datasets/')) {
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected mocked request: ${url}`);
  };
  try {
    const signals = await apify.fetchApifySignals({
      token: 'mock-token',
      platform: 'tiktok',
      inputType: 'profile',
      inputValue: '@chatcutapp',
      limit: 5,
      maxTotalChargeUsd: 0.5,
      maxItems: 5,
      workspaceId: 'ws_manual_refresh',
      market: 'global',
    });
    assert.match(requests[0].url, /maxTotalChargeUsd=0\.5/);
    assert.match(requests[0].url, /maxItems=5/);
    assert.match(requests.at(-1).url, /limit=5/);
    assert.equal(signals.runId, 'run_metadata_guard');
    assert.equal(signals.actualCostUsd, 0.01);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await check('per-run ledger reserves unknown actual cost fail-closed', async () => {
  assert.equal(typeof discovery.createProviderBudgetLedger, 'function');
  const ledger = discovery.createProviderBudgetLedger({ hardCapUsd: 1.15 });
  ledger.reserve('metadata', 0.5);
  ledger.complete('metadata', { actualCostUsd: null });
  ledger.reserve('download', 0.5);
  ledger.complete('download', { actualCostUsd: null });
  ledger.reserve('gemini', 0.15);
  assert.equal(ledger.snapshot().committedCostUsd, 1.15);
  assert.equal(ledger.snapshot().remainingBudgetUsd, 0);
  assert.throws(() => ledger.reserve('extra', 0.01), /budget/i);
});

await check('Gemini runtime guards are bounded and pricing-known', async () => {
  assert.equal(typeof signalQuality.resolveSignalQualityRuntimeGuards, 'function');
  const guards = signalQuality.resolveSignalQualityRuntimeGuards({
    model: 'gemini-3.5-flash',
    maxOutputTokens: 8192,
    maxMetadataTextChars: 6000,
    maxMediaBytes: 104857600,
    maxMediaDurationSeconds: 60,
    hardCapUsd: 0.15,
  });
  assert.equal(guards.model, 'gemini-3.5-flash');
  assert.equal(guards.maxOutputTokens, 8192);
  assert.equal(guards.maxMetadataTextChars, 6000);
  assert.equal(guards.maxMediaBytes, 104857600);
  assert.equal(guards.maxMediaDurationSeconds, 60);
  assert.ok(guards.conservativeCostUsd <= 0.15);
  assert.throws(
    () => signalQuality.resolveSignalQualityRuntimeGuards({ model: 'unknown-paid-model' }),
    /pricing/i,
  );
});

await check('production trace removes captions, credentials, and signed query data', async () => {
  assert.equal(typeof discovery.sanitizeAutomaticDiscoveryTrace, 'function');
  const sanitized = discovery.sanitizeAutomaticDiscoveryTrace({
    rawMetadataCandidates: [{
      id: '7668237339872759053',
      caption: 'private caption text',
      videoUrl: 'https://api.apify.com/media/video.mp4?signature=secret-value#fragment',
      authorization: 'Bearer secret-value',
    }],
    selectedTopCandidate: {
      id: '7668237339872759053',
      sourceUrl: 'https://www.tiktok.com/@chatcutapp/video/7668237339872759053?tracking=secret',
      rankingScore: 0.241855,
    },
  });
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /private caption text|secret-value|signature=|tracking=/i);
  assert.match(serialized, /7668237339872759053/);
});

await check('daily and monthly workspace limits block before provider execution', async () => {
  const dailyState = createPausedState();
  dailyState.discoveryRuns.push({
    id: 'previous_daily_run', workspaceId: 'ws_manual_refresh', lane: 'automatic', status: 'failed',
    attemptedCallCount: 1, reservedCostUsd: 0.5, claimedAt: '2026-08-03T01:00:00.000Z',
  });
  const daily = discovery.prepareAutomaticDiscovery({
    state: dailyState, workspaceId: 'ws_manual_refresh', now, force: true,
    triggerMode: 'manual_refresh', policy: pilotPolicy,
  });
  assert.equal(daily.reason, 'daily_run_limit');
  assert.equal(daily.execution, null);

  const monthlyState = createPausedState();
  monthlyState.discoveryRuns.push({
    id: 'previous_monthly_run', workspaceId: 'ws_manual_refresh', lane: 'automatic', status: 'failed',
    attemptedCallCount: 1, reservedCostUsd: 11.2, claimedAt: '2026-08-02T01:00:00.000Z',
  });
  const monthly = discovery.prepareAutomaticDiscovery({
    state: monthlyState, workspaceId: 'ws_manual_refresh', now, force: true,
    triggerMode: 'manual_refresh', policy: pilotPolicy,
  });
  assert.equal(monthly.run?.status, 'blocked_budget');
  assert.equal(monthly.execution, null);
  assert.equal(monthly.run?.attemptedCallCount, 0);

  const priorMonthState = createPausedState();
  priorMonthState.discoveryRuns.push({
    id: 'prior_month_run', workspaceId: 'ws_manual_refresh', lane: 'automatic', status: 'failed',
    attemptedCallCount: 1, reservedCostUsd: 11.5, claimedAt: '2026-07-31T23:59:59.000Z',
  });
  const priorMonth = discovery.prepareAutomaticDiscovery({
    state: priorMonthState, workspaceId: 'ws_manual_refresh', now, force: true,
    triggerMode: 'manual_refresh', policy: pilotPolicy,
  });
  assert.equal(priorMonth.run?.status, 'running');
  assert.ok(priorMonth.execution);
});

await check('download identity mismatch stops Gemini and all Bank mutations', async () => {
  const state = createPausedState();
  let qualityCalls = 0;
  const result = await discovery.executeAutomaticDiscovery({
    state, workspaceId: 'ws_manual_refresh', now, force: true,
    triggerMode: 'manual_refresh', policy: pilotPolicy, maxQualityEvaluations: 1,
    qualityGateConfig: { version: 3.1, rejectionMemory: { enabled: true, ttlDays: 30 } },
    qualityRuntimeGuards: signalQuality.resolveSignalQualityRuntimeGuards(),
    fetchSignals: async (call) => ({
      actualCostUsd: 0,
      runId: call.downloadVideo ? 'mock_download_run' : 'mock_metadata_run',
      signals: [createCandidate(
        'ws_manual_refresh',
        call.downloadVideo ? '7999999999999999999' : '7668237339872759053',
        { downloaded: Boolean(call.downloadVideo) },
      )],
    }),
    evaluateSignalQuality: async () => {
      qualityCalls += 1;
      throw new Error('quality_must_not_run_after_identity_mismatch');
    },
  });
  assert.equal(qualityCalls, 0);
  assert.equal(result.run.qualityEvaluatedCount, 0);
  assert.equal(result.acceptedSignals.length, 0);
  assert.equal(state.reels.length, 0);
  assert.equal(result.run.auditTrace.mutationSnapshot.bankDelta, 0);
  assert.equal(result.run.auditTrace.mutationSnapshot.collectionDelta, 0);
});

await check('admission and mutation snapshots remain fail-closed', async () => {
  for (const decision of ['accept', 'reject', 'uncertain']) {
    const state = createPausedState();
    const stageCalls = [];
    const result = await discovery.executeAutomaticDiscovery({
      state, workspaceId: 'ws_manual_refresh', now, force: true,
      triggerMode: 'manual_refresh', policy: pilotPolicy, maxQualityEvaluations: 1,
      qualityGateConfig: { version: 3.1, rejectionMemory: { enabled: true, ttlDays: 30 } },
      qualityRuntimeGuards: signalQuality.resolveSignalQualityRuntimeGuards(),
      fetchSignals: async (call) => {
        stageCalls.push(call);
        return {
          actualCostUsd: 0,
          runId: call.downloadVideo ? `download_${decision}` : `metadata_${decision}`,
          signals: [createCandidate('ws_manual_refresh', '7668237339872759053', {
            downloaded: Boolean(call.downloadVideo),
          })],
        };
      },
      evaluateSignalQuality: async () => ({
        policyVersion: 3.1,
        decision,
        admittedToBank: decision === 'accept',
        qualityScore: decision === 'accept' ? 80 : 20,
        rejectionReasons: decision === 'reject' ? ['offline_reject'] : [],
        uncertaintyReasons: decision === 'uncertain' ? ['offline_uncertain'] : [],
        auditTrace: {
          mediaSha256: 'a'.repeat(64), mediaByteLength: 1024, model: 'gemini-3.5-flash',
          calculatedCostUsd: 0.01, conservativeCostUsd: 0.100728,
          usage: { total_input_tokens: 100, total_output_tokens: 10 },
          normalizedUsage: { inputTokens: 100, outputTokens: 10 },
          parsedResult: { accessible: true, observations: [], evidenceChains: [] },
          rawResponse: { caption: 'must hash, never persist' },
        },
      }),
    });
    const expectedDelta = decision === 'accept' ? 1 : 0;
    assert.equal(stageCalls.length, 2);
    assert.deepEqual(
      stageCalls.map((call) => [call.maxTotalChargeUsd, call.maxItems]),
      [[0.5, 5], [0.5, 1]],
    );
    assert.equal(result.acceptedSignals.length, expectedDelta);
    assert.equal(result.run.auditTrace.mutationSnapshot.bankDelta, expectedDelta);
    assert.equal(result.run.auditTrace.mutationSnapshot.collectionDelta, expectedDelta);
    const traceText = JSON.stringify(result.run.auditTrace);
    assert.doesNotMatch(traceText, /caption must never|must hash|signature=|memory-only/i);
    assert.deepEqual(result.run.auditTrace.gemini.rawResponse, {});
    assert.equal(result.run.auditTrace.gemini.rawResponseHash.length, 64);
  }
});

console.log(JSON.stringify({
  status: results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL',
  providerCalls: 0,
  networkAttempts: 0,
  paidCostUsd: 0,
  results,
}, null, 2));

if (results.some((result) => result.status === 'FAIL')) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
