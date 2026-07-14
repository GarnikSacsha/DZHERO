import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  createLocalizedElement,
  setRenderLanguage,
} from '../src/renderI18n.mjs';

setRenderLanguage('en');

const translated = renderToStaticMarkup(
  createLocalizedElement(
    'section',
    { title: 'Налаштування' },
    'Головна',
    createLocalizedElement('input', { placeholder: 'Пошук або посилання на TikTok, Reels, Shorts чи сайт...' }),
  ),
);
const protectedContent = renderToStaticMarkup(
  createLocalizedElement('span', { 'data-i18n-content': true }, 'Головна'),
);

assert.match(translated, /title="Settings"/);
assert.match(translated, />Home<input/);
assert.match(translated, /placeholder="Search or paste a TikTok/);
assert.match(protectedContent, />Головна</);

setRenderLanguage('uk');
const ukrainian = renderToStaticMarkup(createLocalizedElement('span', null, 'Головна'));
assert.match(ukrainian, />Головна</);

console.log('render-time i18n tests passed');
