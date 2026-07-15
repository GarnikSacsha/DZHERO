const crypto = require('node:crypto');

const AGENT_STUDIO_USAGE_SCHEMA_VERSION = 1;
const MAX_AGENT_STUDIO_USAGE_CALLS = 64;

const OPENAI_STANDARD_RATES = {
  'gpt-5.6': { input: 5, cachedInput: 0.5, output: 30 },
  'gpt-5.6-sol': { input: 5, cachedInput: 0.5, output: 30 },
  'gpt-5.6-terra': { input: 2.5, cachedInput: 0.25, output: 15 },
  'gpt-5.6-luna': { input: 1, cachedInput: 0.1, output: 6 },
};

const GEMINI_STANDARD_RATES = {
  'gemini-3.5-flash': { input: 1.5, cachedInput: 0.15, output: 9 },
};

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function optionalNonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function usdToMicrousd(value) {
  const usd = optionalNonNegativeNumber(value);
  return usd === null ? null : Math.round(usd * 1_000_000);
}

function microusdToUsd(value) {
  return Number((nonNegativeInteger(value) / 1_000_000).toFixed(6));
}

function sumDetail(details, keys) {
  const rows = Array.isArray(details) ? details : details && typeof details === 'object' ? [details] : [];
  return rows.reduce((total, row) => {
    if (!row || typeof row !== 'object') return total;
    const value = keys.map((key) => row[key]).find((item) => item !== undefined);
    return total + nonNegativeInteger(value);
  }, 0);
}

function makeCallBase({
  callId,
  invocationId,
  phase = 'initial',
  provider,
  operation,
  agentId = null,
  model = null,
  status = 'completed',
  startedAt = null,
  completedAt = null,
}) {
  return {
    callId: String(callId || `${invocationId || 'invocation'}:${crypto.randomUUID()}`),
    invocationId: String(invocationId || ''),
    phase: String(phase || 'initial'),
    provider,
    operation,
    agentId: agentId ? String(agentId) : null,
    model: model ? String(model) : null,
    status: status === 'failed' ? 'failed' : 'completed',
    startedAt: startedAt || null,
    completedAt: completedAt || new Date().toISOString(),
  };
}

function estimateTokenCostMicrousd({ inputTokens, cachedInputTokens, outputTokens, rates }) {
  if (!rates) return null;
  const cached = Math.min(nonNegativeInteger(inputTokens), nonNegativeInteger(cachedInputTokens));
  const uncached = Math.max(0, nonNegativeInteger(inputTokens) - cached);
  return Math.round(
    (uncached * rates.input)
    + (cached * rates.cachedInput)
    + (nonNegativeInteger(outputTokens) * rates.output),
  );
}

function normalizeOpenAIUsage(args = {}) {
  const usage = args.usage && typeof args.usage === 'object' ? args.usage : null;
  const inputTokens = nonNegativeInteger(usage?.inputTokens ?? usage?.input_tokens);
  const outputTokens = nonNegativeInteger(usage?.outputTokens ?? usage?.output_tokens);
  const totalTokens = nonNegativeInteger(usage?.totalTokens ?? usage?.total_tokens)
    || inputTokens + outputTokens;
  const cachedInputTokens = sumDetail(
    usage?.inputTokensDetails ?? usage?.input_tokens_details,
    ['cached_tokens', 'cachedTokens', 'cache_read_tokens', 'cacheReadTokens'],
  );
  const model = String(args.model || '').trim();
  const estimatedCostMicrousd = usage
    ? estimateTokenCostMicrousd({
      inputTokens,
      cachedInputTokens,
      outputTokens,
      rates: OPENAI_STANDARD_RATES[model],
    })
    : null;
  return {
    ...makeCallBase({ ...args, provider: 'openai', operation: 'agent', model }),
    requests: nonNegativeInteger(usage?.requests),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    thoughtTokens: 0,
    totalTokens,
    usageKnown: Boolean(usage),
    estimatedCostMicrousd,
    providerReportedCostMicrousd: null,
    pricingVersion: estimatedCostMicrousd === null ? null : 'openai-standard-2026-07-16',
  };
}

function normalizeGeminiUsage(args = {}) {
  const usage = args.usage && typeof args.usage === 'object' ? args.usage : null;
  const inputTokens = nonNegativeInteger(usage?.total_input_tokens ?? usage?.totalInputTokens);
  const outputTokens = nonNegativeInteger(usage?.total_output_tokens ?? usage?.totalOutputTokens);
  const thoughtTokens = nonNegativeInteger(usage?.total_thought_tokens ?? usage?.totalThoughtTokens);
  const cachedInputTokens = nonNegativeInteger(usage?.total_cached_tokens ?? usage?.totalCachedTokens);
  const totalTokens = nonNegativeInteger(usage?.total_tokens ?? usage?.totalTokens)
    || inputTokens + outputTokens + thoughtTokens;
  const model = String(args.model || '').trim();
  const estimatedCostMicrousd = usage
    ? estimateTokenCostMicrousd({
      inputTokens,
      cachedInputTokens,
      outputTokens: outputTokens + thoughtTokens,
      rates: GEMINI_STANDARD_RATES[model],
    })
    : null;
  return {
    ...makeCallBase({ ...args, provider: 'gemini', operation: 'video_analysis', model }),
    requests: usage ? 1 : 0,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    thoughtTokens,
    totalTokens,
    usageKnown: Boolean(usage),
    estimatedCostMicrousd,
    providerReportedCostMicrousd: null,
    pricingVersion: estimatedCostMicrousd === null ? null : 'gemini-standard-2026-07-16',
  };
}

function normalizeApifyUsage(args = {}) {
  const providerReportedCostMicrousd = usdToMicrousd(
    args.usageTotalUsd ?? args.actualCostUsd ?? args.providerReportedCostUsd,
  );
  return {
    ...makeCallBase({ ...args, provider: 'apify', operation: 'source_resolution', model: args.actor || null }),
    requests: 1,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    usageKnown: providerReportedCostMicrousd !== null,
    estimatedCostMicrousd: null,
    providerReportedCostMicrousd,
    pricingVersion: providerReportedCostMicrousd === null ? null : 'apify-provider-reported',
  };
}

function aggregateAgentStudioUsage(calls = []) {
  const providerCalls = { openai: 0, gemini: 0, apify: 0 };
  const totals = {
    providerCalls,
    modelRequests: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    estimatedCostMicrousd: 0,
    providerReportedCostMicrousd: 0,
    completeness: calls.length === 0 ? 'none' : 'complete',
  };
  for (const call of calls) {
    if (Object.hasOwn(providerCalls, call.provider)) providerCalls[call.provider] += 1;
    totals.modelRequests += nonNegativeInteger(call.requests);
    totals.inputTokens += nonNegativeInteger(call.inputTokens);
    totals.cachedInputTokens += nonNegativeInteger(call.cachedInputTokens);
    totals.outputTokens += nonNegativeInteger(call.outputTokens);
    totals.thoughtTokens += nonNegativeInteger(call.thoughtTokens);
    totals.totalTokens += nonNegativeInteger(call.totalTokens);
    totals.estimatedCostMicrousd += nonNegativeInteger(call.estimatedCostMicrousd);
    totals.providerReportedCostMicrousd += nonNegativeInteger(call.providerReportedCostMicrousd);
    const costKnown = call.estimatedCostMicrousd !== null || call.providerReportedCostMicrousd !== null;
    if (!call.usageKnown || !costKnown) totals.completeness = 'partial';
  }
  return totals;
}

function normalizeStoredCalls(value, maxCalls = MAX_AGENT_STUDIO_USAGE_CALLS) {
  const calls = Array.isArray(value) ? value.filter((call) => call && typeof call === 'object') : [];
  const unique = new Map();
  for (const call of calls) unique.set(String(call.callId || crypto.randomUUID()), call);
  return [...unique.values()].slice(-maxCalls);
}

function buildUsageEnvelope(calls, maxCalls = MAX_AGENT_STUDIO_USAGE_CALLS) {
  const cappedCalls = normalizeStoredCalls(calls, maxCalls);
  return {
    schemaVersion: AGENT_STUDIO_USAGE_SCHEMA_VERSION,
    calls: cappedCalls,
    totals: aggregateAgentStudioUsage(cappedCalls),
  };
}

function createAgentStudioUsageCollector({ initialUsage = null, maxCalls = MAX_AGENT_STUDIO_USAGE_CALLS } = {}) {
  let envelope = buildUsageEnvelope(initialUsage?.calls || [], maxCalls);
  function addCall(call) {
    envelope = buildUsageEnvelope([...envelope.calls, call], maxCalls);
    return call;
  }
  return {
    recordOpenAI(args) {
      return addCall(normalizeOpenAIUsage(args));
    },
    recordGemini(args) {
      return addCall(normalizeGeminiUsage(args));
    },
    recordApify(args) {
      return addCall(normalizeApifyUsage(args));
    },
    snapshot() {
      return buildUsageEnvelope(envelope.calls, maxCalls);
    },
  };
}

function toPublicAgentStudioUsageSummary(usage) {
  const totals = buildUsageEnvelope(usage?.calls || []).totals;
  return {
    schemaVersion: AGENT_STUDIO_USAGE_SCHEMA_VERSION,
    providerCalls: { ...totals.providerCalls },
    modelRequests: totals.modelRequests,
    inputTokens: totals.inputTokens,
    cachedInputTokens: totals.cachedInputTokens,
    outputTokens: totals.outputTokens,
    thoughtTokens: totals.thoughtTokens,
    totalTokens: totals.totalTokens,
    estimatedCostUsd: microusdToUsd(totals.estimatedCostMicrousd),
    providerReportedCostUsd: microusdToUsd(totals.providerReportedCostMicrousd),
    completeness: totals.completeness,
  };
}

module.exports = {
  AGENT_STUDIO_USAGE_SCHEMA_VERSION,
  MAX_AGENT_STUDIO_USAGE_CALLS,
  usdToMicrousd,
  normalizeOpenAIUsage,
  normalizeGeminiUsage,
  normalizeApifyUsage,
  aggregateAgentStudioUsage,
  createAgentStudioUsageCollector,
  toPublicAgentStudioUsageSummary,
};
