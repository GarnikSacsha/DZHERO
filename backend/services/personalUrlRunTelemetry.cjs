'use strict';

const ALLOWED_PLATFORMS = new Set(['youtube', 'tiktok', 'instagram', 'unknown']);
const ALLOWED_STAGES = new Set(['source_resolution', 'remix', 'persistence']);
const MAX_RECORDS = 500;

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeTokenUsage(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const inputTokens = finiteNonNegative(
    value.inputTokens
      ?? value.input_tokens
      ?? value.total_input_tokens
      ?? value.promptTokenCount
      ?? value.prompt_tokens,
  );
  const outputTokens = finiteNonNegative(
    value.outputTokens
      ?? value.output_tokens
      ?? value.total_output_tokens
      ?? value.candidatesTokenCount
      ?? value.completion_tokens,
  );
  const totalTokens = finiteNonNegative(
    value.totalTokens
      ?? value.total_tokens
      ?? value.totalTokenCount,
  );
  if (inputTokens === null && outputTokens === null && totalTokens === null) return null;
  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens ?? ((inputTokens ?? 0) + (outputTokens ?? 0)),
  };
}

function normalizeActualCost(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const actualUsd = finiteNonNegative(value.actualCostUsd ?? value.actual_cost_usd);
  return actualUsd === null ? null : { actualUsd };
}

function compactSafeToken(value, fallback, maxLength = 80) {
  const token = String(value || '').trim().toLowerCase();
  if (!token || !/^[a-z0-9_.:-]+$/.test(token)) return fallback;
  return token.slice(0, maxLength);
}

function createPersonalUrlRunTracker({ runId, platform, acquisitionMode, now = Date.now() } = {}) {
  return {
    runId: String(runId || ''),
    platform: ALLOWED_PLATFORMS.has(String(platform || '').toLowerCase())
      ? String(platform).toLowerCase()
      : 'unknown',
    acquisitionMode: compactSafeToken(acquisitionMode, 'unknown'),
    startedAtMs: Number(now),
    stageStartedAt: new Map(),
    stageTimingsMs: {},
    providerAttempts: [],
    usageByProvider: {},
    costByProvider: {},
  };
}

function startPersonalUrlRunStage(tracker, stage, now = Date.now()) {
  if (!tracker || !ALLOWED_STAGES.has(stage) || tracker.stageStartedAt.has(stage)) return;
  tracker.stageStartedAt.set(stage, Number(now));
}

function finishPersonalUrlRunStage(tracker, stage, now = Date.now()) {
  if (!tracker || !ALLOWED_STAGES.has(stage)) return;
  const startedAt = tracker.stageStartedAt.get(stage);
  if (!Number.isFinite(startedAt)) return;
  tracker.stageTimingsMs[stage] = Math.max(0, Math.round(Number(now) - startedAt));
  tracker.stageStartedAt.delete(stage);
}

function recordPersonalUrlProviderAttempt(tracker, event = {}) {
  if (!tracker) return;
  tracker.providerAttempts.push({
    provider: compactSafeToken(event.provider, 'unknown'),
    model: compactSafeToken(event.model, 'unknown', 120),
    operation: compactSafeToken(event.operation, 'unknown'),
  });
}

function recordPersonalUrlProviderUsage(tracker, provider, value) {
  if (!tracker) return;
  const key = compactSafeToken(provider, 'unknown');
  const usage = normalizeTokenUsage(value);
  const cost = normalizeActualCost(value);
  if (usage) tracker.usageByProvider[key] = usage;
  if (cost) tracker.costByProvider[key] = cost;
}

function finalizePersonalUrlRun(tracker, {
  terminalReason,
  reuseState = 'none',
  singleFlightState = 'leader',
  now = Date.now(),
} = {}) {
  const providerMap = new Map();
  for (const attempt of tracker?.providerAttempts || []) {
    const key = `${attempt.provider}:${attempt.model}:${attempt.operation}`;
    const current = providerMap.get(key) || { ...attempt, attemptCount: 0 };
    current.attemptCount += 1;
    providerMap.set(key, current);
  }
  return {
    runId: String(tracker?.runId || ''),
    platform: tracker?.platform || 'unknown',
    acquisitionMode: tracker?.acquisitionMode || 'unknown',
    overallTimingMs: Math.max(0, Math.round(Number(now) - Number(tracker?.startedAtMs || now))),
    stageTimingsMs: { ...(tracker?.stageTimingsMs || {}) },
    providers: Array.from(providerMap.values()),
    usageByProvider: { ...(tracker?.usageByProvider || {}) },
    costByProvider: { ...(tracker?.costByProvider || {}) },
    reuseState: compactSafeToken(reuseState, 'none'),
    singleFlightState: compactSafeToken(singleFlightState, 'leader'),
    terminalReason: compactSafeToken(terminalReason, 'unknown', 120),
    recordedAt: new Date(Number(now)).toISOString(),
  };
}

function appendPersonalUrlRunTelemetry(records, record, maxRecords = MAX_RECORDS) {
  const output = Array.isArray(records) ? records : [];
  output.unshift(record);
  if (output.length > maxRecords) output.length = maxRecords;
  return output;
}

module.exports = {
  MAX_RECORDS,
  appendPersonalUrlRunTelemetry,
  createPersonalUrlRunTracker,
  finalizePersonalUrlRun,
  finishPersonalUrlRunStage,
  normalizeActualCost,
  normalizeTokenUsage,
  recordPersonalUrlProviderAttempt,
  recordPersonalUrlProviderUsage,
  startPersonalUrlRunStage,
};
