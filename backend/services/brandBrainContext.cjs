function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactList(value) {
  if (Array.isArray(value)) {
    return value.map(compactText).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map(compactText)
      .filter(Boolean);
  }
  return [];
}

function pickFirst(...values) {
  return values.map(compactText).find(Boolean) || '';
}

function normalizeBrandBrain(input = {}) {
  const brief = input.brief || input.brandBrain || input || {};
  const contentPillars = compactList(brief.contentPillars || brief.contentRubrics || brief.pillars);
  const contentRubrics = compactList(brief.contentRubrics || brief.contentPillars || brief.pillars);
  const normalized = {
    brandName: pickFirst(brief.brandName, brief.name),
    businessType: pickFirst(brief.businessType, brief.niche, brief.category),
    product: pickFirst(brief.product, brief.offer, brief.productOffer),
    audience: pickFirst(brief.audience, brief.targetAudience),
    location: pickFirst(brief.location, brief.market, brief.region),
    toneOfVoice: pickFirst(brief.toneOfVoice, brief.tone, brief.voice),
    goals: compactList(brief.goals),
    stopTopics: compactList(brief.stopTopics),
    contentPillars,
    contentRubrics,
    keywords: compactList(brief.keywords),
    contentFocus: pickFirst(brief.contentFocus, brief.focus),
    cta: pickFirst(brief.cta, brief.mainCta),
    proof: pickFirst(brief.proof, brief.socialProof, brief.resultProof),
    offer: pickFirst(brief.offer, brief.productOffer, brief.product),
    updatedAt: brief.updatedAt || null,
  };

  const readinessFields = [
    normalized.businessType,
    normalized.product,
    normalized.audience,
    normalized.location,
    normalized.toneOfVoice,
    normalized.contentFocus,
    normalized.cta,
    normalized.proof,
    ...normalized.goals,
  ].filter(Boolean);

  const missing = [];
  if (!normalized.businessType) missing.push('businessType');
  if (!normalized.product && !normalized.offer) missing.push('product');
  if (!normalized.audience) missing.push('audience');
  if (!normalized.toneOfVoice) missing.push('toneOfVoice');

  const ready = Boolean(
    (normalized.businessType || normalized.product || normalized.offer)
    && (normalized.audience || normalized.contentFocus || normalized.goals.length)
  );

  return {
    mode: ready ? 'brand' : 'consultant',
    ready,
    missing,
    confidence: Math.min(100, Math.round((readinessFields.length / 7) * 100)),
    ...normalized,
  };
}

function buildBrandBrainPromptBlock(input = {}) {
  const context = normalizeBrandBrain(input);
  if (!context.ready) {
    return [
      '=== BRAND BRAIN MODE ===',
      'Mode: consultant',
      'The workspace Brand Brain is empty or too thin.',
      'Do not pretend that default demo values are real user facts.',
      'You may consult generally, ask for missing business details, or create a safe draft with explicit assumptions.',
      `Missing: ${context.missing.join(', ') || 'core brand facts'}`,
    ].join('\n');
  }

  return [
    '=== BRAND BRAIN MODE ===',
    'Mode: brand',
    'Treat the following Brand Brain as the source of truth for this workspace.',
    `Brand name: ${context.brandName || 'not specified'}`,
    `Business type: ${context.businessType || 'not specified'}`,
    `Product: ${context.product || 'not specified'}`,
    `Offer: ${context.offer || 'not specified'}`,
    `Audience: ${context.audience || 'not specified'}`,
    `Location / market: ${context.location || 'not specified'}`,
    `Tone of voice: ${context.toneOfVoice || 'not specified'}`,
    `Content focus: ${context.contentFocus || 'not specified'}`,
    `CTA: ${context.cta || 'not specified'}`,
    `Proof: ${context.proof || 'not specified'}`,
    `Goals: ${context.goals.length ? context.goals.join('; ') : 'not specified'}`,
    `Content pillars: ${context.contentPillars.length ? context.contentPillars.join('; ') : 'not specified'}`,
    `Content rubrics: ${context.contentRubrics.length ? context.contentRubrics.join('; ') : 'not specified'}`,
    `Discovery keywords: ${context.keywords.length ? context.keywords.join('; ') : 'not specified'}`,
    `Stop topics: ${context.stopTopics.length ? context.stopTopics.join('; ') : 'not specified'}`,
    'Use these facts before generic best practices. If a requested output conflicts with Brand Brain, adapt it to Brand Brain.',
  ].join('\n');
}

function buildBusinessBriefFromBrandBrain(input = {}) {
  const context = normalizeBrandBrain(input);
  return {
    brandName: context.brandName || '',
    niche: context.businessType || '',
    product: context.product || context.offer || '',
    offer: context.offer || '',
    location: context.location || '',
    toneOfVoice: context.toneOfVoice || '',
    audience: context.audience || '',
    goals: context.goals,
    stopTopics: context.stopTopics,
    contentPillars: context.contentPillars,
    contentRubrics: context.contentRubrics,
    keywords: context.keywords,
    contentFocus: context.contentFocus || '',
    cta: context.cta || '',
    proof: context.proof || '',
    brandBrainMode: context.mode,
    brandBrainReady: context.ready,
  };
}

function mergeBusinessBriefWithBrandBrain(storedInput = {}, overrideInput = {}) {
  const stored = normalizeBrandBrain(storedInput);
  const override = normalizeBrandBrain(overrideInput);
  const useList = (preferred, fallback) => (preferred.length ? preferred : fallback);
  return buildBusinessBriefFromBrandBrain({
    brandName: override.brandName || stored.brandName,
    businessType: override.businessType || stored.businessType,
    product: override.product || stored.product,
    offer: override.offer || stored.offer,
    audience: override.audience || stored.audience,
    location: override.location || stored.location,
    toneOfVoice: override.toneOfVoice || stored.toneOfVoice,
    goals: useList(override.goals, stored.goals),
    stopTopics: useList(override.stopTopics, stored.stopTopics),
    contentPillars: useList(override.contentPillars, stored.contentPillars),
    contentRubrics: useList(override.contentRubrics, stored.contentRubrics),
    keywords: useList(override.keywords, stored.keywords),
    contentFocus: override.contentFocus || stored.contentFocus,
    cta: override.cta || stored.cta,
    proof: override.proof || stored.proof,
  });
}

module.exports = {
  compactText,
  compactList,
  normalizeBrandBrain,
  buildBrandBrainPromptBlock,
  buildBusinessBriefFromBrandBrain,
  mergeBusinessBriefWithBrandBrain,
};
