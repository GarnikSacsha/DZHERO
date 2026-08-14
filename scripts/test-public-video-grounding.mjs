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

function extractLegacyFunction(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Could not extract ${startMarker}`);
  return source.slice(start, end);
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
  assert.equal(youtube.status, 'available');
  assert.equal(youtube.video.status, 'available');
  assert.equal(youtube.video.videoInput.uri, 'https://youtube.com/watch?v=steps123');
  assert.equal(youtube.transcript.status, 'available');
  assert.equal(youtube.transcript.text, providerEvidence.spokenText);
  assert.equal(youtube.visual.status, 'available');
  assert.equal(youtube.analysis.status, 'available');
  assert.equal(youtube.diagnostic, null);

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

  for (const platform of ['instagram', 'tiktok']) {
    const sourceUrl = platform === 'tiktok'
      ? 'https://tiktok.com/@creator/video/123456789'
      : 'https://instagram.com/reel/abc123';
    const playableUrl = platform === 'instagram'
      ? 'https://api.apify.com/v2/key-value-stores/test/records/instagram.mp4'
      : 'https://cdn.example.test/tiktok.mp4';
    const uploadedFile = {
      name: `files/${platform}-saved-url`,
      uri: `https://gemini.test/files/${platform}-saved-url`,
      mimeType: 'video/mp4',
    };
    const sequence = [];
    let resolverInput = null;
    let uploadInput = null;
    let interactionBody = null;
    let cleanupInput = null;
    const social = await analyzePublicVideoUrlWithGemini({
      platform,
      sourceUrl,
      metadata: { title: 'Metadata must not become analysis.' },
      apiKey: 'test-key',
      model: 'gemini-test',
      mediaApiToken: 'test-apify-token',
      resolveSocialSource: async (input) => {
        sequence.push('resolve');
        resolverInput = input;
        return {
          sourceUrl,
          videoUrl: playableUrl,
          resolvedBy: 'offline-social-resolver',
          importedMetadata: { apify: { videoUrl: playableUrl, mediaUrls: [playableUrl] } },
        };
      },
      uploadSocialVideo: async (input) => {
        sequence.push('upload');
        uploadInput = input;
        return uploadedFile;
      },
      fetchImpl: async (url, options) => {
        sequence.push('interaction');
        interactionBody = JSON.parse(options.body);
        return response({
          status: 'completed',
          model: 'gemini-test',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(providerEvidence) }] }],
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
    assert.deepEqual(
      uploadInput.requestHeaders,
      platform === 'instagram' ? { Authorization: 'Bearer test-apify-token' } : {},
      `${platform}: Apify token must only be sent to the Apify API host`,
    );
    assert.equal(interactionBody.input[0].uri, uploadedFile.uri, `${platform} Gemini receives acquired media, not the public page`);
    assert.equal(interactionBody.input[0].mime_type, uploadedFile.mimeType);
    assert.equal(cleanupInput.fileName, uploadedFile.name);
    assert.equal(social.status, 'available');
    assert.equal(social.video.status, 'available');
    assert.equal(social.video.videoInput.uri, sourceUrl);
    assert.equal(social.transcript.status, 'available');
    assert.equal(social.transcript.text, providerEvidence.spokenText);
    assert.equal(social.visual.status, 'available');
    assert.equal(social.analysis.status, 'available');
    assert.equal(social.diagnostic, null);
  }

  let failedUploadCalled = false;
  let failedInteractionCalled = false;
  let failedCleanupCalled = false;
  const unavailableSocial = await analyzePublicVideoUrlWithGemini({
    platform: 'instagram',
    sourceUrl: 'https://instagram.com/reel/unavailable123',
    apiKey: 'test-key',
    mediaApiToken: 'test-apify-token',
    resolveSocialSource: async () => ({
      unresolved: true,
      sourceUrl: 'https://instagram.com/reel/unavailable123',
      platform: 'instagram',
      attempts: [{ actor: 'platform-default', outcome: 'empty' }],
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
  assert.doesNotMatch(groundingSource, /yt-dlp|youtube-dl|playwright|puppeteer/i);
}

if (existsSync(GROUNDING_PATH)) {
  await runGroundingContract();
  console.log('GREEN: public video grounding adapters, diagnostics, Studio state, and script contract passed.');
} else {
  await runLegacyStepsRegression();
  console.log('Unexpectedly green: legacy personal URL video parser handled raw steps output.');
}
