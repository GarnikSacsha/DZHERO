'use strict';

const assert = require('node:assert/strict');
const {
  calculatePersonalUrlRunWorstCase,
  readPersonalUrlRunBudget,
} = require('../backend/services/personalUrlRunBudget.cjs');

const models = {
  videoModel: 'gemini-3.6-flash',
  remixModel: 'gemini-3.5-flash',
  now: new Date('2026-08-15T12:00:00Z'),
};

const savedUrlBudgetEnv = {
  PERSONAL_URL_RUN_BUDGET_USD: '1.10',
  PERSONAL_URL_INSTAGRAM_APIFY_MAX_ACTOR_STARTS: '1',
  PERSONAL_URL_TIKTOK_APIFY_MAX_ACTOR_STARTS: '1',
  PERSONAL_URL_INSTAGRAM_APIFY_TOTAL_MAX_CHARGE_USD: '0.05',
  PERSONAL_URL_TIKTOK_APIFY_TOTAL_MAX_CHARGE_USD: '0.50',
  PERSONAL_URL_INSTAGRAM_FALLBACK_ENABLED: 'false',
  PERSONAL_URL_MAX_VIDEO_DURATION_SECONDS: '60',
  PERSONAL_URL_GEMINI_VIDEO_MAX_INPUT_TOKENS: '25000',
  PERSONAL_URL_GEMINI_VIDEO_MAX_OUTPUT_TOKENS: '4096',
  PERSONAL_URL_GEMINI_REMIX_MAX_OUTPUT_TOKENS: '8192',
  PERSONAL_URL_GEMINI_VIDEO_MAX_REQUEST_BYTES: '12000',
  PERSONAL_URL_GEMINI_REMIX_MAX_REQUEST_BYTES: '30000',
};

const defaults = readPersonalUrlRunBudget({}, models);
assert.equal(defaults.enabled, false);
assert.equal(defaults.platforms.instagram.maxActorStarts, 1);
assert.equal(defaults.platforms.instagram.allowInstagramFallback, false);
assert.equal(defaults.platforms.tiktok.maxActorStarts, 1);

const budget = readPersonalUrlRunBudget(savedUrlBudgetEnv, models);
assert.equal(budget.enabled, true);
assert.equal(budget.maxVideoDurationSeconds, 60);
assert.equal(budget.geminiVideoMaxInputTokens, 25_000);
assert.equal(budget.geminiVideoMaxOutputTokens, 4_096);
assert.equal(budget.geminiRemixMaxOutputTokens, 8_192);
assert.equal(budget.geminiVideoMaxRequestBytes, 12_000);
assert.equal(budget.geminiRemixMaxRequestBytes, 30_000);
assert.equal(budget.platforms.instagram.maxActorStarts, 1);
assert.equal(budget.platforms.instagram.allowInstagramFallback, false);
assert.equal(budget.platforms.tiktok.maxActorStarts, 1);

const estimate = (platform) => calculatePersonalUrlRunWorstCase({ ...budget, platform });
const youtube = estimate('youtube');
const instagram = estimate('instagram');
const tiktok = estimate('tiktok');

// Official Gemini API Standard pricing: 3.6 Flash $0.75/$3.75 and 3.5 Flash $1.50/$9.00 per million input/output tokens.
assert.ok(Math.abs(youtube.totalUsd - 0.271566) < 1e-9, `YouTube estimate was ${youtube.totalUsd}`);
assert.ok(Math.abs(instagram.totalUsd - 0.326566) < 1e-9, `Instagram estimate was ${instagram.totalUsd}`);
assert.ok(Math.abs(tiktok.totalUsd - 0.821566) < 1e-9, `TikTok estimate was ${tiktok.totalUsd}`);
assert.ok(tiktok.totalUsd < budget.totalBudgetUsd);
assert.equal(youtube.apifyUsd, 0, 'unused social platforms must not be charged');
assert.ok(Math.abs(instagram.apifyUsd - 0.055) < 1e-9, 'Instagram includes only its 10% Apify margin');
assert.ok(Math.abs(tiktok.apifyUsd - 0.55) < 1e-9, 'TikTok includes only its 10% Apify margin');
assert.equal(youtube.videoTokenCountInputUsd, 0, 'video input is not charged twice for token counting');
assert.equal(youtube.remixAttemptCount, 2, 'the estimate reserves the two permitted remix attempts and no third');

assert.throws(
  () => readPersonalUrlRunBudget({ ...savedUrlBudgetEnv, PERSONAL_URL_RUN_BUDGET_USD: '0.82' }, models),
  (error) => error?.code === 'personal_url_run_budget_exceeded'
    && Math.abs(error.details.maximumExposureUsd - 0.821566) < 1e-9,
  'the global envelope must reject a budget below the highest active-source estimate',
);
assert.throws(
  () => readPersonalUrlRunBudget({ PERSONAL_URL_RUN_BUDGET_USD: '1.10' }, models),
  (error) => error?.code === 'personal_url_run_budget_config_incomplete',
);
assert.throws(
  () => readPersonalUrlRunBudget(savedUrlBudgetEnv, { ...models, videoModel: 'unknown-model' }),
  (error) => error?.code === 'personal_url_run_budget_model_pricing_unknown',
);
assert.throws(
  () => readPersonalUrlRunBudget(savedUrlBudgetEnv, { ...models, now: new Date('2027-01-01T00:00:00Z') }),
  (error) => error?.code === 'personal_url_run_budget_pricing_expired',
);

console.log('Personal URL run budget guard checks passed.');
