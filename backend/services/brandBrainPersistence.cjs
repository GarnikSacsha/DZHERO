const {
  REQUIRED_BRAND_ANSWER_FIELDS,
  getMissingBrandAnswers,
  isBrandBrainV2Complete,
} = require('./brandBrainV2.cjs');

const BRAND_BRAIN_FIELDS = [
  'schemaVersion',
  'answers',
  'derivedBrief',
  'recommendation',
  'businessType',
  'niche',
  'product',
  'audience',
  'location',
  'toneOfVoice',
  'offer',
  'cta',
  'proof',
  'contentFocus',
  'contentPillars',
  'contentRubrics',
  'keywords',
  'goals',
  'stopTopics',
  'brandName',
  'sourceProfileUrl',
  'rawBrandInput',
];

const LEGACY_REQUIRED_BRAND_FIELDS = [
  'businessType',
  'product',
  'audience',
  'offer',
  'cta',
  'toneOfVoice',
];

function hasValue(value) {
  if (Array.isArray(value)) return value.some((item) => hasValue(item));
  if (value && typeof value === 'object') return Object.values(value).some((item) => hasValue(item));
  return String(value || '').trim().length > 0;
}

function hasStoredBrandBrain(brief = {}) {
  if (!brief || typeof brief !== 'object') return false;
  return BRAND_BRAIN_FIELDS.some((field) => hasValue(brief[field]));
}

function shouldChargeBrandBrainSave({ existingBrief = {}, nextBrief = {} } = {}) {
  return !hasStoredBrandBrain(existingBrief) && hasStoredBrandBrain(nextBrief);
}

function getMissingRequiredBrandFields(brief = {}) {
  const source = brief && typeof brief === 'object' ? brief : {};
  if (Number(source.schemaVersion) === 2) {
    return getMissingBrandAnswers(source.answers);
  }
  return LEGACY_REQUIRED_BRAND_FIELDS.filter((field) => !String(source[field] || '').trim());
}

function normalizeBrandBrainSourceLinks(value) {
  const candidates = (Array.isArray(value) ? value : [value])
    .flatMap((item) => String(item || '').split(/[\s,]+/));
  const seen = new Set();
  return candidates.reduce((links, candidate) => {
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol)) return links;
      const normalized = url.toString();
      if (seen.has(normalized)) return links;
      seen.add(normalized);
      links.push(normalized);
    } catch {}
    return links;
  }, []);
}

module.exports = {
  BRAND_BRAIN_FIELDS,
  REQUIRED_BRAND_FIELDS: LEGACY_REQUIRED_BRAND_FIELDS,
  REQUIRED_BRAND_ANSWER_FIELDS,
  isBrandBrainV2Complete,
  hasStoredBrandBrain,
  shouldChargeBrandBrainSave,
  getMissingRequiredBrandFields,
  normalizeBrandBrainSourceLinks,
};
