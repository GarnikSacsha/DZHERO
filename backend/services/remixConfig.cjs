'use strict';

const DEFAULT_REMIX_MAX_INPUT_TOKENS = 30_000;
const DEFAULT_REMIX_MAX_REQUEST_BYTES = 750_000;
const DEFAULT_REMIX_MAX_OUTPUT_TOKENS = 8_192;
const DEFAULT_REMIX_RETRY_MAX_OUTPUT_TOKENS = 12_288;
const DEFAULT_REMIX_VARIANT_COUNT = 3;
const DEFAULT_REMIX_REQUEST_OVERHEAD_BYTES = 20_000;

function boundedPositiveInteger(value, fallback, minimum = 1) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function getRemixGenerationConfig(env = process.env) {
  const maxOutputTokens = boundedPositiveInteger(
    env.REMIX_MAX_OUTPUT_TOKENS,
    DEFAULT_REMIX_MAX_OUTPUT_TOKENS,
    1_024,
  );
  return {
    maxInputTokens: boundedPositiveInteger(env.REMIX_MAX_INPUT_TOKENS, DEFAULT_REMIX_MAX_INPUT_TOKENS, 1_000),
    maxRequestBytes: boundedPositiveInteger(env.REMIX_MAX_REQUEST_BYTES, DEFAULT_REMIX_MAX_REQUEST_BYTES, 10_000),
    maxOutputTokens,
    retryMaxOutputTokens: Math.max(
      maxOutputTokens,
      boundedPositiveInteger(env.REMIX_RETRY_MAX_OUTPUT_TOKENS, DEFAULT_REMIX_RETRY_MAX_OUTPUT_TOKENS, 1_024),
    ),
    variantCount: DEFAULT_REMIX_VARIANT_COUNT,
    targetLanguage: String(env.REMIX_TARGET_LANGUAGE || '').replace(/\s+/g, ' ').trim() || 'uk',
  };
}

module.exports = {
  DEFAULT_REMIX_MAX_INPUT_TOKENS,
  DEFAULT_REMIX_MAX_REQUEST_BYTES,
  DEFAULT_REMIX_MAX_OUTPUT_TOKENS,
  DEFAULT_REMIX_RETRY_MAX_OUTPUT_TOKENS,
  DEFAULT_REMIX_VARIANT_COUNT,
  DEFAULT_REMIX_REQUEST_OVERHEAD_BYTES,
  boundedPositiveInteger,
  getRemixGenerationConfig,
};
