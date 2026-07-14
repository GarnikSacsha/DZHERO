import assert from 'node:assert/strict';
import { en } from '../src/locales/en.mjs';
import { uk } from '../src/locales/uk.mjs';
import {
  assertCatalogParity,
  createTranslator,
  getLocaleTag,
  interpolateMessage,
  normalizeLanguage,
} from '../src/i18nCore.mjs';

assert.equal(normalizeLanguage('en'), 'en');
assert.equal(normalizeLanguage('uk'), 'uk');
assert.equal(normalizeLanguage('de'), 'uk');
assert.equal(normalizeLanguage(null), 'uk');
assert.equal(getLocaleTag('en'), 'en-US');
assert.equal(getLocaleTag('uk'), 'uk-UA');
assert.equal(assertCatalogParity(), true);
assert.deepEqual(Object.keys(en).sort(), Object.keys(uk).sort());

const enT = createTranslator('en');
const ukT = createTranslator('uk');
assert.equal(enT('common.cancel'), 'Cancel');
assert.equal(ukT('common.cancel'), 'Скасувати');
assert.equal(enT('auth.brandScan.addSources'), 'Add sources');
assert.equal(ukT('settings.sources.noConnectedSources'), 'Поки без підключених джерел');
assert.equal(enT('common.itemsCount', { count: 3 }), '3 items');
assert.equal(interpolateMessage('{count} items', { count: 0 }), '0 items');
assert.throws(() => enT('missing.key'), /Missing translation key: missing\.key \(en\)/);
assert.throws(() => enT('common.itemsCount'), /Missing translation parameter: count/);

for (const [key, value] of Object.entries(en)) {
  assert.equal(typeof value, 'string', `English value must be a string: ${key}`);
  assert.ok(value.trim(), `English value must not be empty: ${key}`);
}
for (const [key, value] of Object.entries(uk)) {
  assert.equal(typeof value, 'string', `Ukrainian value must be a string: ${key}`);
  assert.ok(value.trim(), `Ukrainian value must not be empty: ${key}`);
}

console.log('i18n core tests passed');
