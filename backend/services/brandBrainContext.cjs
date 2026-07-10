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
  const normalized = {
    businessType: pickFirst(brief.businessType, brief.niche, brief.category),
    product: pickFirst(brief.product, brief.offer, brief.productOffer),
    audience: pickFirst(brief.audience, brief.targetAudience),
    location: pickFirst(brief.location, brief.market, brief.region),
    toneOfVoice: pickFirst(brief.toneOfVoice, brief.tone, brief.voice),
    goals: compactList(brief.goals),
    stopTopics: compactList(brief.stopTopics),
    contentFocus: pickFirst(brief.contentFocus, brief.focus),
    cta: pickFirst(brief.cta, brief.mainCta),
    proof: pickFirst(brief.proof, brief.socialProof, brief.resultProof),
    offer: pickFirst(brief.offer, brief.product),
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
    `Business type: ${context.businessType || 'not specified'}`,
    `Product / offer: ${context.product || context.offer || 'not specified'}`,
    `Audience: ${context.audience || 'not specified'}`,
    `Location / market: ${context.location || 'not specified'}`,
    `Tone of voice: ${context.toneOfVoice || 'not specified'}`,
    `Content focus: ${context.contentFocus || 'not specified'}`,
    `CTA: ${context.cta || 'not specified'}`,
    `Proof: ${context.proof || 'not specified'}`,
    `Goals: ${context.goals.length ? context.goals.join('; ') : 'not specified'}`,
    `Stop topics: ${context.stopTopics.length ? context.stopTopics.join('; ') : 'not specified'}`,
    'Use these facts before generic best practices. If a requested output conflicts with Brand Brain, adapt it to Brand Brain.',
  ].join('\n');
}

function buildBusinessBriefFromBrandBrain(input = {}) {
  const context = normalizeBrandBrain(input);
  return {
    niche: context.businessType || '',
    product: context.product || context.offer || '',
    location: context.location || '',
    toneOfVoice: context.toneOfVoice || '',
    audience: context.audience || '',
    goals: context.goals,
    stopTopics: context.stopTopics,
    contentFocus: context.contentFocus || '',
    cta: context.cta || '',
    proof: context.proof || '',
    brandBrainMode: context.mode,
    brandBrainReady: context.ready,
  };
}

module.exports = {
  compactText,
  compactList,
  normalizeBrandBrain,
  buildBrandBrainPromptBlock,
  buildBusinessBriefFromBrandBrain,
};
