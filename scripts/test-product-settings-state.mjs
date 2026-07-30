import assert from 'node:assert/strict';

import {
  CREDIT_OPERATIONS,
  PRODUCT_ACTIVE_BRAND_STORAGE_KEY,
  PRODUCT_BRANDS_STORAGE_KEY,
  applyCreditCharge,
  createProductBrandId,
  normalizeCreditState,
  readActiveBrandId,
  readProductBrands,
  resolveActiveBrandId,
  upsertProductBrand,
  writeActiveBrandId,
  writeProductBrands,
} from '../src/productSettingsState.mjs';

function brand(id, name, niche) {
  return {
    id,
    name,
    brain: {
      profileDescription: `${name} product`,
      audience: `${name} audience`,
      niche,
      market: 'Ukraine',
      instagramUrl: '',
    },
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:00:00.000Z',
  };
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    dump: () => Object.fromEntries(values),
  };
}

{
  const incomplete = {
    id: 'brand-incomplete',
    name: 'Incomplete',
    brain: { profileDescription: 'Only one answer' },
  };
  assert.deepEqual(upsertProductBrand([], incomplete), [], 'an incomplete Brand Brain must not create a placeholder brand');
}

{
  const updatedOnboardingBrand = {
    id: 'brand-updated-onboarding',
    name: 'Updated onboarding',
    brain: {
      profileDescription: 'Educational content for creators',
      audience: 'Creators',
    },
  };
  const saved = upsertProductBrand([], updatedOnboardingBrand);
  assert.equal(saved.length, 1, 'the updated two-screen onboarding must create a complete product brand');
  assert.equal(saved[0].brain.niche, '');
  assert.equal(saved[0].brain.market, '');
  assert.equal(saved[0].brain.instagramUrl, '');
}

{
  const first = brand('brand-first', 'First', 'Technology');
  const second = brand('brand-second', 'Second', 'Food');
  const brands = upsertProductBrand(upsertProductBrand([], first), second);
  const edited = upsertProductBrand(brands, {
    ...first,
    brain: { ...first.brain, audience: 'Updated first audience' },
  });

  assert.equal(edited.length, 2);
  assert.equal(edited[0].brain.audience, 'Updated first audience');
  assert.equal(edited[1].brain.audience, 'Second audience', 'editing one brand must not mutate another Brand Brain');
  assert.equal(resolveActiveBrandId(edited, 'brand-second'), 'brand-second');
}

{
  const storage = memoryStorage();
  const brands = [brand('brand-persisted', 'Persisted', 'Education')];
  writeProductBrands(storage, brands);
  writeActiveBrandId(storage, brands, 'brand-persisted');

  assert.deepEqual(readProductBrands(storage), brands);
  assert.equal(readActiveBrandId(storage, brands), 'brand-persisted');
  assert.ok(storage.dump()[PRODUCT_BRANDS_STORAGE_KEY]);
  assert.equal(storage.dump()[PRODUCT_ACTIVE_BRAND_STORAGE_KEY], 'brand-persisted');
}

{
  const first = createProductBrandId('North Star', 1000);
  const second = createProductBrandId('North Star', 1001);
  assert.notEqual(first, second);
  assert.match(first, /^brand-north-star-/);
}

{
  assert.ok(CREDIT_OPERATIONS.length >= 5);
  CREDIT_OPERATIONS.forEach((operation) => {
    assert.ok(Number.isInteger(operation.credits) && operation.credits > 0);
  });

  const chargeInput = {
    balance: 10,
    entries: [],
  };
  const charge = applyCreditCharge(chargeInput, {
    operationId: 'adaptation',
    brandId: 'brand-first',
    occurredAt: '2026-07-30T12:00:00.000Z',
    entryId: 'usage-1',
  });

  assert.equal(charge.status, 'charged');
  assert.equal(charge.state.balance, 6);
  assert.deepEqual(charge.state.entries[0], {
    id: 'usage-1',
    operationId: 'adaptation',
    brandId: 'brand-first',
    occurredAt: '2026-07-30T12:00:00.000Z',
    credits: 4,
  });

  const repeated = applyCreditCharge(chargeInput, {
    operationId: 'adaptation',
    brandId: 'brand-first',
    occurredAt: '2026-07-30T12:00:00.000Z',
    entryId: 'usage-1',
  });
  assert.deepEqual(repeated, charge, 'the same charge input must produce the same deduction');

  const duplicate = applyCreditCharge(charge.state, {
    operationId: 'adaptation',
    brandId: 'brand-first',
    occurredAt: '2026-07-30T12:00:00.000Z',
    entryId: 'usage-1',
  });
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.state.balance, 6, 'retrying the same charge must not deduct credits twice');
  assert.equal(duplicate.state.entries.length, 1);

  const insufficient = applyCreditCharge({ balance: 3, entries: [] }, {
    operationId: 'adaptation',
    brandId: 'brand-first',
    occurredAt: '2026-07-30T12:00:00.000Z',
    entryId: 'usage-2',
  });
  assert.equal(insufficient.status, 'insufficient');
  assert.equal(insufficient.state.balance, 3);

  assert.deepEqual(normalizeCreditState(), { balance: null, entries: [] }, 'empty state must not invent a balance or usage history');
}

console.log('Product settings state checks passed.');
