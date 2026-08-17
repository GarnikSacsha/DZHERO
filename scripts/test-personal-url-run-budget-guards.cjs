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

const defaults = readPersonalUrlRunBudget({}, models);
assert.equal(defaults.enabled, false);
assert.equal(defaults.platforms.instagram.maxActorStarts, 2);
assert.equal(defaults.platforms.instagram.allowInstagramFallback, true);
assert.equal(defaults.platforms.tiktok.maxActorStarts, 1);
assert.equal(defaults.maxVideoDurationSeconds, null);

const cappedEnv = {
  PERSONAL_URL_RUN_BUDGET_USD: '0.75',
  PERSONAL_URL_INSTAGRAM_APIFY_MAX_ACTOR_STARTS: '1',
  PERSONAL_URL_TIKTOK_APIFY_MAX_ACTOR_STARTS: '1',
  PERSONAL_URL_INSTAGRAM_APIFY_TOTAL_MAX_CHARGE_USD: '0.05',
  PERSONAL_URL_TIKTOK_APIFY_TOTAL_MAX_CHARGE_USD: '0.50',
  PERSONAL_URL_INSTAGRAM_FALLBACK_ENABLED: 'false',
  PERSONAL_URL_MAX_VIDEO_DURATION_SECONDS: '60',
  PERSONAL_URL_GEMINI_VIDEO_MAX_INPUT_TOKENS: '25000',
  PERSONAL_URL_GEMINI_VIDEO_MAX_OUTPUT_TOKENS: '1536',
  PERSONAL_URL_GEMINI_REMIX_MAX_OUTPUT_TOKENS: '2560',
  PERSONAL_URL_GEMINI_VIDEO_MAX_REQUEST_BYTES: '12000',
  PERSONAL_URL_GEMINI_REMIX_MAX_REQUEST_BYTES: '12000',
};
const capped = readPersonalUrlRunBudget(cappedEnv, models);
assert.equal(capped.enabled, true);
assert.equal(capped.platforms.instagram.maxActorStarts, 1);
assert.equal(capped.platforms.instagram.allowInstagramFallback, false);
assert.equal(capped.worstCase.maximumVideoInputTokensPerSource, 25_000);
assert.equal(capped.worstCase.maximumRemixInputTokensPerSource, 12_000);
assert.equal(capped.worstCase.videoTokenCountInputUsd, capped.worstCase.videoInputUsd);
assert.ok(Math.abs(capped.worstCase.totalUsd - 0.7186) < 1e-12);
assert.ok(capped.worstCase.totalUsd < capped.totalBudgetUsd);
assert.deepEqual(calculatePersonalUrlRunWorstCase(capped), capped.worstCase);

assert.throws(
  () => readPersonalUrlRunBudget({ PERSONAL_URL_RUN_BUDGET_USD: '0.75' }, models),
  (error) => error?.code === 'personal_url_run_budget_config_incomplete'
    && error.details.missing.includes('PERSONAL_URL_MAX_VIDEO_DURATION_SECONDS'),
);
assert.throws(
  () => readPersonalUrlRunBudget({
    ...cappedEnv,
    PERSONAL_URL_GEMINI_REMIX_MAX_OUTPUT_TOKENS: '65536',
  }, models),
  (error) => error?.code === 'personal_url_run_budget_exceeded'
    && error.details.maximumExposureUsd > 0.75,
);
assert.throws(
  () => readPersonalUrlRunBudget(cappedEnv, { ...models, videoModel: 'unknown-model' }),
  (error) => error?.code === 'personal_url_run_budget_model_pricing_unknown',
);
assert.throws(
  () => readPersonalUrlRunBudget(cappedEnv, { ...models, now: new Date('2027-01-01T00:00:00Z') }),
  (error) => error?.code === 'personal_url_run_budget_pricing_expired',
);

console.log('Personal URL run budget guard checks passed.');
