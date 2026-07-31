import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const {
  createPostgresMetadataAuditStore,
} = require('../backend/services/metadataAuditStorage.cjs');
const {
  runStagingMetadataAudit,
} = require('../backend/services/stagingMetadataAudit.cjs');

function parseArgs(argv = []) {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error('metadata_audit_unknown_argument');
    if (['--preflight-only', '--execute'].includes(argument)) {
      flags.add(argument);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`metadata_audit_value_required_${argument.slice(2)}`);
    values[argument.slice(2)] = value;
    index += 1;
  }
  if (flags.size !== 1) throw new Error('metadata_audit_exactly_one_mode_required');
  const required = ['workspace-id', 'platform', 'input-type', 'source', 'limit', 'hard-cap-usd', 'deployed-commit'];
  for (const key of required) {
    if (!values[key]) throw new Error(`metadata_audit_argument_required_${key}`);
  }
  return {
    workspaceId: values['workspace-id'],
    platform: values.platform,
    inputType: values['input-type'],
    source: values.source,
    limit: Number(values.limit),
    hardCapUsd: Number(values['hard-cap-usd']),
    deployedCommitSha: values['deployed-commit'],
    preflightOnly: flags.has('--preflight-only'),
  };
}

let store = null;
try {
  const options = parseArgs(process.argv.slice(2));
  store = createPostgresMetadataAuditStore({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' || process.env.PGSSLMODE === 'require',
    appStateKey: process.env.APP_STATE_KEY || 'main',
    PoolClass: Pool,
  });
  const result = await runStagingMetadataAudit({ env: process.env, options, store });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.trace?.state === 'failed') process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    error: error?.code || error?.message || 'metadata_audit_failed',
    details: error?.details || null,
  })}\n`);
  process.exitCode = 1;
} finally {
  if (store) await store.close();
}
