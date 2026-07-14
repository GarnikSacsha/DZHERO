import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

import { createTranslator, getLocaleTag, normalizeLanguage } from './i18nCore.mjs';
import { setRenderLanguage, translateUiValue } from './renderI18n.mjs';

export const LANGUAGE_STORAGE_KEY = 'insta-producer-language';

const I18nContext = createContext(null);

function readInitialLanguage(explicitLanguage) {
  if (explicitLanguage !== undefined) {
    return normalizeLanguage(explicitLanguage);
  }

  if (typeof window === 'undefined') {
    return 'uk';
  }

  return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

export function I18nProvider({ children, initialLanguage }) {
  const [language, setLanguageState] = useState(() => readInitialLanguage(initialLanguage));
  setRenderLanguage(language);
  const setLanguage = useCallback((value) => {
    setLanguageState(normalizeLanguage(value));
  }, []);
  const locale = getLocaleTag(language);
  const t = useMemo(() => createTranslator(language), [language]);

  useLayoutEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      locale,
      t,
      translateText: (value) => translateUiValue(value, language),
      formatNumber: (number, options) => new Intl.NumberFormat(locale, options).format(number),
      formatDate: (date, options) => new Intl.DateTimeFormat(locale, options).format(date),
    }),
    [language, locale, setLanguage, t],
  );

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider');
  }

  return value;
}
