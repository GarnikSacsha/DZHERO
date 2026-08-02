import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const {
  runStagingSignalFilterAudit,
} = require('../backend/services/stagingSignalFilterAudit.cjs');
const {
  createPostgresSignalFilterAuditStore,
} = require('../backend/services/stagingSignalFilterAuditStorage.cjs');

function parseArgs(argv = []) {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error('signal_filter_unknown_argument');
    if (['--preflight-only', '--execute'].includes(argument)) {
      flags.add(argument);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`signal_filter_value_required_${argument.slice(2)}`);
    }
    values[argument.slice(2)] = value;
    index += 1;
  }
  if (flags.size !== 1) throw new Error('signal_filter_exactly_one_mode_required');
  const required = [
    'metadata-audit-id',
    'candidate-id',
    'deployed-commit',
    'expected-source-handle',
    'expected-duration-seconds',
    'expected-ranking-score',
    'max-candidates',
    'max-downloads',
    'max-gemini-analyses',
    'max-output-tokens',
    'max-media-bytes',
    'max-media-duration-seconds',
    'max-metadata-text-chars',
    'apify-hard-cap-usd',
    'gemini-hard-cap-usd',
    'total-provider-hard-cap-usd',
    'retries',
    'fallbacks',
  ];
  for (const key of required) {
    if (values[key] === undefined) throw new Error(`signal_filter_argument_required_${key}`);
  }
  return {
    metadataAuditId: values['metadata-audit-id'],
    candidateId: values['candidate-id'],
    deployedCommitSha: values['deployed-commit'],
    expectedSourceHandle: values['expected-source-handle'],
    expectedDurationSeconds: Number(values['expected-duration-seconds']),
    expectedRankingScore: Number(values['expected-ranking-score']),
    maxCandidates: Number(values['max-candidates']),
    maxDownloads: Number(values['max-downloads']),
    maxGeminiAnalyses: Number(values['max-gemini-analyses']),
    maxOutputTokens: Number(values['max-output-tokens']),
    maxMediaBytes: Number(values['max-media-bytes']),
    maxMediaDurationSeconds: Number(values['max-media-duration-seconds']),
    maxMetadataTextChars: Number(values['max-metadata-text-chars']),
    apifyHardCapUsd: Number(values['apify-hard-cap-usd']),
    geminiHardCapUsd: Number(values['gemini-hard-cap-usd']),
    totalProviderHardCapUsd: Number(values['total-provider-hard-cap-usd']),
    retries: Number(values.retries),
    fallbacks: Number(values.fallbacks),
    preflightOnly: flags.has('--preflight-only'),
    execute: flags.has('--execute'),
  };
}

let store = null;
try {
  const options = parseArgs(process.argv.slice(2));
  store = createPostgresSignalFilterAuditStore({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' || process.env.PGSSLMODE === 'require',
    appStateKey: process.env.APP_STATE_KEY || 'main',
    PoolClass: Pool,
  });
  const result = await runStagingSignalFilterAudit({ env: process.env, options, store });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    error: error?.code || error?.message || 'signal_filter_audit_failed',
    details: error?.details || null,
  })}\n`);
  process.exitCode = 1;
} finally {
  if (store) await store.close();
}
