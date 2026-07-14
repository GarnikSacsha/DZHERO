import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { assertCatalogParity } from '../src/i18nCore.mjs';

assert.equal(assertCatalogParity(), true);

const main = readFileSync('src/main.jsx', 'utf8');
const provider = readFileSync('src/i18nProvider.mjs', 'utf8');
const renderI18n = readFileSync('src/renderI18n.mjs', 'utf8');
const legacyPath = 'src/i18n.js';
const forbiddenArchitecture = [
  'applyInterfaceLanguage',
  'MutationObserver',
  'createTreeWalker',
  'SHOW_TEXT',
  'translateDocumentText',
  'englishMutationTimer',
];

for (const fragment of forbiddenArchitecture) {
  assert.equal(main.includes(fragment), false, `Legacy localization remains in main.jsx: ${fragment}`);
  assert.equal(provider.includes(fragment), false, `Legacy localization remains in i18nProvider.mjs: ${fragment}`);
  assert.equal(renderI18n.includes(fragment), false, `Legacy localization remains in renderI18n.mjs: ${fragment}`);
}

for (const pattern of [
  /(?:error|err|agentError)\??\.message/,
]) {
  assert.doesNotMatch(main, pattern, `Unsafe or unlocalized interface pattern remains: ${pattern}`);
}

assert.match(
  main,
  /const notify = \(message\) => \{\s*setToast\(translateText\(message\)\)/,
  'Toast messages must pass through render-time localization',
);
assert.match(
  renderI18n,
  /TRANSLATED_ATTRIBUTES = new Set\(\['alt', 'aria-label', 'placeholder', 'title'\]\)/,
  'Render-time localization must cover user-facing attributes',
);

assert.equal(existsSync(legacyPath), false, `${legacyPath} must be removed after render-time migration`);

console.log('i18n language audit passed');
