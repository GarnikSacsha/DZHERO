'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  APIFY_HARD_CAP_USD,
  GEMINI_HARD_CAP_USD,
  MAX_MEDIA_BYTES,
  MAX_MEDIA_DURATION_SECONDS,
  MAX_METADATA_TEXT_CHARS,
  MAX_OUTPUT_TOKENS,
  TOTAL_PROVIDER_HARD_CAP_USD,
  TARGETED_TIKTOK_ACTOR,
  buildCanonicalTikTokDownloadSource,
  buildStagingSignalFilterPreflight,
  buildTargetedTikTokActorInput,
  createOneShotFetchGuard,
  createTargetedApifyFetchGuard,
  executeOneShotAnalysis,
  resolveTargetedTikTokMedia,
  runStagingSignalFilterAudit,
  validateCanonicalTikTokDownloadSource,
} = require('../backend/services/stagingSignalFilterAudit.cjs');
const {
  createInMemorySignalFilterAuditStore,
  createPostgresSignalFilterAuditStore,
} = require('../backend/services/stagingSignalFilterAuditStorage.cjs');

const dbPath = path.resolve(__dirname, '..', 'backend', 'data', 'db.example.json');
const dbHashBefore = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
const commitSha = '9'.repeat(40);
const auditId = 'metadata_audit_1785539862647_d5f3d44ba5bc';
const candidateId = '7668237339872759053';
const canonicalSourceUrl = `https://www.tiktok.com/@chatcutapp/video/${candidateId}`;
const signedMediaUrl = 'https://media.example.test/chatcut.mp4?X-Amz-Signature=never-persist';

function createCandidate(overrides = {}) {
  return {
    id: 'mapped_chatcut',
    stableId: candidateId,
    workspaceId: 'ws_signal_filter_audit',
    handle: '@chatcutapp',
    sourceHandle: '@chatcutapp',
    sourceRelationship: 'owner',
    sourceUrl: canonicalSourceUrl,
    title: 'ChatCut workflow',
    caption: 'sensitive-caption-that-must-not-be-in-diagnostics',
    views: 27500,
    shares: 411,
    saves: 1669,
    duration: 44,
    rankingScore: 0.241855,
    rankingComponents: {
      protectedIntent: 0.241855,
      intentNumerator: 6651,
    },
    importedMetadata: {
      platform: 'tiktok',
      externalId: candidateId,
      handle: '@chatcutapp',
      contentOwnerHandle: '@chatcutapp',
      sourceRelationship: 'owner',
      url: canonicalSourceUrl,
      duration: 44,
      stats: { views: 27500, shares: 411, saves: 1669 },
    },
    ...overrides,
  };
}

function createState(traceOverrides = {}) {
  const candidate = createCandidate();
  return {
    users: [],
    workspaces: [{
      id: 'ws_signal_filter_audit',
      name: 'Signal Filter Audit',
      productBrandBrain: {
        id: 'brand_signal_filter_audit',
        name: 'Dzhero',
        brain: {
          profileDescription: 'AI content signal product',
          audience: 'AI builders',
          niche: 'AI and vibe coding',
          contentFocus: 'Practical workflows',
          goals: ['Educate'],
        },
      },
    }],
    reels: [{
      id: 'existing_verified',
      workspaceId: 'ws_signal_filter_audit',
      importedMetadata: {
        externalId: 'existing',
        qualityGate: { decision: 'accept', admittedToBank: true },
      },
    }],
    discoveryRuns: [],
    signalFilterAuditRuns: [],
    metadataAuditRuns: [{
      id: auditId,
      state: 'completed',
      environment: 'staging',
      deployedCommitSha: '8'.repeat(40),
      workspaceId: 'ws_signal_filter_audit',
      selectedTopCandidate: {
        stableId: candidateId,
        handle: '@chatcutapp',
        contentOwnerHandle: '@chatcutapp',
        sourceRelationship: 'owner',
        canonicalUrl: canonicalSourceUrl,
        rankingScore: 0.241855,
        protectedIntent: 0.241855,
        sharesAvailable: true,
        savesAvailable: true,
        viewsAvailable: true,
        durationAvailable: true,
      },
      topCandidates: [],
      deduplicatedEligibleCandidates: [candidate],
      normalizedCandidates: [candidate],
      rawMetadataCandidates: [],
      ...traceOverrides,
    }],
  };
}

function createEnv(overrides = {}) {
  return {
    RAILWAY_ENVIRONMENT_NAME: 'staging',
    RAILWAY_ENVIRONMENT_ID: 'env_staging',
    STAGING_METADATA_AUDIT_ENVIRONMENT_ID: 'env_staging',
    RAILWAY_PROJECT_ID: 'project_staging',
    STAGING_METADATA_AUDIT_PROJECT_ID: 'project_staging',
    RAILWAY_SERVICE_NAME: 'backend',
    RAILWAY_DEPLOYMENT_ID: 'deployment_staging',
    RAILWAY_REPLICA_ID: 'replica_staging',
    RAILWAY_GIT_COMMIT_SHA: commitSha,
    ENABLE_STAGING_METADATA_AUDIT: 'true',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    DATABASE_URL: 'postgresql://audit:db-secret@postgres.internal/app',
    GEMINI_API_KEY: 'gemini-secret-never-persist',
    APIFY_TOKEN: 'apify-secret-never-persist',
    ...overrides,
  };
}

function createOptions(overrides = {}) {
  return {
    metadataAuditId: auditId,
    candidateId,
    deployedCommitSha: commitSha,
    expectedSourceHandle: '@chatcutapp',
    expectedDurationSeconds: 44,
    expectedRankingScore: 0.241855,
    maxCandidates: 1,
    maxDownloads: 1,
    maxGeminiAnalyses: 1,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxMediaBytes: MAX_MEDIA_BYTES,
    maxMediaDurationSeconds: MAX_MEDIA_DURATION_SECONDS,
    maxMetadataTextChars: MAX_METADATA_TEXT_CHARS,
    apifyHardCapUsd: APIFY_HARD_CAP_USD,
    geminiHardCapUsd: GEMINI_HARD_CAP_USD,
    totalProviderHardCapUsd: TOTAL_PROVIDER_HARD_CAP_USD,
    retries: 0,
    fallbacks: 0,
    preflightOnly: true,
    execute: false,
    ...overrides,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code, code);
}

function mockAnalysis(decision, admittedToBank, extra = {}) {
  return {
    quality: {
      decision,
      admittedToBank,
      rejectionReasons: decision === 'reject' ? ['mock_reject'] : [],
      uncertaintyReasons: decision === 'uncertain' ? ['mock_uncertain'] : [],
      qualityScore: decision === 'accept' ? 91 : 20,
      policyVersion: 3.1,
      auditTrace: {
        mediaSha256: 'a'.repeat(64),
        mediaByteLength: 1024,
        rawResponse: {
          uploadUrl: 'https://generativelanguage.googleapis.com/upload/v1beta/files?secret=query',
          mediaUrl: signedMediaUrl,
          echoedCaption: 'sensitive-caption-that-must-not-be-in-diagnostics',
        },
        parsedResult: { accessible: true },
        usage: {
          total_input_tokens: 14000,
          total_output_tokens: 1000,
          total_thought_tokens: 500,
          total_tokens: 15500,
        },
      },
    },
    operations: {
      apify: {
        counters: { actorStarts: 1, statusPolls: 1, datasetReads: 1 },
        operations: [
          { operation: 'apify_actor_start', method: 'POST', status: 201 },
          { operation: 'apify_actor_poll', method: 'GET', status: 200 },
          { operation: 'apify_dataset_read', method: 'GET', status: 200 },
        ],
      },
      mediaAndGemini: {
        counters: {
          mediaDownloads: 1,
          geminiAnalysisJobs: 1,
          apifyActorCalls: 0,
          uploadStarts: 1,
          uploadFinalizes: 1,
          fileStatusPolls: 1,
          cleanups: 1,
        },
        operations: [
          { operation: 'media_download', method: 'GET', status: 200 },
          { operation: 'gemini_analysis', method: 'POST', status: 200 },
        ],
      },
    },
    apify: {
      logicalActorRuns: 1,
      actorId: TARGETED_TIKTOK_ACTOR,
      runId: 'mock-targeted-run',
      providerReportedCostUsd: 0.2,
      conservativeCommitmentUsd: 0.2,
    },
    usageCall: {
      usageKnown: true,
      inputTokens: 14000,
      cachedInputTokens: 0,
      outputTokens: 1000,
      thoughtTokens: 500,
      totalTokens: 15500,
      estimatedCostMicrousd: 34500,
    },
    calculatedCostUsd: 0.0345,
    conservativeTotalCostUsd: 0.2345,
    resolvedMediaUrl: signedMediaUrl,
    ...extra,
  };
}

async function main() {
  assert.equal(buildCanonicalTikTokDownloadSource({
    sourceHandle: '@chatcutapp',
    candidateId,
  }), canonicalSourceUrl);
  assert.deepEqual(buildTargetedTikTokActorInput(canonicalSourceUrl), {
    resultsPerPage: 1,
    maxItems: 1,
    shouldDownloadVideos: true,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadSubtitles: false,
    shouldDownloadComments: false,
    postURLs: [canonicalSourceUrl],
  });
  for (const [value, code] of [
    [`https://www.tiktok.com/@other/video/${candidateId}`, 'signal_filter_download_source_url_forbidden'],
    ['https://www.tiktok.com/@chatcutapp/video/1', 'signal_filter_download_source_url_forbidden'],
    [`${canonicalSourceUrl}?tracking=1`, 'signal_filter_download_source_url_forbidden'],
    [`${canonicalSourceUrl}#fragment`, 'signal_filter_download_source_url_forbidden'],
    [`http://www.tiktok.com/@chatcutapp/video/${candidateId}`, 'signal_filter_download_source_url_forbidden'],
    [`https://tiktok.com/@chatcutapp/video/${candidateId}`, 'signal_filter_download_source_url_forbidden'],
  ]) {
    expectCode(() => validateCanonicalTikTokDownloadSource(value), code);
  }
  expectCode(
    () => buildCanonicalTikTokDownloadSource({ sourceHandle: '@other', candidateId }),
    'signal_filter_download_source_handle_forbidden',
  );
  expectCode(
    () => buildCanonicalTikTokDownloadSource({ sourceHandle: '@chatcutapp', candidateId: '1' }),
    'signal_filter_download_source_candidate_forbidden',
  );

  const preflight = buildStagingSignalFilterPreflight({
    state: createState(),
    env: createEnv(),
    options: createOptions(),
  });
  assert.equal(preflight.options.apifyHardCapUsd, 0.5);
  assert.equal(preflight.options.geminiHardCapUsd, 0.15);
  assert.equal(preflight.options.totalProviderHardCapUsd, 0.65);
  assert.equal(preflight.options.maxOutputTokens, 8192);
  assert.equal(preflight.options.retries, 0);
  assert.equal(preflight.options.fallbacks, 0);
  assert.equal(preflight.options.maxCandidates, 1);
  assert.equal(preflight.options.maxDownloads, 1);
  assert.equal(preflight.options.maxGeminiAnalyses, 1);
  assert.equal(preflight.sourceRelationship, 'owner');
  assert.equal(preflight.sourceHandle, 'chatcutapp');
  assert.equal(preflight.metrics.duration, 44);
  assert.equal(preflight.rankingScore, 0.241855);
  assert.equal(preflight.downloadSourceUrl, canonicalSourceUrl);
  assert.ok(preflight.estimate.geminiMaximumCostUsd <= 0.15);
  assert.ok(preflight.estimate.totalMaximumCostUsd <= 0.65);
  assert.equal(preflight.estimate.apifyConservativeCommitmentUsd, 0.5);
  assert.equal(preflight.estimate.providerEnforcedDollarCap, false);
  assert.equal(preflight.estimate.apifyProviderEnforcedDollarCap, true);

  const persistedTraceShape = createState();
  delete persistedTraceShape.metadataAuditRuns[0].selectedTopCandidate.protectedIntent;
  for (const key of ['normalizedCandidates', 'deduplicatedEligibleCandidates']) {
    delete persistedTraceShape.metadataAuditRuns[0][key][0].rankingScore;
    delete persistedTraceShape.metadataAuditRuns[0][key][0].rankingComponents;
  }
  const persistedTracePreflight = buildStagingSignalFilterPreflight({
    state: persistedTraceShape,
    env: createEnv(),
    options: createOptions(),
  });
  assert.equal(persistedTracePreflight.rankingScore, 0.241855);
  assert.ok(Math.abs(persistedTracePreflight.protectedIntent - 0.24185454545454546) < 1e-12);

  for (const environmentName of ['production', 'local', 'unknown', '']) {
    expectCode(
      () => buildStagingSignalFilterPreflight({
        state: createState(),
        env: createEnv({ RAILWAY_ENVIRONMENT_NAME: environmentName }),
        options: createOptions(),
      }),
      'signal_filter_staging_required',
    );
  }
  expectCode(
    () => buildStagingSignalFilterPreflight({
      state: createState(),
      env: createEnv({ RAILWAY_GIT_COMMIT_SHA: '7'.repeat(40) }),
      options: createOptions(),
    }),
    'signal_filter_deployed_commit_mismatch',
  );
  expectCode(
    () => buildStagingSignalFilterPreflight({ state: { ...createState(), metadataAuditRuns: [] }, env: createEnv(), options: createOptions() }),
    'signal_filter_metadata_audit_not_found',
  );
  expectCode(
    () => buildStagingSignalFilterPreflight({ state: createState(), env: createEnv({ APIFY_TOKEN: '' }), options: createOptions() }),
    'signal_filter_apify_token_required',
  );
  expectCode(
    () => buildStagingSignalFilterPreflight({ state: createState(), env: createEnv(), options: createOptions({ candidateId: 'missing' }) }),
    'signal_filter_candidate_forbidden',
  );
  expectCode(
    () => buildStagingSignalFilterPreflight({
      state: createState({ selectedTopCandidate: { ...createState().metadataAuditRuns[0].selectedTopCandidate, stableId: 'other' } }),
      env: createEnv(),
      options: createOptions(),
    }),
    'signal_filter_candidate_not_saved_top_one',
  );
  expectCode(
    () => buildStagingSignalFilterPreflight({
      state: createState({
        selectedTopCandidate: { ...createState().metadataAuditRuns[0].selectedTopCandidate, sourceRelationship: 'tagged' },
      }),
      env: createEnv(),
      options: createOptions(),
    }),
    'signal_filter_source_scope_mismatch',
  );
  expectCode(
    () => buildStagingSignalFilterPreflight({
      state: createState({
        selectedTopCandidate: { ...createState().metadataAuditRuns[0].selectedTopCandidate, sharesAvailable: false },
      }),
      env: createEnv(),
      options: createOptions(),
    }),
    'signal_filter_insufficient_ranking_metadata',
  );
  expectCode(
    () => buildStagingSignalFilterPreflight({
      state: createState(),
      env: createEnv(),
      options: createOptions(),
      estimateWorstCase: () => ({ maximumCostUsd: 0.150001 }),
    }),
    'signal_filter_worst_case_estimate_exceeds_cap',
  );
  for (const invalid of [
    { maxCandidates: 2 }, { maxDownloads: 2 }, { maxGeminiAnalyses: 2 },
    { apifyHardCapUsd: 0.49 }, { apifyHardCapUsd: 0.51 }, { geminiHardCapUsd: 0.16 },
    { totalProviderHardCapUsd: 0.66 }, { retries: 1 }, { fallbacks: 1 },
  ]) {
    assert.throws(() => buildStagingSignalFilterPreflight({
      state: createState(), env: createEnv(), options: createOptions(invalid),
    }));
  }

  let preflightMutationCalls = 0;
  const preflightStore = createInMemorySignalFilterAuditStore(createState());
  const originalMutate = preflightStore.mutateState;
  preflightStore.mutateState = async (...args) => {
    preflightMutationCalls += 1;
    return originalMutate(...args);
  };
  const preflightResult = await runStagingSignalFilterAudit({
    env: createEnv(), options: createOptions(), store: preflightStore,
    analyze: async () => { throw new Error('provider_must_not_run'); },
  });
  assert.equal(preflightMutationCalls, 0);
  assert.equal(preflightResult.trace, null);
  assert.equal(preflightResult.preflight.invariants.providerCalls, 0);
  assert.equal(preflightResult.preflight.invariants.downloads, 0);
  assert.equal(preflightResult.preflight.invariants.geminiAnalysisJobs, 0);
  assert.equal(preflightResult.preflight.invariants.writes, 0);
  assert.equal(preflightResult.preflight.limits.maxOutputTokens, 8192);
  assert.ok(preflightResult.preflight.estimate.maximumInputTokens > 0);
  assert.equal(preflightResult.preflight.downloadSourceUrl, canonicalSourceUrl);
  assert.equal(preflightResult.preflight.targetedActor.actorId, TARGETED_TIKTOK_ACTOR);
  assert.equal(preflightResult.preflight.targetedActor.shouldDownloadCovers, false);

  let targetedActorCalls = 0;
  const targetedResolution = await resolveTargetedTikTokMedia({
    preflight,
    env: createEnv(),
    runActor: async (request) => {
      targetedActorCalls += 1;
      assert.equal(request.actorId, TARGETED_TIKTOK_ACTOR);
      assert.equal(request.maxTotalChargeUsd, 0.5);
      assert.equal(request.maxItems, 1);
      assert.deepEqual(request.input, buildTargetedTikTokActorInput(canonicalSourceUrl));
      return {
        items: [{ webVideoUrl: canonicalSourceUrl, mediaUrls: [signedMediaUrl] }],
        actualCostUsd: 0.2,
        runId: 'mock-targeted-run',
      };
    },
  });
  assert.equal(targetedActorCalls, 1);
  assert.equal(targetedResolution.returnedId, candidateId);
  assert.equal(targetedResolution.mediaReference, signedMediaUrl);
  assert.equal(targetedResolution.apify.logicalActorRuns, 1);
  assert.equal(targetedResolution.apify.providerReportedCostUsd, 0.2);
  assert.equal(targetedResolution.apify.conservativeCommitmentUsd, 0.2);
  assert.ok(targetedResolution.conservativeTotalBeforeGemini <= 0.65);

  const missingCostResolution = await resolveTargetedTikTokMedia({
    preflight,
    env: createEnv(),
    runActor: async () => ({
      items: [{ webVideoUrl: canonicalSourceUrl, mediaUrls: [signedMediaUrl] }],
      actualCostUsd: null,
      runId: 'mock-targeted-run-no-cost',
    }),
  });
  assert.equal(missingCostResolution.apify.conservativeCommitmentUsd, 0.5);

  let integrationActorCalls = 0;
  const integrationResult = await executeOneShotAnalysis({
    preflight,
    env: createEnv(),
    runActor: async () => {
      integrationActorCalls += 1;
      return {
        items: [{ webVideoUrl: canonicalSourceUrl, mediaUrls: [signedMediaUrl] }],
        actualCostUsd: 0.2,
        runId: 'mock-integrated-targeted-run',
      };
    },
    fetchImpl: async (url) => {
      if (String(url) === signedMediaUrl) {
        return new Response(Buffer.from('integrated-video-bytes'), {
          status: 200,
          headers: { 'content-type': 'video/mp4', 'content-length': '22' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    evaluate: async ({ fetchImpl: guardedFetch, signal }) => {
      assert.equal(signal.videoUrl, signedMediaUrl);
      const mediaResponse = await guardedFetch(signedMediaUrl, { method: 'GET' });
      const mediaBytes = Buffer.from(await mediaResponse.arrayBuffer());
      await guardedFetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
        method: 'POST', headers: { 'X-Goog-Upload-Command': 'start' },
      });
      await guardedFetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
        method: 'POST', headers: { 'X-Goog-Upload-Command': 'upload, finalize' },
      });
      await guardedFetch('https://generativelanguage.googleapis.com/v1beta/files/mock-file', { method: 'GET' });
      await guardedFetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST', body: JSON.stringify({ model: 'gemini-3.5-flash', input: [] }),
      });
      await guardedFetch('https://generativelanguage.googleapis.com/v1beta/files/mock-file', { method: 'DELETE' });
      return {
        decision: 'reject',
        admittedToBank: false,
        rejectionReasons: ['mock_reject'],
        uncertaintyReasons: [],
        auditTrace: {
          mediaSha256: crypto.createHash('sha256').update(mediaBytes).digest('hex'),
          mediaByteLength: mediaBytes.length,
          usage: {
            total_input_tokens: 14000,
            total_output_tokens: 1000,
            total_thought_tokens: 500,
            total_tokens: 15500,
          },
        },
      };
    },
  });
  assert.equal(integrationActorCalls, 1);
  assert.equal(integrationResult.apify.logicalActorRuns, 1);
  assert.equal(integrationResult.operations.mediaAndGemini.counters.mediaDownloads, 1);
  assert.equal(integrationResult.operations.mediaAndGemini.counters.geminiAnalysisJobs, 1);
  assert.equal(integrationResult.operations.mediaAndGemini.counters.uploadStarts, 1);
  assert.equal(integrationResult.operations.mediaAndGemini.counters.uploadFinalizes, 1);
  assert.equal(integrationResult.operations.mediaAndGemini.counters.fileStatusPolls, 1);
  assert.equal(integrationResult.operations.mediaAndGemini.counters.cleanups, 1);
  assert.equal(integrationResult.calculatedCostUsd, 0.0345);
  assert.equal(integrationResult.conservativeTotalCostUsd, 0.2345);

  let mismatchNetworkCalls = 0;
  await assert.rejects(
    executeOneShotAnalysis({
      preflight,
      env: createEnv(),
      runActor: async () => ({
        items: [{
          webVideoUrl: 'https://www.tiktok.com/@chatcutapp/video/7000000000000000000',
          mediaUrls: [signedMediaUrl],
        }],
        actualCostUsd: 0.2,
        runId: 'mock-targeted-run-mismatch',
      }),
      fetchImpl: async () => {
        mismatchNetworkCalls += 1;
        throw new Error('network_must_not_run_after_mismatch');
      },
    }),
    (error) => error?.code === 'signal_filter_targeted_candidate_mismatch',
  );
  assert.equal(mismatchNetworkCalls, 0);

  const apifyGuard = createTargetedApifyFetchGuard({
    fetchImpl: async () => new Response(JSON.stringify({ data: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  await apifyGuard.fetchImpl(
    'https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs?maxTotalChargeUsd=0.5&maxItems=1',
    { method: 'POST' },
  );
  await apifyGuard.fetchImpl('https://api.apify.com/v2/actor-runs/mock-targeted-run', { method: 'GET' });
  await apifyGuard.fetchImpl(
    'https://api.apify.com/v2/datasets/mock-targeted-dataset/items?clean=true&format=json&limit=1',
    { method: 'GET' },
  );
  assert.deepEqual(apifyGuard.snapshot().counters, {
    actorStarts: 1,
    statusPolls: 1,
    datasetReads: 1,
  });

  const fetchRequests = [];
  const guarded = createOneShotFetchGuard({
    mediaUrl: signedMediaUrl,
    fetchImpl: async (url, init = {}) => {
      fetchRequests.push({ url, init });
      if (String(url) === signedMediaUrl) {
        return new Response(Buffer.from('video-bytes'), {
          status: 200,
          headers: { 'content-type': 'video/mp4', 'content-length': '11' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const mediaResponse = await guarded.fetchImpl(signedMediaUrl, { method: 'GET' });
  await mediaResponse.arrayBuffer();
  await guarded.fetchImpl('https://generativelanguage.googleapis.com/upload/v1beta/files', {
    method: 'POST', headers: { 'X-Goog-Upload-Command': 'start' },
  });
  await guarded.fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST', body: JSON.stringify({ model: 'gemini-3.5-flash', input: [] }),
  });
  const interactionBody = JSON.parse(fetchRequests[2].init.body);
  assert.equal(interactionBody.generation_config.max_output_tokens, 8192);
  assert.equal(fetchRequests[0].init.redirect, 'error');
  assert.equal(guarded.snapshot().counters.mediaDownloads, 1);
  assert.equal(guarded.snapshot().counters.geminiAnalysisJobs, 1);
  assert.equal(guarded.snapshot().counters.apifyActorCalls, 0);
  assert.equal(guarded.snapshot().media.contentType, 'video/mp4');
  assert.equal(guarded.snapshot().media.byteLength, 11);
  assert.equal(
    guarded.snapshot().media.sha256,
    crypto.createHash('sha256').update(Buffer.from('video-bytes')).digest('hex'),
  );
  await assert.rejects(
    guarded.fetchImpl(signedMediaUrl, { method: 'GET' }),
    (error) => error?.code === 'signal_filter_download_limit_exceeded',
  );
  await assert.rejects(
    guarded.fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', body: JSON.stringify({ model: 'gemini-3.5-flash', input: [] }),
    }),
    (error) => error?.code === 'signal_filter_gemini_analysis_limit_exceeded',
  );
  await assert.rejects(
    guarded.fetchImpl('https://api.apify.com/v2/acts/provider/run-sync', { method: 'POST' }),
    (error) => error?.code === 'signal_filter_apify_actor_call_forbidden',
  );

  const invalidMediaGuard = createOneShotFetchGuard({
    mediaUrl: signedMediaUrl,
    fetchImpl: async () => new Response('<html>not media</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }),
  });
  await assert.rejects(
    invalidMediaGuard.fetchImpl(signedMediaUrl, { method: 'GET' }),
    (error) => error?.code === 'signal_filter_media_content_type_invalid',
  );

  const acceptStore = createInMemorySignalFilterAuditStore(createState());
  const acceptResult = await runStagingSignalFilterAudit({
    env: createEnv(),
    options: createOptions({ preflightOnly: false, execute: true }),
    store: acceptStore,
    analyze: async () => mockAnalysis('accept', true),
    now: () => new Date('2026-08-03T12:00:00.000Z'),
  });
  const acceptState = await acceptStore.readState();
  assert.equal(acceptState.reels.length, 2);
  assert.equal(acceptState.signalFilterAuditRuns.length, 1);
  assert.equal(acceptResult.trace.decision, 'accept');
  assert.equal(acceptResult.trace.admittedToBank, true);
  assert.equal(acceptResult.trace.workspaceId, 'ws_signal_filter_audit');
  assert.equal(acceptResult.trace.metadataAuditId, auditId);
  assert.equal(acceptResult.trace.candidateId, candidateId);
  assert.equal(acceptResult.trace.platform, 'tiktok');
  assert.equal(acceptResult.trace.canonicalUrl, canonicalSourceUrl.replace('www.', ''));
  assert.deepEqual(acceptResult.trace.identityKeys, [
    `tiktok:${candidateId}`,
    `url:${canonicalSourceUrl.replace('www.', '')}`,
  ]);
  assert.equal(acceptResult.trace.policyVersion, 3.1);
  assert.equal(acceptResult.trace.failure, null);
  assert.equal(acceptResult.trace.completedAt, '2026-08-03T12:00:00.000Z');
  assert.equal(acceptResult.trace.usage.inputTokens, 14000);
  assert.equal(acceptResult.trace.usage.outputTokens, 1000);
  assert.equal(acceptResult.trace.apifyRunId, 'mock-targeted-run');
  assert.equal(acceptResult.trace.providerReportedCostUsd, 0.2);
  assert.equal(acceptResult.trace.conservativeApifyCommitmentUsd, 0.2);
  assert.equal(acceptResult.trace.providerUsageCalculatedCostUsd, 0.0345);
  assert.equal(acceptResult.trace.conservativeTotalCostUsd, 0.2345);
  assert.equal(acceptResult.trace.operations.apify.counters.actorStarts, 1);
  assert.equal(acceptResult.trace.operations.mediaAndGemini.counters.mediaDownloads, 1);
  assert.equal(acceptResult.trace.mutationAfter.reels - acceptResult.trace.mutationBefore.reels, 1);
  assert.equal(acceptResult.trace.mutationAfter.verifiedSignalBank - acceptResult.trace.mutationBefore.verifiedSignalBank, 1);
  assert.equal(acceptResult.trace.mutationAfter.signalFilterAuditRuns - acceptResult.trace.mutationBefore.signalFilterAuditRuns, 1);
  const acceptTraceText = JSON.stringify(acceptState.signalFilterAuditRuns[0]);
  assert.doesNotMatch(acceptTraceText, /gemini-secret-never-persist|apify-secret-never-persist|db-secret/);
  assert.doesNotMatch(acceptTraceText, /sensitive-caption-that-must-not-be-in-diagnostics/);
  assert.doesNotMatch(acceptTraceText, /X-Amz-Signature|secret=query/);
  assert.doesNotMatch(acceptTraceText, /media\.example\.test/);
  assert.doesNotMatch(acceptTraceText, /echoedCaption|uploadUrl/);

  for (const [decision, admittedToBank] of [['reject', false], ['uncertain', false], ['reject', true]]) {
    const store = createInMemorySignalFilterAuditStore(createState());
    const result = await runStagingSignalFilterAudit({
      env: createEnv(),
      options: createOptions({ preflightOnly: false, execute: true }),
      store,
      analyze: async () => mockAnalysis(decision, admittedToBank),
    });
    const nextState = await store.readState();
    assert.equal(nextState.reels.length, 1, `${decision} must not write a Bank signal`);
    assert.equal(nextState.signalFilterAuditRuns.length, 1, `${decision} must retain one audit trace`);
    assert.equal(result.trace.admittedToBank, false);
    assert.equal(result.trace.mutationAfter.reels - result.trace.mutationBefore.reels, 0);
    assert.equal(result.trace.mutationAfter.verifiedSignalBank - result.trace.mutationBefore.verifiedSignalBank, 0);
  }

  const errorStore = createInMemorySignalFilterAuditStore(createState());
  const errorResult = await runStagingSignalFilterAudit({
    env: createEnv(),
    options: createOptions({ preflightOnly: false, execute: true }),
    store: errorStore,
    analyze: async () => { throw Object.assign(new Error('secret provider error'), { code: 'mock_provider_error' }); },
  });
  assert.equal((await errorStore.readState()).reels.length, 1);
  assert.equal(errorResult.trace.state, 'failed');
  assert.equal(errorResult.trace.admittedToBank, false);
  assert.deepEqual(errorResult.trace.failure, {
    code: 'mock_provider_error',
    stage: 'execution',
  });
  assert.equal(errorResult.trace.completedAt, errorResult.trace.createdAt);

  let fakeState = createState();
  class FakePool {
    async query(sql) {
      if (sql.includes('SELECT data')) return { rows: [{ data: structuredClone(fakeState) }] };
      throw new Error('unexpected_pool_query');
    }
    async connect() {
      return {
        query: async (sql, params = []) => {
          if (sql.includes('SELECT data')) return { rows: [{ data: structuredClone(fakeState) }] };
          if (sql.includes('UPDATE app_state')) {
            fakeState = JSON.parse(params[1]);
            return { rows: [] };
          }
          return { rows: [] };
        },
        release() {},
      };
    }
    async end() {}
  }
  const postgresStore = createPostgresSignalFilterAuditStore({
    connectionString: 'postgresql://fake',
    appStateKey: 'main',
    PoolClass: FakePool,
  });
  await postgresStore.mutateState('ws_signal_filter_audit', (state) => {
    state.testReadWriteBoundary = true;
  });
  assert.equal((await postgresStore.readState()).testReadWriteBoundary, true);
  await postgresStore.close();

  const dbHashAfter = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
  assert.equal(dbHashAfter, dbHashBefore, 'backend/data/db.example.json must remain unchanged');
  console.log('Staging Signal Filter one-shot audit gate tests passed with provider/network calls = 0.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
