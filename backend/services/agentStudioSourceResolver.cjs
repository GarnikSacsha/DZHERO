const {
  fetchApifySignals,
  mapInstagramApifyItem,
  runApifyActor,
} = require('./apifySignalProvider');
const crypto = require('node:crypto');

const INSTAGRAM_FALLBACK_ACTOR = 'apify/instagram-scraper';
const MAX_SOCIAL_SOURCE_CHARGE_USD = 0.25;

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
  if (
    !Number.isFinite(boundedMaxTotalChargeUsd)
    || boundedMaxTotalChargeUsd <= 0
    || boundedMaxTotalChargeUsd > MAX_SOCIAL_SOURCE_CHARGE_USD
  ) {
    const error = new Error('saved_url_social_cost_cap_required');
    error.code = 'saved_url_social_cost_cap_required';
    error.status = 503;
    throw error;
  }
  const attempts = [];
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

  try {
    if (typeof beforeProviderAttempt === 'function') {
      await beforeProviderAttempt({
        provider: 'apify',
        model: platform === 'instagram' ? 'apify/instagram-reel-scraper' : 'clockworks/tiktok-scraper',
        operation: 'social_source_resolution',
      });
    }
    const signals = await fetchSignals({
      token,
      platform,
      inputType: 'url',
      inputValue: sourceUrl,
      limit: 1,
      maxItems: 1,
      maxTotalChargeUsd: boundedMaxTotalChargeUsd,
      downloadVideo: true,
      workspaceId,
      market,
    });
    await reportUsage({
      actor: platform === 'instagram' ? 'apify/instagram-reel-scraper' : 'clockworks/tiktok-scraper',
      status: 'completed',
      usageTotalUsd: signals?.actualCostUsd,
    });
    const resolved = (Array.isArray(signals) ? signals : []).find((signal) => String(signal?.videoUrl || '').trim());
    if (resolved) {
      return {
        ...resolved,
        sourceUrl: resolved.sourceUrl || sourceUrl,
        resolvedBy: 'apify-platform-actor',
      };
    }
    attempts.push({ actor: 'platform-default', outcome: 'empty' });
  } catch (error) {
    if (error?.providerAttemptBlocked) throw error;
    await reportUsage({
      actor: platform === 'instagram' ? 'apify/instagram-reel-scraper' : 'clockworks/tiktok-scraper',
      status: 'failed',
      usageTotalUsd: error?.actualCostUsd ?? error?.run?.usageTotalUsd,
    });
    attempts.push({ actor: 'platform-default', outcome: 'failed', error: error?.message || 'unknown' });
  }

  if (platform === 'instagram' && typeof runActor === 'function' && typeof mapInstagramItem === 'function') {
    try {
      if (typeof beforeProviderAttempt === 'function') {
        await beforeProviderAttempt({
          provider: 'apify',
          model: INSTAGRAM_FALLBACK_ACTOR,
          operation: 'social_source_resolution',
        });
      }
      const result = await runActor({
        token,
        actorId: INSTAGRAM_FALLBACK_ACTOR,
        input: {
          directUrls: [sourceUrl],
          resultsType: 'reels',
          resultsLimit: 1,
        },
        maxItems: 1,
        maxTotalChargeUsd: boundedMaxTotalChargeUsd,
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
  MAX_SOCIAL_SOURCE_CHARGE_USD,
  resolveAgentStudioVideoSource,
};
