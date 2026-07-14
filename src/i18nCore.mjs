import { en } from './locales/en.mjs';
import { uk } from './locales/uk.mjs';

export const SUPPORTED_LANGUAGES = Object.freeze(['uk', 'en']);
export const catalogs = Object.freeze({ uk, en });

export function normalizeLanguage(value) {
  return value === 'en' ? 'en' : 'uk';
}

export function getLocaleTag(language) {
  return normalizeLanguage(language) === 'en' ? 'en-US' : 'uk-UA';
}

export function interpolateMessage(template, parameters = {}) {
  return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_, name) => {
    if (!Object.prototype.hasOwnProperty.call(parameters, name)) {
      throw new Error(`Missing translation parameter: ${name}`);
    }
    return String(parameters[name]);
  });
}

export function createTranslator(language) {
  const normalized = normalizeLanguage(language);
  const catalog = catalogs[normalized];
  return (key, parameters) => {
    if (!Object.prototype.hasOwnProperty.call(catalog, key)) {
      throw new Error(`Missing translation key: ${key} (${normalized})`);
    }
    return interpolateMessage(catalog[key], parameters);
  };
}

export function assertCatalogParity() {
  const ukKeys = Object.keys(uk).sort();
  const enKeys = Object.keys(en).sort();
  if (ukKeys.length !== enKeys.length || ukKeys.some((key, index) => key !== enKeys[index])) {
    const onlyUk = ukKeys.filter((key) => !Object.hasOwn(en, key));
    const onlyEn = enKeys.filter((key) => !Object.hasOwn(uk, key));
    throw new Error(`Catalog key mismatch. onlyUk=${onlyUk.join(',')} onlyEn=${onlyEn.join(',')}`);
  }
  return true;
}
