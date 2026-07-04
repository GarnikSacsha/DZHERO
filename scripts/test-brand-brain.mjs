import assert from 'node:assert/strict';
import { buildBrandBrainDraft } from '../src/brandBrain.mjs';

const draft = buildBrandBrainDraft({
  label: 'fitness / wellness',
  title: '220K Followers, 7 Following, 4,529 Posts - See Instagram photos and videos from WOWBODY - 20-minute workouts for health and beauty (@wowbody_app)',
  description: '@wowbody_app - WOWBODY - 20-minute workouts for health and beauty',
  handle: '@wowbody_app',
  stats: {
    followers: '220K',
    following: '7',
    posts: '4,529',
  },
  exampleCaption: '20 minutes is better than starting Monday. Save this mini-start and write START if you want the first mini workout.',
});

assert.equal(draft.businessType, 'fitness / wellness');
assert.equal(draft.product, '20-minute workouts for health and beauty');
assert.equal(draft.audience, 'люди, які хочуть тренуватися для здоровʼя і краси без залу, складного плану і старту “з понеділка”');
assert.equal(draft.offer, 'перший 20-хвилинний комплекс або міні-старт, який можна спробувати сьогодні');
assert.equal(draft.cta, 'написати START або Direct, щоб отримати перший комплекс');
assert.match(draft.proof, /220K followers/);
assert.doesNotMatch(draft.product, /Followers|Following|Posts|See Instagram/i);
assert.doesNotMatch(draft.audience, /@wowbody_app|Followers|Following|Posts|See Instagram/i);
assert.doesNotMatch(draft.offer, /Followers|Following|Posts|See Instagram/i);

const englishDraft = buildBrandBrainDraft({
  language: 'en',
  label: 'fitness / wellness',
  title: draft.product,
  stats: { followers: '220K' },
  exampleCaption: 'write START',
});

assert.equal(englishDraft.audience, 'people who want short workouts for health and beauty without a gym, a complex plan, or waiting until Monday');
assert.equal(englishDraft.offer, 'a first 20-minute routine or mini-start people can try today');
assert.equal(englishDraft.cta, 'write START or DM to get the first routine');

const fallback = buildBrandBrainDraft({
  label: 'local business',
  title: 'Only stats: 5K Followers, 12 Following, 33 Posts - See Instagram photos and videos',
  description: '',
  handle: '@empty',
  stats: { followers: '5K' },
});

assert.equal(fallback.product, 'local business');
assert.equal(fallback.offer, 'головна пропозиція для local business');
assert.doesNotMatch(fallback.product, /Followers|Following|Posts|See Instagram/i);

const thinFitnessDraft = buildBrandBrainDraft({
  label: 'Фітнес / wellness',
  title: 'Short-form: 1 вправа + результат для тіла',
  description: '',
  handle: '@wowbody_app',
  stats: { followers: '220K' },
  language: 'uk',
});

assert.equal(thinFitnessDraft.product, 'короткі домашні тренування та wellness-програма');
assert.equal(thinFitnessDraft.audience, 'люди, які хочуть тренуватися для здоровʼя і краси без залу, складного плану і старту “з понеділка”');
assert.equal(thinFitnessDraft.offer, 'перший 20-хвилинний комплекс або міні-старт, який можна спробувати сьогодні');
assert.equal(thinFitnessDraft.cta, 'написати START або Direct, щоб отримати перший комплекс');
assert.doesNotMatch(thinFitnessDraft.product, /Short-form|1 вправа/i);
