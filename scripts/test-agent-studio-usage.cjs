const assert = require('node:assert/strict');

const {
  MAX_AGENT_STUDIO_USAGE_CALLS,
  createAgentStudioUsageCollector,
  normalizeOpenAIUsage,
  normalizeGeminiUsage,
  normalizeApifyUsage,
  toPublicAgentStudioUsageSummary,
} = require('../backend/services/agentStudioUsage.cjs');

const openai = normalizeOpenAIUsage({
  callId: 'openai-1',
  invocationId: 'invocation-1',
  phase: 'initial',
  agentId: 'creative_producer',
  model: 'gpt-5.6',
  usage: {
    requests: 2,
    inputTokens: 1000,
    outputTokens: 100,
    totalTokens: 1100,
    inputTokensDetails: [{ cached_tokens: 400 }],
  },
});
assert.equal(openai.cachedInputTokens, 400);
assert.equal(openai.estimatedCostMicrousd, 6200);

const gemini = normalizeGeminiUsage({
  callId: 'gemini-1',
  invocationId: 'invocation-1',
  model: 'gemini-3.5-flash',
  usage: {
    total_input_tokens: 1000,
    total_cached_tokens: 200,
    total_output_tokens: 100,
    total_thought_tokens: 50,
    total_tokens: 1150,
  },
});
assert.equal(gemini.estimatedCostMicrousd, 2580);

const apify = normalizeApifyUsage({
  callId: 'apify-1',
  actor: 'apify/instagram-reel-scraper',
  usageTotalUsd: 0.012345,
});
assert.equal(apify.providerReportedCostMicrousd, 12345);

const collector = createAgentStudioUsageCollector();
collector.recordOpenAI({ ...openai, usage: {
  requests: openai.requests,
  inputTokens: openai.inputTokens,
  outputTokens: openai.outputTokens,
  totalTokens: openai.totalTokens,
  inputTokensDetails: [{ cached_tokens: openai.cachedInputTokens }],
} });
collector.recordOpenAI({ ...openai, usage: {
  requests: openai.requests,
  inputTokens: openai.inputTokens,
  outputTokens: openai.outputTokens,
  totalTokens: openai.totalTokens,
  inputTokensDetails: [{ cached_tokens: openai.cachedInputTokens }],
} });
collector.recordGemini({ ...gemini, usage: {
  total_input_tokens: gemini.inputTokens,
  total_cached_tokens: gemini.cachedInputTokens,
  total_output_tokens: gemini.outputTokens,
  total_thought_tokens: gemini.thoughtTokens,
  total_tokens: gemini.totalTokens,
} });
collector.recordApify({ ...apify, usageTotalUsd: 0.012345 });

const snapshot = collector.snapshot();
assert.equal(snapshot.calls.length, 3, 'duplicate call ids must be idempotent');
assert.deepEqual(snapshot.totals.providerCalls, { openai: 1, gemini: 1, apify: 1 });
assert.equal(snapshot.totals.completeness, 'complete');

for (let index = 0; index < MAX_AGENT_STUDIO_USAGE_CALLS + 5; index += 1) {
  collector.recordApify({ callId: `bounded-${index}`, actor: 'test', usageTotalUsd: 0 });
}
assert.equal(collector.snapshot().calls.length, MAX_AGENT_STUDIO_USAGE_CALLS);

const summary = toPublicAgentStudioUsageSummary(snapshot);
assert.equal(summary.totalTokens, 2250);
assert.equal(summary.estimatedCostUsd, 0.00878);
assert.equal(summary.providerReportedCostUsd, 0.012345);
assert.equal(Object.hasOwn(summary, 'calls'), false);
assert.equal(JSON.stringify(summary).includes('invocation-1'), false);

console.log('Agent Studio usage telemetry checks passed.');
