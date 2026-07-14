import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider, useI18n } from '../src/i18nProvider.mjs';

function Probe() {
  const { language, locale, t, formatNumber } = useI18n();
  return React.createElement('output', null, `${language}|${locale}|${t('common.cancel')}|${formatNumber(1200)}`);
}

function MissingProviderProbe() {
  useI18n();
  return React.createElement('output');
}

const english = renderToStaticMarkup(
  React.createElement(I18nProvider, { initialLanguage: 'en' }, React.createElement(Probe)),
);
const invalid = renderToStaticMarkup(
  React.createElement(I18nProvider, { initialLanguage: 'pl' }, React.createElement(Probe)),
);

assert.match(english, /en\|en-US\|Cancel\|1,200/);
assert.match(invalid, /uk\|uk-UA\|Скасувати\|1(?: | )200/);
assert.throws(
  () => renderToStaticMarkup(React.createElement(MissingProviderProbe)),
  /useI18n must be used inside I18nProvider/,
);

console.log('i18n provider tests passed');
