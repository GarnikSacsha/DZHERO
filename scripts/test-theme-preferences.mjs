import assert from 'node:assert/strict';
import {
  THEME_MODE_KEY,
  getAutoTheme,
  getInitialThemeMode,
  getNextThemeMode,
  persistThemeMode,
} from '../src/themePreferences.mjs';

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

assert.equal(getAutoTheme(new Date(2026, 6, 24, 18, 27)), 'light');
assert.equal(getAutoTheme(new Date(2026, 6, 24, 20, 59, 59)), 'light');
assert.equal(getAutoTheme(new Date(2026, 6, 24, 21, 0)), 'dark');
assert.equal(getAutoTheme(new Date(2026, 6, 25, 6, 59, 59)), 'dark');
assert.equal(getAutoTheme(new Date(2026, 6, 25, 7, 0)), 'light');

assert.equal(getInitialThemeMode(memoryStorage({
  'insta-producer-theme-mode-v1': 'dark',
  'insta-producer-theme-v2': 'dark',
})), 'auto');
assert.equal(getInitialThemeMode(memoryStorage({ [THEME_MODE_KEY]: 'dark' })), 'dark');
assert.equal(getInitialThemeMode(memoryStorage({ [THEME_MODE_KEY]: 'light' })), 'light');
assert.equal(getInitialThemeMode(memoryStorage({ [THEME_MODE_KEY]: 'auto' })), 'auto');

const storage = memoryStorage();
persistThemeMode(storage, 'light');
assert.equal(storage.getItem(THEME_MODE_KEY), 'light');
assert.equal(getNextThemeMode('auto'), 'dark');
assert.equal(getNextThemeMode('dark'), 'light');
assert.equal(getNextThemeMode('light'), 'auto');

console.log('theme preference tests passed');
