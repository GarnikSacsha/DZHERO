'use strict';

const crypto = require('node:crypto');
const {
  SIGNAL_QUALITY_RESPONSE_FORMAT,
  buildSignalQualityPrompt,
  evaluateSignalQuality,
  loadSignalQualityGateConfig,
} = require('./signalQualityGate.cjs');
const {
  normalizeGeminiUsage,
} = require('./agentStudioUsage.cjs');
const {
  getMutationSnapshot,
  sanitizeAuditValue,
} = require('./stagingMetadataAudit.cjs');
const {
  resolveSignalAdmission,
} = require('./automaticSignalDiscovery.js');

const STAGING_SIGNAL_FILTER_AUDIT_VERSION = 1;
const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_INPUT_USD_PER_MILLION = 1.5;
const GEMINI_OUTPUT_USD_PER_MILLION = 9;
const VIDEO_TOKENS_PER_SECOND = 295;
const MAX_CANDIDATES = 1;
const MAX_DOWNLOADS = 1;
const MAX_GEMINI_ANALYSES = 1;
const MAX_OUTPUT_TOKENS = 8192;
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const MAX_MEDIA_DURATION_SECONDS = 60;
const MAX_METADATA_TEXT_CHARS = 6000;
const APIFY_HARD_CAP_USD = 0;
const GEMINI_HARD_CAP_USD = 0.15;
const TOTAL_PROVIDER_HARD_CAP_USD = 0.15;
const MAX_FILE_STATUS_POLLS = 45;
const MAX_SIGNAL_FILTER_AUDIT_RUNS = 100;

function auditError(code, details = null) {
  const error = new Error(code);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function roundUsd(value) {
  return Math.round(Number(value || 0) * 1000000) / 1000000;
}

function compactText(value, maxLength = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function stripDiagnosticFields(value, key = '') {
  if (/(?:caption|upload.*url|signed.*url)/i.test(key)) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => stripDiagnosticFields(item)).filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([nestedKey, nestedValue]) => [nestedKey, stripDiagnosticFields(nestedValue, nestedKey)])
      .filter(([, nestedValue]) => nestedValue !== undefined));
  }
  return value;
}

function normalizeHandle(value) {
  return compactText(value, 120).replace(/^@/, '').toLowerCase();
}

function firstFinite(values = []) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return null;
}

function firstText(values = [], maxLength = 2000) {
  for (const value of values) {
    const text = compactText(value, maxLength);
    if (text) return text;
  }
  return '';
}

function getStableId(candidate = {}) {
  return firstText([
    candidate.stableId,
    candidate.externalId,
    candidate.tiktokVideoId,
    candidate.shortCode,
    candidate.importedMetadata?.externalId,
    candidate.importedMetadata?.tiktokVideoId,
    candidate.importedMetadata?.shortCode,
    candidate.id,
  ], 160);
}

function getCandidateMetrics(candidate = {}) {
  return {
    views: firstFinite([
      candidate.views,
      candidate.playCount,
      candidate.videoPlayCount,
      candidate.importedMetadata?.stats?.views,
      candidate.importedMetadata?.rawStats?.views,
    ]),
    shares: firstFinite([
      candidate.shares,
      candidate.shareCount,
      candidate.sharesCount,
      candidate.importedMetadata?.stats?.shares,
      candidate.importedMetadata?.rawStats?.shares,
    ]),
    saves: firstFinite([
      candidate.saves,
      candidate.collectCount,
      candidate.savesCount,
      candidate.importedMetadata?.stats?.saves,
      candidate.importedMetadata?.rawStats?.saves,
    ]),
    duration: firstFinite([
      candidate.duration,
      candidate.durationSeconds,
      candidate.videoDuration,
      candidate.videoMeta?.duration,
      candidate.importedMetadata?.duration,
    ]),
  };
}

function collectMediaReferences(candidate = {}) {
  return [
    candidate.videoUrl,
    candidate.downloadedVideoUrl,
    candidate.downloadedVideo,
    candidate.mediaUrl,
    ...(Array.isArray(candidate.mediaUrls) ? candidate.mediaUrls : []),
    candidate.importedMetadata?.videoUrl,
    ...(Array.isArray(candidate.importedMetadata?.mediaUrls)
      ? candidate.importedMetadata.mediaUrls
      : []),
    candidate.importedMetadata?.apify?.videoUrl,
    ...(Array.isArray(candidate.importedMetadata?.apify?.mediaUrls)
      ? candidate.importedMetadata.apify.mediaUrls
      : []),
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function findCandidateInTrace(trace = {}, candidateId = '') {
  const pools = [
    trace.deduplicatedEligibleCandidates,
    trace.normalizedCandidates,
    trace.rawMetadataCandidates,
  ];
  let match = null;
  for (const pool of pools) {
    const candidate = (Array.isArray(pool) ? pool : [])
      .find((item) => getStableId(item) === candidateId);
    if (!candidate) continue;
    match = match ? { ...candidate, ...match } : candidate;
    const mediaReferences = collectMediaReferences(candidate);
    if (mediaReferences.length) {
      match = {
        ...match,
        videoUrl: collectMediaReferences(match)[0] || mediaReferences[0],
      };
    }
  }
  return match ? structuredClone(match) : null;
}

function normalizeOptions(options = {}) {
  const normalized = {
    metadataAuditId: compactText(options.metadataAuditId, 180),
    candidateId: compactText(options.candidateId, 180),
    deployedCommitSha: compactText(options.deployedCommitSha, 40).toLowerCase(),
    expectedSourceHandle: normalizeHandle(options.expectedSourceHandle || 'chatcutapp'),
    expectedDurationSeconds: Number(options.expectedDurationSeconds),
    expectedRankingScore: Number(options.expectedRankingScore),
    maxCandidates: Number(options.maxCandidates),
    maxDownloads: Number(options.maxDownloads),
    maxGeminiAnalyses: Number(options.maxGeminiAnalyses),
    maxOutputTokens: Number(options.maxOutputTokens),
    maxMediaBytes: Number(options.maxMediaBytes),
    maxMediaDurationSeconds: Number(options.maxMediaDurationSeconds),
    maxMetadataTextChars: Number(options.maxMetadataTextChars),
    apifyHardCapUsd: Number(options.apifyHardCapUsd),
    geminiHardCapUsd: Number(options.geminiHardCapUsd),
    totalProviderHardCapUsd: Number(options.totalProviderHardCapUsd),
    retries: Number(options.retries),
    fallbacks: Number(options.fallbacks),
    preflightOnly: options.preflightOnly === true,
    execute: options.execute === true,
  };
  if (!normalized.metadataAuditId) throw auditError('signal_filter_audit_id_required');
  if (!normalized.candidateId) throw auditError('signal_filter_candidate_id_required');
  if (!/^[a-f0-9]{40}$/.test(normalized.deployedCommitSha)) {
    throw auditError('signal_filter_commit_sha_invalid');
  }
  if (!normalized.expectedSourceHandle) throw auditError('signal_filter_source_handle_required');
  if (!Number.isFinite(normalized.expectedDurationSeconds) || normalized.expectedDurationSeconds <= 0) {
    throw auditError('signal_filter_expected_duration_invalid');
  }
  if (!Number.isFinite(normalized.expectedRankingScore) || normalized.expectedRankingScore <= 0) {
    throw auditError('signal_filter_expected_ranking_invalid');
  }
  if (normalized.preflightOnly === normalized.execute) {
    throw auditError('signal_filter_exactly_one_mode_required');
  }
  const exactLimits = [
    ['maxCandidates', MAX_CANDIDATES],
    ['maxDownloads', MAX_DOWNLOADS],
    ['maxGeminiAnalyses', MAX_GEMINI_ANALYSES],
    ['maxOutputTokens', MAX_OUTPUT_TOKENS],
    ['maxMediaBytes', MAX_MEDIA_BYTES],
    ['maxMediaDurationSeconds', MAX_MEDIA_DURATION_SECONDS],
    ['maxMetadataTextChars', MAX_METADATA_TEXT_CHARS],
    ['apifyHardCapUsd', APIFY_HARD_CAP_USD],
    ['geminiHardCapUsd', GEMINI_HARD_CAP_USD],
    ['totalProviderHardCapUsd', TOTAL_PROVIDER_HARD_CAP_USD],
    ['retries', 0],
    ['fallbacks', 0],
  ];
  for (const [key, expected] of exactLimits) {
    if (normalized[key] !== expected) throw auditError(`signal_filter_${key}_invalid`);
  }
  return normalized;
}

function assertStagingRuntime(env = {}, options = {}) {
  if (env.RAILWAY_ENVIRONMENT_NAME !== 'staging') throw auditError('signal_filter_staging_required');
  if (env.RAILWAY_SERVICE_NAME !== 'backend') throw auditError('signal_filter_backend_service_required');
  if (!env.RAILWAY_DEPLOYMENT_ID || !env.RAILWAY_REPLICA_ID) {
    throw auditError('signal_filter_railway_runtime_required');
  }
  if (!env.RAILWAY_ENVIRONMENT_ID
    || env.RAILWAY_ENVIRONMENT_ID !== env.STAGING_METADATA_AUDIT_ENVIRONMENT_ID) {
    throw auditError('signal_filter_environment_id_mismatch');
  }
  if (!env.RAILWAY_PROJECT_ID || env.RAILWAY_PROJECT_ID !== env.STAGING_METADATA_AUDIT_PROJECT_ID) {
    throw auditError('signal_filter_project_id_mismatch');
  }
  if (env.ENABLE_STAGING_METADATA_AUDIT !== 'true') {
    throw auditError('signal_filter_staging_audit_feature_disabled');
  }
  if (env.AUTOMATIC_DISCOVERY_ENABLED !== 'false') {
    throw auditError('signal_filter_background_worker_must_be_disabled');
  }
  if (!env.DATABASE_URL) throw auditError('signal_filter_postgres_required');
  if (!env.GEMINI_API_KEY) throw auditError('signal_filter_gemini_key_required');
  if (!env.RAILWAY_GIT_COMMIT_SHA
    || env.RAILWAY_GIT_COMMIT_SHA.toLowerCase() !== options.deployedCommitSha) {
    throw auditError('signal_filter_deployed_commit_mismatch');
  }
}

function getSignalFilterMutationSnapshot(state = {}, workspaceId = '') {
  return {
    ...getMutationSnapshot(state, workspaceId),
    signalFilterAuditRuns: Array.isArray(state.signalFilterAuditRuns)
      ? state.signalFilterAuditRuns.length
      : 0,
  };
}

function getVerifiedStableIds(state = {}, workspaceId = '') {
  return new Set((Array.isArray(state.reels) ? state.reels : [])
    .filter((item) => item?.workspaceId === workspaceId)
    .filter((item) => item?.importedMetadata?.qualityGate?.decision === 'accept'
      && item?.importedMetadata?.qualityGate?.admittedToBank === true)
    .map((item) => getStableId(item))
    .filter(Boolean));
}

function buildBoundedCandidate(candidate = {}, preflight = {}) {
  const metadataBudget = preflight.options.maxMetadataTextChars;
  const title = firstText([
    candidate.title,
    candidate.importedMetadata?.title,
  ], Math.min(1000, metadataBudget));
  const captionBudget = Math.max(0, metadataBudget - title.length);
  const caption = firstText([
    candidate.caption,
    candidate.text,
    candidate.importedMetadata?.caption,
  ], captionBudget);
  const mediaUrl = preflight.mediaReference;
  const sourceUrl = firstText([
    candidate.sourceUrl,
    candidate.webVideoUrl,
    candidate.url,
    candidate.importedMetadata?.url,
    preflight.selectedTopCandidate?.canonicalUrl,
  ], 2000);
  const metrics = preflight.metrics;
  return {
    ...candidate,
    id: preflight.options.candidateId,
    workspaceId: preflight.workspaceId,
    sourceHandle: `@${preflight.sourceHandle}`,
    handle: `@${preflight.sourceHandle}`,
    sourceUrl,
    videoUrl: mediaUrl,
    title,
    caption,
    views: metrics.views,
    shares: metrics.shares,
    saves: metrics.saves,
    duration: metrics.duration,
    rankingScore: preflight.rankingScore,
    importedMetadata: {
      platform: 'tiktok',
      url: sourceUrl,
      videoUrl: mediaUrl,
      mediaUrls: [mediaUrl],
      duration: metrics.duration,
      handle: `@${preflight.sourceHandle}`,
      externalId: preflight.options.candidateId,
      sourceRelationship: 'owner',
      stats: {
        views: metrics.views,
        shares: metrics.shares,
        saves: metrics.saves,
      },
    },
  };
}

function estimateGeminiWorstCase({ candidate, workspace, config, durationSeconds, maxOutputTokens }) {
  const prompt = buildSignalQualityPrompt({ signal: candidate, workspace, config });
  const schemaText = JSON.stringify(SIGNAL_QUALITY_RESPONSE_FORMAT);
  const textCharacters = prompt.length + schemaText.length;
  const conservativeTextTokens = textCharacters;
  const videoTokens = Math.ceil(durationSeconds * VIDEO_TOKENS_PER_SECOND);
  const maximumInputTokens = conservativeTextTokens + videoTokens;
  const maximumGeneratedTokens = maxOutputTokens;
  const inputCostUsd = maximumInputTokens * GEMINI_INPUT_USD_PER_MILLION / 1_000_000;
  const outputCostUsd = maximumGeneratedTokens * GEMINI_OUTPUT_USD_PER_MILLION / 1_000_000;
  return {
    model: GEMINI_MODEL,
    pricingVersion: 'gemini-standard-2026-08-03',
    videoTokensPerSecond: VIDEO_TOKENS_PER_SECOND,
    videoTokens,
    conservativeTextTokens,
    maximumInputTokens,
    maximumGeneratedTokens,
    inputCostUsd: roundUsd(inputCostUsd),
    outputCostUsd: roundUsd(outputCostUsd),
    maximumCostUsd: roundUsd(inputCostUsd + outputCostUsd),
    providerEnforcedDollarCap: false,
  };
}

function buildStagingSignalFilterPreflight({
  state = {},
  env = {},
  options = {},
  estimateWorstCase = estimateGeminiWorstCase,
}) {
  const normalized = normalizeOptions(options);
  assertStagingRuntime(env, normalized);
  const model = env.GEMINI_VIDEO_MODEL || env.GEMINI_VISION_MODEL || GEMINI_MODEL;
  if (model !== GEMINI_MODEL) throw auditError('signal_filter_model_not_priced');
  const trace = (Array.isArray(state.metadataAuditRuns) ? state.metadataAuditRuns : [])
    .find((item) => item?.id === normalized.metadataAuditId);
  if (!trace) throw auditError('signal_filter_metadata_audit_not_found');
  if (trace.environment !== 'staging' || trace.state !== 'completed') {
    throw auditError('signal_filter_metadata_audit_not_completed');
  }
  const selectedTopCandidate = trace.selectedTopCandidate || trace.topCandidates?.[0] || null;
  if (!selectedTopCandidate) throw auditError('signal_filter_saved_top_candidate_missing');
  if (getStableId(selectedTopCandidate) !== normalized.candidateId) {
    throw auditError('signal_filter_candidate_not_saved_top_one');
  }
  const candidate = findCandidateInTrace(trace, normalized.candidateId);
  if (!candidate) throw auditError('signal_filter_candidate_not_found');
  const sourceRelationship = firstText([
    selectedTopCandidate.sourceRelationship,
    candidate.sourceRelationship,
    candidate.importedMetadata?.sourceRelationship,
  ], 40).toLowerCase();
  if (sourceRelationship !== 'owner') throw auditError('signal_filter_source_scope_mismatch');
  const sourceHandle = normalizeHandle(firstText([
    selectedTopCandidate.contentOwnerHandle,
    selectedTopCandidate.handle,
    candidate.contentOwnerHandle,
    candidate.handle,
    candidate.sourceHandle,
    candidate.authorMeta?.name,
    candidate.authorMeta?.uniqueId,
    candidate.importedMetadata?.contentOwnerHandle,
    candidate.importedMetadata?.handle,
  ], 120));
  if (sourceHandle !== normalized.expectedSourceHandle) throw auditError('signal_filter_source_handle_mismatch');
  const metrics = getCandidateMetrics(candidate);
  const availability = {
    shares: selectedTopCandidate.sharesAvailable === true && metrics.shares !== null,
    saves: selectedTopCandidate.savesAvailable === true && metrics.saves !== null,
    views: selectedTopCandidate.viewsAvailable === true && metrics.views !== null,
    duration: selectedTopCandidate.durationAvailable === true && metrics.duration !== null,
  };
  if (Object.values(availability).some((value) => value !== true)) {
    throw auditError('signal_filter_insufficient_ranking_metadata');
  }
  if (Math.abs(metrics.duration - normalized.expectedDurationSeconds) > 0.5) {
    throw auditError('signal_filter_duration_mismatch');
  }
  if (metrics.duration > normalized.maxMediaDurationSeconds) {
    throw auditError('signal_filter_media_duration_exceeds_limit');
  }
  const rankingScore = firstFinite([
    selectedTopCandidate.rankingScore,
    candidate.rankingScore,
  ]);
  const protectedIntent = firstFinite([
    selectedTopCandidate.protectedIntent,
    candidate.rankingComponents?.protectedIntent,
    candidate.protectedIntent,
  ]);
  if (rankingScore === null || rankingScore <= 0 || protectedIntent === null || protectedIntent <= 0) {
    throw auditError('signal_filter_insufficient_ranking_signal');
  }
  if (Math.abs(rankingScore - normalized.expectedRankingScore) > 0.000001) {
    throw auditError('signal_filter_ranking_score_mismatch');
  }
  const mediaReference = collectMediaReferences(candidate).find(isHttpUrl) || '';
  if (!mediaReference) throw auditError('signal_filter_media_reference_missing');
  const workspaceId = compactText(trace.workspaceId, 160);
  const workspace = (Array.isArray(state.workspaces) ? state.workspaces : [])
    .find((item) => item?.id === workspaceId);
  if (!workspace) throw auditError('signal_filter_workspace_not_found');
  if (getVerifiedStableIds(state, workspaceId).has(normalized.candidateId)) {
    throw auditError('signal_filter_candidate_already_admitted');
  }
  const config = loadSignalQualityGateConfig();
  if (Number(config.version) !== 3.1) throw auditError('signal_filter_policy_version_mismatch');
  const base = {
    options: normalized,
    trace,
    candidate,
    selectedTopCandidate,
    workspaceId,
    workspace,
    sourceHandle,
    sourceRelationship,
    metrics,
    availability,
    rankingScore,
    protectedIntent,
    mediaReference,
    model,
    config,
  };
  const boundedCandidate = buildBoundedCandidate(candidate, base);
  const estimate = estimateWorstCase({
    candidate: boundedCandidate,
    workspace,
    config,
    durationSeconds: metrics.duration,
    maxOutputTokens: normalized.maxOutputTokens,
  });
  if (estimate.maximumCostUsd > normalized.geminiHardCapUsd
    || estimate.maximumCostUsd > normalized.totalProviderHardCapUsd) {
    throw auditError('signal_filter_worst_case_estimate_exceeds_cap', { estimate });
  }
  return {
    ...base,
    boundedCandidate,
    estimate,
    mutationSnapshot: getSignalFilterMutationSnapshot(state, workspaceId),
  };
}

function toPublicPreflight(preflight = {}) {
  const result = sanitizeAuditValue({
    mode: preflight.options.preflightOnly ? 'preflight-only' : 'execute',
    environment: 'staging',
    deployedCommitSha: preflight.options.deployedCommitSha,
    metadataAuditId: preflight.options.metadataAuditId,
    metadataAuditCommitSha: preflight.trace.deployedCommitSha || null,
    candidate: {
      stableId: preflight.options.candidateId,
      platform: 'tiktok',
      sourceHandle: `@${preflight.sourceHandle}`,
      sourceRelationship: preflight.sourceRelationship,
      durationSeconds: preflight.metrics.duration,
      rankingScore: preflight.rankingScore,
      protectedIntent: preflight.protectedIntent,
      metricAvailability: preflight.availability,
      savedTopOne: true,
      mediaReferenceAvailable: true,
    },
    model: preflight.model,
    estimate: preflight.estimate,
    caps: {
      apifyUsd: preflight.options.apifyHardCapUsd,
      geminiUsd: preflight.options.geminiHardCapUsd,
      totalProviderUsd: preflight.options.totalProviderHardCapUsd,
    },
    limits: {
      candidates: preflight.options.maxCandidates,
      downloads: preflight.options.maxDownloads,
      geminiAnalysisJobs: preflight.options.maxGeminiAnalyses,
      maxOutputTokens: preflight.options.maxOutputTokens,
      maxMediaBytes: preflight.options.maxMediaBytes,
      maxMediaDurationSeconds: preflight.options.maxMediaDurationSeconds,
      maxMetadataTextChars: preflight.options.maxMetadataTextChars,
      retries: preflight.options.retries,
      fallbacks: preflight.options.fallbacks,
    },
    invariants: {
      metadataDiscoveryCalls: 0,
      apifyActorCalls: 0,
      providerCalls: preflight.options.preflightOnly ? 0 : 1,
      downloads: preflight.options.preflightOnly ? 0 : 1,
      geminiAnalysisJobs: preflight.options.preflightOnly ? 0 : 1,
      signalFilterVersion: 3.1,
      maxVideoAnalysesPerRun: 1,
      writes: preflight.options.preflightOnly ? 0 : 'admission_policy_only',
    },
    mutationSnapshot: preflight.mutationSnapshot,
  });
  result.estimate = structuredClone(preflight.estimate);
  result.limits.maxOutputTokens = preflight.options.maxOutputTokens;
  return result;
}

function createOneShotFetchGuard({
  fetchImpl = globalThis.fetch,
  mediaUrl,
  maxMediaBytes = MAX_MEDIA_BYTES,
  maxOutputTokens = MAX_OUTPUT_TOKENS,
} = {}) {
  if (typeof fetchImpl !== 'function') throw auditError('signal_filter_fetch_unavailable');
  const counters = {
    mediaDownloads: 0,
    geminiAnalysisJobs: 0,
    apifyActorCalls: 0,
    uploadStarts: 0,
    uploadFinalizes: 0,
    fileStatusPolls: 0,
    cleanups: 0,
  };
  const operations = [];

  const guardedFetch = async (input, init = {}) => {
    const url = String(input || '');
    const method = String(init.method || 'GET').toUpperCase();
    const headers = init.headers || {};
    let operation = '';
    let nextInit = init;

    if (url === mediaUrl && method === 'GET') {
      counters.mediaDownloads += 1;
      if (counters.mediaDownloads > MAX_DOWNLOADS) throw auditError('signal_filter_download_limit_exceeded');
      operation = 'media_download';
    } else {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw auditError('signal_filter_network_target_invalid');
      }
      const host = parsed.hostname.toLowerCase();
      const uploadCommand = String(headers['X-Goog-Upload-Command'] || headers['x-goog-upload-command'] || '');
      if (host === 'api.apify.com' || host.endsWith('.api.apify.com')) {
        counters.apifyActorCalls += 1;
        throw auditError('signal_filter_apify_actor_call_forbidden');
      }
      if (host !== 'generativelanguage.googleapis.com') {
        throw auditError('signal_filter_network_target_forbidden');
      }
      if (method === 'POST' && uploadCommand === 'start') {
        counters.uploadStarts += 1;
        operation = 'gemini_upload_start';
      } else if (method === 'POST' && uploadCommand.includes('finalize')) {
        counters.uploadFinalizes += 1;
        operation = 'gemini_upload_finalize';
      } else if (method === 'POST' && /\/interactions\/?$/.test(parsed.pathname)) {
        counters.geminiAnalysisJobs += 1;
        if (counters.geminiAnalysisJobs > MAX_GEMINI_ANALYSES) {
          throw auditError('signal_filter_gemini_analysis_limit_exceeded');
        }
        let body;
        try {
          body = JSON.parse(String(init.body || '{}'));
        } catch {
          throw auditError('signal_filter_gemini_request_malformed');
        }
        body.generation_config = {
          ...(body.generation_config || {}),
          max_output_tokens: maxOutputTokens,
        };
        nextInit = { ...init, body: JSON.stringify(body) };
        operation = 'gemini_analysis';
      } else if (method === 'GET' && /\/files\//.test(parsed.pathname)) {
        counters.fileStatusPolls += 1;
        if (counters.fileStatusPolls > MAX_FILE_STATUS_POLLS) {
          throw auditError('signal_filter_file_poll_limit_exceeded');
        }
        operation = 'gemini_file_status';
      } else if (method === 'DELETE' && /\/files\//.test(parsed.pathname)) {
        counters.cleanups += 1;
        operation = 'gemini_cleanup';
      } else {
        throw auditError('signal_filter_gemini_operation_forbidden');
      }
    }

    const operationRecord = { operation, method, status: null, result: 'attempted' };
    operations.push(operationRecord);
    let response;
    try {
      response = await fetchImpl(input, nextInit);
      operationRecord.status = Number(response?.status || 0) || null;
      operationRecord.result = response?.ok === false ? 'http_error' : 'completed';
    } catch (error) {
      operationRecord.result = 'failed';
      throw error;
    }
    if (operation !== 'media_download') return response;
    const declaredLength = Number(response?.headers?.get?.('content-length') || 0);
    if (declaredLength > maxMediaBytes) throw auditError('signal_filter_media_too_large');
    return new Proxy(response, {
      get(target, property, receiver) {
        if (property !== 'arrayBuffer') {
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return async () => {
          if (!target.body?.getReader) {
            const value = await target.arrayBuffer();
            if (value.byteLength > maxMediaBytes) throw auditError('signal_filter_media_too_large');
            return value;
          }
          const reader = target.body.getReader();
          const chunks = [];
          let byteLength = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            byteLength += value.byteLength;
            if (byteLength > maxMediaBytes) {
              await reader.cancel().catch(() => {});
              throw auditError('signal_filter_media_too_large');
            }
            chunks.push(Buffer.from(value));
          }
          const bytes = Buffer.concat(chunks, byteLength);
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        };
      },
    });
  };

  return {
    fetchImpl: guardedFetch,
    snapshot() {
      return structuredClone({ counters, operations });
    },
  };
}

async function executeOneShotAnalysis({ preflight, env, fetchImpl = globalThis.fetch, sleepImpl }) {
  const fetchGuard = createOneShotFetchGuard({
    fetchImpl,
    mediaUrl: preflight.mediaReference,
    maxMediaBytes: preflight.options.maxMediaBytes,
    maxOutputTokens: preflight.options.maxOutputTokens,
  });
  const quality = await evaluateSignalQuality({
    signal: preflight.boundedCandidate,
    workspace: preflight.workspace,
    config: preflight.config,
    apiKey: env.GEMINI_API_KEY,
    mediaApiToken: env.APIFY_TOKEN || '',
    model: preflight.model,
    fetchImpl: fetchGuard.fetchImpl,
    sleepImpl,
    includeAuditTrace: true,
  });
  const operations = fetchGuard.snapshot();
  if (operations.counters.mediaDownloads !== 1) throw auditError('signal_filter_download_count_invalid');
  if (operations.counters.geminiAnalysisJobs !== 1) throw auditError('signal_filter_analysis_count_invalid');
  if (operations.counters.apifyActorCalls !== 0) throw auditError('signal_filter_apify_actor_call_forbidden');
  const usageCall = normalizeGeminiUsage({
    invocationId: `staging-signal-filter:${preflight.options.candidateId}`,
    model: preflight.model,
    usage: quality?.auditTrace?.usage,
  });
  if (!usageCall.usageKnown || usageCall.estimatedCostMicrousd === null) {
    throw auditError('signal_filter_usage_metadata_required');
  }
  const calculatedCostUsd = roundUsd(usageCall.estimatedCostMicrousd / 1_000_000);
  if (calculatedCostUsd > preflight.options.geminiHardCapUsd
    || calculatedCostUsd > preflight.options.totalProviderHardCapUsd) {
    throw auditError('signal_filter_reported_usage_exceeds_cap');
  }
  return { quality, operations, usageCall, calculatedCostUsd };
}

function buildAdmittedSignal(preflight, quality, now) {
  const { decision, admittedToBank } = resolveSignalAdmission(quality);
  if (!admittedToBank) return { decision, admittedToBank, signal: null };
  const signal = structuredClone(preflight.boundedCandidate);
  signal.updatedAt = now.toISOString();
  signal.createdAt = signal.createdAt || signal.updatedAt;
  signal.importedMetadata = {
    ...(signal.importedMetadata || {}),
    qualityGate: {
      ...structuredClone(quality),
      decision,
      admittedToBank,
      evaluatedAt: now.toISOString(),
      evaluationCount: 1,
    },
  };
  delete signal.importedMetadata.qualityGate.auditTrace;
  return { decision, admittedToBank, signal };
}

function appendExecutionTrace(state, trace) {
  const runs = Array.isArray(state.signalFilterAuditRuns) ? state.signalFilterAuditRuns : [];
  state.signalFilterAuditRuns = [trace, ...runs.filter((item) => item?.id !== trace.id)]
    .slice(0, MAX_SIGNAL_FILTER_AUDIT_RUNS);
}

async function persistExecutionResult({ store, preflight, result, failure, env, now }) {
  const secretValues = [
    env.DATABASE_URL,
    env.GEMINI_API_KEY,
    env.APIFY_TOKEN,
    preflight.boundedCandidate.caption,
  ].filter(Boolean);
  return store.mutateState(preflight.workspaceId, (state) => {
    const before = getSignalFilterMutationSnapshot(state, preflight.workspaceId);
    const admitted = result
      ? buildAdmittedSignal(preflight, result.quality, now)
      : { decision: 'uncertain', admittedToBank: false, signal: null };
    if (admitted.signal) {
      if (getVerifiedStableIds(state, preflight.workspaceId).has(preflight.options.candidateId)) {
        throw auditError('signal_filter_candidate_already_admitted');
      }
      const reels = Array.isArray(state.reels) ? state.reels : (state.reels = []);
      reels.unshift(admitted.signal);
    }
    const trace = sanitizeAuditValue(stripDiagnosticFields({
      id: `signal_filter_audit_${Date.now()}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
      schemaVersion: STAGING_SIGNAL_FILTER_AUDIT_VERSION,
      environment: 'staging',
      deployedCommitSha: preflight.options.deployedCommitSha,
      metadataAuditId: preflight.options.metadataAuditId,
      candidateId: preflight.options.candidateId,
      model: preflight.model,
      state: failure ? 'failed' : 'completed',
      decision: admitted.decision,
      admittedToBank: admitted.admittedToBank,
      reasons: failure
        ? [failure.code || 'signal_filter_execute_failed']
        : [...(result.quality?.rejectionReasons || []), ...(result.quality?.uncertaintyReasons || [])],
      estimatedMaximumCostUsd: preflight.estimate.maximumCostUsd,
      providerUsageCalculatedCostUsd: result?.calculatedCostUsd ?? null,
      providerReportedCostUsd: null,
      operations: result?.operations || null,
      rawGeminiResponse: result?.quality?.auditTrace?.rawResponse || null,
      parsedGeminiResult: result?.quality?.auditTrace?.parsedResult || null,
      media: result?.quality?.auditTrace ? {
        sha256: result.quality.auditTrace.mediaSha256 || null,
        byteLength: result.quality.auditTrace.mediaByteLength || null,
      } : null,
      mutationBefore: before,
      mutationAfter: null,
      createdAt: now.toISOString(),
    }), { secrets: secretValues });
    trace.usage = result?.usageCall ? {
      inputTokens: result.usageCall.inputTokens,
      cachedInputTokens: result.usageCall.cachedInputTokens,
      outputTokens: result.usageCall.outputTokens,
      thoughtTokens: result.usageCall.thoughtTokens,
      totalTokens: result.usageCall.totalTokens,
    } : null;
    appendExecutionTrace(state, trace);
    trace.mutationAfter = getSignalFilterMutationSnapshot(state, preflight.workspaceId);
    return {
      trace: structuredClone(trace),
      mutationBefore: before,
      mutationAfter: structuredClone(trace.mutationAfter),
    };
  });
}

async function runStagingSignalFilterAudit({
  env = process.env,
  options = {},
  store,
  analyze = executeOneShotAnalysis,
  now = () => new Date(),
} = {}) {
  if (!store || typeof store.readState !== 'function' || typeof store.mutateState !== 'function') {
    throw auditError('signal_filter_store_required');
  }
  const initialState = await store.readState();
  const preflight = buildStagingSignalFilterPreflight({ state: initialState, env, options });
  const publicPreflight = toPublicPreflight(preflight);
  if (preflight.options.preflightOnly) return { preflight: publicPreflight, trace: null };

  let result = null;
  let failure = null;
  try {
    result = await analyze({ preflight, env });
  } catch (error) {
    failure = { code: error?.code || 'signal_filter_execute_failed' };
  }
  const persisted = await persistExecutionResult({
    store,
    preflight,
    result,
    failure,
    env,
    now: now(),
  });
  const publicTrace = sanitizeAuditValue(persisted.trace);
  publicTrace.usage = persisted.trace.usage ? structuredClone(persisted.trace.usage) : null;
  return {
    preflight: publicPreflight,
    trace: publicTrace,
  };
}

module.exports = {
  APIFY_HARD_CAP_USD,
  GEMINI_HARD_CAP_USD,
  GEMINI_MODEL,
  MAX_CANDIDATES,
  MAX_DOWNLOADS,
  MAX_GEMINI_ANALYSES,
  MAX_MEDIA_BYTES,
  MAX_MEDIA_DURATION_SECONDS,
  MAX_METADATA_TEXT_CHARS,
  MAX_OUTPUT_TOKENS,
  TOTAL_PROVIDER_HARD_CAP_USD,
  buildAdmittedSignal,
  buildStagingSignalFilterPreflight,
  createOneShotFetchGuard,
  estimateGeminiWorstCase,
  getSignalFilterMutationSnapshot,
  normalizeOptions,
  runStagingSignalFilterAudit,
  toPublicPreflight,
};
