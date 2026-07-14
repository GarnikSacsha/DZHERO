import React from 'react';

import { translateValue } from './interfaceTranslations.mjs';

const TRANSLATED_ATTRIBUTES = new Set(['alt', 'aria-label', 'placeholder', 'title']);
const reactCreateElement = React.createElement;

let renderLanguage = 'uk';

export function setRenderLanguage(language) {
  renderLanguage = language === 'en' ? 'en' : 'uk';
}

export function translateUiValue(value, language = renderLanguage) {
  return typeof value === 'string' ? translateValue(value, language) : value;
}

function translateChild(child, protectedContent) {
  if (protectedContent) return child;
  if (typeof child === 'string') return translateUiValue(child);
  if (Array.isArray(child)) return child.map((item) => translateChild(item, false));
  return child;
}

export function createLocalizedElement(type, props, ...children) {
  const protectedContent = Boolean(props?.['data-i18n-content']);
  const localizedProps = props ? { ...props } : props;

  if (localizedProps) {
    for (const attribute of TRANSLATED_ATTRIBUTES) {
      if (typeof localizedProps[attribute] === 'string') {
        localizedProps[attribute] = translateUiValue(localizedProps[attribute]);
      }
    }
  }

  const localizedChildren = children.map((child) => translateChild(child, protectedContent));
  return reactCreateElement(type, localizedProps, ...localizedChildren);
}
