const assert = require('node:assert/strict');
const {
  rankSignalsForBrand,
  selectBestSignalForBrand,
} = require('../backend/services/brandSignalRecommender.cjs');

const answers = {
  profileDescription: 'Specialty coffee and fast breakfasts',
  audience: 'Busy Kyiv commuters',
  niche: 'Coffee shop',
  market: 'Kyiv, Ukraine',
  instagramUrl: '',
};

const signals = [
  {
    id: 'reel-fashion',
    workspaceId: 'shared',
    title: 'Three summer dress combinations',
    caption: 'Fashion styling',
    market: 'ua',
    score: 96,
    status: ['fashion', 'outfits'],
  },
  {
    id: 'reel-coffee',
    workspaceId: 'shared',
    title: 'Breakfast coffee before the commute',
    caption: 'A quick Kyiv morning ritual',
    market: 'ua',
    score: 88,
    status: ['coffee', 'breakfast', 'local business'],
  },
  {
    id: 'reel-gym',
    workspaceId: 'shared',
    title: 'Gym routine',
    caption: 'Fitness training',
    market: 'global',
    score: 92,
    status: ['fitness'],
  },
];

(async () => {
  const ranked = rankSignalsForBrand({ answers, signals, limit: 3 });
  assert.equal(ranked[0].signal.id, 'reel-coffee');

  const qualityOnlySignals = [
    { id: 'quality-low', title: 'Unrelated alpha', score: 10 },
    { id: 'quality-high', title: 'Different beta', score: 90 },
  ];
  assert.equal(
    rankSignalsForBrand({ answers: {}, signals: qualityOnlySignals })[0].signal.id,
    'quality-high',
  );

  const ukrainianRanked = rankSignalsForBrand({
    answers: { niche: 'Кав’ярня', market: 'Київ' },
    signals: [
      { id: 'english', title: 'Coffee breakfast', score: 100 },
      { id: 'ukrainian', title: 'Ранок у кав’ярні Київ', score: 0 },
    ],
  });
  assert.equal(ukrainianRanked[0].signal.id, 'ukrainian');

  const clampedScores = rankSignalsForBrand({
    answers: {},
    signals: [
      { id: 'negative', score: -10 },
      { id: 'over-100', score: 1000 },
      { id: 'nan', score: Number.NaN },
      { id: 'infinity', score: Number.POSITIVE_INFINITY },
    ],
  });
  assert.deepEqual(
    clampedScores.map(({ candidate, deterministicScore }) => [candidate.id, deterministicScore]),
    [['over-100', 18], ['infinity', 0], ['nan', 0], ['negative', 0]],
  );

  const tieSignals = [{ id: 'tie-b', score: 50 }, { id: 'tie-a', score: 50 }];
  assert.deepEqual(
    rankSignalsForBrand({ answers: {}, signals: tieSignals }).map(({ candidate }) => candidate.id),
    ['tie-a', 'tie-b'],
  );
  assert.deepEqual(
    rankSignalsForBrand({ answers: {}, signals: tieSignals }).map(({ candidate }) => candidate.id),
    ['tie-a', 'tie-b'],
  );

  const manySignals = Array.from({ length: 30 }, (_, index) => ({
    id: `many-${String(index).padStart(2, '0')}`,
    score: index,
  }));
  assert.equal(rankSignalsForBrand({ answers: {}, signals: manySignals, limit: Infinity }).length, 24);
  assert.equal(rankSignalsForBrand({ answers: {}, signals: manySignals, limit: null }).length, 24);
  assert.equal(rankSignalsForBrand({ answers: {}, signals: manySignals, limit: '' }).length, 24);
  assert.equal(rankSignalsForBrand({ answers: {}, signals: manySignals, limit: false }).length, 24);
  assert.equal(rankSignalsForBrand({ answers: {}, signals: manySignals, limit: '3' }).length, 24);
  assert.equal(rankSignalsForBrand({ answers: {}, signals: manySignals, limit: 999 }).length, 24);
  assert.equal(rankSignalsForBrand({ answers: {}, signals: manySignals, limit: 0 }).length, 1);
  assert.equal(rankSignalsForBrand({ answers: {}, signals: manySignals, limit: 3 }).length, 3);
  assert.equal(rankSignalsForBrand({ answers: {}, signals: manySignals, limit: 99 }).length, 24);

  let promptedCandidates = [];
  await selectBestSignalForBrand({
    answers: {},
    signals: manySignals,
    geminiClient: async (prompt) => {
      promptedCandidates = JSON.parse(prompt).candidates;
      return { signalId: promptedCandidates[0].id, reason: 'Object response.' };
    },
  });
  assert.equal(promptedCandidates.length, 24);

  const geminiChoice = await selectBestSignalForBrand({
    answers,
    signals,
    geminiClient: async () => JSON.stringify({
      signalId: 'reel-coffee',
      reason: 'Matches breakfast, coffee, commuters, and Kyiv.',
    }),
    now: () => new Date('2026-07-23T12:00:00.000Z'),
  });
  assert.equal(geminiChoice.signalId, 'reel-coffee');
  assert.equal(geminiChoice.selectionMode, 'gemini');

  const objectGeminiChoice = await selectBestSignalForBrand({
    answers,
    signals,
    geminiClient: async () => ({ signalId: 'reel-coffee', reason: 'Object response.' }),
    now: () => new Date('2026-07-23T12:00:00.000Z'),
  });
  assert.equal(objectGeminiChoice.signalId, 'reel-coffee');
  assert.equal(objectGeminiChoice.selectionMode, 'gemini');

  const invalidChoice = await selectBestSignalForBrand({
    answers,
    signals,
    geminiClient: async () => JSON.stringify({
      signalId: 'not-accessible',
      reason: 'Invalid',
    }),
    now: () => new Date('2026-07-23T12:00:00.000Z'),
  });
  assert.equal(invalidChoice.signalId, 'reel-coffee');
  assert.equal(invalidChoice.selectionMode, 'deterministic');

  const failedChoice = await selectBestSignalForBrand({
    answers,
    signals,
    geminiClient: async () => { throw new Error('provider_down'); },
    now: () => new Date('2026-07-23T12:00:00.000Z'),
  });
  assert.equal(failedChoice.signalId, 'reel-coffee');
  assert.equal(failedChoice.selectionMode, 'deterministic');

  assert.equal(await selectBestSignalForBrand({ answers, signals: [] }), null);

  console.log('Brand signal recommender tests passed');
})();
