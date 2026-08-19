'use strict';

const { createHash } = require('node:crypto');
const { generateRemix } = require('./remixEngine.js');
const {
  DEFAULT_REMIX_MAX_INPUT_TOKENS,
  DEFAULT_REMIX_MAX_REQUEST_BYTES,
  DEFAULT_REMIX_MAX_OUTPUT_TOKENS,
  DEFAULT_REMIX_RETRY_MAX_OUTPUT_TOKENS,
  DEFAULT_REMIX_VARIANT_COUNT,
  DEFAULT_REMIX_REQUEST_OVERHEAD_BYTES,
  boundedPositiveInteger,
  getRemixGenerationConfig,
} = require('./remixConfig.cjs');

function cloneJsonValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function inferPlatform(source = {}) {
  const explicit = compactText(source.platform).toLowerCase();
  if (explicit) return explicit;
  const label = compactText(source.metadata?.source?.label || source.source?.label).toLowerCase();
  const url = compactText(source.canonicalUrl || source.url || source.sourceUrl).toLowerCase();
  if (label.includes('youtube') || url.includes('youtu')) return 'youtube';
  if (label.includes('tiktok') || url.includes('tiktok')) return 'tiktok';
  if (label.includes('instagram') || url.includes('instagram')) return 'instagram';
  return 'unknown';
}

function normalizeTranscript(source = {}, videoIntelligence = {}) {
  const candidate = source.transcript && typeof source.transcript === 'object'
    ? source.transcript
    : videoIntelligence.transcript && typeof videoIntelligence.transcript === 'object'
      ? videoIntelligence.transcript
      : {};
  const text = compactText(candidate.text || source.transcriptText);
  return {
    ...cloneJsonValue(candidate),
    status: compactText(candidate.status) || (text ? 'available' : 'unavailable'),
    text,
    segments: Array.isArray(candidate.segments) ? cloneJsonValue(candidate.segments) : [],
  };
}

function normalizeRemixSourceContext(value = {}, options = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
    ? cloneJsonValue(source.metadata)
    : {};
  const videoIntelligence = source.videoIntelligence && typeof source.videoIntelligence === 'object'
    ? cloneJsonValue(source.videoIntelligence)
    : metadata.videoIntelligence && typeof metadata.videoIntelligence === 'object'
      ? cloneJsonValue(metadata.videoIntelligence)
      : {};
  const transcript = normalizeTranscript(source, videoIntelligence);
  const visual = source.visual && typeof source.visual === 'object'
    ? cloneJsonValue(source.visual)
    : videoIntelligence.visual && typeof videoIntelligence.visual === 'object'
      ? cloneJsonValue(videoIntelligence.visual)
      : null;
  const url = compactText(source.canonicalUrl || source.url || source.sourceUrl || metadata.url);
  const title = compactText(source.title || metadata.title);
  const description = compactText(source.description || metadata.description);
  const handle = compactText(source.handle || source.author || metadata.handle);
  const sourceEvidence = source.sourceEvidence && typeof source.sourceEvidence === 'object'
    ? cloneJsonValue(source.sourceEvidence)
    : null;
  return {
    sourceType: compactText(source.sourceType || options.sourceType) || 'canonical_video',
    sourceId: compactText(source.sourceId || source.savedUrlId || source.signalId || options.sourceId),
    savedUrlId: compactText(source.savedUrlId),
    signalId: compactText(source.signalId),
    originalUrl: compactText(source.originalUrl || url),
    canonicalUrl: url,
    platform: inferPlatform({ ...source, metadata }),
    title,
    description,
    handle,
    metadata,
    transcript,
    videoIntelligence,
    visual,
    analysis: source.analysis && typeof source.analysis === 'object' ? cloneJsonValue(source.analysis) : null,
    sourceEvidence,
    sourceStatus: compactText(source.sourceStatus || metadata.sourceStatus),
    readiness: cloneJsonValue(source.readiness || videoIntelligence.readiness || null),
    grounding: cloneJsonValue(source.grounding || source.sourceGrounding || sourceEvidence?.grounding || null),
    diagnostic: cloneJsonValue(source.diagnostic || videoIntelligence.diagnostic || null),
    globalInsight: source.globalInsight && typeof source.globalInsight === 'object'
      ? cloneJsonValue(source.globalInsight)
      : null,
    missing: Array.isArray(source.missing) ? cloneJsonValue(source.missing) : [],
  };
}

function firstValue(...values) {
  return values.find((value) => {
    if (typeof value === 'string') return Boolean(compactText(value));
    if (Array.isArray(value)) return value.length > 0;
    return value && typeof value === 'object' && Object.keys(value).length > 0;
  });
}

function uniqueArray(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function estimateTokensFromBytes(bytes) {
  return Math.ceil(Math.max(0, bytes) / 4);
}

function createInputBudgetError(diagnostic) {
  const error = new Error('remix_input_budget_exceeded');
  error.code = 'remix_input_budget_exceeded';
  error.status = 413;
  error.payload = {
    error: 'remix_input_budget_exceeded',
    message: 'The source evidence is too large for a safe adaptation request.',
    diagnostic,
  };
  return error;
}

function buildRemixGenerationPayload(sourceContext, generationBrand = {}, options = {}) {
  const normalized = normalizeRemixSourceContext(sourceContext);
  const intelligence = normalized.videoIntelligence || {};
  const video = intelligence.video && typeof intelligence.video === 'object' ? intelligence.video : {};
  const visual = normalized.visual || intelligence.visual || {};
  const qualityGate = normalized.sourceEvidence?.qualityGate || intelligence.sourceQualityGate || {};
  const transcriptSegments = Array.isArray(normalized.transcript?.segments)
    ? normalized.transcript.segments.filter((segment) => segment && compactText(segment.text))
    : [];
  const removedDuplicates = [];
  const transcript = transcriptSegments.length
    ? { status: normalized.transcript.status, language: normalized.transcript.language || '', segments: cloneJsonValue(transcriptSegments) }
    : { status: normalized.transcript.status, language: normalized.transcript.language || '', text: normalized.transcript.text || '' };
  if (transcriptSegments.length && normalized.transcript.text) removedDuplicates.push('transcript.text');
  if (normalized.transcript.text && intelligence.transcript?.text === normalized.transcript.text) {
    removedDuplicates.push('videoIntelligence.transcript');
  }
  if (normalized.transcript.text && compactText(video.spokenText) === normalized.transcript.text) {
    removedDuplicates.push('video.spokenText');
  }

  const duration = firstValue(
    normalized.metadata.durationSeconds,
    normalized.metadata.duration,
    normalized.metadata.youtube?.duration,
    intelligence.facts?.duration,
  );
  const originalLanguage = compactText(firstValue(
    intelligence.originalLanguage,
    intelligence.facts?.originalLanguage,
    normalized.metadata.originalLanguage,
    normalized.metadata.youtube?.defaultAudioLanguage,
    normalized.transcript.language,
  ));
  const analysisLanguage = compactText(firstValue(
    intelligence.analysisLanguage,
    normalized.metadata.analysisLanguage,
    video.analysisLanguage,
  ));
  const observations = firstValue(
    video.observations,
    qualityGate.observations,
    normalized.sourceEvidence?.observations,
  ) || [];
  const scenes = firstValue(video.scenes, video.sceneBeats) || [];
  const shotSignals = uniqueArray([
    ...(Array.isArray(visual.shotSignals) ? visual.shotSignals : []),
  ]);
  const shotList = uniqueArray(Array.isArray(video.shotList) ? video.shotList : []);
  const sourcePayload = {
    url: normalized.canonicalUrl,
    platform: normalized.platform,
    title: normalized.title,
    description: normalized.description,
    author: normalized.handle,
    metadata: {
      duration: duration || '',
      durationSeconds: normalized.metadata.durationSeconds,
      publishedAt: normalized.metadata.publishedAt || intelligence.facts?.publishedAt || '',
      sourceStatus: normalized.sourceStatus,
    },
    originalLanguage,
    analysisLanguage,
    summary: compactText(firstValue(video.videoSummary, qualityGate.summary, normalized.globalInsight?.summary)),
    hook: compactText(firstValue(video.hook, qualityGate.hook, normalized.globalInsight?.hook)),
    contentMechanic: compactText(firstValue(video.contentMechanic, qualityGate.contentMechanic, qualityGate.transferableMechanic, normalized.globalInsight?.marketingMechanics)),
    transcript,
    onScreenText: compactText(video.onScreenText),
    observations: cloneJsonValue(observations),
    scenes: cloneJsonValue(scenes),
    sceneBeats: Array.isArray(video.sceneBeats) ? cloneJsonValue(video.sceneBeats) : [],
    shotList,
    shotSignals,
    soundMusicCues: Array.isArray(video.soundMusicCues) ? cloneJsonValue(video.soundMusicCues) : [],
    limitations: Array.isArray(video.limitations) ? cloneJsonValue(video.limitations) : [],
    confidence: cloneJsonValue(firstValue(video.confidence, intelligence.confidence) || null),
    grounding: cloneJsonValue(normalized.grounding || null),
    readiness: cloneJsonValue(normalized.readiness || null),
  };
  const payload = {
    contractVersion: 1,
    source: sourcePayload,
    generationBrand: cloneJsonValue(generationBrand) || {},
    targetLanguage: compactText(options.targetLanguage) || 'uk',
    productionConstraints: cloneJsonValue(options.productionConstraints || {
      equipment: 'smartphone-first',
      crew: 'small team or solo creator',
      evidencePolicy: 'Do not invent claims, metrics, testimonials, or source facts.',
    }),
    variantCount: boundedPositiveInteger(options.variantCount, DEFAULT_REMIX_VARIANT_COUNT, 1),
  };
  const requestOverheadBytes = boundedPositiveInteger(
    options.requestOverheadBytes,
    DEFAULT_REMIX_REQUEST_OVERHEAD_BYTES,
    1,
  );
  const originalPayloadSizeBytes = Buffer.byteLength(JSON.stringify({ sourceContext: normalized, generationBrand, options }), 'utf8');
  const finalPayloadSizeBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  const originalSizeBytes = originalPayloadSizeBytes + requestOverheadBytes;
  const finalSizeBytes = finalPayloadSizeBytes + requestOverheadBytes;
  const maxInputTokens = boundedPositiveInteger(options.maxInputTokens, DEFAULT_REMIX_MAX_INPUT_TOKENS, 1);
  const maxRequestBytes = boundedPositiveInteger(options.maxRequestBytes, DEFAULT_REMIX_MAX_REQUEST_BYTES, 1);
  const diagnostic = {
    originalSizeBytes,
    originalEstimatedTokens: estimateTokensFromBytes(originalSizeBytes),
    finalSizeBytes,
    finalEstimatedTokens: estimateTokensFromBytes(finalSizeBytes),
    originalPayloadSizeBytes,
    finalPayloadSizeBytes,
    requestOverheadBytes,
    maxInputTokens,
    maxRequestBytes,
    removedDuplicates: [...new Set(removedDuplicates)],
    truncatedFields: [],
    includedTranscriptSegmentCount: transcriptSegments.length,
  };
  if (diagnostic.finalEstimatedTokens > maxInputTokens || finalSizeBytes > maxRequestBytes) {
    throw createInputBudgetError(diagnostic);
  }
  return { payload, payloadDiagnostics: diagnostic, sourceContext: normalized };
}

function stableSortJson(value) {
  if (Array.isArray(value)) return value.map(stableSortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableSortJson(value[key]);
    return result;
  }, {});
}

function buildRemixGenerationCacheKey({ sourceContext = {}, generationBrandKey = '', targetLanguage = 'uk' } = {}) {
  const source = normalizeRemixSourceContext(sourceContext);
  const identity = {
    sourceType: source.sourceType,
    sourceId: source.sourceId || source.savedUrlId || source.signalId,
    url: source.canonicalUrl,
    platform: source.platform,
    title: source.title,
    evidence: {
      metadata: source.metadata,
      transcript: source.transcript,
      videoIntelligence: source.videoIntelligence,
      grounding: source.grounding,
    },
    generationBrandKey,
    targetLanguage: compactText(targetLanguage) || 'uk',
  };
  return createHash('sha256').update(JSON.stringify(stableSortJson(identity))).digest('hex');
}

function toRemixEngineInput(payload, sourceContext) {
  const source = payload.source || {};
  return {
    title: source.title,
    description: source.description,
    handle: source.author,
    hook: source.hook,
    script: source.transcript?.text || source.transcript?.segments?.map((segment) => segment.text).join(' ') || source.summary,
    marketingMechanics: source.contentMechanic,
    url: source.url,
    sourceType: sourceContext.sourceType,
    sourceId: sourceContext.sourceId,
    savedUrlId: sourceContext.savedUrlId,
    signalId: sourceContext.signalId,
    transcriptText: sourceContext.transcript?.text || '',
    videoIntelligence: cloneJsonValue(sourceContext.videoIntelligence || {}),
    sourceGrounding: cloneJsonValue(sourceContext.grounding || null),
    sourceEvidence: cloneJsonValue(sourceContext.sourceEvidence || {
      metadata: sourceContext.metadata,
      transcript: sourceContext.transcript,
      analysis: sourceContext.analysis,
      visual: sourceContext.visual,
      grounding: sourceContext.grounding,
    }),
    generationPayload: payload,
  };
}

async function generateProductLiveRemix({
  sourceContext,
  brandResolution,
  route = 'unknown',
  workspaceId = '',
  targetLanguage,
  productionConstraints,
  beforeProviderAttempt,
  maxAttempts,
  generator = generateRemix,
  config = getRemixGenerationConfig(),
} = {}) {
  const language = compactText(targetLanguage) || config.targetLanguage;
  const built = buildRemixGenerationPayload(sourceContext, brandResolution.generationBrand, {
    targetLanguage: language,
    productionConstraints,
    maxInputTokens: config.maxInputTokens,
    maxRequestBytes: config.maxRequestBytes,
    variantCount: config.variantCount,
  });
  const cacheKey = buildRemixGenerationCacheKey({
    sourceContext: built.sourceContext,
    generationBrandKey: brandResolution.generationBrandKey,
    targetLanguage: language,
  });
  const compatibilityBrief = {
    ...(brandResolution.generationBrand || {}),
    brandBrainMode: brandResolution.complete ? 'brand' : 'consultant',
    brandBrainReady: Boolean(brandResolution.complete),
  };
  const generated = await generator(
    toRemixEngineInput(built.payload, built.sourceContext),
    compatibilityBrief,
    {
      beforeProviderAttempt,
      maxAttempts,
      language,
      route,
      workspaceId,
      inputSizeBytes: built.payloadDiagnostics.finalSizeBytes,
      maxRequestBytes: config.providerMaxRequestBytes || config.maxRequestBytes,
      maxOutputTokens: config.maxOutputTokens,
      retryMaxOutputTokens: config.retryMaxOutputTokens,
      responseSchemaVariantCount: config.variantCount,
    },
  );
  const result = cloneJsonValue(generated);
  result._generation = {
    ...(result._generation || {}),
    route,
    cacheKey,
    brandSource: brandResolution.brandSource,
    generationBrandKey: brandResolution.generationBrandKey,
    targetLanguage: language,
    payloadDiagnostics: built.payloadDiagnostics,
  };
  return {
    result,
    sourceContext: built.sourceContext,
    payloadDiagnostics: built.payloadDiagnostics,
    cacheKey,
  };
}

module.exports = {
  DEFAULT_REMIX_MAX_INPUT_TOKENS,
  DEFAULT_REMIX_MAX_REQUEST_BYTES,
  DEFAULT_REMIX_MAX_OUTPUT_TOKENS,
  DEFAULT_REMIX_RETRY_MAX_OUTPUT_TOKENS,
  DEFAULT_REMIX_VARIANT_COUNT,
  DEFAULT_REMIX_REQUEST_OVERHEAD_BYTES,
  getRemixGenerationConfig,
  normalizeRemixSourceContext,
  buildRemixGenerationPayload,
  buildRemixGenerationCacheKey,
  generateProductLiveRemix,
};
