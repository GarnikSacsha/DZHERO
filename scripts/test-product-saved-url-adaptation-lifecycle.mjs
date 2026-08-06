import assert from 'node:assert/strict';
import {
  createProductDiscoveryClient,
} from '../src/productDiscoveryIntegration.mjs';
import {
  getPersonalUrlAdaptationIdentity,
  isCurrentPersonalUrlAdaptationResponse,
  mapSavedUrlToProductSignal,
} from '../src/productSavedUrlState.mjs';

const savedUrl = {
  id: 'saved-tiktok',
  workspaceId: 'workspace-a',
  platform: 'tiktok',
  originalUrl: 'https://vm.tiktok.com/ZM123abc/?utm_source=test',
  canonicalUrl: 'https://vm.tiktok.com/ZM123abc',
};
const adaptation = {
  id: 'url_adaptation_1',
  sourceType: 'personal_url',
  savedUrlId: savedUrl.id,
  generationId: 'url_adaptation_generation_1',
  sourceContext: {
    title: 'Personal TikTok video',
    transcript: { status: 'unavailable', text: '', segments: [] },
    analysis: { status: 'unavailable', items: [] },
  },
  result: { remixes: [{ title: 'A grounded variant', hook: 'Show the proof first.', visualFlow: [] }] },
};

const identity = getPersonalUrlAdaptationIdentity({ workspaceId: 'workspace-a', savedUrlId: savedUrl.id, brandRevision: 'brand-a:1' });
assert.equal(isCurrentPersonalUrlAdaptationResponse({
  requestRevision: 2,
  currentRevision: 2,
  requestIdentity: identity,
  currentIdentity: identity,
}), true);
assert.equal(isCurrentPersonalUrlAdaptationResponse({
  requestRevision: 2,
  currentRevision: 3,
  requestIdentity: identity,
  currentIdentity: identity,
}), false);
assert.equal(isCurrentPersonalUrlAdaptationResponse({
  requestRevision: 2,
  currentRevision: 2,
  requestIdentity: identity,
  currentIdentity: getPersonalUrlAdaptationIdentity({ workspaceId: 'workspace-b', savedUrlId: savedUrl.id, brandRevision: 'brand-a:1' }),
}), false);

const signal = mapSavedUrlToProductSignal(savedUrl, adaptation);
assert.equal(signal.sourceType, 'personal_url');
assert.equal(signal.personalUrl, true);
assert.equal(signal.savedUrlId, savedUrl.id);
assert.equal(signal.sourceUrl, savedUrl.canonicalUrl);
assert.equal(signal.views, null);
assert.equal(signal.importedMetadata.videoIntelligence, null);
assert.equal(signal.personalUrlAdaptation, adaptation);

const calls = [];
const response = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});
const fetcher = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.endsWith('/saved-urls/saved-tiktok/adaptation')) {
    return response(200, { sourceType: 'personal_url', savedUrl, status: 'ready', adaptation });
  }
  if (url.endsWith('/saved-urls/saved-tiktok/analyze-adapt')) {
    assert.equal(options.method, 'POST');
    return response(201, { sourceType: 'personal_url', savedUrl, adaptation });
  }
  throw new Error(`unexpected URL: ${url}`);
};

const client = createProductDiscoveryClient({ apiBase: '/api', workspaceId: 'workspace-a', fetcher });
assert.equal((await client.loadSavedUrlAdaptation(savedUrl.id)).adaptation.id, adaptation.id);
assert.equal((await client.analyzeAdaptSavedUrl(savedUrl.id)).sourceType, 'personal_url');
assert.ok(calls.some(({ url }) => url.includes('/saved-urls/saved-tiktok/adaptation')));
assert.ok(calls.some(({ url, options }) => url.includes('/saved-urls/saved-tiktok/analyze-adapt') && options.method === 'POST'));
assert.equal(calls.some(({ url }) => url.includes('/adaptations/')), false, 'personal URL flow never calls shared adaptation API');

console.log('Product Personal URL adaptation lifecycle checks passed.');
