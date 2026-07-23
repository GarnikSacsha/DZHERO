export const REQUIRED_BRAND_FIELDS = Object.freeze([
  'businessType',
  'product',
  'audience',
  'offer',
  'cta',
  'toneOfVoice',
]);

const EDITABLE_TEXT_FIELDS = Object.freeze([
  'brandName',
  'businessType',
  'product',
  'audience',
  'location',
  'offer',
  'cta',
  'toneOfVoice',
  'proof',
]);

function compactText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function compactList(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item ?? '').split(','))
    .map(compactText)
    .filter(Boolean);
}

export function normalizeSourceLinks(value) {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set();

  return values
    .flatMap((item) => String(item ?? '').split(/[\s,]+/))
    .flatMap((item) => {
      try {
        const url = new URL(item);
        if (!['http:', 'https:'].includes(url.protocol) || seen.has(url.href)) return [];
        seen.add(url.href);
        return [url.href];
      } catch {
        return [];
      }
    });
}

export function getMissingRequiredBrandFields(brief) {
  const source = brief && typeof brief === 'object' ? brief : {};
  return REQUIRED_BRAND_FIELDS.filter((field) => !compactText(source[field]));
}

export function isBrandProfileComplete(brief) {
  return getMissingRequiredBrandFields(brief).length === 0;
}

export function normalizeEditableBrandBrief(brief) {
  const source = brief && typeof brief === 'object' ? brief : {};
  const normalized = { ...source };

  for (const field of EDITABLE_TEXT_FIELDS) {
    normalized[field] = compactText(source[field]);
  }

  normalized.sourceLinks = normalizeSourceLinks(source.sourceLinks);
  normalized.stopTopics = compactList(source.stopTopics).join(', ');
  return normalized;
}
