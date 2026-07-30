import assert from 'node:assert/strict';

import {
  buildContentPlanCsv,
  buildMonthCells,
  buildWeekDays,
  getContentPlanStorageKey,
  mergeStudioDraftIntoPlan,
  normalizeContentPlanEntry,
  readContentPlanEntries,
  toLocalIsoDate,
  upsertContentPlanEntry,
  writeContentPlanEntries,
} from '../src/contentPlanViewState.mjs';

const storageValues = new Map();
const storage = {
  getItem: (key) => storageValues.get(key) ?? null,
  setItem: (key, value) => storageValues.set(key, value),
};

assert.notEqual(getContentPlanStorageKey('brand-a'), getContentPlanStorageKey('brand-b'));
assert.equal(toLocalIsoDate(new Date(2026, 6, 29, 12)), '2026-07-29');
assert.equal(buildMonthCells(new Date(2026, 6, 1)).length, 42);
assert.deepEqual(
  buildWeekDays(new Date(2026, 6, 29)).map(({ iso }) => iso),
  ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'],
);

const normalized = normalizeContentPlanEntry({
  id: 'post-1',
  title: 'Real post',
  date: '2026-07-29',
  time: '12:30',
  format: 'Post',
  status: 'completed',
  source: 'Studio',
  sourceUrl: 'https://example.com/original',
});
assert.equal(normalized.status, 'completed');
assert.equal(normalized.format, 'Post');
assert.equal(normalizeContentPlanEntry({ title: 'Missing date' }), null);

let entries = upsertContentPlanEntry([], {
  title: 'First post',
  date: '2026-07-29',
  time: '10:00',
  format: 'Reels',
  status: 'scheduled',
});
assert.equal(entries.length, 1);
entries = upsertContentPlanEntry(entries, {
  ...entries[0],
  title: 'Rescheduled post',
  date: '2026-07-30',
  time: '14:00',
  status: 'completed',
}, entries[0].id);
assert.equal(entries[0].date, '2026-07-30');
assert.equal(entries[0].status, 'completed');

entries = mergeStudioDraftIntoPlan(entries, {
  title: 'Saved Studio adaptation',
  body: 'Real script',
  sourceSignalId: 'signal-1',
  sourceUrl: 'https://example.com/source',
}, '2026-07-29');
assert.equal(entries.length, 2);
assert.equal(entries[0].source, 'Studio');
entries = mergeStudioDraftIntoPlan(entries, {
  title: 'Saved Studio adaptation',
  sourceSignalId: 'signal-1',
});
assert.equal(entries.length, 2);

writeContentPlanEntries(storage, 'brand-a', entries);
writeContentPlanEntries(storage, 'brand-b', []);
assert.equal(readContentPlanEntries(storage, 'brand-a').length, 2);
assert.equal(readContentPlanEntries(storage, 'brand-b').length, 0);

const emptyCsv = buildContentPlanCsv([]);
assert.equal(emptyCsv.split('\r\n').length, 1);
assert.match(emptyCsv, /"Title","Date","Time","Format","Status"/);
const csv = buildContentPlanCsv(entries, {
  scheduledLabel: 'Заплановано',
  completedLabel: 'Завершено',
  headers: ['Назва', 'Дата', 'Час', 'Формат', 'Статус', 'Джерело', 'URL джерела', 'Сценарій'],
});
assert.match(csv, /^"Назва","Дата","Час","Формат","Статус","Джерело","URL джерела","Сценарій"/);
assert.match(csv, /"Saved Studio adaptation","2026-07-29","10:00","Reels","Заплановано","Studio"/);
assert.match(csv, /"Rescheduled post","2026-07-30","14:00","Reels","Завершено"/);

console.log('content plan view state tests passed');
