'use strict';

const crypto = require('node:crypto');
const {
  buildApifyActorRequest,
  mapInstagramApifyItem,
  mapTikTokApifyItem,
  runApifyActor,
} = require('./apifySignalProvider.js');
const {
  buildMetadataAuditCandidateSet,
  estimateDiscoveryRunCostUsd,
  getDailyAutomaticSpend,
} = require('./automaticSignalDiscovery.js');
const {
  resolveWorkspaceDiscoveryBrand,
} = require('./productBrandBrain.cjs');
const {
  sanitizeDiagnosticExport,
} = require('./diagnosticExportSanitizer.cjs');

const MAX_COMMAND_BUDGET_USD = 0.30;
const MAX_RESULT_LIMIT = 5;
const RANKING_VERSION = 'b_soft_v1';

function auditError(code, message = code, details = null) {
  const error = new Error(message);
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

function sanitizeSource(value) {
  const text = compactText(value, 500);
  try {
    const url = new URL(text);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return text;
  }
}

function sanitizeAuditValue(value, { secrets = [] } = {}) {
  return sanitizeDiagnosticExport(value, { secrets });
}

function getMutationSnapshot(state = {}, workspaceId = '') {
  const reels = Array.isArray(state.reels) ? state.reels : [];
  const discoveryRuns = Array.isArray(state.discoveryRuns) ? state.discoveryRuns : [];
  const workspaceReels = reels.filter((item) => item?.workspaceId === workspaceId);
  const isVerified = (item) => (
    item?.importedMetadata?.qualityGate?.decision === 'accept'
    && item?.importedMetadata?.qualityGate?.admittedToBank === true
  );
  return {
    reels: reels.length,
    workspaceReels: workspaceReels.length,
    collectionEligible: workspaceReels.filter(isVerified).length,
    verifiedSignalBank: reels.filter(isVerified).length,
    discoveryRuns: discoveryRuns.length,
    workspaceDiscoveryRuns: discoveryRuns.filter((item) => item?.workspaceId === workspaceId).length,
  };
}

function snapshotsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasWorkspaceDiscoveryEntitlement(state = {}, workspaceId = '', env = {}) {
  if (workspaceId.startsWith('ws_demo_')) return false;
  const unlimitedEmails = new Set(String(env.UNLIMITED_ACCESS_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean));
  const workspaceUsers = (Array.isArray(state.users) ? state.users : [])
    .filter((user) => user?.workspaceId === workspaceId);
  if (workspaceUsers.some((user) => user?.role === 'admin' || unlimitedEmails.has(String(user?.email || '').toLowerCase()))) {
    return true;
  }
  const subscription = (Array.isArray(state.subscriptions) ? state.subscriptions : [])
    .find((item) => item?.workspaceId === workspaceId && item?.status !== 'cancelled');
  const plan = (Array.isArray(state.plans) ? state.plans : [])
    .find((item) => item?.id === subscription?.planId);
  return Boolean(plan?.features?.includes('apify_discovery'));
}

function assertStagingGuards(env = {}) {
  if (env.RAILWAY_ENVIRONMENT_NAME !== 'staging') throw auditError('metadata_audit_staging_required');
  if (!env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_ENVIRONMENT_ID !== env.STAGING_METADATA_AUDIT_ENVIRONMENT_ID) {
    throw auditError('metadata_audit_environment_id_mismatch');
  }
  if (!env.RAILWAY_PROJECT_ID || env.RAILWAY_PROJECT_ID !== env.STAGING_METADATA_AUDIT_PROJECT_ID) {
    throw auditError('metadata_audit_project_id_mismatch');
  }
  if (env.RAILWAY_SERVICE_NAME !== 'backend') throw auditError('metadata_audit_backend_service_required');
  if (!env.RAILWAY_DEPLOYMENT_ID || !env.RAILWAY_REPLICA_ID) {
    throw auditError('metadata_audit_railway_runtime_required');
  }
  if (env.ENABLE_STAGING_METADATA_AUDIT !== 'true') throw auditError('metadata_audit_feature_disabled');
  if (env.AUTOMATIC_DISCOVERY_ENABLED !== 'false') throw auditError('metadata_audit_background_worker_must_be_disabled');
  if (!env.DATABASE_URL) throw auditError('metadata_audit_postgres_required');
  if (!env.APIFY_TOKEN) throw auditError('metadata_audit_apify_token_required');
  if (env.GEMINI_API_KEY || env.GEMINI_VISION_API_KEY) throw auditError('metadata_audit_gemini_credentials_forbidden');
}

function normalizeOptions(options = {}) {
  const workspaceId = compactText(options.workspaceId, 160);
  const platform = compactText(options.platform, 20).toLowerCase();
  const inputType = compactText(options.inputType, 20).toLowerCase();
  const source = compactText(options.source, 500);
  const limit = Number(options.limit);
  const hardCapUsd = Number(options.hardCapUsd);
  const deployedCommitSha = compactText(options.deployedCommitSha, 40).toLowerCase();
  if (!workspaceId) throw auditError('metadata_audit_workspace_required');
  if (!['instagram', 'tiktok'].includes(platform)) throw auditError('metadata_audit_platform_invalid');
  if (!['profile', 'search', 'hashtag', 'url'].includes(inputType)) throw auditError('metadata_audit_input_type_invalid');
  if (!source) throw auditError('metadata_audit_source_required');
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULT_LIMIT) throw auditError('metadata_audit_limit_invalid');
  if (!Number.isFinite(hardCapUsd) || hardCapUsd <= 0 || hardCapUsd > MAX_COMMAND_BUDGET_USD) {
    throw auditError('metadata_audit_hard_cap_invalid');
  }
  if (!/^[a-f0-9]{40}$/.test(deployedCommitSha)) throw auditError('metadata_audit_commit_sha_invalid');
  return {
    workspaceId,
    platform,
    inputType,
    source,
    sanitizedSource: sanitizeSource(source),
    limit,
    hardCapUsd: roundUsd(hardCapUsd),
    deployedCommitSha,
    preflightOnly: options.preflightOnly === true,
  };
}

function buildMetadataAuditPreflight({ state = {}, env = {}, options = {} }) {
  assertStagingGuards(env);
  const normalized = normalizeOptions(options);
  if (env.RAILWAY_GIT_COMMIT_SHA && env.RAILWAY_GIT_COMMIT_SHA.toLowerCase() !== normalized.deployedCommitSha) {
    throw auditError('metadata_audit_deployed_commit_mismatch');
  }
  const workspace = (Array.isArray(state.workspaces) ? state.workspaces : [])
    .find((item) => item?.id === normalized.workspaceId);
  if (!workspace) throw auditError('metadata_audit_workspace_not_found');
  if (!hasWorkspaceDiscoveryEntitlement(state, normalized.workspaceId, env)) {
    throw auditError('metadata_audit_workspace_entitlement_required');
  }
  const discoveryBrand = resolveWorkspaceDiscoveryBrand(workspace, { requireProductBrandBrain: true });
  if (!discoveryBrand.complete) throw auditError('metadata_audit_brand_brain_incomplete');
  const workspaceBudgetUsd = Number(workspace.discoverySettings?.dailyBudgetUsd);
  if (!Number.isFinite(workspaceBudgetUsd) || workspaceBudgetUsd <= 0) {
    throw auditError('metadata_audit_workspace_budget_required');
  }
  const spentUsd = getDailyAutomaticSpend(state.discoveryRuns, normalized.workspaceId, new Date());
  const workspaceRemainingBudgetUsd = roundUsd(Math.max(workspaceBudgetUsd - spentUsd, 0));
  const effectiveBudgetUsd = roundUsd(Math.min(
    workspaceRemainingBudgetUsd,
    normalized.hardCapUsd,
    MAX_COMMAND_BUDGET_USD,
  ));
  const estimatedCostUsd = roundUsd(estimateDiscoveryRunCostUsd({
    platform: normalized.platform,
    limit: normalized.limit,
    downloadVideo: false,
    discoveryInputs: { [normalized.inputType]: [normalized.source] },
  }));
  if (estimatedCostUsd > effectiveBudgetUsd) {
    throw auditError('metadata_audit_estimate_exceeds_effective_budget', undefined, {
      estimatedCostUsd,
      effectiveBudgetUsd,
    });
  }
  const previousPaidAudit = (Array.isArray(state.metadataAuditRuns) ? state.metadataAuditRuns : [])
    .find((run) => run?.environment === 'staging'
      && run?.deployedCommitSha === normalized.deployedCommitSha
      && Number(run?.providerCallCount || 0) > 0);
  if (previousPaidAudit && !normalized.preflightOnly) {
    throw auditError('metadata_audit_provider_call_already_recorded');
  }
  const actorRequest = buildApifyActorRequest({
    platform: normalized.platform,
    inputType: normalized.inputType,
    inputValue: normalized.source,
    limit: normalized.limit,
    downloadVideo: false,
  });
  const hasEnabledDownload = Object.entries(actorRequest.input || {})
    .some(([key, value]) => /download/i.test(key) && value === true);
  if (hasEnabledDownload) throw auditError('metadata_audit_download_plan_forbidden');

  return {
    ...normalized,
    environment: 'staging',
    environmentId: env.RAILWAY_ENVIRONMENT_ID,
    projectId: env.RAILWAY_PROJECT_ID,
    service: env.RAILWAY_SERVICE_NAME,
    actorId: actorRequest.actorId,
    actorInput: actorRequest.input,
    workspaceBudgetUsd: roundUsd(workspaceBudgetUsd),
    workspaceSpentUsd: roundUsd(spentUsd),
    workspaceRemainingBudgetUsd,
    effectiveBudgetUsd,
    estimatedCostUsd,
    brandBrainRef: discoveryBrand.ref,
    brandBrainSnapshot: sanitizeAuditValue(discoveryBrand.brief),
    mutationSnapshot: getMutationSnapshot(state, normalized.workspaceId),
    invariants: {
      providerCalls: normalized.preflightOnly ? 0 : 1,
      retries: 0,
      concurrency: 1,
      downloads: 0,
      geminiCalls: 0,
      signalFilterCalls: 0,
      reelsWrites: 0,
      collectionWrites: 0,
      bankWrites: 0,
      maxVideoAnalysesPerRun: 1,
      rankingVersion: RANKING_VERSION,
    },
  };
}

function summarizeCandidate(candidate = {}) {
  const metadata = candidate.importedMetadata || {};
  return {
    handle: compactText(metadata.handle || candidate.handle || candidate.sourceHandle, 120),
    stableId: compactText(metadata.externalId || metadata.tiktokVideoId || metadata.shortCode, 160),
    canonicalUrl: sanitizeSource(candidate.sourceUrl || metadata.url || ''),
    score: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : null,
    rankingScore: Number.isFinite(Number(candidate.rankingScore)) ? Number(candidate.rankingScore) : null,
    qualityScore: null,
    rankingVersion: candidate.rankingVersion || null,
    requestedSourceHandle: candidate.requestedSourceHandle || metadata.requestedSourceHandle || '',
    contentOwnerHandle: candidate.contentOwnerHandle || metadata.contentOwnerHandle || '',
    coauthorHandles: candidate.coauthorHandles || metadata.coauthorHandles || [],
    taggedHandles: candidate.taggedHandles || metadata.taggedHandles || [],
    sourceRelationship: candidate.sourceRelationship || metadata.sourceRelationship || null,
    sharesAvailable: candidate.sharesAvailable === true,
    savesAvailable: candidate.savesAvailable === true,
    viewsAvailable: candidate.viewsAvailable === true,
    durationAvailable: candidate.durationAvailable === true,
    protectedIntentAvailable: candidate.protectedIntentAvailable === true,
    rankingMetadataStatus: candidate.rankingMetadataStatus || null,
  };
}

async function runStagingMetadataAudit({
  env = process.env,
  options = {},
  store,
  runActor = runApifyActor,
  now = () => new Date(),
}) {
  if (!store || typeof store.readState !== 'function' || typeof store.writeTrace !== 'function') {
    throw auditError('metadata_audit_store_required');
  }
  const initialState = await store.readState();
  const preflight = buildMetadataAuditPreflight({ state: initialState, env, options });
  const sanitizedPlan = sanitizeAuditValue({
    mode: preflight.preflightOnly ? 'preflight-only' : 'execute',
    environment: preflight.environment,
    deployedCommitSha: preflight.deployedCommitSha,
    workspaceId: preflight.workspaceId,
    platform: preflight.platform,
    inputType: preflight.inputType,
    source: preflight.sanitizedSource,
    limit: preflight.limit,
    actorId: preflight.actorId,
    estimatedCostUsd: preflight.estimatedCostUsd,
    hardCapUsd: preflight.hardCapUsd,
    workspaceRemainingBudgetUsd: preflight.workspaceRemainingBudgetUsd,
    effectiveBudgetUsd: preflight.effectiveBudgetUsd,
    invariants: preflight.invariants,
  });
  if (preflight.preflightOnly) return { preflight: sanitizedPlan, trace: null };

  const startedAt = now().toISOString();
  const runId = `metadata_audit_${Date.now()}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const secrets = [env.APIFY_TOKEN, env.DATABASE_URL];
  let trace = {
    id: runId,
    environment: preflight.environment,
    environmentId: preflight.environmentId,
    projectId: preflight.projectId,
    deployedCommitSha: preflight.deployedCommitSha,
    workspaceId: preflight.workspaceId,
    brandBrainRef: preflight.brandBrainRef,
    brandBrainSnapshot: preflight.brandBrainSnapshot,
    platform: preflight.platform,
    inputType: preflight.inputType,
    source: preflight.sanitizedSource,
    requestedLimit: preflight.limit,
    effectiveLimit: preflight.limit,
    commandCapUsd: preflight.hardCapUsd,
    workspaceRemainingBudgetUsd: preflight.workspaceRemainingBudgetUsd,
    effectiveBudgetUsd: preflight.effectiveBudgetUsd,
    conservativeEstimatedCostUsd: preflight.estimatedCostUsd,
    state: 'running',
    startedAt,
    completedAt: null,
    providerCallCount: 0,
    retries: 0,
    rawMetadataCandidates: [],
    normalizedCandidates: [],
    deduplicatedEligibleCandidates: [],
    counts: { raw: 0, normalized: 0, deduplicatedEligible: 0 },
    rankingVersion: RANKING_VERSION,
    topCandidates: [],
    selectedTopCandidate: null,
    providerRunId: null,
    providerReportedCostUsd: null,
    conservativeCommittedCostUsd: preflight.estimatedCostUsd,
    classifiedFailure: null,
    invariants: { ...preflight.invariants, providerCalls: 0 },
    mutationBefore: preflight.mutationSnapshot,
    mutationAfter: null,
    mutationGuardPassed: false,
    tracePersistenceConfirmed: false,
  };
  await store.writeTrace(sanitizeAuditValue(trace, { secrets }));

  trace.providerCallCount = 1;
  trace.invariants.providerCalls = 1;
  trace.providerAttemptedAt = now().toISOString();
  await store.writeTrace(sanitizeAuditValue(trace, { secrets }));

  try {
    const result = await runActor({
      token: env.APIFY_TOKEN,
      actorId: preflight.actorId,
      input: preflight.actorInput,
      maxTotalChargeUsd: preflight.effectiveBudgetUsd,
      maxItems: preflight.limit,
    });
    const rawItems = (Array.isArray(result?.items) ? result.items : []).slice(0, preflight.limit);
    const actualCostUsd = Number.isFinite(Number(result?.actualCostUsd))
      ? roundUsd(result.actualCostUsd)
      : null;
    trace.providerRunId = compactText(result?.runId, 120) || null;
    trace.providerReportedCostUsd = actualCostUsd;
    trace.conservativeCommittedCostUsd = roundUsd(Math.max(preflight.estimatedCostUsd, actualCostUsd || 0));
    if (!rawItems.length) throw auditError('metadata_audit_empty_provider_result');
    if (actualCostUsd !== null && actualCostUsd > preflight.effectiveBudgetUsd) {
      throw auditError('metadata_audit_provider_cost_exceeded_cap', undefined, { actualCostUsd });
    }
    const mapper = preflight.platform === 'instagram' ? mapInstagramApifyItem : mapTikTokApifyItem;
    const mapped = rawItems.map((item, index) => mapper(item, {
      workspaceId: preflight.workspaceId,
      market: 'global',
      inputType: preflight.inputType,
      inputValue: preflight.source,
      requestedSourceHandle: preflight.inputType === 'profile' ? preflight.source : '',
      createId: (prefix) => `${prefix}_${runId}_${index + 1}`,
      providerActor: preflight.actorId,
    }));
    const candidateSet = buildMetadataAuditCandidateSet(mapped, {
      workspaceId: preflight.workspaceId,
      market: 'global',
      now: now(),
    });
    trace.rawMetadataCandidates = sanitizeAuditValue(rawItems, { secrets });
    trace.normalizedCandidates = sanitizeAuditValue(candidateSet.normalizedCandidates, { secrets });
    trace.deduplicatedEligibleCandidates = sanitizeAuditValue(candidateSet.deduplicatedEligibleCandidates, { secrets });
    trace.counts = {
      raw: rawItems.length,
      normalized: candidateSet.normalizedCandidates.length,
      deduplicatedEligible: candidateSet.deduplicatedEligibleCandidates.length,
    };
    trace.topCandidates = candidateSet.topCandidates.map(summarizeCandidate);
    trace.selectedTopCandidate = candidateSet.selectedTopCandidate
      ? summarizeCandidate(candidateSet.selectedTopCandidate)
      : null;
    trace.classifiedFailure = candidateSet.classifiedFailure;
    trace.state = candidateSet.selectedTopCandidate ? 'completed' : 'failed';
  } catch (error) {
    const failedActualCostUsd = Number.isFinite(Number(error?.actualCostUsd))
      ? roundUsd(error.actualCostUsd)
      : trace.providerReportedCostUsd;
    trace.providerRunId = compactText(error?.runId, 120) || trace.providerRunId;
    trace.providerReportedCostUsd = failedActualCostUsd;
    trace.conservativeCommittedCostUsd = roundUsd(Math.max(
      preflight.estimatedCostUsd,
      failedActualCostUsd || 0,
    ));
    trace.state = 'failed';
    trace.classifiedFailure = sanitizeAuditValue({
      code: error?.code || 'metadata_audit_provider_failed',
      message: compactText(error?.message || 'metadata_audit_provider_failed', 500),
      status: Number(error?.status || 0) || null,
      details: error?.details || null,
    }, { secrets });
  }

  const postProviderState = await store.readState();
  trace.mutationAfter = getMutationSnapshot(postProviderState, preflight.workspaceId);
  trace.mutationGuardPassed = snapshotsEqual(trace.mutationBefore, trace.mutationAfter);
  if (!trace.mutationGuardPassed) {
    trace.state = 'failed';
    trace.classifiedFailure = { code: 'metadata_audit_mutation_guard_failed' };
  }
  trace.completedAt = now().toISOString();
  await store.writeTrace(sanitizeAuditValue(trace, { secrets }));
  const persistedState = await store.readState();
  const persistedTrace = (Array.isArray(persistedState.metadataAuditRuns) ? persistedState.metadataAuditRuns : [])
    .find((item) => item?.id === runId);
  trace.tracePersistenceConfirmed = Boolean(persistedTrace);
  await store.writeTrace(sanitizeAuditValue(trace, { secrets }));

  return {
    preflight: sanitizedPlan,
    trace: sanitizeAuditValue({
      id: trace.id,
      state: trace.state,
      providerRunId: trace.providerRunId,
      providerCallCount: trace.providerCallCount,
      retries: trace.retries,
      counts: trace.counts,
      rankingVersion: trace.rankingVersion,
      topCandidates: trace.topCandidates,
      selectedTopCandidate: trace.selectedTopCandidate,
      providerReportedCostUsd: trace.providerReportedCostUsd,
      conservativeCommittedCostUsd: trace.conservativeCommittedCostUsd,
      classifiedFailure: trace.classifiedFailure,
      invariants: trace.invariants,
      mutationGuardPassed: trace.mutationGuardPassed,
      tracePersistenceConfirmed: trace.tracePersistenceConfirmed,
    }, { secrets }),
  };
}

module.exports = {
  MAX_COMMAND_BUDGET_USD,
  MAX_RESULT_LIMIT,
  RANKING_VERSION,
  assertStagingGuards,
  buildMetadataAuditPreflight,
  getMutationSnapshot,
  hasWorkspaceDiscoveryEntitlement,
  normalizeOptions,
  runStagingMetadataAudit,
  sanitizeAuditValue,
  sanitizeSource,
};
