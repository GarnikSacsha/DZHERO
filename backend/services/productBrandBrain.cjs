'use strict';

const {
  isBrandContextComplete,
  normalizeBrandAnswers,
  projectBrandBrainCompatibility,
} = require('./brandBrainV2.cjs');

const PRODUCT_BRAND_BRAIN_VERSION = 1;
const REQUIRED_PRODUCT_BRAIN_FIELDS = Object.freeze([
  'profileDescription',
  'audience',
  'niche',
  'market',
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
  const brain = normalizeBrandAnswers(source.brain || source.answers || {});
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
    product: answers.profileDescription,
    audience: answers.audience,
    businessType: answers.niche,
    niche: answers.niche,
    location: answers.market,
    market: answers.market,
    sourceLinks: answers.instagramUrl ? [answers.instagramUrl] : [],
    brandName: brand.name,
    productBrandId: brand.id,
    updatedAt: brand.updatedAt,
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
  normalizeProductBrandId,
  normalizeProductBrand,
  getMissingProductBrainFields,
  isProductBrandComplete,
  persistProductBrand,
  projectProductBrandToBrief,
  resolveWorkspaceDiscoveryBrand,
};
