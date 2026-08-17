import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const previousGeminiKey = process.env.GEMINI_API_KEY;
const previousOpenAiKey = process.env.OPENAI_API_KEY;
process.env.GEMINI_API_KEY = 'offline-test-key';
process.env.OPENAI_API_KEY = '';

const originalFetch = globalThis.fetch;
let remixFetchCalls = 0;
let remixRequestBody = null;
let validProviderPayload = null;
globalThis.fetch = async (_url, options) => {
  remixFetchCalls += 1;
  remixRequestBody = JSON.parse(options.body);
  return {
    ok: true,
    async json() {
      return {
        candidates: [{ content: { parts: [{ text: JSON.stringify(validProviderPayload) }] } }],
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 1000, totalTokenCount: 2000 },
      };
    },
  };
};
const remixEngine = require('../backend/services/remixEngine.js');
const { analyzePublicVideoUrlWithGemini } = require('../backend/services/publicVideoGrounding.cjs');

const source = {
  title: 'A buyer receives a surprise bonus after choosing a product.',
  hook: 'The ordinary purchase turns into a visible surprise.',
  script: 'Show the choice, reveal the bonus, then capture the honest reaction.',
  marketingMechanics: 'choice -> reveal -> reaction',
};
const brief = {
  niche: 'Local retail',
  product: 'Handmade goods',
  location: 'Kyiv',
  toneOfVoice: 'friendly and direct',
};
validProviderPayload = remixEngine.generateHighFidelityFallback(source, brief);
try {
  await remixEngine.generateRemix(source, brief, {
    maxAttempts: 1,
    maxOutputTokens: 2560,
    maxRequestBytes: 12_000,
    language: 'en',
  });
  assert.equal(remixFetchCalls, 1);
  assert.equal(remixRequestBody.generationConfig.maxOutputTokens, 2560);
  const actualRequestBytes = Buffer.byteLength(JSON.stringify(remixRequestBody), 'utf8');
  assert.ok(actualRequestBytes <= 12_000, `offline remix fixture request is ${actualRequestBytes} bytes`);
  await assert.rejects(
    remixEngine.generateRemix(source, brief, {
      maxAttempts: 1,
      maxOutputTokens: 2560,
      maxRequestBytes: actualRequestBytes - 1,
      language: 'en',
    }),
  );
  assert.equal(remixFetchCalls, 1, 'oversized remix request must fail before provider fetch');
} finally {
  globalThis.fetch = originalFetch;
  if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousGeminiKey;
  if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousOpenAiKey;
}

let videoProviderCalls = 0;
let cleanedUploads = 0;
const oversizedVideoRequest = await analyzePublicVideoUrlWithGemini({
  platform: 'tiktok',
  sourceUrl: 'https://www.tiktok.com/@demo/video/123',
  apiKey: 'offline-test-key',
  model: 'gemini-3.6-flash',
  maxOutputTokens: 2048,
  maxRequestBytes: 1,
  resolveSocialSource: async () => ({
    sourceUrl: 'https://www.tiktok.com/@demo/video/123',
    videoUrl: 'https://cdn.example.com/video.mp4',
  }),
  uploadSocialVideo: async () => ({ name: 'files/offline', uri: 'files/offline', mimeType: 'video/mp4' }),
  deleteUploadedVideo: async () => { cleanedUploads += 1; },
  fetchImpl: async () => {
    videoProviderCalls += 1;
    throw new Error('video provider must not be called');
  },
});
assert.equal(videoProviderCalls, 0);
assert.equal(cleanedUploads, 1);
assert.equal(oversizedVideoRequest.status, 'unavailable');
assert.equal(oversizedVideoRequest.diagnostic.reasonCode, 'gemini_request_size_limit_exceeded');
assert.equal(oversizedVideoRequest.diagnostic.retryable, false);

let countTokenCalls = 0;
let boundedVideoGenerationCalls = 0;
let boundedVideoAttemptReservations = 0;
const tokenBoundedVideo = await analyzePublicVideoUrlWithGemini({
  platform: 'instagram',
  sourceUrl: 'https://www.instagram.com/reel/abc/',
  apiKey: 'offline-test-key',
  model: 'gemini-3.6-flash',
  maxInputTokens: 40_000,
  maxOutputTokens: 2048,
  maxRequestBytes: 100_000,
  resolveSocialSource: async () => ({
    sourceUrl: 'https://www.instagram.com/reel/abc/',
    videoUrl: 'https://cdn.example.com/video.mp4',
  }),
  uploadSocialVideo: async () => ({ name: 'files/token-bound', uri: 'files/token-bound', mimeType: 'video/mp4' }),
  deleteUploadedVideo: async () => {},
  beforeProviderAttempt: async () => { boundedVideoAttemptReservations += 1; },
  fetchImpl: async (url) => {
    if (String(url).endsWith(':countTokens')) {
      countTokenCalls += 1;
      return { ok: true, async json() { return { totalTokens: 40_001 }; } };
    }
    boundedVideoGenerationCalls += 1;
    throw new Error('generation must not start above the input-token cap');
  },
});
assert.equal(countTokenCalls, 1);
assert.equal(boundedVideoGenerationCalls, 0);
assert.equal(boundedVideoAttemptReservations, 0);
assert.equal(tokenBoundedVideo.diagnostic.reasonCode, 'gemini_input_token_limit_exceeded');
assert.equal(tokenBoundedVideo.diagnostic.retryable, false);

console.log('Personal URL Gemini generation cap checks passed.');
