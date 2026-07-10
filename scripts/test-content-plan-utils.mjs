import assert from 'node:assert/strict';
import {
  buildCalendarPostSourceKey,
  buildEditableContentNote,
  findReelForCalendarPost,
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

console.log('content plan utility tests passed');
