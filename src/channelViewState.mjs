export const DEFAULT_CHANNEL_FILTERS = Object.freeze({
  platform: 'all',
  niche: 'all',
  aiMatch: 'all',
  avgViews: 'all',
});

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function terms(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return new Set(values.map(normalized).filter(Boolean));
}

function overlap(left, right) {
  return [...left].filter((value) => right.has(value));
}

export function isCollectedChannel(channel) {
  return Boolean(String(channel?.id || '').trim() && String(channel?.collectedId || '').trim());
}

export function filterChannelRecords(
  channels,
  filters = DEFAULT_CHANNEL_FILTERS,
  {
    activeTab = 'all',
    query = '',
    trackedIds = new Set(),
    favoriteIds = new Set(),
    recommendedIds = new Set(),
  } = {},
) {
  const search = normalized(query);
  return channels.filter(isCollectedChannel).filter((channel) => {
    if (activeTab === 'following' && !trackedIds.has(channel.id)) return false;
    if (activeTab === 'favorites' && !favoriteIds.has(channel.id)) return false;
    if (activeTab === 'recommended' && !recommendedIds.has(channel.id)) return false;
    if (activeTab === 'trending' && channel.rising !== true) return false;
    if (search && ![channel.name, channel.handle, channel.niche].some((value) => normalized(value).includes(search))) return false;
    if (filters.platform !== 'all' && normalized(channel.platform) !== filters.platform) return false;
    if (filters.niche !== 'all' && normalized(channel.niche) !== filters.niche) return false;
    if (filters.aiMatch !== 'all') {
      const minimum = filters.aiMatch === 'match80' ? 80 : 90;
      if (!Number.isFinite(channel.aiMatchValue) || channel.aiMatchValue < minimum) return false;
    }
    if (filters.avgViews !== 'all') {
      const minimum = filters.avgViews === 'views100k' ? 100_000 : 500_000;
      if (!Number.isFinite(channel.avgViewsValue) || channel.avgViewsValue < minimum) return false;
    }
    return true;
  });
}

export function sortChannelRecords(channels, sort = 'newest') {
  const sorted = [...channels];
  const numeric = (key) => (left, right) => {
    const leftValue = left[key];
    const rightValue = right[key];
    if (!Number.isFinite(leftValue)) return Number.isFinite(rightValue) ? 1 : 0;
    if (!Number.isFinite(rightValue)) return -1;
    return rightValue - leftValue;
  };

  if (sort === 'avgViews') return sorted.sort(numeric('avgViewsValue'));
  if (sort === 'aiMatch') return sorted.sort(numeric('aiMatchValue'));
  if (sort === 'name') return sorted.sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  return sorted.sort((left, right) => new Date(right.collectedAt || 0) - new Date(left.collectedAt || 0));
}

export function buildChannelRecommendations(channels, brandBrain) {
  const candidates = channels.filter(isCollectedChannel);
  const brandNiches = terms(brandBrain?.niches || brandBrain?.niche);
  const brandLanguages = terms(brandBrain?.languages || brandBrain?.language);
  const brandMarkets = terms(brandBrain?.markets || brandBrain?.market);
  const brandMechanics = terms(brandBrain?.mechanics || brandBrain?.contentMechanics);
  const hasBrandContext = [brandNiches, brandLanguages, brandMarkets, brandMechanics].some((set) => set.size);

  if (!candidates.length || !hasBrandContext) {
    return { status: 'insufficient', recommendations: [] };
  }

  const recommendations = candidates.map((channel) => {
    const nicheOverlap = overlap(brandNiches, terms(channel.taxonomy?.niches || channel.niche));
    const languageOverlap = overlap(brandLanguages, terms(channel.taxonomy?.languages || channel.language));
    const marketOverlap = overlap(brandMarkets, terms(channel.taxonomy?.markets || channel.market));
    const mechanicsOverlap = overlap(brandMechanics, terms(channel.taxonomy?.mechanics));
    const relevance = nicheOverlap.length * 4
      + languageOverlap.length * 2
      + marketOverlap.length * 2
      + mechanicsOverlap.length;
    const reason = nicheOverlap.length
      ? 'nicheOverlap'
      : languageOverlap.length || marketOverlap.length
        ? 'marketLanguage'
        : mechanicsOverlap.length
          ? 'mechanics'
          : '';
    return { channelId: channel.id, relevance, reason };
  }).filter(({ relevance, reason }) => relevance > 0 && reason)
    .sort((left, right) => right.relevance - left.relevance || left.channelId.localeCompare(right.channelId));

  return {
    status: recommendations.length ? 'ready' : 'insufficient',
    recommendations,
  };
}

export function readStoredChannelIds(storage, key, allowedIds = []) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || '[]');
    const allowed = new Set(allowedIds);
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => allowed.has(id)) : []);
  } catch {
    return new Set();
  }
}
