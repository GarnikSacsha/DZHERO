'use strict';

const { createHash } = require('node:crypto');

const {
  isBrandContextComplete,
  normalizeBrandAnswers,
  projectBrandBrainCompatibility,
} = require('./brandBrainV2.cjs');

const PRODUCT_BRAND_BRAIN_VERSION = 1;
const REQUIRED_PRODUCT_BRAIN_FIELDS = Object.freeze([
  'profileDescription',
  'audience',
]);
const REQUIRED_GENERATION_BRAND_FIELDS = Object.freeze([
  'product',
  'audience',
]);

function compactText(value, maxLength = 800) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function normalizeProductBrandId(value) {
  return compactText(value, 100).replace(/[^a-zA-Z0-9_-]/g, '');
}

function normalizeProductBrand(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const rawBrain = source.brain || source.answers || {};
  const brain = normalizeBrandAnswers(rawBrain);
  for (const field of ['product', 'offer', 'toneOfVoice', 'contentFocus', 'cta', 'proof']) {
    const normalized = compactText(rawBrain[field], 800);
    if (normalized) brain[field] = normalized;
  }
  for (const field of ['goals', 'stopTopics', 'contentPillars', 'contentRubrics', 'keywords']) {
    const normalized = Array.isArray(rawBrain[field])
      ? rawBrain[field].map((item) => compactText(item, 240)).filter(Boolean)
      : [];
    if (normalized.length) brain[field] = normalized;
  }
  const id = normalizeProductBrandId(source.id || source.activeBrandId);
  const name = compactText(source.name || source.brandName, 80);
  if (!id || !name) return null;
  return {
    version: PRODUCT_BRAND_BRAIN_VERSION,
    id,
    name,
    brain,
    createdAt: compactText(source.createdAt, 40),
    updatedAt: compactText(source.updatedAt, 40),
  };
}

function getMissingProductBrainFields(value = {}) {
  const brand = normalizeProductBrand(value);
  if (!brand) return [...REQUIRED_PRODUCT_BRAIN_FIELDS];
  return REQUIRED_PRODUCT_BRAIN_FIELDS.filter((field) => !brand.brain[field]);
}

function isProductBrandComplete(value = {}) {
  return Boolean(normalizeProductBrand(value)) && getMissingProductBrainFields(value).length === 0;
}

function persistProductBrand(workspace = {}, value = {}, now = new Date()) {
  const brand = normalizeProductBrand(value);
  if (!brand) return null;
  const previous = normalizeProductBrand(workspace.productBrandBrain);
  const timestamp = new Date(now).toISOString();
  workspace.productBrandBrain = {
    ...brand,
    createdAt: brand.createdAt || (previous?.id === brand.id ? previous.createdAt : '') || timestamp,
    updatedAt: timestamp,
  };
  return workspace.productBrandBrain;
}

function projectProductBrandToBrief(value = {}) {
  const brand = normalizeProductBrand(value);
  if (!brand) return {};
  const answers = brand.brain;
  return {
    schemaVersion: 2,
    answers,
    product: answers.product || answers.offer || answers.profileDescription,
    offer: answers.offer || answers.product || answers.profileDescription,
    audience: answers.audience,
    businessType: answers.niche,
    niche: answers.niche,
    location: answers.market,
    market: answers.market,
    toneOfVoice: answers.toneOfVoice || '',
    goals: answers.goals || [],
    stopTopics: answers.stopTopics || [],
    contentPillars: answers.contentPillars || [],
    contentRubrics: answers.contentRubrics || [],
    keywords: answers.keywords || [],
    contentFocus: answers.contentFocus || '',
    cta: answers.cta || '',
    proof: answers.proof || '',
    sourceLinks: answers.instagramUrl ? [answers.instagramUrl] : [],
    brandName: brand.name,
    productBrandId: brand.id,
    updatedAt: brand.updatedAt,
  };
}

function projectProductBrandToGenerationBrand(value = {}) {
  return projectProductBrandToBrief(value);
}

function getGenerationBrandMissingFields(value = {}) {
  const brand = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return [
    !(brand.product || brand.offer || brand.profileDescription) && 'product',
    !brand.audience && 'audience',
  ].filter(Boolean);
}

function getPopulatedGenerationBrandFieldNames(value = {}) {
  const brand = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return [
    ['brandName', brand.brandName],
    ['product', brand.product || brand.offer || brand.profileDescription],
    ['audience', brand.audience],
    ['niche', brand.niche || brand.businessType],
    ['market', brand.market || brand.location],
    ['toneOfVoice', brand.toneOfVoice],
    ['contentFocus', brand.contentFocus],
    ['cta', brand.cta],
    ['proof', brand.proof],
    ['goals', brand.goals],
    ['constraints', brand.constraints || brand.stopTopics],
  ].filter(([, fieldValue]) => (
    Array.isArray(fieldValue) ? fieldValue.length > 0 : Boolean(compactText(fieldValue))
  )).map(([fieldName]) => fieldName);
}

const GENERATION_OVERRIDE_TEXT_FIELDS = Object.freeze([
  'brandName',
  'businessType',
  'niche',
  'product',
  'offer',
  'audience',
  'location',
  'market',
  'toneOfVoice',
  'contentFocus',
  'cta',
  'proof',
]);
const GENERATION_OVERRIDE_LIST_FIELDS = Object.freeze([
  'goals',
  'stopTopics',
  'contentPillars',
  'contentRubrics',
  'keywords',
  'sourceLinks',
]);

function cloneJsonValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableSortJson(value) {
  if (Array.isArray(value)) return value.map(stableSortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableSortJson(value[key]);
    return result;
  }, {});
}

function hashGenerationBrand(value = {}) {
  const canonical = cloneJsonValue(value) || {};
  delete canonical.updatedAt;
  delete canonical.createdAt;
  return createHash('sha256')
    .update(JSON.stringify(stableSortJson(canonical)))
    .digest('hex');
}

function applyGenerationBrandOverrides(base = {}, overrides = {}) {
  const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides)
    ? overrides
    : {};
  const result = cloneJsonValue(base) || {};
  for (const field of GENERATION_OVERRIDE_TEXT_FIELDS) {
    const normalized = compactText(source[field], 800);
    if (normalized) result[field] = normalized;
  }
  for (const field of GENERATION_OVERRIDE_LIST_FIELDS) {
    const normalized = Array.isArray(source[field])
      ? source[field].map((item) => compactText(item, 240)).filter(Boolean)
      : [];
    if (normalized.length) result[field] = normalized;
  }
  const overrideNiche = compactText(source.niche || source.businessType, 800);
  const overrideMarket = compactText(source.location || source.market, 800);
  const overrideProduct = compactText(source.product || source.offer, 800);
  if (overrideNiche) {
    result.niche = overrideNiche;
    result.businessType = overrideNiche;
  }
  if (overrideMarket) {
    result.location = overrideMarket;
    result.market = overrideMarket;
  }
  if (overrideProduct) {
    result.product = overrideProduct;
    result.offer = overrideProduct;
  }
  if (result.niche && !result.businessType) result.businessType = result.niche;
  if (result.businessType && !result.niche) result.niche = result.businessType;
  if (result.location && !result.market) result.market = result.location;
  if (result.market && !result.location) result.location = result.market;
  return result;
}

function resolveWorkspaceGenerationBrand(workspace = {}, overrides = {}) {
  const productBrand = normalizeProductBrand(workspace.productBrandBrain);
  if (productBrand) {
    const missingFields = getMissingProductBrainFields(productBrand);
    const baseBrand = projectProductBrandToGenerationBrand(productBrand);
    const generationBrand = applyGenerationBrandOverrides(baseBrand, overrides);
    const generationMissingFields = getGenerationBrandMissingFields(generationBrand);
    const sourceCompleteness = missingFields.length ? 'incomplete' : 'complete';
    const generationCompleteness = generationMissingFields.length ? 'incomplete' : 'complete';
    return {
      generationBrand,
      generationBrandKey: hashGenerationBrand(generationBrand),
      generationBrandSnapshot: cloneJsonValue(generationBrand),
      brandSnapshot: cloneJsonValue(productBrand),
      brandSource: 'product_brand_brain',
      missingFields,
      sourceCompleteness,
      generationCompleteness,
      generationMissingFields,
      completeness: generationCompleteness,
      complete: sourceCompleteness === 'complete' && generationCompleteness === 'complete',
    };
  }

  const storedBrief = workspace.brief && typeof workspace.brief === 'object' && !Array.isArray(workspace.brief)
    ? projectBrandBrainCompatibility(workspace.brief)
    : {};
  const generationBrand = applyGenerationBrandOverrides(storedBrief, overrides);
  const missingFields = getGenerationBrandMissingFields(generationBrand);
  const sourceComplete = isBrandContextComplete(workspace.brief || {});
  const sourceCompleteness = sourceComplete ? 'complete' : 'incomplete';
  const generationCompleteness = missingFields.length ? 'incomplete' : 'complete';
  return {
    generationBrand,
    generationBrandKey: hashGenerationBrand(generationBrand),
    generationBrandSnapshot: cloneJsonValue(generationBrand),
    brandSnapshot: cloneJsonValue(storedBrief),
    brandSource: 'legacy_brief',
    missingFields,
    sourceCompleteness,
    generationCompleteness,
    generationMissingFields: [...missingFields],
    completeness: sourceCompleteness,
    complete: sourceComplete && generationCompleteness === 'complete',
  };
}

function resolveWorkspaceDiscoveryBrand(workspace = {}, options = {}) {
  const productBrand = normalizeProductBrand(workspace.productBrandBrain);
  if (productBrand) {
    const missingFields = getMissingProductBrainFields(productBrand);
    const requestedBrandId = normalizeProductBrandId(options.activeBrandId);
    const activeBrandMismatch = Boolean(requestedBrandId && requestedBrandId !== productBrand.id);
    return {
      source: 'product_redesign',
      ref: {
        workspaceId: compactText(workspace.id, 120),
        activeBrandId: productBrand.id,
        updatedAt: productBrand.updatedAt || null,
      },
      productBrand,
      brief: projectProductBrandToBrief(productBrand),
      complete: missingFields.length === 0 && !activeBrandMismatch,
      missingFields,
      activeBrandMismatch,
    };
  }

  if (options.requireProductBrandBrain) {
    return {
      source: 'product_redesign',
      ref: {
        workspaceId: compactText(workspace.id, 120),
        activeBrandId: normalizeProductBrandId(options.activeBrandId) || null,
        updatedAt: null,
      },
      productBrand: null,
      brief: {},
      complete: false,
      missingFields: [...REQUIRED_PRODUCT_BRAIN_FIELDS],
      activeBrandMismatch: false,
    };
  }

  const storedBrief = workspace.brief && typeof workspace.brief === 'object'
    ? workspace.brief
    : {};
  return {
    source: 'workspace_brief',
    ref: {
      workspaceId: compactText(workspace.id, 120),
      activeBrandId: null,
      updatedAt: compactText(storedBrief.updatedAt, 40) || null,
    },
    productBrand: null,
    brief: projectBrandBrainCompatibility(storedBrief),
    complete: isBrandContextComplete(storedBrief),
    missingFields: [],
    activeBrandMismatch: false,
  };
}

module.exports = {
  PRODUCT_BRAND_BRAIN_VERSION,
  REQUIRED_PRODUCT_BRAIN_FIELDS,
  REQUIRED_GENERATION_BRAND_FIELDS,
  normalizeProductBrandId,
  normalizeProductBrand,
  getMissingProductBrainFields,
  isProductBrandComplete,
  persistProductBrand,
  projectProductBrandToBrief,
  projectProductBrandToGenerationBrand,
  getGenerationBrandMissingFields,
  getPopulatedGenerationBrandFieldNames,
  resolveWorkspaceDiscoveryBrand,
  GENERATION_OVERRIDE_TEXT_FIELDS,
  GENERATION_OVERRIDE_LIST_FIELDS,
  applyGenerationBrandOverrides,
  hashGenerationBrand,
  resolveWorkspaceGenerationBrand,
};
