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
