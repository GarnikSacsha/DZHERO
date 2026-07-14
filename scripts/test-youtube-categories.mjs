import assert from 'node:assert/strict';
import { getYouTubeCategoryId, YOUTUBE_POPULAR_CATEGORIES } from '../src/youtubeCategories.mjs';

assert.deepEqual(YOUTUBE_POPULAR_CATEGORIES[0], {
  id: 'all',
  labelKey: 'signals.youtube.category.all',
  categoryId: '',
});
assert.equal(YOUTUBE_POPULAR_CATEGORIES.every((item) => item.labelKey.startsWith('signals.youtube.category.')), true);

for (const category of YOUTUBE_POPULAR_CATEGORIES) {
  assert.equal(typeof category.labelKey, 'string');
  assert.match(category.id, /^[a-z0-9-]+$/);
  assert.match(category.categoryId, /^$|\d{1,3}$/);
}

assert.equal(YOUTUBE_POPULAR_CATEGORIES.find((category) => category.id === 'sports')?.categoryId, '17');
assert.equal(YOUTUBE_POPULAR_CATEGORIES.find((category) => category.id === 'memes')?.categoryId, '24');
assert.equal(YOUTUBE_POPULAR_CATEGORIES.find((category) => category.id === 'fitness-wellness')?.categoryId, '17');
assert.equal(getYouTubeCategoryId('memes'), '24');
assert.equal(getYouTubeCategoryId('fitness-wellness'), '17');
assert.equal(getYouTubeCategoryId('28'), '28');
