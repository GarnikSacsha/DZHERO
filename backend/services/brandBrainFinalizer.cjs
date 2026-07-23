const {
  BRAND_BRAIN_SCHEMA_VERSION,
  normalizeBrandAnswers,
  getMissingBrandAnswers,
  buildBrandAnswerFingerprint,
  projectBrandBrainCompatibility,
} = require('./brandBrainV2.cjs');
const { buildDerivedBrandBrainV2 } = require('./brandBrainExtractor.cjs');
const { selectBestSignalForBrand } = require('./brandSignalRecommender.cjs');

async function finalizeBrandBrainV2({
  answers: inputAnswers,
  signals = [],
  instagramMetadata = {},
  deriveClient = null,
  rerankClient = null,
  now = () => new Date(),
} = {}) {
  const answers = normalizeBrandAnswers(inputAnswers);
  const missingFields = getMissingBrandAnswers(answers);
  if (missingFields.length) return { ok: false, missingFields };

  const derivedBrief = await buildDerivedBrandBrainV2({
    answers,
    instagramMetadata,
    geminiClient: deriveClient,
  });
  const recommendation = await selectBestSignalForBrand({
    answers,
    derivedBrief,
    signals,
    geminiClient: rerankClient,
    now,
  });
  const brief = {
    schemaVersion: BRAND_BRAIN_SCHEMA_VERSION,
    answers,
    sourceLinks: answers.instagramUrl ? [answers.instagramUrl] : [],
    derivedBrief,
    recommendation: recommendation
      ? {
          ...recommendation,
          briefFingerprint: buildBrandAnswerFingerprint(answers),
        }
      : null,
    updatedAt: now().toISOString(),
  };
  return {
    ok: true,
    brief,
    compatibilityBrief: projectBrandBrainCompatibility(brief),
    recommendation: brief.recommendation,
  };
}

module.exports = { finalizeBrandBrainV2 };
