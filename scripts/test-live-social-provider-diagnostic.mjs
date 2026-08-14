import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  analyzePublicVideoUrlWithGemini,
} = require('../backend/services/publicVideoGrounding.cjs');
const {
  resolveAgentStudioVideoSource,
} = require('../backend/services/agentStudioSourceResolver.cjs');
const {
  deleteGeminiFile,
  uploadGeminiVideoFromUrl,
} = require('../backend/services/agentStudioVideoTool.cjs');

const SOURCES = [{
  platform: 'instagram',
  sourceUrl: 'https://instagram.com/reel/DavSJU-OB_h',
  maxApifyAttempts: 2,
  apifyRunCapUsd: 0.05,
}, {
  platform: 'tiktok',
  sourceUrl: 'https://tiktok.com/@claude/video/7662041795798371597',
  maxApifyAttempts: 1,
  apifyRunCapUsd: 0.50,
}];

function compactSafeMessage(value, maxLength = 180) {
  return String(value || '')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(?:token|api[_-]?key)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function finiteCost(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function sanitizeProviderAttempts(attempts) {
  return (Array.isArray(attempts) ? attempts : []).slice(0, 3).map((attempt) => ({
    actor: compactSafeMessage(attempt?.actor, 80),
    outcome: compactSafeMessage(attempt?.outcome, 40),
    error: compactSafeMessage(attempt?.error, 140),
  }));
}

async function runDiagnostic({ platform, sourceUrl, maxApifyAttempts, apifyRunCapUsd }) {
  const startedAt = Date.now();
  const providerStages = [];
  const apifyUsage = [];
  const sourceResolution = [];
  const geminiResponses = [];
  const attemptCounts = { apify: 0, gemini: 0 };

  const beforeProviderAttempt = async (event = {}) => {
    const provider = event.provider === 'apify' ? 'apify' : 'gemini';
    attemptCounts[provider] += 1;
    providerStages.push({
      provider,
      operation: compactSafeMessage(event.operation, 80),
      model: compactSafeMessage(event.model, 100),
      attempt: attemptCounts[provider],
    });
    const limit = provider === 'apify' ? maxApifyAttempts : 1;
    if (attemptCounts[provider] > limit) {
      const error = new Error(`live_diagnostic_${provider}_attempt_limit`);
      error.code = `live_diagnostic_${provider}_attempt_limit`;
      error.providerAttemptBlocked = true;
      throw error;
    }
  };

  const fetchImpl = async (url, options = {}) => {
    const response = await fetch(url, options);
    if (String(url).endsWith('/interactions') || String(url).includes(':generateContent')) {
      const payload = await response.clone().json().catch(() => ({}));
      geminiResponses.push({
        endpoint: String(url).includes(':generateContent') ? 'generateContent' : 'interactions',
        httpStatus: response.status,
        interactionStatus: compactSafeMessage(payload?.status, 60),
        errorCode: compactSafeMessage(payload?.error?.code || payload?.error?.status, 80),
        errorMessage: compactSafeMessage(payload?.error?.message, 180),
        model: compactSafeMessage(payload?.model, 100),
        finishReason: compactSafeMessage(payload?.candidates?.[0]?.finishReason, 60),
        candidateCount: Array.isArray(payload?.candidates) ? payload.candidates.length : 0,
        usage: payload?.usageMetadata ? {
          promptTokenCount: Number(payload.usageMetadata.promptTokenCount || 0) || null,
          candidatesTokenCount: Number(payload.usageMetadata.candidatesTokenCount || 0) || null,
          totalTokenCount: Number(payload.usageMetadata.totalTokenCount || 0) || null,
        } : null,
      });
    }
    return response;
  };

  let result = null;
  let thrown = null;
  try {
    result = await analyzePublicVideoUrlWithGemini({
      platform,
      sourceUrl,
      metadata: { sourceType: 'live_social_provider_diagnostic' },
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_VIDEO_MODEL || 'gemini-3.6-flash',
      mediaApiToken: process.env.APIFY_TOKEN || '',
      fetchImpl,
      beforeProviderAttempt,
      uploadSocialVideo: uploadGeminiVideoFromUrl,
      deleteUploadedVideo: deleteGeminiFile,
      resolveSocialSource: async ({ beforeProviderAttempt: resolverGuard }) => {
        const resolved = await resolveAgentStudioVideoSource({
          token: process.env.APIFY_TOKEN || '',
          sourceUrl,
          workspaceId: 'live_social_provider_diagnostic',
          market: 'global',
          maxTotalChargeUsd: apifyRunCapUsd,
          beforeProviderAttempt: resolverGuard,
          onUsage: async (usage = {}) => {
            apifyUsage.push({
              actor: compactSafeMessage(usage.actor, 100),
              status: compactSafeMessage(usage.status, 40),
              actualCostUsd: finiteCost(usage.usageTotalUsd),
            });
          },
          invocationId: `live-diagnostic-${platform}`,
          phase: 'diagnostic',
        });
        sourceResolution.push({
          resolved: Boolean(resolved?.videoUrl),
          resolvedBy: compactSafeMessage(resolved?.resolvedBy, 80),
          attempts: sanitizeProviderAttempts(resolved?.attempts),
        });
        return resolved;
      },
    });
  } catch (error) {
    thrown = {
      code: compactSafeMessage(error?.code || error?.name, 100),
      message: compactSafeMessage(error?.message, 180),
    };
  }

  return {
    platform,
    elapsedMs: Date.now() - startedAt,
    status: result?.status || 'thrown',
    providerStages,
    sourceResolution,
    diagnostic: result?.diagnostic ? {
      stage: compactSafeMessage(result.diagnostic.stage, 80),
      reasonCode: compactSafeMessage(result.diagnostic.reasonCode, 100),
      retryable: Boolean(result.diagnostic.retryable),
      provider: result.diagnostic.provider ? {
        httpStatus: Number(result.diagnostic.provider.httpStatus || 0) || null,
        interactionStatus: compactSafeMessage(result.diagnostic.provider.interactionStatus, 60),
        model: compactSafeMessage(result.diagnostic.provider.model, 100),
      } : null,
    } : null,
    geminiResponses,
    apifyUsage,
    actualApifyCostUsd: apifyUsage.reduce((sum, item) => sum + (item.actualCostUsd || 0), 0),
    thrown,
  };
}

assert.ok(process.env.APIFY_TOKEN, 'APIFY_TOKEN must be supplied by the Railway staging environment');
assert.ok(process.env.GEMINI_API_KEY, 'GEMINI_API_KEY must be supplied by the Railway staging environment');

const results = [];
for (const source of SOURCES) {
  results.push(await runDiagnostic(source));
}

console.log(JSON.stringify({
  apifyRunCapsUsd: Object.fromEntries(SOURCES.map(({ platform, apifyRunCapUsd }) => [platform, apifyRunCapUsd])),
  maximumApifyCeilingUsd: 0.60,
  results,
}, null, 2));

for (const result of results) {
  assert.equal(result.status, 'available', `${result.platform}: live provider pipeline must return available evidence`);
}

console.log('GREEN: both live social provider diagnostics returned available grounded evidence.');
