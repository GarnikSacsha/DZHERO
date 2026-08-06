import assert from 'node:assert/strict';

import {
  mapQualityAcceptedSignalsToProductCards,
} from '../src/productSignalsViewState.mjs';
import {
  computeWorkspaceBrandMatchScores,
} from '../backend/services/brandSignalRecommender.cjs';
import {
  buildSharedSignalBankReels,
  projectWorkspaceBrandMatches,
} from '../backend/services/sharedSignalBank.cjs';
import { loadSignalQualityGateConfig } from '../backend/services/signalQualityGate.cjs';

const coffeeBrain = {
  profileDescription: 'Specialty coffee and fast breakfasts',
  audience: 'Busy Kyiv commuters',
  niche: 'Coffee shop',
  market: 'Kyiv Ukraine',
  contentFocus: 'Coffee breakfast rituals',
};
const fitnessBrain = {
  profileDescription: 'Strength training and mobility coaching',
  audience: 'People building a consistent fitness routine',
  niche: 'Fitness coaching',
  market: 'Global',
  contentFocus: 'Strength mobility routines',
};

function qualityGate(decision, admittedToBank) {
  return {
    decision,
    admittedToBank,
    qualityScore: 88,
    brandRelevance: 99,
    centralIdea: 'Origin-context score must not be reused for Brand Match.',
  };
}

const sourceSignals = [
  {
    id: 'coffee-signal',
    workspaceId: 'ws-bank',
    curationStatus: 'approved',
    title: 'Coffee breakfast for Kyiv commuters',
    sourceUrl: 'https://tiktok.com/@coffee/video/1',
    caption: 'A quick coffee ritual before the morning commute.',
    market: 'Kyiv Ukraine',
    status: ['coffee', 'breakfast'],
    importedMetadata: { qualityGate: qualityGate('accept', true) },
  },
  {
    id: 'fitness-signal',
    workspaceId: 'ws-bank',
    curationStatus: 'approved',
    title: 'Strength mobility routine for beginners',
    sourceUrl: 'https://tiktok.com/@fitness/video/2',
    caption: 'A practical fitness sequence for consistent training.',
    market: 'Global',
    status: ['fitness', 'mobility'],
    importedMetadata: { qualityGate: qualityGate('accept', true) },
  },
  {
    id: 'rejected-signal',
    workspaceId: 'ws-bank',
    curationStatus: 'approved',
    title: 'Coffee signal rejected by the filter',
    sourceUrl: 'https://tiktok.com/@coffee/video/3',
    importedMetadata: { qualityGate: qualityGate('reject', false) },
  },
  {
    id: 'uncertain-signal',
    workspaceId: 'ws-bank',
    curationStatus: 'approved',
    title: 'Uncertain training signal',
    sourceUrl: 'https://tiktok.com/@fitness/video/4',
    importedMetadata: { qualityGate: qualityGate('uncertain', false) },
  },
  {
    id: 'not-admitted-signal',
    workspaceId: 'ws-bank',
    curationStatus: 'approved',
    title: 'Accepted but not admitted',
    sourceUrl: 'https://tiktok.com/@coffee/video/5',
    importedMetadata: { qualityGate: qualityGate('accept', false) },
  },
];

const db = {
  users: [{ email: 'bank@example.test', workspaceId: 'ws-bank' }],
  workspaces: [{ id: 'ws-bank' }, { id: 'ws-coffee' }, { id: 'ws-fitness' }],
  reels: structuredClone(sourceSignals),
};
const originalSignals = structuredClone(db.reels);
const shared = buildSharedSignalBankReels(db, {
  targetWorkspaceId: 'ws-coffee',
  ownerEmail: 'bank@example.test',
  limit: 20,
});
assert.equal(shared.reels.length, 2, 'Shared Bank projection excludes non-admitted signals');

const workspaceProjections = [
  { workspaceId: 'ws-coffee', brain: coffeeBrain },
  { workspaceId: 'ws-fitness', brain: fitnessBrain },
].map(({ workspaceId, brain }) => ({
  workspaceId,
  reels: projectWorkspaceBrandMatches(shared.reels, { brain }),
}));
const coffeeProjection = workspaceProjections.find(({ workspaceId }) => workspaceId === 'ws-coffee').reels;
const fitnessProjection = workspaceProjections.find(({ workspaceId }) => workspaceId === 'ws-fitness').reels;
const coffeeScores = Object.fromEntries(coffeeProjection.map((signal) => [signal.sharedSourceId, signal.workspaceBrandMatch]));
const fitnessScores = Object.fromEntries(fitnessProjection.map((signal) => [signal.sharedSourceId, signal.workspaceBrandMatch]));
assert.notEqual(coffeeScores['coffee-signal'], fitnessScores['coffee-signal']);
assert.notEqual(coffeeScores['fitness-signal'], fitnessScores['fitness-signal']);
assert.deepEqual(
  coffeeProjection
    .filter((signal) => Number.isFinite(signal.workspaceBrandMatch))
    .sort((left, right) => right.workspaceBrandMatch - left.workspaceBrandMatch)
    .map((signal) => signal.sharedSourceId),
  ['coffee-signal', 'fitness-signal'],
);
assert.deepEqual(
  fitnessProjection
    .filter((signal) => Number.isFinite(signal.workspaceBrandMatch))
    .sort((left, right) => right.workspaceBrandMatch - left.workspaceBrandMatch)
    .map((signal) => signal.sharedSourceId),
  ['fitness-signal', 'coffee-signal'],
);
assert.deepEqual(db.reels, originalSignals, 'Brand Match must not mutate global Shared Bank records');
assert.equal(coffeeProjection.find((signal) => signal.sharedSourceId === 'coffee-signal').importedMetadata.qualityGate.brandRelevance, 99);

const filteredCoffeeCards = mapQualityAcceptedSignalsToProductCards(coffeeProjection);
assert.deepEqual(filteredCoffeeCards.map((card) => card.rawSignal.sharedSourceId), ['coffee-signal', 'fitness-signal']);
assert.equal(filteredCoffeeCards.some((card) => card.rawSignal.sharedSourceId === 'rejected-signal'), false);
assert.equal(filteredCoffeeCards.some((card) => card.rawSignal.sharedSourceId === 'uncertain-signal'), false);
assert.equal(filteredCoffeeCards.some((card) => card.rawSignal.sharedSourceId === 'not-admitted-signal'), false);

const unavailableProjection = projectWorkspaceBrandMatches(shared.reels, null);
const unavailableCards = mapQualityAcceptedSignalsToProductCards(unavailableProjection);
assert.ok(unavailableCards.length > 0);
assert.ok(unavailableCards.every((card) => card.matchValue === undefined), 'missing Brand Brain must stay pending/unavailable');
assert.equal(computeWorkspaceBrandMatchScores({ productBrandBrain: null, signals: sourceSignals }).status, 'unavailable');

const originalFetch = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = async () => {
  providerCalls += 1;
  throw new Error('provider_call_forbidden');
};
try {
  projectWorkspaceBrandMatches(shared.reels, { brain: coffeeBrain });
} finally {
  globalThis.fetch = originalFetch;
}
assert.equal(providerCalls, 0);
assert.equal(loadSignalQualityGateConfig().maxVideoAnalysesPerRun, 1);

console.log('Workspace-scoped Brand Match regression passed with zero provider calls');
