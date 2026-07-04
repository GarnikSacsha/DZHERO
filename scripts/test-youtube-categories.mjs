import assert from 'node:assert/strict';
import { getYouTubeCategoryId, YOUTUBE_POPULAR_CATEGORIES } from '../src/youtubeCategories.mjs';

const expectedLabels = [
  'Усі',
  'Меми',
  'Гумор',
  'Розваги',
  'Спорт',
  'Фітнес / wellness',
  'Стиль і побут',
  'Освіта',
  'Технології',
  'Бізнес',
  'Краса',
  'Їжа',
  'Люди й блоги',
];

assert.deepEqual(YOUTUBE_POPULAR_CATEGORIES.map((category) => category.label), expectedLabels);

for (const category of YOUTUBE_POPULAR_CATEGORIES) {
  assert.equal(typeof category.label, 'string');
  assert.match(category.id, /^[a-z0-9-]+$/);
  assert.match(category.categoryId, /^$|\d{1,3}$/);
}

assert.equal(YOUTUBE_POPULAR_CATEGORIES.find((category) => category.label === 'Спорт')?.categoryId, '17');
assert.equal(YOUTUBE_POPULAR_CATEGORIES.find((category) => category.label === 'Меми')?.categoryId, '24');
assert.equal(YOUTUBE_POPULAR_CATEGORIES.find((category) => category.label === 'Фітнес / wellness')?.categoryId, '17');
assert.equal(getYouTubeCategoryId('memes'), '24');
assert.equal(getYouTubeCategoryId('fitness-wellness'), '17');
assert.equal(getYouTubeCategoryId('28'), '28');
