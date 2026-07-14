import assert from 'node:assert/strict';
import { createTranslator } from '../src/i18nCore.mjs';
import { extractInterfaceErrorCode, localizeInterfaceError } from '../src/interfaceErrors.mjs';

const enT = createTranslator('en');
const ukT = createTranslator('uk');

assert.equal(extractInterfaceErrorCode({ error: 'plan_limit_reached' }), 'plan_limit_reached');
assert.equal(extractInterfaceErrorCode(new Error('youtube_popular_failed')), 'youtube_popular_failed');
assert.equal(extractInterfaceErrorCode({ message: 'SQL connection refused' }, 'unknown_error'), 'unknown_error');
assert.equal(localizeInterfaceError('youtube_popular_failed', enT), 'Could not load popular YouTube videos.');
assert.equal(localizeInterfaceError('youtube_popular_failed', ukT), 'Не вдалося завантажити популярні відео YouTube.');
assert.equal(localizeInterfaceError('SQL connection refused', enT), 'Something went wrong. Try again.');
assert.doesNotMatch(localizeInterfaceError('SQL connection refused', enT), /SQL|connection refused/);

console.log('interface error tests passed');
