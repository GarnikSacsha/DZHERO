const { fetchApifySignals } = require('./apifySignalProvider');

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
} = {}) {
  const platform = detectAgentStudioSocialPlatform(sourceUrl);
  if (!token || !platform || typeof fetchSignals !== 'function') return null;
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
  if (!resolved) return null;
  return {
    ...resolved,
    sourceUrl: resolved.sourceUrl || sourceUrl,
    resolvedBy: 'apify',
  };
}

module.exports = {
  detectAgentStudioSocialPlatform,
  resolveAgentStudioVideoSource,
};
