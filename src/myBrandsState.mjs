import {
  getMissingWizardAnswers,
  normalizeWizardAnswers,
} from './brandBrainWizardState.mjs';

export const REQUIRED_BRAND_FIELDS = Object.freeze([
  'profileDescription',
  'audience',
  'niche',
  'market',
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
  if (Number(source.schemaVersion) === 2) {
    return getMissingWizardAnswers(source.answers);
  }
  return isLegacyBrandProfileComplete(source) ? [] : REQUIRED_BRAND_FIELDS;
}

export function isBrandProfileComplete(brief) {
  return getMissingRequiredBrandFields(brief).length === 0;
}

export function normalizeEditableBrandBrief(brief) {
  const source = brief && typeof brief === 'object' ? brief : {};
  if (Number(source.schemaVersion) === 2) {
    return {
      ...source,
      schemaVersion: 2,
      answers: normalizeWizardAnswers(source.answers),
    };
  }
  return normalizeLegacyEditableBrandBrief(source);
}

function isLegacyBrandProfileComplete(brief = {}) {
  return ['businessType', 'product', 'audience', 'offer', 'cta', 'toneOfVoice']
    .every((field) => compactText(brief[field]));
}

function normalizeLegacyEditableBrandBrief(source = {}) {
  const normalized = { ...source };

  for (const field of EDITABLE_TEXT_FIELDS) {
    normalized[field] = compactText(source[field]);
  }

  normalized.sourceLinks = normalizeSourceLinks(source.sourceLinks);
  normalized.stopTopics = compactList(source.stopTopics).join(', ');
  return normalized;
}
