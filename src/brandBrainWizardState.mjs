export const REQUIRED_BRAND_ANSWER_FIELDS = Object.freeze([
  'profileDescription',
  'audience',
  'niche',
  'market',
]);

export const BRAND_BRAIN_WIZARD_STEPS = Object.freeze([
  { id: 1, fields: ['profileDescription'] },
  { id: 2, fields: ['audience'] },
  { id: 3, fields: ['niche', 'market'] },
  { id: 4, fields: ['instagramUrl'] },
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

export function normalizeWizardAnswers(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    profileDescription: compactText(source.profileDescription),
    audience: compactText(source.audience),
    niche: compactText(source.niche),
    market: compactText(source.market),
    instagramUrl: normalizeInstagramUrl(source.instagramUrl),
  };
}

export function getMissingWizardAnswers(value = {}) {
  const answers = normalizeWizardAnswers(value);
  return REQUIRED_BRAND_ANSWER_FIELDS.filter((field) => !answers[field]);
}

export function validateWizardStep(step, value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const answers = normalizeWizardAnswers(source);
  if (step === 4) {
    const rawInstagram = compactText(source.instagramUrl);
    return rawInstagram && !answers.instagramUrl ? ['instagramUrl'] : [];
  }
  const definition = BRAND_BRAIN_WIZARD_STEPS.find((item) => item.id === step);
  return (definition?.fields || []).filter((field) => !answers[field]);
}

export function normalizeWizardDraft(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    currentStep: Math.min(4, Math.max(1, Number(source.currentStep) || 1)),
    answers: normalizeWizardAnswers(source.answers || source),
    updatedAt: compactText(source.updatedAt),
  };
}
