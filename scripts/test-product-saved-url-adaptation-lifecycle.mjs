import assert from 'node:assert/strict';
import {
  createProductDiscoveryClient,
} from '../src/productDiscoveryIntegration.mjs';
import {
  getPersonalUrlAdaptationForLanguage,
  getPersonalUrlAdaptationIdentity,
  isCurrentPersonalUrlAdaptationResponse,
  mapSavedUrlToProductSignal,
} from '../src/productSavedUrlState.mjs';
import { buildStudioContentPlanDraft } from '../src/contentPlanUtils.mjs';
import {
  getStudioRemixes,
  getStudioSourceLinks,
  normalizeStudioScriptScenes,
} from '../src/studioViewState.mjs';

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
  result: {
    remixes: ['visible_source_conflict', 'mechanism_walkthrough', 'viewer_decision'].map((semanticAngle, index) => ({
      title: `Grounded semantic variant ${index + 1}`,
      hook: `Show grounded proof angle ${index + 1} first.`,
      semanticAngle,
      centralClaim: `Distinct grounded claim ${index + 1}`,
      sourceConflict: 'A visible process has to prove the result before the pitch.',
      preservedMechanic: 'Show the process, reveal the result, then offer a concrete next step.',
      brandTranslation: 'Translate the setting through Brand Brain facts without replacing the source conflict.',
      productionProof: 'One phone, one real process, and one visible result.',
      adaptationLogic: 'Grounded conflict becomes a shootable brand proof sequence.',
      visualFlow: [0, 1, 2].map((beat) => ({
        timeframe: `0:0${beat}-0:0${beat + 1}`,
        actionDescription: `Shoot production action ${index + 1}.${beat + 1} with the real process visible.`,
        onScreenText: `Proof ${index + 1}.${beat + 1}`,
        audioVoiceover: `Explain production beat ${index + 1}.${beat + 1}.`,
      })),
      cta: `Take grounded next step ${index + 1}.`,
    })),
  },
};

const identity = getPersonalUrlAdaptationIdentity({ workspaceId: 'workspace-a', savedUrlId: savedUrl.id, brandRevision: 'brand-a:1' });
const englishIdentity = getPersonalUrlAdaptationIdentity({ workspaceId: 'workspace-a', savedUrlId: savedUrl.id, brandRevision: 'brand-a:1', language: 'en' });
assert.notEqual(identity, englishIdentity, 'Saved URL response identity must distinguish localized analysis requests');
assert.equal(getPersonalUrlAdaptationForLanguage({ ...adaptation, language: 'en' }, 'uk'), null);
assert.equal(getPersonalUrlAdaptationForLanguage({ ...adaptation, language: 'en' }, 'en')?.id, adaptation.id);
assert.equal(getPersonalUrlAdaptationForLanguage(adaptation, 'uk')?.id, adaptation.id, 'legacy records without language remain Ukrainian-readable');
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
const studioRemixes = getStudioRemixes(signal, adaptation);
assert.deepEqual(
  studioRemixes.map((remix) => remix.semanticAngle),
  ['visible_source_conflict', 'mechanism_walkthrough', 'viewer_decision'],
  'Saved URL Studio exposes all three bounded semantic angles',
);
const selectedRemix = studioRemixes[1];
const productionScenes = normalizeStudioScriptScenes(signal, adaptation, selectedRemix);
assert.equal(productionScenes.length, 3, 'selected adaptation angle becomes a three-scene production script');
assert.ok(productionScenes.every((scene) => scene.direction && scene.onScreenText && scene.voiceover));
const contentPlanDraft = buildStudioContentPlanDraft(signal, adaptation, selectedRemix);
assert.equal(contentPlanDraft.title, selectedRemix.title);
assert.match(contentPlanDraft.body, /Кадр:/);
assert.match(contentPlanDraft.body, /Текст на екрані:/);
assert.match(contentPlanDraft.body, /Озвучка:/);
assert.match(contentPlanDraft.body, /CTA:/);
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
  if (url.endsWith('/saved-urls/saved-youtube/adaptation?language=en')) {
    return response(200, { sourceType: 'personal_url', savedUrl, status: 'ready', adaptation });
  }
  if (url.endsWith('/saved-urls/saved-youtube/analyze-adapt')) {
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { language: 'en' });
    return response(201, { sourceType: 'personal_url', savedUrl, adaptation });
  }
  throw new Error(`unexpected URL: ${url}`);
};

const client = createProductDiscoveryClient({ apiBase: '/api', workspaceId: 'workspace-a', fetcher });
assert.equal((await client.loadSavedUrlAdaptation(savedUrl.id, 'en')).adaptation.id, adaptation.id);
assert.equal((await client.analyzeAdaptSavedUrl(savedUrl.id, 'en')).sourceType, 'personal_url');
assert.ok(calls.some(({ url }) => url.includes('/saved-urls/saved-youtube/adaptation?language=en')));
assert.ok(calls.some(({ url, options }) => url.includes('/saved-urls/saved-youtube/analyze-adapt') && options.method === 'POST'));
assert.equal(calls.some(({ url }) => url.includes('/adaptations/')), false, 'personal URL flow never calls shared adaptation API');

console.log('Product Personal URL adaptation lifecycle checks passed.');
