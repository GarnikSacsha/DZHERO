const SEMANTIC_ANGLES = Object.freeze([
  'visible_source_conflict',
  'mechanism_walkthrough',
  'viewer_decision',
]);

const NON_SIGNAL_TOKENS = new Set([
  'that', 'this', 'with', 'from', 'into', 'then', 'than', 'show', 'source', 'video',
  'original', 'visible', 'actual', 'process', 'brand', 'для', 'про', 'після', 'перед',
  'який', 'яка', 'яке', 'цей', 'ця', 'це', 'також', 'лише', 'через', 'показ',
]);
const GENERIC_BRAND_TOKENS = new Set([
  'brand', 'business', 'company', 'customer', 'customers', 'client', 'clients', 'content',
  'local', 'market', 'offer', 'product', 'service', 'small', 'team', 'teams', 'audience',
]);
const SEMANTIC_TOKEN_GROUPS = Object.freeze([
  ['routine', 'ordinary', 'standard', 'predictable'],
  ['order', 'checkout', 'purchase', 'transaction'],
  ['surprise', 'reward', 'bonus', 'gift', 'reveal', 'unwrap', 'unwrapping'],
  ['show', 'showing', 'demonstrate', 'reveal', 'open', 'opens', 'unwrapping'],
  ['explain', 'explains', 'understand', 'understandable', 'clear', 'walkthrough'],
  ['viewer', 'viewers', 'audience'],
  ['participation', 'participate', 'comments', 'comment', 'decision', 'choose', 'chooses'],
  ['choice', 'selection', 'decision', 'choose', 'chooses'],
  ['memorable', 'remember', 'remembering'],
  ['workflow', 'process', 'procedure'],
  ['audit', 'assessment', 'review', 'inspection'],
]);
const SEMANTIC_TOKEN_INDEX = new Map(
  SEMANTIC_TOKEN_GROUPS.flatMap((group, index) => group.map((token) => [token, index])),
);

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function collectRemixText(remix = {}) {
  return [
    remix.title,
    remix.hook,
    remix.cta,
    remix.brandTranslation,
    remix.productionProof,
    remix.adaptationLogic,
    ...(remix.visualFlow || []).flatMap((step) => [
      step?.actionDescription,
      step?.onScreenText,
      step?.audioVoiceover,
    ]),
  ].filter(Boolean).join(' ');
}

function collectSourceVisibleText(remix = {}) {
  return [
    remix.title,
    remix.hook,
    remix.adaptationLogic,
    ...(remix.visualFlow || []).flatMap((step) => [
      step?.actionDescription,
      step?.onScreenText,
      step?.audioVoiceover,
    ]),
  ].filter(Boolean).join(' ');
}

function significantSourcePhrases(globalInsight = {}) {
  return [globalInsight.title, globalInsight.hook]
    .map(normalizeText)
    .filter((text) => text.length >= 12);
}

function signalTokens(value) {
  return new Set(
    normalizeText(value)
      .split(' ')
      .filter((token) => token.length >= 4 && !NON_SIGNAL_TOKENS.has(token)),
  );
}

function overlapCount(left, right) {
  const leftTokens = signalTokens(left);
  const rightTokens = signalTokens(right);
  return [...leftTokens].filter((leftToken) => [...rightTokens].some((rightToken) => {
    if (leftToken === rightToken) return true;
    if (leftToken.length >= 5 && rightToken.length >= 5 && leftToken.slice(0, 5) === rightToken.slice(0, 5)) return true;
    const leftGroup = SEMANTIC_TOKEN_INDEX.get(leftToken);
    return leftGroup !== undefined && leftGroup === SEMANTIC_TOKEN_INDEX.get(rightToken);
  })).length;
}

function hasVisibleAnchor(visibleText, sourceField) {
  const fieldTokens = signalTokens(sourceField);
  if (!fieldTokens.size) return false;
  return overlapCount(visibleText, sourceField) >= Math.min(2, fieldTokens.size);
}

function jaccardSimilarity(left, right) {
  const leftTokens = signalTokens(left);
  const rightTokens = signalTokens(right);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (!union.size) return 1;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / union.size;
}

function buildBrandGroundingFacts(businessBrief = {}) {
  const brief = businessBrief?.brief || businessBrief?.brandBrain || businessBrief || {};
  const candidates = [
    ['brandName', brief.brandName || brief.name],
    ['niche', brief.niche || brief.businessType],
    ['product', brief.product || brief.productOffer],
    ['offer', brief.offer],
    ['audience', brief.audience],
    ['market', brief.market || brief.location],
    ['toneOfVoice', brief.toneOfVoice || brief.tone],
    ['contentFocus', brief.contentFocus],
    ['cta', brief.cta],
    ['proof', brief.proof],
    ...['goals', 'contentPillars', 'contentRubrics', 'keywords', 'constraints', 'stopTopics', 'differentiators']
      .flatMap((field) => (Array.isArray(brief[field]) ? brief[field].map((value) => [field, value]) : [])),
  ];
  const seen = new Set();
  return candidates.reduce((facts, [field, value]) => {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) return facts;
    const tokens = [...signalTokens(normalized)];
    if (tokens.length < 2 && !tokens.some((token) => token.length >= 5 && !GENERIC_BRAND_TOKENS.has(token))) return facts;
    seen.add(normalized);
    facts.push({ field, value: compactText(value) });
    return facts;
  }, []);
}

function matchedBrandFactFields(text, facts = []) {
  return facts.filter((fact) => {
    const factTokens = [...signalTokens(fact.value)];
    const overlap = overlapCount(text, fact.value);
    if (overlap >= Math.min(2, factTokens.length)) return true;
    return factTokens.some((token) => (
      token.length >= 6
      && !GENERIC_BRAND_TOKENS.has(token)
      && overlapCount(text, token) >= 1
    ));
  }).map((fact) => fact.field);
}

function assessRemixQuality(result, { globalInsight = {}, businessBrief = {} } = {}) {
  const reasons = [];
  const remixes = Array.isArray(result?.remixes) ? result.remixes : [];
  const sourcePhrases = significantSourcePhrases(globalInsight);
  const normalizedClaims = [];
  const normalizedHooks = [];
  const seenAngles = new Set();
  const violations = [];
  const brandFacts = buildBrandGroundingFacts(businessBrief);
  const requiresBrandBalance = brandFacts.length > 0;
  const addViolation = (ruleId, message, variantIndex = null, fields = []) => {
    reasons.push(message);
    violations.push({ ruleId, variantIndex, fields });
  };

  if (remixes.length !== 3) addViolation('variant_count', 'Expected exactly 3 remix variants.', null, ['remixes']);

  remixes.forEach((remix, index) => {
    const number = index + 1;
    const flow = Array.isArray(remix?.visualFlow) ? remix.visualFlow : [];
    const output = collectRemixText(remix);
    const sourceVisibleOutput = collectSourceVisibleText(remix);
    const normalizedOutput = normalizeText(output);
    const semanticAngle = compactText(remix?.semanticAngle);
    const centralClaim = compactText(remix?.centralClaim);
    const sourceConflict = compactText(remix?.sourceConflict);
    const preservedMechanic = compactText(remix?.preservedMechanic);
    const brandTranslation = compactText(remix?.brandTranslation);
    const productionProof = compactText(remix?.productionProof);
    const adaptationLogic = compactText(remix?.adaptationLogic);

    if (!compactText(remix?.title) || !compactText(remix?.hook) || !compactText(remix?.cta)) {
      addViolation('required_visible_fields', `Variant ${number} is missing title, hook, or CTA.`, number, ['title', 'hook', 'cta']);
    }
    if (flow.length < 3) addViolation('scene_count', `Variant ${number} needs at least 3 scene beats.`, number, ['visualFlow']);
    if (flow.some((step) => compactText(step?.actionDescription).length < 24)) {
      addViolation('visual_specificity', `Variant ${number} has generic visual directions.`, number, ['visualFlow.actionDescription']);
    }
    if (/#[\p{L}\p{N}_]+/u.test(output)) addViolation('source_hashtag_copy', `Variant ${number} copies source hashtags.`, number, ['title', 'hook', 'cta', 'visualFlow']);
    if (sourcePhrases.some((phrase) => normalizedOutput.includes(phrase))) {
      addViolation('source_wording_copy', `Variant ${number} copies source wording.`, number, ['title', 'hook', 'visualFlow']);
    }

    if (!SEMANTIC_ANGLES.includes(semanticAngle)) {
      addViolation('semantic_angle_supported', `Variant ${number} has an unsupported semantic angle.`, number, ['semanticAngle']);
    } else if (seenAngles.has(semanticAngle)) {
      addViolation('semantic_angle_unique', `Variant ${number} repeats semantic angle "${semanticAngle}".`, number, ['semanticAngle']);
    } else {
      seenAngles.add(semanticAngle);
    }

    if (!centralClaim) {
      addViolation('central_claim_present', `Variant ${number} is missing a central claim.`, number, ['centralClaim']);
    } else {
      normalizedClaims.push(centralClaim);
      if (!hasVisibleAnchor(`${remix?.title || ''} ${remix?.hook || ''}`, centralClaim)) {
        addViolation('central_claim_visible', `Variant ${number} title/hook does not express its central claim.`, number, ['title', 'hook', 'centralClaim']);
      }
    }

    if (!sourceConflict || !preservedMechanic) {
      addViolation('source_contract_present', `Variant ${number} is missing source conflict or preserved mechanic.`, number, ['sourceConflict', 'preservedMechanic']);
    } else {
      if (!hasVisibleAnchor(sourceVisibleOutput, sourceConflict)) {
        addViolation('source_conflict_visible', `Variant ${number} does not visibly preserve its source conflict.`, number, ['title', 'hook', 'adaptationLogic', 'visualFlow', 'sourceConflict']);
      }
      if (!hasVisibleAnchor(sourceVisibleOutput, preservedMechanic)) {
        addViolation('source_mechanic_visible', `Variant ${number} does not visibly preserve its source mechanic.`, number, ['title', 'hook', 'adaptationLogic', 'visualFlow', 'preservedMechanic']);
      }
    }

    if (!brandTranslation || !productionProof || !adaptationLogic) {
      addViolation('adaptation_contract_present', `Variant ${number} is missing adaptation contract fields.`, number, ['brandTranslation', 'productionProof', 'adaptationLogic']);
    }
    if (requiresBrandBalance) {
      const outputFactFields = matchedBrandFactFields(output, brandFacts);
      const translationFactFields = matchedBrandFactFields(brandTranslation, brandFacts);
      if (!outputFactFields.length) {
        addViolation('brand_fact_visible', `Variant ${number} does not visibly apply Brand Brain facts.`, number, ['title', 'hook', 'brandTranslation', 'productionProof', 'adaptationLogic', 'visualFlow']);
      }
      if (!translationFactFields.length || !translationFactFields.some((field) => outputFactFields.includes(field))) {
        addViolation('brand_translation_grounded', `Variant ${number} brand translation is not grounded in Brand Brain facts.`, number, ['brandTranslation']);
      }
    }

    const normalizedHook = normalizeText(remix?.hook);
    if (normalizedHook) normalizedHooks.push(normalizedHook);
  });

  if (seenAngles.size !== SEMANTIC_ANGLES.length) {
    addViolation('semantic_angle_coverage', 'Remix variants must cover each required semantic angle exactly once.', null, ['semanticAngle']);
  }
  if (new Set(normalizedHooks).size !== normalizedHooks.length) {
    addViolation('hook_distinct', 'Remix variants need distinct hooks.', null, ['hook']);
  }
  if (new Set(normalizedClaims.map(normalizeText)).size !== normalizedClaims.length) {
    addViolation('central_claim_distinct', 'Remix variants repeat a normalized central claim.', null, ['centralClaim']);
  }
  for (let left = 0; left < normalizedClaims.length; left += 1) {
    for (let right = left + 1; right < normalizedClaims.length; right += 1) {
      if (jaccardSimilarity(normalizedClaims[left], normalizedClaims[right]) > 0.72) {
        addViolation('central_claim_diversity', 'Remix variants use paraphrased versions of the same central claim.', null, ['centralClaim']);
        left = normalizedClaims.length;
        break;
      }
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    violations,
    brandFactFieldNames: [...new Set(brandFacts.map((fact) => fact.field))],
  };
}

module.exports = {
  SEMANTIC_ANGLES,
  buildBrandGroundingFacts,
  assessRemixQuality,
  normalizeText,
};
