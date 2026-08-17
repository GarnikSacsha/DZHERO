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
  return [...leftTokens].filter((leftToken) => [...rightTokens].some((rightToken) => (
    leftToken === rightToken
    || (leftToken.length >= 5 && rightToken.length >= 5 && leftToken.slice(0, 5) === rightToken.slice(0, 5))
  ))).length;
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

function brandTerms(businessBrief = {}) {
  const brief = businessBrief?.brief || businessBrief?.brandBrain || businessBrief || {};
  return [
    brief.businessType,
    brief.niche,
    brief.product,
    brief.offer,
    brief.productOffer,
    brief.audience,
    brief.location,
    brief.market,
    brief.contentFocus,
  ].filter(Boolean).join(' ');
}

function assessRemixQuality(result, { globalInsight = {}, businessBrief = {} } = {}) {
  const reasons = [];
  const remixes = Array.isArray(result?.remixes) ? result.remixes : [];
  const sourcePhrases = significantSourcePhrases(globalInsight);
  const normalizedClaims = [];
  const normalizedHooks = [];
  const seenAngles = new Set();
  const brandContext = brandTerms(businessBrief);
  const requiresBrandBalance = signalTokens(brandContext).size > 0;

  if (remixes.length !== 3) reasons.push('Expected exactly 3 remix variants.');

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
      reasons.push(`Variant ${number} is missing title, hook, or CTA.`);
    }
    if (flow.length < 3) reasons.push(`Variant ${number} needs at least 3 scene beats.`);
    if (flow.some((step) => compactText(step?.actionDescription).length < 24)) {
      reasons.push(`Variant ${number} has generic visual directions.`);
    }
    if (/#[\p{L}\p{N}_]+/u.test(output)) reasons.push(`Variant ${number} copies source hashtags.`);
    if (sourcePhrases.some((phrase) => normalizedOutput.includes(phrase))) {
      reasons.push(`Variant ${number} copies source wording.`);
    }

    if (!SEMANTIC_ANGLES.includes(semanticAngle)) {
      reasons.push(`Variant ${number} has an unsupported semantic angle.`);
    } else if (seenAngles.has(semanticAngle)) {
      reasons.push(`Variant ${number} repeats semantic angle "${semanticAngle}".`);
    } else {
      seenAngles.add(semanticAngle);
    }

    if (!centralClaim) {
      reasons.push(`Variant ${number} is missing a central claim.`);
    } else {
      normalizedClaims.push(centralClaim);
      if (!hasVisibleAnchor(`${remix?.title || ''} ${remix?.hook || ''}`, centralClaim)) {
        reasons.push(`Variant ${number} title/hook does not express its central claim.`);
      }
    }

    if (!sourceConflict || !preservedMechanic) {
      reasons.push(`Variant ${number} is missing source conflict or preserved mechanic.`);
    } else {
      if (!hasVisibleAnchor(sourceVisibleOutput, sourceConflict)) {
        reasons.push(`Variant ${number} does not visibly preserve its source conflict.`);
      }
      if (!hasVisibleAnchor(sourceVisibleOutput, preservedMechanic)) {
        reasons.push(`Variant ${number} does not visibly preserve its source mechanic.`);
      }
    }

    if (!brandTranslation || !productionProof || !adaptationLogic) {
      reasons.push(`Variant ${number} is missing adaptation contract fields.`);
    }
    if (requiresBrandBalance) {
      if (!hasVisibleAnchor(output, brandContext)) {
        reasons.push(`Variant ${number} does not visibly apply Brand Brain facts.`);
      }
      if (!hasVisibleAnchor(brandTranslation, brandContext)) {
        reasons.push(`Variant ${number} brand translation is not grounded in Brand Brain facts.`);
      }
    }

    const normalizedHook = normalizeText(remix?.hook);
    if (normalizedHook) normalizedHooks.push(normalizedHook);
  });

  if (seenAngles.size !== SEMANTIC_ANGLES.length) {
    reasons.push('Remix variants must cover each required semantic angle exactly once.');
  }
  if (new Set(normalizedHooks).size !== normalizedHooks.length) {
    reasons.push('Remix variants need distinct hooks.');
  }
  if (new Set(normalizedClaims.map(normalizeText)).size !== normalizedClaims.length) {
    reasons.push('Remix variants repeat a normalized central claim.');
  }
  for (let left = 0; left < normalizedClaims.length; left += 1) {
    for (let right = left + 1; right < normalizedClaims.length; right += 1) {
      if (jaccardSimilarity(normalizedClaims[left], normalizedClaims[right]) > 0.72) {
        reasons.push('Remix variants use paraphrased versions of the same central claim.');
        left = normalizedClaims.length;
        break;
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

module.exports = {
  SEMANTIC_ANGLES,
  assessRemixQuality,
  normalizeText,
};
