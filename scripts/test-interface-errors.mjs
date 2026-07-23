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
assert.equal(
  localizeInterfaceError('daily_remix_limit_reached', ukT),
  'Сьогодні використано 5 із 5 адаптацій. Новий ліміт буде доступний після 00:00 за Києвом.',
);
assert.equal(
  localizeInterfaceError('daily_agent_chat_limit_reached', enT),
  'You have used 100 of 100 Jeryk messages today. Your daily allowance resets at midnight Kyiv time.',
);
assert.equal(
  localizeInterfaceError('ai_provider_not_configured', ukT),
  'Gemini не налаштований на сервері.',
);
assert.equal(
  localizeInterfaceError('ai_provider_failed', enT),
  'Gemini could not complete the request. Try again shortly.',
);
assert.equal(
  localizeInterfaceError('ai_provider_capacity_reached', ukT),
  'Денний технічний ліміт Gemini вичерпано. Спробуй після 00:00 за Києвом.',
);

console.log('interface error tests passed');
