const { createHash } = require('node:crypto');

const BRAND_BRAIN_SCHEMA_VERSION = 2;
const REQUIRED_BRAND_ANSWER_FIELDS = Object.freeze([
  'profileDescription',
  'audience',
  'niche',
  'market',
]);

function compactText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeInstagramUrl(value) {
  const candidate = compactText(value);
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeBrandAnswers(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    profileDescription: compactText(source.profileDescription),
    audience: compactText(source.audience),
    niche: compactText(source.niche),
    market: compactText(source.market),
    instagramUrl: normalizeInstagramUrl(source.instagramUrl),
  };
}

function getMissingBrandAnswers(value = {}) {
  const answers = normalizeBrandAnswers(value.answers || value);
  return REQUIRED_BRAND_ANSWER_FIELDS.filter((field) => !answers[field]);
}

function isBrandBrainV2Complete(value = {}) {
  return Number(value.schemaVersion) === BRAND_BRAIN_SCHEMA_VERSION
    && getMissingBrandAnswers(value.answers).length === 0;
}

function normalizeBrandBrainDraft(value = {}) {
  return {
    currentStep: Math.min(4, Math.max(1, Number(value.currentStep) || 1)),
    answers: normalizeBrandAnswers(value.answers),
    updatedAt: compactText(value.updatedAt),
  };
}

function isLegacyBrandComplete(brief = {}) {
  return ['businessType', 'product', 'audience', 'offer', 'cta', 'toneOfVoice']
    .every((field) => compactText(brief[field]));
}

function isBrandContextComplete(brief = {}) {
  if (Number(brief.schemaVersion) === BRAND_BRAIN_SCHEMA_VERSION) {
    return isBrandBrainV2Complete(brief);
  }
  return isLegacyBrandComplete(brief);
}

function projectBrandBrainCompatibility(brief = {}) {
  if (!isBrandBrainV2Complete(brief)) return { ...brief };
  const answers = normalizeBrandAnswers(brief.answers);
  const derived = brief.derivedBrief && typeof brief.derivedBrief === 'object'
    ? brief.derivedBrief
    : {};
  return {
    ...brief,
    product: answers.profileDescription,
    audience: answers.audience,
    businessType: answers.niche,
    niche: answers.niche,
    location: answers.market,
    market: answers.market,
    offer: compactText(derived.offer),
    cta: compactText(derived.cta),
    toneOfVoice: compactText(derived.toneOfVoice),
    sourceLinks: answers.instagramUrl ? [answers.instagramUrl] : [],
  };
}

function buildBrandAnswerFingerprint(value = {}) {
  const answers = normalizeBrandAnswers(value);
  return createHash('sha256').update(JSON.stringify(answers)).digest('hex');
}

module.exports = {
  BRAND_BRAIN_SCHEMA_VERSION,
  REQUIRED_BRAND_ANSWER_FIELDS,
  normalizeBrandAnswers,
  getMissingBrandAnswers,
  isBrandBrainV2Complete,
  normalizeBrandBrainDraft,
  projectBrandBrainCompatibility,
  isBrandContextComplete,
  buildBrandAnswerFingerprint,
};
