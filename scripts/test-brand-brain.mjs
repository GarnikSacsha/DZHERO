import assert from 'node:assert/strict';
import { buildBrandBrainDraft } from '../src/brandBrain.mjs';
import { isBrandProfileComplete } from '../src/myBrandsState.mjs';

const draft = buildBrandBrainDraft({
  label: 'fitness / wellness',
  title: '220K Followers, 7 Following, 4,529 Posts - See Instagram photos and videos from WOWBODY - 20-minute workouts for health and beauty (@wowbody_app)',
  description: '@wowbody_app - WOWBODY - 20-minute workouts for health and beauty',
  handle: '@wowbody_app',
  stats: { followers: '220K', following: '7', posts: '4,529' },
  exampleCaption: '20 minutes is better than starting Monday. Save this mini-start and write START if you want the first mini workout.',
});

assert.equal(draft.businessType, 'fitness / wellness');
assert.equal(draft.product, '20-minute workouts for health and beauty');
assert.equal(draft.audience, '');
assert.equal(draft.offer, '');
assert.equal(draft.cta, '');
assert.equal(draft.toneOfVoice, '');
assert.match(draft.proof, /220K followers/);
assert.doesNotMatch(draft.product, /Followers|Following|Posts|See Instagram/i);

const instagramLoginDraft = buildBrandBrainDraft({
  label: 'fitness / wellness',
  title: "Create an account or log in to Instagram - Share what you're into with the people who get you.",
  description: "Create an account or log in to Instagram - Share what you're into with the people who get you.",
  handle: '@wowbody_app',
});
assert.equal(instagramLoginDraft.product, '');
assert.equal(instagramLoginDraft.audience, '');
assert.equal(instagramLoginDraft.offer, '');
assert.equal(instagramLoginDraft.cta, '');
assert.doesNotMatch(Object.values(instagramLoginDraft).join(' '), /Create an account|log in to Instagram|people who get you/i);

for (const boilerplate of ['Watch on YouTube', 'TikTok videos', 'YouTube Channel']) {
  const platformDraft = buildBrandBrainDraft({
    label: 'creator',
    title: boilerplate,
    description: boilerplate,
    handle: '@creator',
  });
  assert.equal(platformDraft.product, '');
  assert.doesNotMatch(Object.values(platformDraft).join(' '), /Watch on YouTube|TikTok videos/i);
}

const productionFallbackDraft = buildBrandBrainDraft({
  label: 'local business',
  title: 'Short-form: problem + solution',
  handle: '@creator',
});
assert.equal(productionFallbackDraft.product, '');
assert.equal(productionFallbackDraft.audience, '');
assert.equal(productionFallbackDraft.offer, '');
assert.equal(productionFallbackDraft.cta, '');

const sparseSocialDraft = buildBrandBrainDraft({
  label: 'local business',
  title: '1,642 Followers, 55 Following, 322 Posts - See Instagram photos and videos',
  description: '',
  handle: '@car_finder_',
  stats: { followers: '1,642', following: '55', posts: '322' },
});
for (const field of ['businessType', 'product', 'audience', 'offer', 'cta', 'toneOfVoice']) {
  assert.equal(sparseSocialDraft[field], '', `Sparse social metadata must not synthesize ${field}`);
}
assert.match(sparseSocialDraft.proof, /1,642 followers/);
assert.equal(isBrandProfileComplete(sparseSocialDraft), false, 'Sparse Brand Scan metadata must not unlock navigation');

const clothingDraft = buildBrandBrainDraft({
  label: 'clothing store',
  title: '1,234 Followers, 12 Following, 88 Posts - See Instagram photos and videos from \u041c\u0410\u0419\u041a\u0410, \u0424\u0423\u0422\u0411\u041e\u041b\u041a\u0410, \u0421\u0423\u041a\u041d\u042f ()',
  handle: '@shop',
  stats: { followers: '1,234', posts: '88' },
});
assert.equal(clothingDraft.product, '\u043c\u0430\u0439\u043a\u0430, \u0444\u0443\u0442\u0431\u043e\u043b\u043a\u0430, \u0441\u0443\u043a\u043d\u044f');
assert.equal(clothingDraft.audience, '');
assert.equal(clothingDraft.offer, '');
assert.equal(clothingDraft.cta, '');
assert.doesNotMatch(clothingDraft.product, /^from\b|\(\)|Followers|Following|Posts|See Instagram/i);
console.log('brand brain tests passed');
