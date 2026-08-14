import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  buildMediaPersistenceReport,
  main,
  parseCliArgs,
  persistBenchmarkMedia,
  runObservedQualityInteraction,
  runLoadMode,
  validatePersistedBenchmarkMedia,
} from './signal-filter-soak.mjs';

const require = createRequire(import.meta.url);
const {
  loadSignalQualityGateConfig,
} = require('../backend/services/signalQualityGate.cjs');

const parsed = parseCliArgs([
  'load',
  '--counts=10,20',
  '--seed',
  '42',
  '--confirm-paid',
]);
assert.equal(parsed.mode, 'load');
assert.equal(parsed.options.counts, '10,20');
assert.equal(parsed.options.seed, '42');
assert.equal(parsed.options['confirm-paid'], true);

const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dzhero-signal-filter-soak-test-'));
const loadResult = await runLoadMode({
  counts: '100',
  seed: '42',
  concurrency: '4',
  'max-retries': '2',
  'determinism-runs': '2',
  'discovery-candidates': '50',
  'max-quality-evaluations': '1',
  'output-dir': outputDirectory,
});

assert.equal(loadResult.report.mode, 'load');
assert.equal(loadResult.report.runs.length, 1);
assert.equal(loadResult.report.runs[0].count, 100);
assert.equal(loadResult.report.runs[0].deterministic, true);
assert.equal(loadResult.report.runs[0].primary.completedCount, 100);
assert.equal(loadResult.report.runs[0].primary.decisions.error, 7);
assert.equal(loadResult.report.runs[0].primary.schemaFailures, 5);
assert.equal(loadResult.report.runs[0].primary.retries, 7);
assert.equal(loadResult.report.runs[0].primary.peakConcurrency, 4);
assert.equal(loadResult.report.providerCalls.paid, 0);
assert.equal(loadResult.report.providerCalls.gemini, 0);
assert.equal(loadResult.report.providerCalls.apify, 0);
assert.equal(loadResult.report.providerCalls.unexpectedNetworkAttempts, 0);
assert.equal(loadResult.report.runtimeDb.inspected, false);
assert.equal(loadResult.report.automaticDiscovery.metadataCandidateCount, 50);
assert.equal(loadResult.report.automaticDiscovery.qualityAttempts, 1);
assert.equal(loadResult.report.automaticDiscovery.withinLimit, true);
assert.equal(loadResult.report.automaticDiscovery.realProviderCalls, 0);
assert.equal(fs.existsSync(loadResult.artifacts.reportPath), true);
assert.equal(fs.existsSync(loadResult.artifacts.summaryPath), true);

const mediaPersistenceOutputDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'dzhero-signal-filter-media-test-'),
);
const mockMediaBytes = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x6d, 0x70, 0x34, 0x32, 0x6d, 0x6f, 0x63, 0x6b,
]);
const mockMediaEvaluationLinks = [
  { interactionNumber: 1, repeat: 1 },
  { interactionNumber: 2, repeat: 2 },
  { interactionNumber: 3, repeat: 3 },
];
const persistedMockMedia = persistBenchmarkMedia({
  outputDirectory: mediaPersistenceOutputDirectory,
  benchmarkId: 'mock-benchmark',
  bytes: mockMediaBytes,
  mimeType: 'video/mp4',
  downloadCount: 1,
  evaluationLinks: mockMediaEvaluationLinks,
  sourceUrl: 'https://provider.invalid/video.mp4?token=signed-secret-never-write',
  Authorization: 'Bearer authorization-never-write',
});
assert.equal(persistedMockMedia.relativePath, 'media/mock-benchmark.mp4');
assert.equal(persistedMockMedia.benchmarkId, 'mock-benchmark');
assert.equal(persistedMockMedia.mimeType, 'video/mp4');
assert.equal(persistedMockMedia.byteLength, mockMediaBytes.length);
assert.equal(
  persistedMockMedia.sha256,
  crypto.createHash('sha256').update(mockMediaBytes).digest('hex'),
);
assert.equal(persistedMockMedia.downloadCount, 1);
assert.deepEqual(persistedMockMedia.evaluationLinks, mockMediaEvaluationLinks);
assert.equal(persistedMockMedia.mediaPersisted, true);
assert.equal(persistedMockMedia.persistenceError, null);
assert.equal(persistedMockMedia.persistedByThisCall, true);
const persistedMockMediaPath = path.join(
  mediaPersistenceOutputDirectory,
  ...persistedMockMedia.relativePath.split('/'),
);
assert.deepEqual(fs.readFileSync(persistedMockMediaPath), mockMediaBytes);

const repeatedPersistedMockMedia = persistBenchmarkMedia({
  outputDirectory: mediaPersistenceOutputDirectory,
  benchmarkId: 'mock-benchmark',
  bytes: mockMediaBytes,
  mimeType: 'video/mp4',
  downloadCount: 1,
  evaluationLinks: mockMediaEvaluationLinks,
});
assert.equal(repeatedPersistedMockMedia.persistedByThisCall, false);
assert.deepEqual(fs.readFileSync(persistedMockMediaPath), mockMediaBytes);

const mediaPersistenceReport = buildMediaPersistenceReport({
  outputDirectory: mediaPersistenceOutputDirectory,
  expectedBenchmarkIds: ['mock-benchmark'],
  records: [persistedMockMedia],
});
assert.equal(mediaPersistenceReport.enabled, true);
assert.equal(mediaPersistenceReport.mediaPersisted, true);
assert.equal(mediaPersistenceReport.records.length, 1);
assert.equal(mediaPersistenceReport.records[0].relativePath, 'media/mock-benchmark.mp4');
assert.equal(validatePersistedBenchmarkMedia(
  mediaPersistenceReport.records,
  ['mock-benchmark'],
), true);
assert.throws(
  () => validatePersistedBenchmarkMedia([], ['mock-benchmark']),
  /live_media_persistence_required_mock-benchmark/,
);
assert.throws(
  () => validatePersistedBenchmarkMedia([{
    benchmarkId: 'mock-benchmark',
    mediaPersisted: false,
    persistenceError: 'mock_write_failed',
  }], ['mock-benchmark']),
  /live_media_persistence_required_mock-benchmark/,
);
const serializedMediaReport = JSON.stringify(mediaPersistenceReport);
assert.equal(serializedMediaReport.includes('signed-secret-never-write'), false);
assert.equal(serializedMediaReport.includes('authorization-never-write'), false);

const mockConfig = loadSignalQualityGateConfig();
const mockParsedGeminiOutput = {
  accessible: true,
  pass: true,
  summary: 'Mock provider response for an observability trace.',
  derivedClaims: {
    centralIdea: {
      text: 'A workflow is explained.',
      evidenceIds: ['obs_duplicate'],
      supportLevel: 'demonstrated',
    },
    contentMechanic: {
      text: 'A reusable workflow mechanic is explained.',
      evidenceIds: ['obs_duplicate', 'obs_missing'],
      supportLevel: 'demonstrated',
    },
    visualExecution: {
      text: 'The interface is shown.',
      evidenceIds: ['obs_duplicate'],
      supportLevel: 'demonstrated',
    },
    adaptationTemplate: {
      text: '[tool] enables [workflow].',
      evidenceIds: ['obs_duplicate'],
      supportLevel: 'inferred',
    },
  },
  scores: {
    contentValue: 99,
    adaptability: 98,
    topicClarity: 97,
    hookStrength: 96,
    payoffStrength: 95,
    brandRelevance: 94,
  },
  evidenceConfidence: 0.91,
  slopIndicators: ['raw_mock_slop_indicator'],
  observations: [
    {
      id: 'obs_duplicate',
      timestamp: '00:01',
      source: 'spoken',
      kind: 'claim',
      description: 'A speaker makes a concrete claim.',
      confidence: 0.95,
    },
    {
      id: 'obs_duplicate',
      timestamp: '00:02',
      source: 'visual',
      kind: 'process',
      description: 'The same observation ID is deliberately repeated.',
      confidence: 0.92,
    },
  ],
  evidenceChains: [],
  unknowns: ['The final payoff is not visible.'],
};
const mockSecret = 'mock-api-key-never-write';
const mockAuthorization = 'Bearer mock-authorization-never-write';
const mockProviderPayload = {
  model: 'gemini-observability-mock',
  candidates: [{
    content: {
      parts: [{ text: JSON.stringify(mockParsedGeminiOutput) }],
    },
    finishReason: 'STOP',
  }],
  usageMetadata: {
    promptTokenCount: 123,
    candidatesTokenCount: 45,
    totalTokenCount: 168,
  },
  debug: {
    Authorization: mockAuthorization,
    apiKey: mockSecret,
    requestUrl: `https://provider.invalid/interactions?key=${mockSecret}`,
  },
};
const mockUsageRecords = [];
const observed = await runObservedQualityInteraction({
  benchmarkId: 'mock-observability',
  repeatIndex: 0,
  interactionNumber: 1,
  signal: { videoUrl: 'https://media.invalid/mock.mp4' },
  config: mockConfig,
  model: 'gemini-observability-mock',
  apiKey: mockSecret,
  fetchImpl: async () => new Response(JSON.stringify(mockProviderPayload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }),
  usageRecords: mockUsageRecords,
  inputRatePerMillion: 1,
  outputRatePerMillion: 2,
  analyzeVideo: async ({ fetchImpl }) => {
    await fetchImpl(`https://provider.invalid/interactions?key=${mockSecret}`, {
      headers: { Authorization: mockAuthorization },
    });
    return mockParsedGeminiOutput;
  },
});
assert.equal(observed.trace.interaction.benchmarkId, 'mock-observability');
assert.equal(observed.trace.interaction.repeat, 1);
assert.equal(observed.trace.interaction.interactionNumber, 1);
assert.equal(observed.trace.interaction.effectiveGeminiModel, 'gemini-observability-mock');
assert.equal(observed.trace.interaction.attemptNumber, 1);
assert.equal(observed.trace.interaction.retryCount, 0);
assert.ok(observed.trace.interaction.startedAt);
assert.ok(observed.trace.interaction.completedAt);
assert.ok(observed.trace.interaction.latencyMs >= 0);
assert.deepEqual(
  observed.trace.rawProviderResponse.responseBody.candidates,
  mockProviderPayload.candidates,
);
assert.equal(
  observed.trace.rawProviderResponse.responseBody.usageMetadata.promptTokenCount,
  123,
);
assert.equal(observed.trace.rawProviderResponse.generatedText, JSON.stringify(mockParsedGeminiOutput));
assert.equal(observed.trace.rawProviderResponse.finishReason, 'STOP');
assert.equal(observed.trace.parsedGeminiOutput.pass, true);
assert.deepEqual(observed.trace.parsedGeminiOutput.unknowns, mockParsedGeminiOutput.unknowns);
assert.deepEqual(
  observed.trace.parsedGeminiOutput.slopIndicators,
  mockParsedGeminiOutput.slopIndicators,
);
assert.equal(observed.trace.deterministicPolicyResult.decision, 'reject');
assert.equal(observed.trace.deterministicPolicyResult.admittedToBank, false);
assert.notEqual(
  observed.trace.parsedGeminiOutput.pass,
  observed.trace.deterministicPolicyResult.decision === 'accept',
);
assert.deepEqual(observed.trace.deterministicPolicyResult.missingEvidenceIds, ['obs_missing']);
assert.deepEqual(observed.trace.deterministicPolicyResult.duplicateEvidenceIds, ['obs_duplicate']);
assert.equal(observed.trace.linkage.rawToParsed, 'same_interaction_response');
assert.match(observed.trace.linkage.parsedToPolicy, /^applySignalQualityPolicy/);
assert.equal(mockUsageRecords[0].attemptNumber, 1);
assert.equal(mockUsageRecords[0].retryCount, 0);
const serializedObserved = JSON.stringify(observed.trace);
assert.equal(serializedObserved.includes(mockSecret), false);
assert.equal(serializedObserved.includes(mockAuthorization), false);
assert.equal(serializedObserved.includes('"Authorization"'), false);
assert.equal(serializedObserved.includes('"apiKey"'), false);

const preflightOutputDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'dzhero-signal-filter-preflight-test-'),
);
const paidPreflight = await main([
  'consistency',
  '--manifest=scripts/fixtures/signal-filter-benchmark.json',
  '--repeats=3',
  '--concurrency=1',
  '--max-videos=2',
  '--max-gemini-attempts=6',
  '--max-apify-runs=2',
  '--max-paid-usd=0.40',
  '--gemini-ceiling-usd=0.06',
  '--apify-ceiling-usd=0.02',
  `--output-dir=${preflightOutputDirectory}`,
]);
assert.equal(paidPreflight.report.status, 'preflight_passed');
assert.equal(paidPreflight.report.providerCalls.apify, 0);
assert.equal(paidPreflight.report.providerCalls.gemini, 0);
assert.equal(paidPreflight.report.providerCalls.retries, 0);
assert.equal(paidPreflight.report.preflight.confirmPaid, false);
assert.equal(paidPreflight.report.preflight.plannedEvaluations, 6);
assert.equal(paidPreflight.report.preflight.plannedApifyRuns, 2);
assert.equal(paidPreflight.report.preflight.automaticRetries, 0);
assert.equal(paidPreflight.report.preflight.policyVersion, 3.1);
assert.equal(paidPreflight.report.preflight.maxVideoAnalysesPerRun, 1);
assert.ok(paidPreflight.report.preflight.effectiveGeminiModel);
assert.equal(paidPreflight.report.preflight.upperBoundUsd, 0.4);
assert.equal(paidPreflight.report.preflight.mediaPersistence.enabled, true);
assert.equal(paidPreflight.report.preflight.mediaPersistence.exactBytes, true);
assert.equal(paidPreflight.report.preflight.mediaPersistence.transcodeApplied, false);
assert.equal(paidPreflight.report.preflight.mediaPersistence.outputDirectoryWritable, true);
assert.equal(paidPreflight.report.preflight.evidenceFrameExtraction.available, true);
assert.deepEqual(
  paidPreflight.report.preflight.benchmarkIds,
  ['mindstudio-accept', 'axial-teaser-reject'],
);
assert.equal(paidPreflight.report.observability.rawProviderResponseCaptured, true);
assert.equal(paidPreflight.report.observability.parsedGeminiOutputCaptured, true);
assert.equal(paidPreflight.report.observability.deterministicPolicyResultCaptured, true);
assert.equal(paidPreflight.report.observability.threeStateDecisionCaptured, true);
assert.equal(paidPreflight.report.observability.bankAdmissionCaptured, true);
assert.equal(paidPreflight.report.observability.providerDecisionCaptured, true);
assert.equal(paidPreflight.report.observability.uncertaintyCaptured, true);
assert.equal(paidPreflight.report.observability.evidenceChainsCaptured, true);
assert.equal(paidPreflight.report.observability.causalChainValidationCaptured, true);
assert.equal(paidPreflight.report.observability.mediaPersistenceCaptured, true);
assert.equal(paidPreflight.report.observability.evidenceFramesCaptured, true);
assert.equal(paidPreflight.report.observability.requestHeadersCaptured, false);
assert.equal(paidPreflight.report.observability.requestUrlsCaptured, false);
assert.equal(fs.existsSync(paidPreflight.artifacts.reportPath), true);
assert.equal(fs.existsSync(paidPreflight.artifacts.summaryPath), true);
const preflightArtifactText = fs.readFileSync(paidPreflight.artifacts.reportPath, 'utf8');
assert.equal(preflightArtifactText.includes('GEMINI_API_KEY'), false);
assert.equal(preflightArtifactText.includes('APIFY_TOKEN'), false);
assert.equal(preflightArtifactText.includes('"Authorization"'), false);

await assert.rejects(
  () => main([
    'benchmark',
    '--manifest=scripts/fixtures/signal-filter-benchmark.json',
    '--repeats=3',
    '--max-videos=2',
    '--max-gemini-attempts=5',
    '--max-apify-runs=2',
    '--max-paid-usd=1',
  ]),
  /planned_evaluations_exceed_gemini_attempt_cap/,
);

console.log('signal filter soak harness tests passed');
