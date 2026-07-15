const {
  fetchApifySignals,
  mapInstagramApifyItem,
  runApifyActor,
} = require('./apifySignalProvider');

const INSTAGRAM_FALLBACK_ACTOR = 'apify/instagram-scraper';

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
  fetchSignals = fetchApifySignals,
  runActor = runApifyActor,
  mapInstagramItem = mapInstagramApifyItem,
} = {}) {
  const platform = detectAgentStudioSocialPlatform(sourceUrl);
  if (!token || !platform || typeof fetchSignals !== 'function') return null;
  const attempts = [];

  try {
    const signals = await fetchSignals({
      token,
      platform,
      inputType: 'url',
      inputValue: sourceUrl,
      limit: 1,
      downloadVideo: true,
      workspaceId,
      market,
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
    attempts.push({ actor: 'platform-default', outcome: 'failed', error: error?.message || 'unknown' });
  }

  if (platform === 'instagram' && typeof runActor === 'function' && typeof mapInstagramItem === 'function') {
    try {
      const result = await runActor({
        token,
        actorId: INSTAGRAM_FALLBACK_ACTOR,
        input: {
          directUrls: [sourceUrl],
          resultsType: 'reels',
          resultsLimit: 1,
        },
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
      attempts.push({ actor: INSTAGRAM_FALLBACK_ACTOR, outcome: 'failed', error: error?.message || 'unknown' });
    }
  }

  return { unresolved: true, sourceUrl, platform, attempts };
}

module.exports = {
  detectAgentStudioSocialPlatform,
  INSTAGRAM_FALLBACK_ACTOR,
  resolveAgentStudioVideoSource,
};
