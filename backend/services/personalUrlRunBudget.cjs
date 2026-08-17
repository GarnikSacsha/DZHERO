'use strict';

const DEFAULT_PLATFORM_LIMITS = Object.freeze({
  instagram: Object.freeze({ maxActorStarts: 2, maxChargeUsd: 0.05 }),
  tiktok: Object.freeze({ maxActorStarts: 1, maxChargeUsd: 0.50 }),
});

const GEMINI_STANDARD_PRICING_USD_PER_MILLION = Object.freeze({
  'gemini-3.6-flash': Object.freeze({ input: 1.50, output: 7.50 }),
  'gemini-3.5-flash': Object.freeze({ input: 1.50, output: 9.00 }),
});

const GEMINI_PRICING_VALID_THROUGH = '2026-12-31';
const DEFAULT_VIDEO_TOKENS_PER_SECOND = 300;

function createBudgetError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.status = 503;
  error.details = details;
  return error;
}

function readOptionalNumber(env, name, { integer = false, minimum = 0, maximum = Number.POSITIVE_INFINITY } = {}) {
  const raw = String(env?.[name] ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw createBudgetError('personal_url_run_budget_config_invalid', { field: name });
  }
  return value;
}

function readOptionalBoolean(env, name, fallback) {
  const raw = String(env?.[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw createBudgetError('personal_url_run_budget_config_invalid', { field: name });
}

function getPlatformEnvPrefix(platform) {
  return platform === 'instagram'
    ? 'PERSONAL_URL_INSTAGRAM'
    : 'PERSONAL_URL_TIKTOK';
}

function readPlatformBudget(env, platform) {
  const defaults = DEFAULT_PLATFORM_LIMITS[platform];
  const prefix = getPlatformEnvPrefix(platform);
  const configuredActorStarts = readOptionalNumber(env, `${prefix}_APIFY_MAX_ACTOR_STARTS`, {
    integer: true,
    minimum: 0,
    maximum: defaults.maxActorStarts,
  });
  const configuredTotalCharge = readOptionalNumber(env, `${prefix}_APIFY_TOTAL_MAX_CHARGE_USD`, {
    minimum: 0.000001,
    maximum: defaults.maxChargeUsd,
  });
  return Object.freeze({
    maxActorStarts: configuredActorStarts ?? defaults.maxActorStarts,
    totalMaxChargeUsd: configuredTotalCharge,
    allowInstagramFallback: platform === 'instagram'
      ? readOptionalBoolean(env, 'PERSONAL_URL_INSTAGRAM_FALLBACK_ENABLED', true)
      : false,
  });
}

function calculatePersonalUrlRunWorstCase(config) {
  const videoPricing = GEMINI_STANDARD_PRICING_USD_PER_MILLION[config.videoModel];
  const remixPricing = GEMINI_STANDARD_PRICING_USD_PER_MILLION[config.remixModel];
  if (!videoPricing || !remixPricing) {
    throw createBudgetError('personal_url_run_budget_model_pricing_unknown', {
      videoModel: config.videoModel,
      remixModel: config.remixModel,
    });
  }
  const platformCount = 2;
  const maximumVideoInputTokensPerSource = config.geminiVideoMaxInputTokens;
  const maximumRemixInputTokensPerSource = config.geminiRemixMaxRequestBytes;
  const apifyUsd = config.platforms.instagram.totalMaxChargeUsd
    + config.platforms.tiktok.totalMaxChargeUsd;
  const videoInputUsd = platformCount * maximumVideoInputTokensPerSource * videoPricing.input / 1_000_000;
  const videoTokenCountInputUsd = videoInputUsd;
  const videoOutputUsd = platformCount * config.geminiVideoMaxOutputTokens * videoPricing.output / 1_000_000;
  const remixInputUsd = platformCount * maximumRemixInputTokensPerSource * remixPricing.input / 1_000_000;
  const remixOutputUsd = platformCount * config.geminiRemixMaxOutputTokens * remixPricing.output / 1_000_000;
  const totalUsd = apifyUsd
    + videoTokenCountInputUsd
    + videoInputUsd
    + videoOutputUsd
    + remixInputUsd
    + remixOutputUsd;
  return Object.freeze({
    pricingValidThrough: GEMINI_PRICING_VALID_THROUGH,
    videoTokensPerSecond: config.videoTokensPerSecond,
    maximumVideoInputTokensPerSource,
    maximumRemixInputTokensPerSource,
    apifyUsd,
    videoTokenCountInputUsd,
    videoInputUsd,
    videoOutputUsd,
    remixInputUsd,
    remixOutputUsd,
    totalUsd,
  });
}

function readPersonalUrlRunBudget(env = process.env, {
  videoModel = 'gemini-3.6-flash',
  remixModel = 'gemini-3.5-flash',
  now = new Date(),
} = {}) {
  const totalBudgetUsd = readOptionalNumber(env, 'PERSONAL_URL_RUN_BUDGET_USD', {
    minimum: 0.000001,
  });
  const config = {
    enabled: totalBudgetUsd !== null,
    totalBudgetUsd,
    videoModel,
    remixModel,
    videoTokensPerSecond: DEFAULT_VIDEO_TOKENS_PER_SECOND,
    maxVideoDurationSeconds: readOptionalNumber(env, 'PERSONAL_URL_MAX_VIDEO_DURATION_SECONDS', {
      minimum: 0.001,
      maximum: 3600,
    }),
    geminiVideoMaxInputTokens: readOptionalNumber(env, 'PERSONAL_URL_GEMINI_VIDEO_MAX_INPUT_TOKENS', {
      integer: true,
      minimum: 1,
      maximum: 1_048_576,
    }),
    geminiVideoMaxOutputTokens: readOptionalNumber(env, 'PERSONAL_URL_GEMINI_VIDEO_MAX_OUTPUT_TOKENS', {
      integer: true,
      minimum: 1,
      maximum: 65_536,
    }),
    geminiRemixMaxOutputTokens: readOptionalNumber(env, 'PERSONAL_URL_GEMINI_REMIX_MAX_OUTPUT_TOKENS', {
      integer: true,
      minimum: 1,
      maximum: 65_536,
    }),
    geminiVideoMaxRequestBytes: readOptionalNumber(env, 'PERSONAL_URL_GEMINI_VIDEO_MAX_REQUEST_BYTES', {
      integer: true,
      minimum: 1,
    }),
    geminiRemixMaxRequestBytes: readOptionalNumber(env, 'PERSONAL_URL_GEMINI_REMIX_MAX_REQUEST_BYTES', {
      integer: true,
      minimum: 1,
    }),
    platforms: Object.freeze({
      instagram: readPlatformBudget(env, 'instagram'),
      tiktok: readPlatformBudget(env, 'tiktok'),
    }),
  };
  if (!config.enabled) return Object.freeze({ ...config, worstCase: null });

  const requiredFields = [
    ['PERSONAL_URL_MAX_VIDEO_DURATION_SECONDS', config.maxVideoDurationSeconds],
    ['PERSONAL_URL_GEMINI_VIDEO_MAX_INPUT_TOKENS', config.geminiVideoMaxInputTokens],
    ['PERSONAL_URL_GEMINI_VIDEO_MAX_OUTPUT_TOKENS', config.geminiVideoMaxOutputTokens],
    ['PERSONAL_URL_GEMINI_REMIX_MAX_OUTPUT_TOKENS', config.geminiRemixMaxOutputTokens],
    ['PERSONAL_URL_GEMINI_VIDEO_MAX_REQUEST_BYTES', config.geminiVideoMaxRequestBytes],
    ['PERSONAL_URL_GEMINI_REMIX_MAX_REQUEST_BYTES', config.geminiRemixMaxRequestBytes],
    ['PERSONAL_URL_INSTAGRAM_APIFY_TOTAL_MAX_CHARGE_USD', config.platforms.instagram.totalMaxChargeUsd],
    ['PERSONAL_URL_TIKTOK_APIFY_TOTAL_MAX_CHARGE_USD', config.platforms.tiktok.totalMaxChargeUsd],
  ];
  const missing = requiredFields.filter(([, value]) => value === null).map(([name]) => name);
  if (missing.length) {
    throw createBudgetError('personal_url_run_budget_config_incomplete', { missing });
  }
  if (String(now.toISOString()).slice(0, 10) > GEMINI_PRICING_VALID_THROUGH) {
    throw createBudgetError('personal_url_run_budget_pricing_expired', {
      validThrough: GEMINI_PRICING_VALID_THROUGH,
    });
  }
  const worstCase = calculatePersonalUrlRunWorstCase(config);
  if (worstCase.totalUsd > totalBudgetUsd + Number.EPSILON) {
    throw createBudgetError('personal_url_run_budget_exceeded', {
      budgetUsd: totalBudgetUsd,
      maximumExposureUsd: worstCase.totalUsd,
    });
  }
  return Object.freeze({ ...config, worstCase });
}

function getPersonalUrlPlatformBudget(config, platformValue = '') {
  const platform = String(platformValue || '').trim().toLowerCase();
  return config?.platforms?.[platform] || null;
}

module.exports = {
  DEFAULT_PLATFORM_LIMITS,
  DEFAULT_VIDEO_TOKENS_PER_SECOND,
  GEMINI_PRICING_VALID_THROUGH,
  GEMINI_STANDARD_PRICING_USD_PER_MILLION,
  calculatePersonalUrlRunWorstCase,
  getPersonalUrlPlatformBudget,
  readPersonalUrlRunBudget,
};
