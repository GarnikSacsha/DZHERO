import assert from 'node:assert/strict';

import {
  createProductDiscoveryClient,
  getProductRefreshMessageStatus,
  mergeRestoredProductBrand,
} from '../src/productDiscoveryIntegration.mjs';

assert.equal(
  getProductRefreshMessageStatus('blocked', 'automatic_daily_run_limit_reached'),
  'dailyLimit',
);
assert.equal(
  getProductRefreshMessageStatus('blocked', 'automatic_discovery_brand_brain_incomplete'),
  'blocked',
);

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

const localBrand = {
  id: 'brand-local',
  name: 'Local Brand',
  brain: {
    profileDescription: 'A local AI product studio.',
    audience: 'Small product teams',
    niche: 'AI tools',
    market: 'Ukraine',
    instagramUrl: '',
  },
};
const backendBrand = {
  ...localBrand,
  id: 'brand-backend',
  name: 'Backend Brand',
};
const restored = mergeRestoredProductBrand([localBrand], backendBrand);
assert.deepEqual(restored.brands.map(({ id }) => id), ['brand-local', 'brand-backend']);
assert.equal(restored.activeBrandId, 'brand-backend');

let releaseRun;
const runGate = new Promise((resolve) => {
  releaseRun = resolve;
});
const calls = [];
const fetcher = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.endsWith('/agent/context') && !options.method) {
    return jsonResponse(200, { productBrand: backendBrand });
  }
  if (url.endsWith('/agent/context/redesign')) {
    return jsonResponse(200, { productBrand: backendBrand, complete: true, missingFields: [] });
  }
  if (url.endsWith('/signals/discovery/run')) {
    await runGate;
    return jsonResponse(201, {
      run: { id: 'run-1', status: 'completed' },
      acceptedSignals: 1,
      updatedSignals: 0,
    });
  }
  if (url.endsWith('/reels')) {
    return jsonResponse(200, { reels: [{ id: 'accepted-signal', workspaceBrandMatch: 73 }] });
  }
  if (url.endsWith('/saved-signals')) {
    return jsonResponse(200, { savedSignals: [{ cardId: 'accepted-signal' }] });
  }
  if (url.endsWith('/adaptations/accepted-signal') || url.endsWith('/adaptations/accepted-signal?targetLanguage=en')) {
    return jsonResponse(200, { status: 'absent', adaptation: null });
  }
  if (url.endsWith('/adaptations/accepted-signal/generate')) {
    return jsonResponse(201, { adaptation: { id: 'adaptation-1' } });
  }
  if (url.endsWith('/content-plan?surface=product_redesign')) {
    return jsonResponse(200, { posts: [{ id: 'plan-1', title: 'Persisted post' }] });
  }
  if (url.endsWith('/content-plan/posts') && options.method === 'POST') {
    return jsonResponse(201, { post: { id: 'plan-2', title: 'Created post' }, posts: [{ id: 'plan-1' }, { id: 'plan-2' }] });
  }
  if (url.endsWith('/content-plan/posts/plan-2') && options.method === 'PUT') {
    return jsonResponse(200, { post: { id: 'plan-2', title: 'Updated post' }, posts: [{ id: 'plan-1' }, { id: 'plan-2' }] });
  }
  if (url.endsWith('/content-plan/posts/plan-2') && options.method === 'DELETE') {
    return jsonResponse(200, { deletedPostId: 'plan-2', posts: [{ id: 'plan-1' }] });
  }
  if (url.includes('/saved-signals/')) {
    return jsonResponse(options.method === 'PUT' ? 201 : 200, options.method === 'PUT'
      ? { saved: true, alreadySaved: false, savedSignal: { cardId: 'accepted-signal' } }
      : { saved: false, alreadyUnsaved: false });
  }
  throw new Error(`unexpected request: ${url}`);
};

const client = createProductDiscoveryClient({
  apiBase: '/api',
  workspaceId: 'workspace-a',
  fetcher,
});
assert.equal((await client.loadBrand()).id, 'brand-backend');
await client.saveBrand(backendBrand);
const rereadSignals = await client.loadSignals();
assert.equal(rereadSignals.reels[0].workspaceBrandMatch, 73, 'Brand Match is re-read from the current workspace projection');
assert.deepEqual((await client.loadSavedSignals()).savedSignals, [{ cardId: 'accepted-signal' }]);
assert.equal((await client.saveSignal('accepted-signal')).saved, true);
assert.equal((await client.unsaveSignal('accepted-signal')).saved, false);
assert.equal((await client.loadAdaptation('accepted-signal')).status, 'absent');
assert.equal((await client.generateAdaptation('accepted-signal')).adaptation.id, 'adaptation-1');
assert.equal((await client.loadAdaptation('accepted-signal', { targetLanguage: 'en' })).status, 'absent');
assert.equal((await client.generateAdaptation('accepted-signal', { targetLanguage: 'en' })).adaptation.id, 'adaptation-1');
assert.ok(calls.some(({ url }) => url.endsWith('/adaptations/accepted-signal?targetLanguage=en')));
assert.deepEqual(
  JSON.parse(calls.filter(({ url }) => url.endsWith('/adaptations/accepted-signal/generate')).at(-1).options.body),
  { targetLanguage: 'en' },
);
assert.deepEqual((await client.loadContentPlan()).posts, [{ id: 'plan-1', title: 'Persisted post' }]);
const createdPlan = await client.createContentPlanPost({
  origin: 'studio_adaptation', sourceAdaptationId: 'adaptation-1', sourceVariantIndex: 1, date: '2026-08-12',
});
assert.equal(createdPlan.post.id, 'plan-2');
assert.equal(JSON.parse(calls.at(-1).options.body).post.sourceVariantIndex, 1);
assert.equal((await client.updateContentPlanPost('plan-2', { title: 'Updated post' })).post.title, 'Updated post');
assert.equal((await client.deleteContentPlanPost('plan-2')).deletedPostId, 'plan-2');
assert.equal(calls.find(({ url }) => url.endsWith('/content-plan?surface=product_redesign')).url, '/api/workspaces/workspace-a/content-plan?surface=product_redesign');

const firstRefresh = client.refreshBank({ activeBrandId: backendBrand.id });
const duplicateRefresh = client.refreshBank({ activeBrandId: backendBrand.id });
assert.strictEqual(duplicateRefresh, firstRefresh, 'parallel Refresh Bank clicks must share one in-flight request');
assert.equal(calls.filter(({ url }) => url.endsWith('/signals/discovery/run')).length, 1);
releaseRun();
const refreshResult = await firstRefresh;
assert.equal(refreshResult.status, 'success');
assert.deepEqual(refreshResult.reels.map(({ id }) => id), ['accepted-signal']);

const runCall = calls.find(({ url }) => url.endsWith('/signals/discovery/run'));
assert.equal(runCall.url, '/api/workspaces/workspace-a/signals/discovery/run');
assert.deepEqual(JSON.parse(runCall.options.body), {
  surface: 'product_redesign',
  activeBrandId: 'brand-backend',
});
assert.equal(calls.filter(({ url }) => url.endsWith('/reels')).length, 2);

let blockedCalls = 0;
const blockedClient = createProductDiscoveryClient({
  apiBase: '/api',
  workspaceId: 'workspace-b',
  fetcher: async (url) => {
    blockedCalls += 1;
    assert.equal(url, '/api/workspaces/workspace-b/signals/discovery/run');
    return jsonResponse(501, { error: 'apify_not_configured' });
  },
});
const blocked = await blockedClient.refreshBank({ activeBrandId: 'brand-backend' });
assert.equal(blocked.status, 'blocked');
assert.equal(blocked.code, 'apify_not_configured');
assert.equal(blockedCalls, 1, 'a blocked provider preflight must not fake a Collection refresh');

let failedOutcomeReelsCalls = 0;
const failedOutcomeClient = createProductDiscoveryClient({
  apiBase: '/api',
  workspaceId: 'workspace-quality-failure',
  fetcher: async (url) => {
    if (url.endsWith('/signals/discovery/run')) {
      return jsonResponse(201, {
        run: {
          id: 'run-quality-failure',
          status: 'completed',
          errorCount: 1,
          acceptedCount: 0,
          errors: [{ lane: 'quality_gate', code: 'provider_error' }],
        },
        acceptedSignals: 0,
        updatedSignals: 0,
      });
    }
    if (url.endsWith('/reels')) {
      failedOutcomeReelsCalls += 1;
      return jsonResponse(200, { reels: [] });
    }
    throw new Error(`unexpected failed outcome request: ${url}`);
  },
});
const failedOutcome = await failedOutcomeClient.refreshBank({ activeBrandId: 'brand-backend' });
assert.equal(failedOutcome.status, 'error');
assert.equal(failedOutcome.code, 'automatic_discovery_run_failed');
assert.equal(failedOutcomeReelsCalls, 0, 'a technical discovery failure must not refresh Collection');

console.log('Product discovery client checks passed.');
