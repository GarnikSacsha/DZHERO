import assert from 'node:assert/strict';
import {
  createProductDiscoveryClient,
} from '../src/productDiscoveryIntegration.mjs';
import {
  getPersonalUrlAdaptationIdentity,
  isCurrentPersonalUrlAdaptationResponse,
  mapSavedUrlToProductSignal,
} from '../src/productSavedUrlState.mjs';
import { getStudioSourceLinks } from '../src/studioViewState.mjs';

const sourceThumbnail = 'https://i.ytimg.com/vi/personal-short/maxresdefault.jpg';
const sourceProfileUrl = 'https://www.youtube.com/@personal-creator';

const savedUrl = {
  id: 'saved-youtube',
  workspaceId: 'workspace-a',
  platform: 'youtube',
  originalUrl: 'https://www.youtube.com/shorts/personal-short?feature=share',
  canonicalUrl: 'https://www.youtube.com/shorts/personal-short',
};
const adaptation = {
  id: 'url_adaptation_1',
  sourceType: 'personal_url',
  savedUrlId: savedUrl.id,
  generationId: 'url_adaptation_generation_1',
  sourceContext: {
    title: 'Personal YouTube video',
    image: sourceThumbnail,
    thumbnail: sourceThumbnail,
    profileUrl: sourceProfileUrl,
    sourceProfileUrl,
    metadata: {
      image: sourceThumbnail,
      thumbnail: sourceThumbnail,
      profileUrl: sourceProfileUrl,
      sourceProfileUrl,
      youtube: {
        channelId: 'UC_PERSONAL_CREATOR',
        channelUrl: sourceProfileUrl,
        thumbnail: sourceThumbnail,
      },
    },
    transcript: { status: 'unavailable', text: '', segments: [] },
    grounding: {
      status: 'full',
      mode: 'video',
      videoInput: { type: 'video', uri: savedUrl.canonicalUrl, source: 'test-video-provider' },
      transcript: { status: 'unavailable', trusted: false },
    },
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
assert.equal(signal.importedMetadata.grounding.status, 'full');
assert.equal(signal.importedMetadata.grounding.videoInput.uri, savedUrl.canonicalUrl);
assert.equal(signal.personalUrlAdaptation, adaptation);
const studioPreviewImage = signal.image
  || signal.thumbnail
  || signal.importedMetadata?.thumbnail
  || signal.importedMetadata?.youtube?.thumbnail
  || '';
assert.deepEqual({
  previewImage: studioPreviewImage,
  sourceLinks: getStudioSourceLinks(signal),
}, {
  previewImage: sourceThumbnail,
  sourceLinks: {
    originalUrl: savedUrl.canonicalUrl,
    profileUrl: sourceProfileUrl,
  },
});

const calls = [];
const response = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});
const fetcher = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.endsWith('/saved-urls/saved-youtube/adaptation')) {
    return response(200, { sourceType: 'personal_url', savedUrl, status: 'ready', adaptation });
  }
  if (url.endsWith('/saved-urls/saved-youtube/analyze-adapt')) {
    assert.equal(options.method, 'POST');
    return response(201, { sourceType: 'personal_url', savedUrl, adaptation });
  }
  throw new Error(`unexpected URL: ${url}`);
};

const client = createProductDiscoveryClient({ apiBase: '/api', workspaceId: 'workspace-a', fetcher });
assert.equal((await client.loadSavedUrlAdaptation(savedUrl.id)).adaptation.id, adaptation.id);
assert.equal((await client.analyzeAdaptSavedUrl(savedUrl.id)).sourceType, 'personal_url');
assert.ok(calls.some(({ url }) => url.includes('/saved-urls/saved-youtube/adaptation')));
assert.ok(calls.some(({ url, options }) => url.includes('/saved-urls/saved-youtube/analyze-adapt') && options.method === 'POST'));
assert.equal(calls.some(({ url }) => url.includes('/adaptations/')), false, 'personal URL flow never calls shared adaptation API');

console.log('Product Personal URL adaptation lifecycle checks passed.');
