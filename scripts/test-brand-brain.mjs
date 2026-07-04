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
assert.equal(draft.audience, 'люди, які хочуть короткі тренування для здоровʼя і краси без довгої рутини в залі');
assert.equal(draft.offer, '20-хвилинне стартове тренування, яке можна зберегти і спробувати сьогодні');
assert.equal(draft.cta, 'написати START, щоб отримати перше міні-тренування');
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

assert.equal(englishDraft.audience, 'people who want short health and beauty workouts without a long gym routine');
assert.equal(englishDraft.offer, 'a 20-minute starter workout people can save and try today');
assert.equal(englishDraft.cta, 'write START to get the first mini workout');

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

const instagramLoginDraft = buildBrandBrainDraft({
  label: 'Фітнес / wellness',
  title: "Create an account or log in to Instagram - Share what you're into with the people who get you.",
  description: "Create an account or log in to Instagram - Share what you're into with the people who get you.",
  handle: '@wowbody_app',
  stats: {},
  language: 'uk',
});

assert.equal(instagramLoginDraft.product, 'Фітнес / wellness');
assert.equal(instagramLoginDraft.offer, 'головна пропозиція для Фітнес / wellness');
assert.doesNotMatch(instagramLoginDraft.product, /Create an account|log in to Instagram|people who get you/i);
assert.doesNotMatch(instagramLoginDraft.offer, /Create an account|log in to Instagram|people who get you/i);
