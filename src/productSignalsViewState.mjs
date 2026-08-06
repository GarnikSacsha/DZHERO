import { canonicalizeSignalUrl } from './signalFeedUtils.mjs';

export const DEFAULT_SIGNAL_FILTERS = Object.freeze({
  platform: 'all',
  niche: 'all',
  aiMatch: 'all',
  views: 'all',
  likes: 'all',
  date: 'all',
  creator: 'all',
  status: 'all',
});

const MINIMUMS = Object.freeze({
  aiMatch: Object.freeze({ match80: 80, match90: 90 }),
  views: Object.freeze({ views1m: 1_000_000, views2m: 2_000_000 }),
  likes: Object.freeze({ likes100k: 100_000, likes500k: 500_000 }),
});

const PLATFORM_LABELS = Object.freeze({
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
});

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseMetric(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Number(value));
  const match = clean(value).toUpperCase().replace(/,/g, '').match(/^([\d.]+)\s*([KMB])?$/);
  if (!match) return undefined;
  const multiplier = match[2] === 'B'
    ? 1_000_000_000
    : match[2] === 'M'
      ? 1_000_000
      : match[2] === 'K'
        ? 1_000
        : 1;
  const result = Number(match[1]) * multiplier;
  return Number.isFinite(result) ? result : undefined;
}

function formatMetric(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

function detectPlatform(reel = {}) {
  const metadata = reel.importedMetadata || {};
  const explicit = clean(metadata.platform || metadata.source?.tone || reel.sourceType).toLowerCase();
  if (explicit.includes('instagram')) return 'instagram';
  if (explicit.includes('tiktok') || explicit.includes('tik tok')) return 'tiktok';
  if (explicit.includes('youtube') || explicit.includes('shorts')) return 'youtube';

  const sourceUrl = clean(reel.sourceUrl || metadata.url);
  if (/instagram\.com/i.test(sourceUrl)) return 'instagram';
  if (/tiktok\.com/i.test(sourceUrl)) return 'tiktok';
  if (/youtu\.?be/i.test(sourceUrl)) return 'youtube';
  return '';
}

function inferNiche(reel = {}) {
  const metadata = reel.importedMetadata || {};
  const text = clean([
    reel.niche,
    reel.title,
    reel.caption,
    metadata.title,
    metadata.description,
    metadata.qualityGate?.centralIdea,
  ].filter(Boolean).join(' ')).toLowerCase();
  if (/\b(ai|agent|coding|code|software|app|saas|automation|workflow|tech|gemini|claude|openai)\b/i.test(text)) {
    return 'technology';
  }
  if (/\b(food|coffee|cafe|restaurant|recipe|drink|meal|kitchen)\b/i.test(text)) return 'food';
  return clean(reel.niche).toLowerCase() || 'lifestyle';
}

function initialsFrom(value) {
  const parts = clean(value).replace(/^@/, '').split(/[._\s-]+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join('') || 'DZ').toUpperCase();
}

export function mapBackendSignalToProductCard(reel = {}, now = Date.now()) {
  const metadata = reel.importedMetadata || {};
  const qualityGate = metadata.qualityGate || {};
  const platformId = detectPlatform(reel);
  const handle = clean(reel.handle || reel.sourceHandle || metadata.handle || metadata.author) || '@creator';
  const creator = clean(metadata.authorName || metadata.channelTitle || handle.replace(/^@/, '')) || 'Creator';
  const viewsValue = parseMetric(reel.views ?? metadata.rawStats?.views ?? metadata.stats?.views);
  const likesValue = parseMetric(reel.likes ?? metadata.rawStats?.likes ?? metadata.stats?.likes);
  const publishedAt = clean(reel.publishedAt || metadata.publishedAt || reel.createdAt);
  const publishedOrder = Date.parse(publishedAt);
  const ageHours = Number.isFinite(publishedOrder)
    ? Math.max(0, (Number(now) - publishedOrder) / 3_600_000)
    : undefined;
  const qualityValue = Number.isFinite(Number(qualityGate.qualityScore))
    ? Number(qualityGate.qualityScore)
    : undefined;
  const matchValue = Number.isFinite(Number(reel.workspaceBrandMatch))
    ? Number(reel.workspaceBrandMatch)
    : undefined;
  const sourceUrl = clean(reel.sourceUrl || metadata.url || metadata.webVideoUrl);

  return {
    id: clean(reel.id) || canonicalizeSignalUrl(sourceUrl),
    visual: platformId || 'signal',
    creatorId: handle.toLowerCase(),
    country: clean(reel.market).toUpperCase() || 'GLOBAL',
    platform: PLATFORM_LABELS[platformId] || clean(reel.sourceType) || 'Video',
    platformId,
    niche: inferNiche(reel),
    creator,
    handle,
    title: clean(reel.title || metadata.title || qualityGate.centralIdea) || 'Untitled signal',
    insight: clean(qualityGate.centralIdea || qualityGate.summary),
    views: formatMetric(viewsValue),
    viewsValue,
    likes: formatMetric(likesValue),
    likesValue,
    ageHours,
    publishedOrder: Number.isFinite(publishedOrder) ? publishedOrder : undefined,
    sourceUrl,
    sourceHandle: handle,
    image: clean(reel.image || metadata.image || metadata.thumbnailUrl),
    videoUrl: clean(reel.videoUrl || metadata.videoUrl || metadata.downloadedVideoUrl),
    caption: clean(reel.caption || metadata.description),
    transcript: reel.transcript || '',
    importedMetadata: metadata,
    analysis: {
      recommendation: clean(qualityGate.summary),
      notes: clean(qualityGate.centralIdea),
      signals: qualityGate.contentMechanic || qualityGate.transferableMechanic
        ? [clean(qualityGate.contentMechanic || qualityGate.transferableMechanic)]
        : [],
    },
    initials: initialsFrom(creator || handle),
    qualityDecision: clean(qualityGate.decision),
    qualityValue,
    qualitySummary: clean(qualityGate.summary),
    centralIdea: clean(qualityGate.centralIdea),
    transferableMechanic: clean(qualityGate.contentMechanic || qualityGate.transferableMechanic),
    matchValue,
    rawSignal: reel,
  };
}

export function mapQualityAcceptedSignalsToProductCards(reels = [], now = Date.now()) {
  return reels
    .filter((reel) => (
      reel?.importedMetadata?.qualityGate?.decision === 'accept'
      && reel?.importedMetadata?.qualityGate?.admittedToBank === true
    ))
    .map((reel) => mapBackendSignalToProductCard(reel, now))
    .filter((card) => card.id && card.sourceUrl);
}

function meetsMinimum(value, selection, thresholds) {
  if (selection === 'all') return true;
  if (!Number.isFinite(value)) return false;
  return value >= thresholds[selection];
}

export function filterSignalCards(
  cards,
  filters = DEFAULT_SIGNAL_FILTERS,
  { savedIds = new Set(), directSignalId = '' } = {},
) {
  return cards.filter((card) => {
    if (directSignalId && card.id !== directSignalId) return false;
    if (filters.platform !== 'all' && card.platformId !== filters.platform) return false;
    if (filters.niche !== 'all' && card.niche !== filters.niche) return false;
    if (!meetsMinimum(card.matchValue, filters.aiMatch, MINIMUMS.aiMatch)) return false;
    if (!meetsMinimum(card.viewsValue, filters.views, MINIMUMS.views)) return false;
    if (!meetsMinimum(card.likesValue, filters.likes, MINIMUMS.likes)) return false;
    if (filters.date !== 'all') {
      const maximumAge = filters.date === 'last6h' ? 6 : 24;
      if (!Number.isFinite(card.ageHours) || card.ageHours > maximumAge) return false;
    }
    if (filters.creator !== 'all' && card.id !== filters.creator) return false;
    if (filters.status === 'saved' && !savedIds.has(card.id)) return false;
    return true;
  });
}

export function sortSignalCards(cards, sort = 'match') {
  const sorted = [...cards];
  const numericSort = (property) => (left, right) => {
    const leftValue = left[property];
    const rightValue = right[property];
    if (!Number.isFinite(leftValue)) return Number.isFinite(rightValue) ? 1 : 0;
    if (!Number.isFinite(rightValue)) return -1;
    return rightValue - leftValue;
  };

  if (sort === 'views') return sorted.sort(numericSort('viewsValue'));
  if (sort === 'likes') return sorted.sort(numericSort('likesValue'));
  if (sort === 'newest') return sorted.sort(numericSort('publishedOrder'));
  return sorted.sort(numericSort('matchValue'));
}

export function getSupportedSignalPlatform(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw.startsWith('www.') ? `https://${raw}` : raw);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = url.pathname.toLowerCase();

    if (hostname === 'instagram.com' && /^\/reels?\//.test(pathname)) return 'instagram';
    if ((hostname === 'youtube.com' && pathname.startsWith('/shorts/')) || hostname === 'youtu.be') return 'youtube';
    if (hostname === 'tiktok.com' && pathname.includes('/video/')) return 'tiktok';
    return '';
  } catch {
    return '';
  }
}

export function findSignalBySourceUrl(cards, value) {
  const canonicalUrl = canonicalizeSignalUrl(value);
  return cards.find((card) => canonicalizeSignalUrl(card.sourceUrl) === canonicalUrl) || null;
}
