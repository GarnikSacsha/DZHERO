export const THEME_MODE_KEY = 'insta-producer-theme-mode-v2';
export const DAY_THEME_START_HOUR = 7;
export const NIGHT_THEME_START_HOUR = 21;

const VALID_THEME_MODES = new Set(['auto', 'dark', 'light']);

export function getAutoTheme(date = new Date()) {
  const hour = date.getHours();
  return hour >= NIGHT_THEME_START_HOUR || hour < DAY_THEME_START_HOUR ? 'dark' : 'light';
}

export function getInitialThemeMode(storage = globalThis.localStorage) {
  const savedMode = storage?.getItem?.(THEME_MODE_KEY);
  return VALID_THEME_MODES.has(savedMode) ? savedMode : 'auto';
}

export function persistThemeMode(storage, themeMode) {
  const normalizedMode = VALID_THEME_MODES.has(themeMode) ? themeMode : 'auto';
  storage?.setItem?.(THEME_MODE_KEY, normalizedMode);
  return normalizedMode;
}

export function getNextThemeMode(themeMode) {
  if (themeMode === 'auto') return 'dark';
  if (themeMode === 'dark') return 'light';
  return 'auto';
}
