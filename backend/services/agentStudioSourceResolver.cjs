const {
  fetchApifySignals,
  mapInstagramApifyItem,
  runApifyActor,
} = require('./apifySignalProvider');
const crypto = require('node:crypto');

const INSTAGRAM_FALLBACK_ACTOR = 'apify/instagram-scraper';
const INSTAGRAM_MAX_SOCIAL_SOURCE_CHARGE_USD = 0.05;
const TIKTOK_MAX_SOCIAL_SOURCE_CHARGE_USD = 0.50;
const SOURCE_RESOLUTION_ATTEMPT_LIMIT = 4;
const SOURCE_RESOLUTION_ACTOR_MAX_LENGTH = 120;
const SOURCE_RESOLUTION_OUTCOMES = new Set(['empty', 'failed', 'blocked_by_cap', 'resolved']);

function buildSafeResolutionAttempts(attempts = [], finalAttempt = null) {
  return [...(Array.isArray(attempts) ? attempts : []), finalAttempt]
    .flatMap((attempt) => {
      if (!attempt || typeof attempt !== 'object') return [];
      const rawActor = String(attempt.actor || '').replace(/\s+/g, ' ').trim();
      const actor = rawActor.length > SOURCE_RESOLUTION_ACTOR_MAX_LENGTH
        ? `${rawActor.slice(0, SOURCE_RESOLUTION_ACTOR_MAX_LENGTH - 1).trim()}…`
        : rawActor;
      const outcome = String(attempt.outcome || '').trim().toLowerCase();
      if (!actor || !SOURCE_RESOLUTION_OUTCOMES.has(outcome)) return [];
      return [{ actor, outcome }];
    })
    .slice(0, SOURCE_RESOLUTION_ATTEMPT_LIMIT);
}

function detectAgentStudioSocialPlatform(value = '') {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  } catch {
    return '';
  }
  return '';
}

async function resolveAgentStudioVideoSource({
  token = process.env.APIFY_TOKEN || '',
  sourceUrl = '',
  workspaceId = '',
  market = 'global',
  maxTotalChargeUsd = null,
  totalMaxChargeUsd = null,
  maxPaidActorStarts = null,
  allowInstagramFallback = true,
  fetchSignals = fetchApifySignals,
  runActor = runApifyActor,
  mapInstagramItem = mapInstagramApifyItem,
  onUsage = null,
  beforeProviderAttempt = null,
  phase = 'initial',
  invocationId = '',
} = {}) {
  const platform = detectAgentStudioSocialPlatform(sourceUrl);
  if (!token || !platform || typeof fetchSignals !== 'function') return null;
  const boundedMaxTotalChargeUsd = Number(maxTotalChargeUsd);
  const platformMaxTotalChargeUsd = platform === 'tiktok'
    ? TIKTOK_MAX_SOCIAL_SOURCE_CHARGE_USD
    : INSTAGRAM_MAX_SOCIAL_SOURCE_CHARGE_USD;
  if (
    !Number.isFinite(boundedMaxTotalChargeUsd)
    || boundedMaxTotalChargeUsd <= 0
    || boundedMaxTotalChargeUsd > platformMaxTotalChargeUsd
  ) {
    const error = new Error('saved_url_social_cost_cap_required');
    error.code = 'saved_url_social_cost_cap_required';
    error.status = 503;
    throw error;
  }
  const attempts = [];
  const defaultActorStartLimit = platform === 'instagram' ? 2 : 1;
  const configuredActorStartLimit = maxPaidActorStarts === null || maxPaidActorStarts === undefined
    ? defaultActorStartLimit
    : Number(maxPaidActorStarts);
  if (
    !Number.isInteger(configuredActorStartLimit)
    || configuredActorStartLimit < 0
    || configuredActorStartLimit > defaultActorStartLimit
  ) {
    const error = new Error('saved_url_social_actor_start_limit_invalid');
    error.code = 'saved_url_social_actor_start_limit_invalid';
    error.status = 503;
    throw error;
  }
  const aggregateCapConfigured = totalMaxChargeUsd !== null && totalMaxChargeUsd !== undefined;
  const configuredAggregateCap = Number(totalMaxChargeUsd);
  if (
    aggregateCapConfigured
    && (
      !Number.isFinite(configuredAggregateCap)
      || configuredAggregateCap <= 0
      || configuredAggregateCap > platformMaxTotalChargeUsd
    )
  ) {
    const error = new Error('saved_url_social_total_cost_cap_invalid');
    error.code = 'saved_url_social_total_cost_cap_invalid';
    error.status = 503;
    throw error;
  }
  let paidActorStarts = 0;
  let remainingAggregateExposureUsd = aggregateCapConfigured ? configuredAggregateCap : null;
  const prepareActorAttempt = async ({ actor }) => {
    if (paidActorStarts >= configuredActorStartLimit) return null;
    const remainingStarts = configuredActorStartLimit - paidActorStarts;
    const actorMaxTotalChargeUsd = aggregateCapConfigured
      ? remainingAggregateExposureUsd / remainingStarts
      : boundedMaxTotalChargeUsd;
    if (typeof beforeProviderAttempt === 'function') {
      await beforeProviderAttempt({
        provider: 'apify',
        model: actor,
        operation: 'social_source_resolution',
      });
    }
    paidActorStarts += 1;
    if (aggregateCapConfigured) remainingAggregateExposureUsd -= actorMaxTotalChargeUsd;
    return actorMaxTotalChargeUsd;
  };
  const reportUsage = async ({ actor, status, usageTotalUsd }) => {
    if (typeof onUsage !== 'function') return;
    try {
      await onUsage({
        callId: `${invocationId || 'agent-studio'}:apify:${crypto.randomUUID()}`,
        invocationId,
        phase,
        actor,
        status,
        usageTotalUsd,
        startedAt: null,
        completedAt: new Date().toISOString(),
      });
    } catch {
      // Source resolution remains usable when telemetry persistence is unavailable.
    }
  };

  const primaryActor = platform === 'instagram' ? 'apify/instagram-reel-scraper' : 'clockworks/tiktok-scraper';
  const primaryActorChargeCap = await prepareActorAttempt({ actor: primaryActor });
  if (primaryActorChargeCap !== null) try {
    const signals = await fetchSignals({
      token,
      platform,
      inputType: 'url',
      inputValue: sourceUrl,
      limit: 1,
      maxItems: 1,
      maxTotalChargeUsd: primaryActorChargeCap,
      downloadVideo: true,
      workspaceId,
      market,
    });
    await reportUsage({
      actor: primaryActor,
      status: 'completed',
      usageTotalUsd: signals?.actualCostUsd,
    });
    const resolved = (Array.isArray(signals) ? signals : []).find((signal) => String(signal?.videoUrl || '').trim());
    if (resolved) {
      return {
        ...resolved,
        sourceUrl: resolved.sourceUrl || sourceUrl,
        resolvedBy: 'apify-platform-actor',
        attempts: buildSafeResolutionAttempts(attempts, { actor: primaryActor, outcome: 'resolved' }),
      };
    }
    attempts.push({ actor: primaryActor, outcome: 'empty' });
  } catch (error) {
    if (error?.providerAttemptBlocked) throw error;
    await reportUsage({
      actor: primaryActor,
      status: 'failed',
      usageTotalUsd: error?.actualCostUsd ?? error?.run?.usageTotalUsd,
    });
    attempts.push({ actor: primaryActor, outcome: 'failed', error: error?.message || 'unknown' });
  } else attempts.push({ actor: primaryActor, outcome: 'blocked_by_cap' });

  if (
    platform === 'instagram'
    && allowInstagramFallback
    && typeof runActor === 'function'
    && typeof mapInstagramItem === 'function'
  ) {
    const fallbackActorChargeCap = await prepareActorAttempt({ actor: INSTAGRAM_FALLBACK_ACTOR });
    if (fallbackActorChargeCap === null) {
      attempts.push({ actor: INSTAGRAM_FALLBACK_ACTOR, outcome: 'blocked_by_cap' });
      return { unresolved: true, sourceUrl, platform, attempts };
    }
    try {
      const result = await runActor({
        token,
        actorId: INSTAGRAM_FALLBACK_ACTOR,
        input: {
          directUrls: [sourceUrl],
          resultsType: 'reels',
          resultsLimit: 1,
        },
        maxItems: 1,
        maxTotalChargeUsd: fallbackActorChargeCap,
      });
      await reportUsage({
        actor: INSTAGRAM_FALLBACK_ACTOR,
        status: 'completed',
        usageTotalUsd: result?.actualCostUsd,
      });
      const resolved = (Array.isArray(result?.items) ? result.items : [])
        .map((item) => mapInstagramItem(item, {
          workspaceId,
          market,
          providerActor: INSTAGRAM_FALLBACK_ACTOR,
        }))
        .find((signal) => String(signal?.videoUrl || '').trim());
      if (resolved) {
        return {
          ...resolved,
          sourceUrl: resolved.sourceUrl || sourceUrl,
          resolvedBy: 'apify-instagram-fallback',
          attempts: buildSafeResolutionAttempts(attempts, {
            actor: INSTAGRAM_FALLBACK_ACTOR,
            outcome: 'resolved',
          }),
        };
      }
      attempts.push({ actor: INSTAGRAM_FALLBACK_ACTOR, outcome: 'empty' });
    } catch (error) {
      if (error?.providerAttemptBlocked) throw error;
      await reportUsage({
        actor: INSTAGRAM_FALLBACK_ACTOR,
        status: 'failed',
        usageTotalUsd: error?.actualCostUsd ?? error?.run?.usageTotalUsd,
      });
      attempts.push({ actor: INSTAGRAM_FALLBACK_ACTOR, outcome: 'failed', error: error?.message || 'unknown' });
    }
  }

  return { unresolved: true, sourceUrl, platform, attempts };
}

module.exports = {
  detectAgentStudioSocialPlatform,
  INSTAGRAM_FALLBACK_ACTOR,
  INSTAGRAM_MAX_SOCIAL_SOURCE_CHARGE_USD,
  TIKTOK_MAX_SOCIAL_SOURCE_CHARGE_USD,
  resolveAgentStudioVideoSource,
};
