import { normalizeWizardAnswers } from './brandBrainWizardState.mjs';

export const PRODUCT_BRANDS_STORAGE_KEY = 'dzhero-preview-product-brands-v1';
export const PRODUCT_ACTIVE_BRAND_STORAGE_KEY = 'dzhero-preview-product-active-brand-v1';
export const PRODUCT_CREDITS_STORAGE_KEY = 'dzhero-preview-product-credits-v1';
export const PRODUCT_UNASSIGNED_BRAND_ID = 'workspace-unassigned';

export const CREDIT_OPERATIONS = Object.freeze([
  Object.freeze({ id: 'sourceIngestion', credits: 1 }),
  Object.freeze({ id: 'transcriptCreation', credits: 2 }),
  Object.freeze({ id: 'signalAnalysis', credits: 3 }),
  Object.freeze({ id: 'adaptation', credits: 4 }),
  Object.freeze({ id: 'scriptGeneration', credits: 5 }),
]);

function compactText(value, maxLength = 500) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function normalizeBrandId(value) {
  return compactText(value, 100).replace(/[^a-zA-Z0-9_-]/g, '');
}

export function normalizeProductBrand(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const brain = normalizeWizardAnswers(source.brain || source.answers || {});
  const id = normalizeBrandId(source.id);
  const name = compactText(source.name, 80);

  if (!id || !name || brain.profileDescription.length < 10 || brain.audience.length < 3) return null;

  return {
    id,
    name,
    brain,
    createdAt: compactText(source.createdAt, 40),
    updatedAt: compactText(source.updatedAt, 40),
  };
}

export function normalizeProductBrands(value) {
  const brands = Array.isArray(value) ? value : [];
  const unique = new Map();

  brands.forEach((candidate) => {
    const brand = normalizeProductBrand(candidate);
    if (brand) unique.set(brand.id, brand);
  });

  return [...unique.values()];
}

export function readProductBrands(storage) {
  try {
    return normalizeProductBrands(JSON.parse(storage?.getItem(PRODUCT_BRANDS_STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
}

export function writeProductBrands(storage, brands) {
  const normalized = normalizeProductBrands(brands);
  storage?.setItem(PRODUCT_BRANDS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function createProductBrandId(name, now = Date.now()) {
  const slug = compactText(name, 60)
    .toLocaleLowerCase('en-US')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return `brand-${slug || 'workspace'}-${Math.max(0, Number(now) || 0).toString(36)}`;
}

export function upsertProductBrand(brands, candidate) {
  const nextBrand = normalizeProductBrand(candidate);
  const current = normalizeProductBrands(brands);
  if (!nextBrand) return current;

  const existingIndex = current.findIndex((brand) => brand.id === nextBrand.id);
  if (existingIndex === -1) return [...current, nextBrand];

  return current.map((brand, index) => (index === existingIndex ? nextBrand : brand));
}

export function resolveActiveBrandId(brands, requestedId = '') {
  const normalized = normalizeProductBrands(brands);
  const id = normalizeBrandId(requestedId);
  if (normalized.some((brand) => brand.id === id)) return id;
  return normalized[0]?.id || '';
}

export function readActiveBrandId(storage, brands) {
  return resolveActiveBrandId(
    brands,
    storage?.getItem(PRODUCT_ACTIVE_BRAND_STORAGE_KEY) || '',
  );
}

export function writeActiveBrandId(storage, brands, activeBrandId) {
  const resolved = resolveActiveBrandId(brands, activeBrandId);
  if (resolved) storage?.setItem(PRODUCT_ACTIVE_BRAND_STORAGE_KEY, resolved);
  else storage?.removeItem(PRODUCT_ACTIVE_BRAND_STORAGE_KEY);
  return resolved;
}

function normalizeBalance(value) {
  if (value === null || value === undefined || value === '') return null;
  const balance = Number(value);
  return Number.isInteger(balance) && balance >= 0 ? balance : null;
}

function normalizeCreditEntry(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const operation = CREDIT_OPERATIONS.find((item) => item.id === source.operationId);
  const id = compactText(source.id, 120);
  const brandId = normalizeBrandId(source.brandId);
  const occurredAt = compactText(source.occurredAt, 40);
  const credits = Number(source.credits);

  if (!id || !operation || !brandId || !occurredAt || Number.isNaN(Date.parse(occurredAt)) || credits !== operation.credits) return null;
  return { id, operationId: operation.id, brandId, occurredAt, credits };
}

export function normalizeCreditState(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const entries = Array.isArray(source.entries)
    ? source.entries.map(normalizeCreditEntry).filter(Boolean)
    : [];

  return {
    balance: normalizeBalance(source.balance),
    entries: entries.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
  };
}

export function readCreditState(storage) {
  try {
    return normalizeCreditState(JSON.parse(storage?.getItem(PRODUCT_CREDITS_STORAGE_KEY) || '{}'));
  } catch {
    return normalizeCreditState();
  }
}

export function writeCreditState(storage, state) {
  const normalized = normalizeCreditState(state);
  storage?.setItem(PRODUCT_CREDITS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function getCreditCost(operationId) {
  return CREDIT_OPERATIONS.find((operation) => operation.id === operationId)?.credits ?? null;
}

export function applyCreditCharge(state, {
  operationId,
  brandId,
  occurredAt,
  entryId,
} = {}) {
  const current = normalizeCreditState(state);
  const credits = getCreditCost(operationId);
  const normalizedBrandId = normalizeBrandId(brandId);
  const normalizedOccurredAt = compactText(occurredAt, 40);
  const normalizedEntryId = compactText(entryId, 120);

  if (credits === null || !normalizedBrandId || !normalizedOccurredAt || !normalizedEntryId) {
    return { status: 'invalid', state: current };
  }
  if (current.entries.some((entry) => entry.id === normalizedEntryId)) {
    return { status: 'duplicate', state: current };
  }
  if (current.balance === null) return { status: 'unavailable', state: current };
  if (current.balance < credits) return { status: 'insufficient', state: current };

  const entry = {
    id: normalizedEntryId,
    operationId,
    brandId: normalizedBrandId,
    occurredAt: normalizedOccurredAt,
    credits,
  };

  return {
    status: 'charged',
    state: normalizeCreditState({
      balance: current.balance - credits,
      entries: [entry, ...current.entries],
    }),
    entry,
  };
}
