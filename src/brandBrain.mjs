function compactText(value) {
  return String(value || '')
    .replace(/\bтут\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripProfileStats(value) {
  return compactText(value)
    .replace(/\b[\d,.]+\s*[KMB]?\s+Followers\b,?\s*/gi, '')
    .replace(/\b[\d,.]+\s*[KMB]?\s+Following\b,?\s*/gi, '')
    .replace(/\b[\d,.]+\s*[KMB]?\s+Posts\b,?\s*/gi, '')
    .replace(/\s*-\s*See Instagram photos and videos\s*/gi, ' ')
    .replace(/\s*See Instagram photos and videos from\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHandle(value, handle = '') {
  const cleanHandle = compactText(handle).replace(/^@/, '');
  if (!cleanHandle) return compactText(value);
  const escaped = cleanHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return compactText(value)
    .replace(new RegExp(`@${escaped}\\b`, 'gi'), '')
    .replace(new RegExp(`\\(@?${escaped}\\)`, 'gi'), '')
    .trim();
}

function stripBrandPrefix(value) {
  const text = compactText(value)
    .replace(/^[-–—|:]+/, '')
    .replace(/[-–—|:]+$/, '')
    .trim();
  const parts = text.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return text;
  const [first, ...rest] = parts;
  const firstLooksLikeBrand = /^[A-Z0-9_ .]{3,}$/.test(first) || /^[\w.]+$/i.test(first);
  return firstLooksLikeBrand ? rest.join(' - ') : text;
}

export function extractCleanBrandProduct({ title = '', description = '', handle = '', label = '' } = {}) {
  const candidates = [description, title]
    .map((value) => stripBrandPrefix(stripHandle(stripProfileStats(value), handle)))
    .map((value) => value.replace(/^[-–—|:]+/, '').trim())
    .filter(Boolean)
    .filter((value) => !/^(followers|following|posts)$/i.test(value))
    .filter((value) => !/See Instagram photos and videos/i.test(value));

  const useful = candidates.find((value) => /workout|training|трен|beauty|health|курс|послуг|shop|store|studio|salon|fitness|wellness|app/i.test(value));
  if (useful) return compactText(useful);
  const fallback = candidates[0] || '';
  if (label && (!fallback || /\bstats?\b/i.test(fallback) || fallback.split(/\s+/).length <= 2)) return compactText(label);
  return compactText(fallback || label || '');
}

function buildAudience(product, label) {
  const text = `${product} ${label}`.toLowerCase();
  if (/workout|training|fitness|wellness|health|трен/.test(text)) {
    return 'people who want short health and beauty workouts without a long gym routine';
  }
  if (/beauty|salon|манік|крас/.test(text)) {
    return 'people who want a simple beauty service booking with a clear result';
  }
  if (/shop|store|одяг|clothes|fashion/.test(text)) {
    return 'people choosing a product now and needing clear styles, prices and proof';
  }
  return `people who need ${product || label || 'this product'} and are likely to buy now`;
}

function buildOffer(product, label) {
  const text = `${product} ${label}`.toLowerCase();
  if (/20[-\s]?minute|workout|training|трен/.test(text)) {
    return 'a 20-minute starter workout people can save and try today';
  }
  return `main offer for ${product || label || 'the product'}`;
}

function buildCta(product, exampleCaption = '') {
  const text = `${product} ${exampleCaption}`.toLowerCase();
  if (/\bstart\b/.test(text) && /workout|training|20[-\s]?minute|трен/.test(text)) {
    return 'write START to get the first mini workout';
  }
  if (/direct|dm|message|напис/.test(text)) {
    return 'write in Direct to get details or book';
  }
  return 'write in Direct to book or ask for details';
}

export function buildBrandBrainDraft({
  label = '',
  title = '',
  description = '',
  handle = '',
  stats = {},
  exampleCaption = '',
} = {}) {
  const businessType = compactText(label || 'local business');
  const product = extractCleanBrandProduct({ title, description, handle, label: businessType }) || businessType;
  const proof = [
    stats.followers && `${stats.followers} followers`,
    stats.posts && `${stats.posts} posts`,
    compactText(title) && stripHandle(stripProfileStats(title), handle),
  ].filter(Boolean).join(' · ');

  return {
    businessType,
    product,
    audience: buildAudience(product, businessType),
    offer: buildOffer(product, businessType),
    cta: buildCta(product, exampleCaption),
    proof,
  };
}
