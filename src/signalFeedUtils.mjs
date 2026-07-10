export function parseMetric(value) {
  if (value === null || value === undefined || value === '' || value === '-') return 0;
  const raw = String(value).trim().toUpperCase();
  if (!raw) return 0;
  const compactMatch = raw.match(/([\d.,\s]+)\s*([KMB])?/);
  if (!compactMatch) return 0;
  const suffix = compactMatch[2] || '';
  let numericText = compactMatch[1].replace(/\s+/g, '');
  const commaCount = (numericText.match(/,/g) || []).length;
  const dotCount = (numericText.match(/\./g) || []).length;
  if (commaCount > 0 && dotCount > 0) {
    numericText = numericText.replace(/,/g, '');
  } else if (commaCount > 1) {
    numericText = numericText.replace(/,/g, '');
  } else if (dotCount > 1) {
    numericText = numericText.replace(/\./g, '');
  } else if (commaCount === 1 && !suffix) {
    const [left, right] = numericText.split(',');
    numericText = right?.length === 3 ? `${left}${right}` : `${left}.${right}`;
  } else if (commaCount === 1) {
    numericText = numericText.replace(',', '.');
  }
  const number = Number.parseFloat(numericText);
  if (!Number.isFinite(number)) return 0;
  if (suffix === 'B') return number * 1_000_000_000;
  if (suffix === 'M') return number * 1_000_000;
  if (suffix === 'K') return number * 1_000;
  return number;
}

export function canonicalizeSignalUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('www.') ? `https://${raw}` : raw);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const youtubeVideoId = url.hostname === 'youtube.com' && url.pathname.replace(/\/+$/, '') === '/watch'
      ? url.searchParams.get('v')
      : '';
    url.search = youtubeVideoId ? `?v=${encodeURIComponent(youtubeVideoId)}` : '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}${url.search}`.toLowerCase();
  } catch {
    return raw.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

export function getSignalSourceGroup(reel = {}) {
  const metadata = reel.importedMetadata || {};
  const platform = String(metadata.platform || '').toLowerCase();
  const providerPlatform = String(metadata.providerPlatform || metadata.source?.tone || '').toLowerCase();
  const sourceLabel = String(reel.scanLabel || reel.sourceType || metadata.source?.label || '').toLowerCase();
  const sourceStatus = String(reel.sourceStatus || metadata.sourceStatus || '').toLowerCase();
  const sourceUrl = String(reel.sourceUrl || metadata.url || metadata.webVideoUrl || metadata.sourceUrl || '').toLowerCase();
  const statusText = Array.isArray(reel.status) ? reel.status.join(' ').toLowerCase() : '';

  if (/https?:\/\/(?:www\.)?tiktok\.com\//.test(sourceUrl)) return 'tiktok';
  if (/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(sourceUrl)) return 'youtube';
  if (/https?:\/\/(?:www\.)?instagram\.com\//.test(sourceUrl)) return 'instagram';

  const explicitPlatform = [platform, providerPlatform].find((value) => value);
  if (explicitPlatform?.includes('tiktok')) return 'tiktok';
  if (explicitPlatform?.includes('youtube')) return 'youtube';
  if (explicitPlatform?.includes('instagram')) return 'instagram';

  const sourceIdentity = [sourceStatus, sourceLabel].join(' ');
  if (sourceIdentity.includes('tiktok')) return 'tiktok';
  if (sourceIdentity.includes('youtube') || sourceIdentity.includes('youtu.be') || sourceIdentity.includes('shorts')) return 'youtube';
  if (sourceIdentity.includes('instagram') || sourceIdentity.includes('reels')) return 'instagram';

  if (statusText.includes('tiktok')) return 'tiktok';
  if (statusText.includes('youtube') || statusText.includes('shorts')) return 'youtube';
  if (statusText.includes('instagram') || statusText.includes('reels')) return 'instagram';
  if (sourceLabel.includes('website') || /^https?:\/\//i.test(sourceUrl)) return 'website';
  return 'bank';
}

export function compareSignalReels(left, right, { sort = 'score', scoreSortDirection = 'desc' } = {}) {
  if (sort === 'views') return parseMetric(right.views) - parseMetric(left.views);
  if (sort === 'likes') return parseMetric(right.likes) - parseMetric(left.likes);
  if (sort === 'comments') return parseMetric(right.comments) - parseMetric(left.comments);
  if (sort === 'newest') {
    return new Date(right.createdAt || right.publishedAt || right.importedMetadata?.publishedAt || 0)
      - new Date(left.createdAt || left.publishedAt || left.importedMetadata?.publishedAt || 0);
  }
  const leftScore = Number(left.score) || 0;
  const rightScore = Number(right.score) || 0;
  return scoreSortDirection === 'asc' ? leftScore - rightScore : rightScore - leftScore;
}
