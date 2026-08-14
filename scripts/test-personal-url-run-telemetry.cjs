'use strict';

const assert = require('node:assert/strict');
const {
  appendPersonalUrlRunTelemetry,
  createPersonalUrlRunTracker,
  finalizePersonalUrlRun,
  finishPersonalUrlRunStage,
  recordPersonalUrlProviderAttempt,
  recordPersonalUrlProviderUsage,
  startPersonalUrlRunStage,
} = require('../backend/services/personalUrlRunTelemetry.cjs');

const tracker = createPersonalUrlRunTracker({
  runId: 'personal_url_run_opaque_fixture',
  platform: 'youtube',
  acquisitionMode: 'public_video_grounding',
  now: 1_000,
});
startPersonalUrlRunStage(tracker, 'source_resolution', 1_010);
recordPersonalUrlProviderAttempt(tracker, { provider: 'gemini', model: 'fixture-model', operation: 'source_resolution' });
recordPersonalUrlProviderUsage(tracker, 'gemini', {
  promptTokenCount: 10,
  candidatesTokenCount: 4,
  totalTokenCount: 14,
  actualCostUsd: 0.002,
  estimatedCostUsd: 99,
});
finishPersonalUrlRunStage(tracker, 'source_resolution', 1_040);
startPersonalUrlRunStage(tracker, 'remix', 1_050);
recordPersonalUrlProviderAttempt(tracker, { provider: 'openai', model: 'fixture-remix', operation: 'remix' });
recordPersonalUrlProviderUsage(tracker, 'openai', {
  input_tokens: 20,
  output_tokens: 8,
  total_tokens: 28,
  estimated_cost_usd: 88,
});
finishPersonalUrlRunStage(tracker, 'remix', 1_100);

const record = finalizePersonalUrlRun(tracker, {
  terminalReason: 'completed',
  reuseState: 'none',
  singleFlightState: 'leader',
  now: 1_120,
});
assert.equal(record.overallTimingMs, 120);
assert.deepEqual(record.stageTimingsMs, { source_resolution: 30, remix: 50 });
assert.deepEqual(record.providers, [
  { provider: 'gemini', model: 'fixture-model', operation: 'source_resolution', attemptCount: 1 },
  { provider: 'openai', model: 'fixture-remix', operation: 'remix', attemptCount: 1 },
]);
assert.deepEqual(record.usageByProvider, {
  gemini: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
  openai: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
});
assert.deepEqual(record.costByProvider, { gemini: { actualUsd: 0.002 } });
assert.equal(Object.hasOwn(record.costByProvider, 'openai'), false, 'estimated or invented costs are never persisted');

const serialized = JSON.stringify(record);
for (const privateValue of [
  'https://example.test/private-source',
  'private transcript fixture',
  'raw_user_fixture',
  'raw_workspace_fixture',
]) {
  assert.equal(serialized.includes(privateValue), false);
}

const records = [];
for (let index = 0; index < 4; index += 1) {
  appendPersonalUrlRunTelemetry(records, { runId: `run_${index}` }, 3);
}
assert.deepEqual(records.map(({ runId }) => runId), ['run_3', 'run_2', 'run_1']);

console.log('Personal URL privacy-safe telemetry tests passed.');
