function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function significantSourcePhrases(globalInsight = {}) {
  return [globalInsight.title, globalInsight.hook]
    .map(normalizeText)
    .filter((text) => text.length >= 12);
}

function assessRemixQuality(result, { globalInsight = {} } = {}) {
  const reasons = [];
  const remixes = Array.isArray(result?.remixes) ? result.remixes : [];
  const sourcePhrases = significantSourcePhrases(globalInsight);

  if (remixes.length !== 3) reasons.push('Expected exactly 3 remix variants.');

  remixes.forEach((remix, index) => {
    const number = index + 1;
    const flow = Array.isArray(remix?.visualFlow) ? remix.visualFlow : [];
    const output = collectRemixText(remix);
    const normalizedOutput = normalizeText(output);

    if (
      !String(remix?.title || '').trim()
      || !String(remix?.hook || '').trim()
      || !String(remix?.cta || '').trim()
    ) {
      reasons.push(`Variant ${number} is missing title, hook, or CTA.`);
    }
    if (flow.length < 3) reasons.push(`Variant ${number} needs at least 3 scene beats.`);
    if (flow.some((step) => String(step?.actionDescription || '').trim().length < 24)) {
      reasons.push(`Variant ${number} has generic visual directions.`);
    }
    if (/#[\p{L}\p{N}_]+/u.test(output)) reasons.push(`Variant ${number} copies source hashtags.`);
    if (sourcePhrases.some((phrase) => normalizedOutput.includes(phrase))) {
      reasons.push(`Variant ${number} copies source wording.`);
    }
  });

  const normalizedHooks = remixes.map((remix) => normalizeText(remix?.hook)).filter(Boolean);
  if (new Set(normalizedHooks).size !== normalizedHooks.length) {
    reasons.push('Remix variants need distinct hooks.');
  }

  return { ok: reasons.length === 0, reasons };
}

module.exports = { assessRemixQuality, normalizeText };
