import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  buildPersonalUrlAdaptationFailureState,
  mapSavedUrlToProductSignal,
} from '../src/productSavedUrlState.mjs';
import {
  deriveStudioAnalysis,
  deriveStudioTranscript,
  getStudioRemixes,
  normalizeStudioScriptScenes,
} from '../src/studioViewState.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_PATH = path.join(ROOT, 'backend', 'server.js');
const GROUNDING_PATH = path.join(ROOT, 'backend', 'services', 'publicVideoGrounding.cjs');
const require = createRequire(import.meta.url);

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

function hasPropertyRecursively(value, propertyName) {
  if (Array.isArray(value)) return value.some((item) => hasPropertyRecursively(item, propertyName));
  if (!value || typeof value !== 'object') return false;
  return Object.hasOwn(value, propertyName)
    || Object.values(value).some((item) => hasPropertyRecursively(item, propertyName));
}

const providerEvidence = {
  accessible: true,
  summary: 'A founder explains a workflow problem, demonstrates the handoff, and shows the corrected board.',
  spokenText: 'This handoff loses tasks. Here is the corrected owner flow.',
  spokenSegments: [
    { timeframe: '0:00-0:04', text: 'This handoff loses tasks.' },
    { timeframe: '0:04-0:09', text: 'Here is the corrected owner flow.' },
  ],
  onScreenText: 'ONE OWNER PER STEP',
  hook: 'A broken handoff is shown before the explanation.',
  contentMechanic: 'observable problem followed by a corrected process',
  observations: [
    { sourceType: 'video_observation', text: 'The speaker points to an unowned task on a real board.', timestamp: '0:01', confidence: 0.97 },
    { sourceType: 'audio_observation', text: 'The speaker explains why the handoff loses tasks.', timestamp: '0:02', confidence: 0.94 },
    { sourceType: 'on_screen_text', text: 'ONE OWNER PER STEP', timestamp: '0:07', confidence: 0.99 },
  ],
  scenes: [
    { timeframe: '0:00-0:04', visualAction: 'Point to the unowned task.', spokenContent: 'This handoff loses tasks.', onScreenText: 'MISSED OWNER', soundMusicCues: 'room tone' },
    { timeframe: '0:04-0:09', visualAction: 'Assign one owner and refresh the board.', spokenContent: 'Here is the corrected owner flow.', onScreenText: 'ONE OWNER', soundMusicCues: 'soft reveal hit' },
  ],
  shotList: ['Close-up of the task board', 'Medium shot of the corrected handoff'],
  soundMusicCues: ['quiet room tone', 'soft reveal hit'],
  confidence: 'high for speech, board state, and correction',
  limitations: ['Fine text outside the highlighted card is unreadable.'],
};

function providerEvidenceForLanguage(language) {
  const isEnglish = language === 'en';
  return {
    ...providerEvidence,
    summary: isEnglish
      ? 'A founder shows the corrected workflow after exposing the ownership gap.'
      : 'Засновник показує виправлений процес після демонстрації прогалини у відповідальності.',
    hook: isEnglish ? 'Expose the missing owner before the explanation.' : 'Спочатку покажи відсутнього відповідального, а потім пояснення.',
    contentMechanic: isEnglish ? 'observable ownership gap followed by a correction' : 'видима прогалина у відповідальності з подальшим виправленням',
    spokenText: 'Original spoken evidence stays in the source language.',
    spokenSegments: [{ timeframe: '0:00-0:04', text: 'Original spoken evidence stays in the source language.' }],
    onScreenText: 'ORIGINAL ROOT OCR',
    observations: [
      {
        sourceType: 'video_observation',
        text: isEnglish ? 'The founder points to the unowned task.' : 'Засновник показує задачу без відповідального.',
        timestamp: '0:01',
        confidence: 0.97,
      },
      {
        sourceType: 'on_screen_text',
        text: 'ORIGINAL OBSERVATION OCR',
        localizedText: isEnglish ? 'Localized observation OCR' : 'Локалізований OCR спостереження',
        timestamp: '0:02',
        confidence: 0.99,
      },
    ],
    scenes: [{
      timeframe: '0:00-0:04',
      visualAction: isEnglish ? 'Point to the task without an owner.' : 'Покажи задачу без відповідального.',
      spokenContent: 'Original scene speech stays in the source language.',
      onScreenText: 'ORIGINAL SCENE OCR',
      localizedOnScreenText: isEnglish ? 'Localized scene OCR' : 'Локалізований OCR сцени',
      soundMusicCues: isEnglish ? 'Quiet room tone' : 'Тихий кімнатний шум',
    }],
  };
}

function extractLegacyFunction(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Could not extract ${startMarker}`);
  return source.slice(start, end);
}

function createPersonalPublicVideoEnricher(grounded) {
  const source = readFileSync(SERVER_PATH, 'utf8');
  const enrich = extractLegacyFunction(
    source,
    'async function enrichPersonalPublicVideoIntelligence',
    'function enrichVideoIntelligenceForContext',
  );
  return vm.runInNewContext(`(() => { ${enrich}\nreturn enrichPersonalPublicVideoIntelligence; })()`, {
    GEMINI_API_KEY: 'test-key',
    analyzePublicVideoUrlWithGemini: async () => grounded,
    compactText: (value) => String(value || '').trim(),
    detectPublicVideoPlatform: (url) => String(url).includes('tiktok.com') ? 'tiktok' : 'instagram',
    normalizePersonalUrlLanguage: (value) => String(value || '').trim().toLowerCase() === 'en' ? 'en' : 'uk',
    process: { env: {} },
  });
}

async function runLegacyStepsRegression() {
  const source = readFileSync(SERVER_PATH, 'utf8');
  const parseJson = extractLegacyFunction(source, 'function parseGeminiJson', 'async function analyzeSourceImageWithGemini');
  const analyze = extractLegacyFunction(source, 'async function analyzeYouTubeVideoWithGemini', 'function buildVideoIntelligenceReadiness');
  const calls = [];
  const context = {
    GEMINI_API_KEY: 'test-key',
    GEMINI_API_BASE: 'https://gemini.test/v1beta',
    GEMINI_VISION_MODEL: 'gemini-test',
    compactText: (value) => String(value || '').trim(),
    fetch: async (url, options) => {
      calls.push({ url, options });
      return response({
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(providerEvidence) }] }],
      });
    },
    process: { env: { GEMINI_VIDEO_MODEL: 'gemini-test' } },
    URL,
  };
  const analyzeLegacy = vm.runInNewContext(`(() => { ${parseJson}\n${analyze}\nreturn analyzeYouTubeVideoWithGemini; })()`, context);
  const result = await analyzeLegacy({
    url: 'https://www.youtube.com/watch?v=steps123',
    title: 'Public conversation',
    description: 'A public conversational video.',
    handle: '@creator',
    stats: {},
    youtube: { videoId: 'steps123' },
  });
  assert.equal(calls.length, 1);
  assert.equal(result.status, 'available', 'raw Interactions steps[] output must become grounded video evidence');
  assert.equal(result.spokenText, providerEvidence.spokenText);
}

function buildAdaptation(sourceContext) {
  return {
    id: 'adaptation_public_video',
    sourceContext,
    result: {
      remixes: [1, 2, 3].map((index) => ({
        title: `Adapted workflow scenario ${index}`,
        hook: `Show the missed handoff first — take ${index}.`,
        visualFlow: [
          {
            timeframe: '0:00-0:04',
            actionDescription: 'Film the real task board and point to the task without an owner.',
            onScreenText: 'ХТО ВЛАСНИК?',
            audioVoiceover: 'Ця задача губиться, бо в неї немає одного власника.',
          },
          {
            timeframe: '0:04-0:09',
            actionDescription: 'Assign one owner, refresh the board, and show the corrected handoff.',
            onScreenText: 'ОДИН КРОК — ОДИН ВЛАСНИК',
            audioVoiceover: 'Призначаємо одного власника й одразу бачимо весь маршрут задачі.',
          },
        ],
        cta: 'Напиши «АУДИТ», щоб перевірити свій процес.',
      })),
    },
  };
}

async function runGroundingContract() {
  const {
    analyzePublicVideoUrlWithGemini,
    classifyPublicVideoProviderFailure,
    getPublicVideoPlatformCapability,
  } = require(GROUNDING_PATH);

  assert.deepEqual(getPublicVideoPlatformCapability('youtube'), {
    platform: 'youtube',
    supported: true,
    acquisition: 'gemini_public_youtube_url',
    fallback: 'user_owned_upload_or_owner_authorized_captions',
  });
  for (const [platform, acquisition] of [
    ['instagram', 'apify_instagram_video_then_gemini'],
    ['tiktok', 'apify_tiktok_video_then_gemini'],
  ]) {
    const capability = getPublicVideoPlatformCapability(platform);
    assert.equal(capability.platform, platform);
    assert.equal(capability.supported, true);
    assert.equal(capability.acquisition, acquisition);
    assert.equal(capability.fallback, 'user_owned_upload_or_owner_authorized_captions');
  }

  const calls = [];
  const youtube = await analyzePublicVideoUrlWithGemini({
    platform: 'youtube',
    sourceUrl: 'https://youtube.com/watch?v=steps123',
    metadata: { title: 'Untrusted metadata title', description: 'Untrusted metadata description' },
    apiKey: 'test-key',
    model: 'gemini-test',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({
        status: 'completed',
        model: 'gemini-test',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(providerEvidence) }] }],
        usage: { total_input_tokens: 900, total_output_tokens: 240, total_tokens: 1140 },
      });
    },
  });
  assert.equal(calls.length, 1, 'one saved URL run performs at most one video-analysis call');
  const requestBody = JSON.parse(calls[0].options.body);
  assert.equal(requestBody.input.filter((part) => part.type === 'video').length, 1);
  assert.equal(requestBody.input[0].uri, 'https://youtube.com/watch?v=steps123');
  assert.equal(requestBody.response_format.type, 'text');
  assert.equal(requestBody.response_format.mime_type, 'application/json');
  assert.equal(
    hasPropertyRecursively(requestBody.response_format.schema, 'additionalProperties'),
    true,
    'YouTube Interactions keeps the original response schema unchanged',
  );
  assert.equal(youtube.status, 'available');
  assert.equal(youtube.video.status, 'available');
  assert.equal(youtube.video.videoInput.uri, 'https://youtube.com/watch?v=steps123');
  assert.equal(youtube.transcript.status, 'available');
  assert.equal(youtube.transcript.text, providerEvidence.spokenText);
  assert.equal(youtube.visual.status, 'available');
  assert.equal(youtube.analysis.status, 'available');
  assert.equal(youtube.diagnostic, null);

  for (const language of ['uk', 'en']) {
    const languageCalls = [];
    const expected = providerEvidenceForLanguage(language);
    const localized = await analyzePublicVideoUrlWithGemini({
      platform: 'youtube',
      sourceUrl: `https://youtube.com/watch?v=localized-${language}`,
      apiKey: 'test-key',
      language,
      fetchImpl: async (url, options) => {
        languageCalls.push({ url, options });
        return response({
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(expected) }] }],
        });
      },
    });
    const request = JSON.parse(languageCalls[0].options.body);
    const prompt = request.input.find((part) => part.type === 'text')?.text || '';
    assert.match(prompt, language === 'en' ? /descriptive fields in English/ : /descriptive fields in Ukrainian/);
    assert.match(prompt, /never translate or replace them/);
    assert.equal(request.response_format.schema.properties.observations.items.properties.localizedText.type, 'string');
    assert.equal(request.response_format.schema.properties.scenes.items.properties.localizedOnScreenText.type, 'string');
    assert.equal(localized.language, language);
    assert.equal(localized.video.analysisLanguage, language);
    assert.equal(localized.analysis.language, language);
    assert.equal(localized.video.videoSummary, expected.summary, 'descriptive video fields follow the requested workspace language');
    assert.equal(localized.transcript.text, 'Original spoken evidence stays in the source language.');
    assert.equal(localized.video.onScreenText, 'ORIGINAL ROOT OCR');
    assert.deepEqual(localized.video.observations.find((item) => item.sourceType === 'on_screen_text'), {
      sourceType: 'on_screen_text',
      text: 'ORIGINAL OBSERVATION OCR',
      localizedText: expected.observations[1].localizedText,
      timestamp: '0:02',
      confidence: 0.99,
    });
    assert.deepEqual(localized.video.scenes[0], {
      ...expected.scenes[0],
    });
  }

  const audioOnly = await analyzePublicVideoUrlWithGemini({
    platform: 'youtube',
    sourceUrl: 'https://youtube.com/watch?v=audio123',
    apiKey: 'test-key',
    fetchImpl: async () => response({
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify({
        ...providerEvidence,
        observations: [{ sourceType: 'audio_observation', timestamp: '0:01', text: 'An owner explains the handoff.', confidence: 0.96 }],
        scenes: [],
        shotList: [],
      }) }] }],
    }),
  });
  assert.equal(audioOnly.status, 'available');
  assert.equal(audioOnly.transcript.status, 'available');
  assert.equal(audioOnly.visual.status, 'unavailable', 'audio evidence must not be relabeled as visual evidence');
  assert.equal(audioOnly.visual.visualSummary, '');

  const socialSourceIdentityResults = [];
  for (const platform of ['instagram', 'tiktok']) {
    const sourceUrl = platform === 'tiktok'
      ? 'https://tiktok.com/@creator/video/123456789'
      : 'https://instagram.com/reel/abc123';
    const playableUrl = platform === 'instagram'
      ? 'https://api.apify.com/v2/key-value-stores/test/records/instagram.mp4'
      : 'https://cdn.example.test/tiktok.mp4';
    const sourceTitle = `Offline ${platform} source title`;
    const sourceHandle = `@offline_${platform}_creator`;
    const sourcePoster = `https://cdn.example.test/${platform}-poster.jpg`;
    const uploadedFile = {
      name: `files/${platform}-saved-url`,
      uri: `https://gemini.test/files/${platform}-saved-url`,
      mimeType: 'video/mp4',
    };
    const sequence = [];
    let resolverInput = null;
    let uploadInput = null;
    let providerUrl = null;
    let providerBody = null;
    let cleanupInput = null;
    const social = await analyzePublicVideoUrlWithGemini({
      platform,
      sourceUrl,
      metadata: { title: 'Metadata must not become analysis.' },
      apiKey: 'test-key',
      model: 'gemini-test',
      maxOutputTokens: 2048,
      maxRequestBytes: 100_000,
      maxVideoDurationSeconds: 60,
      requireVideoDuration: true,
      mediaApiToken: 'test-apify-token',
      resolveSocialSource: async (input) => {
        sequence.push('resolve');
        resolverInput = input;
        return {
          sourceUrl,
          videoUrl: playableUrl,
          title: sourceTitle,
          handle: sourceHandle,
          image: sourcePoster,
          resolvedBy: 'offline-social-resolver',
          importedMetadata: {
            title: sourceTitle,
            handle: sourceHandle,
            image: sourcePoster,
            apify: { videoUrl: playableUrl, mediaUrls: [playableUrl] },
          },
        };
      },
      uploadSocialVideo: async (input) => {
        sequence.push('upload');
        uploadInput = input;
        return uploadedFile;
      },
      fetchImpl: async (url, options) => {
        sequence.push('interaction');
        providerUrl = String(url);
        providerBody = JSON.parse(options.body);
        return response({
          candidates: [{ content: { parts: [{ text: JSON.stringify(providerEvidence) }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 240, totalTokenCount: 1140 },
        });
      },
      deleteUploadedVideo: async (input) => {
        sequence.push('cleanup');
        cleanupInput = input;
      },
    });
    assert.deepEqual(sequence, ['resolve', 'upload', 'interaction', 'cleanup'], `${platform} acquisition is bounded and always cleans up`);
    assert.equal(resolverInput.platform, platform);
    assert.equal(resolverInput.sourceUrl, sourceUrl);
    assert.equal(uploadInput.sourceUrl, playableUrl);
    assert.equal(uploadInput.maxDurationSeconds, 60);
    assert.equal(uploadInput.requireDuration, true);
    assert.deepEqual(
      uploadInput.requestHeaders,
      platform === 'instagram' ? { Authorization: 'Bearer test-apify-token' } : {},
      `${platform}: Apify token must only be sent to the Apify API host`,
    );
    assert.match(providerUrl, /\/v1beta\/models\/gemini-test:generateContent$/);
    assert.equal(providerBody.contents[0].parts[0].file_data.file_uri, uploadedFile.uri, `${platform} Gemini receives acquired media, not the public page`);
    assert.equal(providerBody.contents[0].parts[0].file_data.mime_type, uploadedFile.mimeType);
    assert.match(providerBody.contents[0].parts[1].text, /descriptive fields in Ukrainian/);
    assert.equal(providerBody.generationConfig.responseMimeType, 'application/json');
    assert.equal(providerBody.generationConfig.maxOutputTokens, 2048);
    assert.equal(providerBody.generationConfig.responseSchema.type, 'object');
    assert.ok(providerBody.generationConfig.responseSchema.required.includes('observations'));
    assert.equal(providerBody.generationConfig.responseSchema.properties.observations.type, 'array');
    assert.equal(providerBody.generationConfig.responseSchema.properties.observations.items.properties.text.type, 'string');
    assert.equal(providerBody.generationConfig.responseSchema.properties.observations.items.properties.localizedText.type, 'string');
    assert.equal(providerBody.generationConfig.responseSchema.properties.scenes.items.properties.localizedOnScreenText.type, 'string');
    assert.equal(
      hasPropertyRecursively(providerBody.generationConfig.responseSchema, 'additionalProperties'),
      false,
      `${platform}: generateContent receives the Gemini-supported schema subset`,
    );
    assert.equal(cleanupInput.fileName, uploadedFile.name);
    assert.equal(social.status, 'available');
    assert.equal(social.video.status, 'available');
    assert.equal(social.video.videoInput.uri, sourceUrl);
    assert.equal(social.transcript.status, 'available');
    assert.equal(social.transcript.text, providerEvidence.spokenText);
    assert.equal(social.visual.status, 'available');
    assert.equal(social.analysis.status, 'available');
    assert.equal(social.diagnostic, null);
    assert.deepEqual(social.usage, { promptTokenCount: 900, candidatesTokenCount: 240, totalTokenCount: 1140 });

    const enrichPersonalPublicVideoIntelligence = createPersonalPublicVideoEnricher(social);
    const enrichedMetadata = await enrichPersonalPublicVideoIntelligence({
      source: { label: platform, tone: platform },
      url: sourceUrl,
      title: '',
      handle: '',
      image: '',
      sourceStatus: 'url_only',
      analysisText: sourceUrl,
    });
    const savedUrlSignal = mapSavedUrlToProductSignal({
      id: `saved_${platform}`,
      platform,
      canonicalUrl: sourceUrl,
      originalUrl: sourceUrl,
    }, {
      sourceContext: {
        title: enrichedMetadata.title,
        handle: enrichedMetadata.handle,
        metadata: enrichedMetadata,
      },
    });
    socialSourceIdentityResults.push({
      platform,
      grounding: {
        title: social.title,
        handle: social.handle,
        image: social.image,
      },
      studio: {
        title: savedUrlSignal.title,
        handle: savedUrlSignal.handle,
        image: savedUrlSignal.image,
        thumbnail: savedUrlSignal.thumbnail,
      },
    });
  }
  assert.deepEqual(
    socialSourceIdentityResults,
    ['instagram', 'tiktok'].map((platform) => ({
      platform,
      grounding: {
        title: `Offline ${platform} source title`,
        handle: `@offline_${platform}_creator`,
        image: `https://cdn.example.test/${platform}-poster.jpg`,
      },
      studio: {
        title: `Offline ${platform} source title`,
        handle: `@offline_${platform}_creator`,
        image: `https://cdn.example.test/${platform}-poster.jpg`,
        thumbnail: `https://cdn.example.test/${platform}-poster.jpg`,
      },
    })),
    'resolved social title, handle, and poster must survive grounding into the Saved URL Studio signal',
  );

  let failedUploadCalled = false;
  let failedInteractionCalled = false;
  let failedCleanupCalled = false;
  const overlongResolutionActor = 'x'.repeat(180);
  const unavailableSocial = await analyzePublicVideoUrlWithGemini({
    platform: 'instagram',
    sourceUrl: 'https://instagram.com/reel/unavailable123',
    apiKey: 'test-key',
    mediaApiToken: 'test-apify-token',
    resolveSocialSource: async () => ({
      unresolved: true,
      sourceUrl: 'https://instagram.com/reel/unavailable123',
      platform: 'instagram',
      attempts: [{
        actor: 'apify/instagram-reel-scraper',
        outcome: 'empty',
        error: 'raw provider detail must not cross the grounding boundary',
      }, {
        actor: overlongResolutionActor,
        outcome: 'failed',
      }, {
        actor: 'ignored/untrusted-outcome',
        outcome: 'provider_payload',
      }, {
        actor: 'apify/instagram-scraper',
        outcome: 'blocked_by_cap',
      }, {
        actor: 'clockworks/tiktok-scraper',
        outcome: 'failed',
      }, {
        actor: 'ignored/overflow',
        outcome: 'empty',
      }],
    }),
    uploadSocialVideo: async () => { failedUploadCalled = true; return null; },
    fetchImpl: async () => { failedInteractionCalled = true; return response({}); },
    deleteUploadedVideo: async () => { failedCleanupCalled = true; },
  });
  assert.equal(failedUploadCalled, false, 'unresolved social acquisition must not upload an empty source');
  assert.equal(failedInteractionCalled, false, 'unresolved social acquisition must not call Gemini');
  assert.equal(failedCleanupCalled, false, 'no cleanup call is needed when no upload was created');
  assert.equal(unavailableSocial.status, 'unavailable');
  assert.equal(unavailableSocial.video.status, 'unavailable');
  assert.equal(unavailableSocial.transcript.text, '');
  assert.deepEqual(unavailableSocial.analysis.items, []);
  assert.equal(unavailableSocial.diagnostic.platform, 'instagram');
  assert.equal(unavailableSocial.diagnostic.stage, 'source_resolution');
  assert.equal(unavailableSocial.diagnostic.reasonCode, 'social_video_unavailable');
  assert.equal(unavailableSocial.diagnostic.retryable, true);
  assert.equal(unavailableSocial.diagnostic.fallback, 'user_owned_upload_or_owner_authorized_captions');
  assert.deepEqual(unavailableSocial.diagnostic.sourceResolutionAttempts, [{
    actor: 'apify/instagram-reel-scraper',
    outcome: 'empty',
  }, {
    actor: `${'x'.repeat(119)}…`,
    outcome: 'failed',
  }, {
    actor: 'apify/instagram-scraper',
    outcome: 'blocked_by_cap',
  }, {
    actor: 'clockworks/tiktok-scraper',
    outcome: 'failed',
  }], 'terminal diagnostics must preserve only sanitized source-resolution actor/outcome details');

  const rejected = await analyzePublicVideoUrlWithGemini({
    platform: 'youtube',
    sourceUrl: 'https://youtube.com/watch?v=private123',
    metadata: { title: 'Private title must not ground the result.' },
    apiKey: 'test-key',
    fetchImpl: async () => response({ error: { message: 'The video is private or requires login.' } }, { ok: false, status: 400 }),
  });
  assert.equal(rejected.status, 'unavailable');
  assert.equal(rejected.transcript.text, '');
  assert.deepEqual(rejected.analysis.items, []);
  assert.equal(rejected.diagnostic.reasonCode, 'source_private_or_login_required');
  assert.equal(rejected.diagnostic.provider.httpStatus, 400);
  assert.equal(Object.hasOwn(rejected.diagnostic.provider, 'message'), false, 'raw provider messages are never returned');

  assert.equal(classifyPublicVideoProviderFailure({ status: 403, message: 'region restriction' }), 'source_region_restricted');
  assert.equal(classifyPublicVideoProviderFailure({ status: 429, message: 'rate limit' }), 'provider_rate_limited');
  assert.equal(classifyPublicVideoProviderFailure({ status: 503, message: 'temporarily unavailable' }), 'provider_unavailable');

  const metadataOnly = await analyzePublicVideoUrlWithGemini({
    platform: 'youtube',
    sourceUrl: 'https://youtube.com/watch?v=empty123',
    metadata: { title: 'A persuasive metadata title', description: 'Claims a dramatic result.' },
    apiKey: 'test-key',
    fetchImpl: async () => response({
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify({
        ...providerEvidence,
        accessible: false,
        summary: 'A persuasive metadata title',
        spokenText: '',
        spokenSegments: [],
        observations: [],
        scenes: [],
      }) }] }],
    }),
  });
  assert.equal(metadataOnly.status, 'unavailable');
  assert.equal(metadataOnly.transcript.text, '');
  assert.deepEqual(metadataOnly.analysis.items, []);
  assert.equal(metadataOnly.diagnostic.reasonCode, 'provider_source_inaccessible');

  let invalidHostCalled = false;
  const invalidHost = await analyzePublicVideoUrlWithGemini({
    platform: 'youtube',
    sourceUrl: 'https://example.com/not-a-youtube-video',
    apiKey: 'test-key',
    fetchImpl: async () => { invalidHostCalled = true; return response({}); },
  });
  assert.equal(invalidHostCalled, false);
  assert.equal(invalidHost.diagnostic.reasonCode, 'source_url_invalid');

  const entitlementError = Object.assign(new Error('ai_provider_capacity_reached'), {
    status: 402,
    providerAttemptBlocked: true,
    payload: { error: 'ai_provider_capacity_reached' },
  });
  let blockedFetchCalled = false;
  await assert.rejects(
    analyzePublicVideoUrlWithGemini({
      platform: 'youtube',
      sourceUrl: 'https://youtube.com/watch?v=blocked123',
      apiKey: 'test-key',
      beforeProviderAttempt: async () => { throw entitlementError; },
      fetchImpl: async () => { blockedFetchCalled = true; return response({}); },
    }),
    (error) => error === entitlementError,
  );
  assert.equal(blockedFetchCalled, false, 'billing guard failures preserve existing plan semantics and stop before the provider');

  const sourceContext = {
    sourceType: 'personal_url',
    savedUrlId: 'saved_steps123',
    title: 'Grounded public conversation',
    description: 'Grounded through the public video provider.',
    handle: '@creator',
    metadata: { title: 'Grounded public conversation', sourceStatus: 'public_metadata' },
    transcript: youtube.transcript,
    videoIntelligence: { video: youtube.video, visual: youtube.visual, transcript: youtube.transcript },
    visual: youtube.visual,
    analysis: youtube.analysis,
    grounding: {
      status: 'full',
      mode: 'video',
      videoInput: youtube.video.videoInput,
      transcript: { status: 'available', trusted: true, source: youtube.transcript.source },
      evidence: { metadata: true, video: true, transcript: true },
    },
    sourceStatus: 'public_video_grounded',
  };
  const savedUrl = {
    id: 'saved_steps123',
    platform: 'youtube',
    canonicalUrl: 'https://youtube.com/watch?v=steps123',
    originalUrl: 'https://youtu.be/steps123',
  };
  const adaptation = buildAdaptation(sourceContext);
  const signal = mapSavedUrlToProductSignal(savedUrl, adaptation);
  assert.equal(deriveStudioTranscript(signal).status, 'available');
  assert.equal(deriveStudioAnalysis(signal).status, 'available');
  assert.equal(getStudioRemixes(signal, adaptation).length, 3, 'all useful adaptations remain available');
  const scenes = normalizeStudioScriptScenes(signal, adaptation);
  assert.equal(scenes.length, 2, 'Script Editor receives a structured shootable scenario');
  scenes.forEach((scene) => {
    assert.ok(scene.time);
    assert.ok(scene.direction);
    assert.ok(scene.onScreenText);
    assert.ok(scene.voiceover);
  });

  const diagnostic = {
    platform: 'tiktok',
    stage: 'capability',
    reasonCode: 'public_url_analysis_unsupported',
    retryable: false,
    fallback: 'user_owned_upload_or_owner_authorized_captions',
  };
  assert.deepEqual(
    buildPersonalUrlAdaptationFailureState('saved_url_source_unavailable', adaptation, diagnostic),
    { status: 'ready', adaptation, errorCode: 'saved_url_source_unavailable', diagnostic },
    'failed refresh keeps the old adaptation while exposing the truthful diagnostic',
  );
  assert.deepEqual(
    buildPersonalUrlAdaptationFailureState('saved_url_source_unavailable', null, diagnostic),
    { status: 'error', adaptation: null, errorCode: 'saved_url_source_unavailable', diagnostic },
    'an unavailable first analysis remains openable as an explicit error state',
  );

  const studioSource = readFileSync(path.join(ROOT, 'src', 'components', 'ProductStudioPreview.jsx'), 'utf8');
  const homeSource = readFileSync(path.join(ROOT, 'src', 'components', 'ProductHomePreview.jsx'), 'utf8');
  const serverSource = readFileSync(SERVER_PATH, 'utf8');
  const groundingSource = readFileSync(GROUNDING_PATH, 'utf8');
  assert.match(studioSource, /SourceDiagnosticBanner/);
  assert.match(homeSource, /error\?\.payload\?\.diagnostic/);
  assert.match(homeSource, /diagnostic\?\.retryable\s*!==\s*false/);
  assert.match(homeSource, /onOpenSavedUrlStudio\?\.\(savedUrl\)/);
  assert.match(serverSource, /diagnostic:\s*sourceContext\.diagnostic/);
  assert.match(serverSource, /publicVideoGrounding:\s*true/);
  assert.match(groundingSource, /resolveSocialSource/);
  assert.match(groundingSource, /:generateContent/);
  assert.match(serverSource, /INSTAGRAM_SAVED_URL_APIFY_MAX_TOTAL_CHARGE_USD\s*=\s*0\.05/);
  assert.match(serverSource, /TIKTOK_SAVED_URL_APIFY_MAX_TOTAL_CHARGE_USD\s*=\s*0\.50/);
  assert.doesNotMatch(groundingSource, /yt-dlp|youtube-dl|playwright|puppeteer/i);
}

if (existsSync(GROUNDING_PATH)) {
  await runGroundingContract();
  console.log('GREEN: public video grounding adapters, diagnostics, Studio state, and script contract passed.');
} else {
  await runLegacyStepsRegression();
  console.log('Unexpectedly green: legacy personal URL video parser handled raw steps output.');
}
