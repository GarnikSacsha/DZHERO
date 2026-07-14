import assert from 'node:assert/strict';
import {
  buildCalendarPostSourceKey,
  buildCalendarRemixScenario,
  buildEditableContentNote,
  buildReelFromCalendarPost,
  buildReelForCalendarPost,
  buildStudioContentPlanDraft,
  findReelForCalendarPost,
  isDuplicateContentPlanPost,
  mergeEditableNotes,
  updateEditableNote,
} from '../src/contentPlanUtils.mjs';

const sourceReel = {
  id: 'reel-a',
  title: 'Pilates balance proof',
  sourceUrl: 'https://www.instagram.com/reel/source-a/',
  handle: '@studio',
  score: 91,
};
const otherReel = {
  id: 'reel-b',
  title: 'Latest studio draft',
  sourceUrl: 'https://www.instagram.com/reel/source-b/',
  handle: '@other',
  score: 88,
};
const post = {
  id: 'post-1',
  title: 'Calendar task for source A',
  source: 'brand_scan',
  sourceKey: buildCalendarPostSourceKey(sourceReel),
};

assert.equal(findReelForCalendarPost(post, [otherReel, sourceReel])?.id, 'reel-a');
assert.equal(findReelForCalendarPost({ ...post, sourceKey: '' }, [otherReel, sourceReel])?.id, undefined);

const aiIdea = {
  id: 'ai-1',
  source: 'AI',
  title: 'Generated hook',
  hook: 'Generated body',
  status: 'До реміксу',
};
const editable = buildEditableContentNote(aiIdea, 0);
assert.equal(editable.id, 'ai-1');
assert.equal(editable.origin, 'generated');
assert.equal(editable.title, 'Generated hook');
assert.equal(editable.hook, 'Generated body');

const merged = mergeEditableNotes([], [aiIdea]);
assert.equal(merged.length, 1);
assert.equal(merged[0].id, 'ai-1');
const updated = updateEditableNote(merged, 'ai-1', { title: 'Edited title', hook: 'Edited body' });
assert.equal(updated[0].title, 'Edited title');
assert.equal(updated[0].hook, 'Edited body');

const studioDraft = buildStudioContentPlanDraft({
  title: 'Original viral reel title',
  remixResult: {
    remixes: [{
      title: 'Домашній десерт проти вітрини кафе',
      hook: 'Думаєш, домашній десерт завжди дешевший?',
      visualFlow: [{
        timeframe: '0:00-0:02',
        actionDescription: 'Дівчина тримає невдалий бісквіт.',
        onScreenText: 'Очікування проти реальності',
        audioVoiceover: 'Я вирішила зекономити.',
      }],
      cta: 'Замовляй у Direct.',
    }],
  },
});

assert.equal(studioDraft.title, 'Домашній десерт проти вітрини кафе');
assert.doesNotMatch(studioDraft.title, /Original viral reel title/);
assert.match(studioDraft.body, /Хук: Думаєш, домашній десерт завжди дешевший\?/);
assert.match(studioDraft.body, /0:00-0:02/);
assert.match(studioDraft.body, /Кадр: Дівчина тримає невдалий бісквіт\./);
assert.match(studioDraft.body, /Текст на екрані: Очікування проти реальності/);
assert.match(studioDraft.body, /Озвучка: Я вирішила зекономити\./);
assert.match(studioDraft.body, /CTA: Замовляй у Direct\./);

assert.equal(buildStudioContentPlanDraft({ title: 'Source only' }), null);
assert.equal(buildStudioContentPlanDraft({
  title: 'Source title',
  remixResult: { remixes: [{ title: '', hook: 'Короткий AI-хук', visualFlow: [] }] },
}).title, 'Короткий AI-хук');

const restored = buildReelFromCalendarPost({
  id: 'calendar-ai-1',
  title: 'Коротка назва',
  body: 'Хук: Повний сценарій\n\nCTA: Напиши в Direct.',
});
assert.equal(restored.title, 'Коротка назва');
assert.equal(restored.hook, 'Хук: Повний сценарій\n\nCTA: Напиши в Direct.');
assert.equal(restored.caption, restored.hook);

const restoredWithSource = buildReelForCalendarPost({
  id: 'calendar-ai-2',
  title: 'Назва з календаря',
  body: 'Хук: Відредагований сценарій\n\nCTA: Напиши нам.',
  sourceKey: buildCalendarPostSourceKey(sourceReel),
  sourceTitle: 'Original viral reel title',
}, [{
  ...sourceReel,
  scanExample: { title: 'Old scan example', hook: 'Old hook', script: [] },
  remixResult: { remixes: [{ title: 'Old remix', hook: 'Old remix hook' }] },
}]);
assert.equal(restoredWithSource.id, sourceReel.id);
assert.equal(restoredWithSource.title, 'Назва з календаря');
assert.equal(restoredWithSource.sourceTitle, 'Original viral reel title');
assert.equal(restoredWithSource.hook, 'Хук: Відредагований сценарій\n\nCTA: Напиши нам.');
assert.equal(restoredWithSource.caption, restoredWithSource.hook);
assert.equal(restoredWithSource.sourceUrl, sourceReel.sourceUrl);

const restoredScenario = buildCalendarRemixScenario(restoredWithSource);
assert.equal(restoredScenario.script.length, 2);
assert.match(restoredScenario.script[0].voice, /Відредагований сценарій/);
assert.match(restoredScenario.script[1].voice, /Напиши нам/);

const longTitleDraft = buildStudioContentPlanDraft({
  remixResult: { remixes: [{ title: 'Д'.repeat(220), hook: 'Короткий хук' }] },
});
assert.equal(longTitleDraft.title.length, 180);
assert.equal(isDuplicateContentPlanPost(
  { source: 'studio_ai', sourceKey: 'brand-scan:long', title: 'Д'.repeat(180), format: 'Reels' },
  { source: 'studio_ai', sourceKey: 'brand-scan:long', title: longTitleDraft.title, format: 'Reels' },
), true);

const firstAiPost = {
  source: 'studio_ai',
  sourceKey: 'brand-scan:source-a',
  title: 'Перший AI-сценарій',
  format: 'Reels',
};
assert.equal(isDuplicateContentPlanPost(firstAiPost, { ...firstAiPost }), true);
assert.equal(isDuplicateContentPlanPost(firstAiPost, {
  ...firstAiPost,
  title: 'Інший AI-сценарій',
}), false);
assert.equal(isDuplicateContentPlanPost(
  { ...firstAiPost, source: 'brand_scan' },
  { ...firstAiPost, source: 'brand_scan', title: 'Інша задача' },
), true);

const englishCalendarReel = buildReelForCalendarPost({
  id: 'post_en',
  title: '',
  body: '',
  format: 'Reels',
}, [], { language: 'en' });
assert.equal(englishCalendarReel.title, 'Content plan draft');
assert.match(englishCalendarReel.quality, /Content plan/);
assert.doesNotMatch(englishCalendarReel.quality, /[А-Яа-яІіЇїЄєҐґ]/);

console.log('content plan utility tests passed');
