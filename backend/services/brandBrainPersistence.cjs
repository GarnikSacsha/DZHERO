const BRAND_BRAIN_FIELDS = [
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
  'keywords',
  'goals',
  'stopTopics',
  'brandName',
  'sourceProfileUrl',
  'rawBrandInput',
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

module.exports = {
  BRAND_BRAIN_FIELDS,
  hasStoredBrandBrain,
  shouldChargeBrandBrainSave,
};
