'use strict';

const MAX_METADATA_AUDIT_RUNS = 100;

function upsertMetadataAuditTrace(state = {}, trace = {}) {
  const runs = Array.isArray(state.metadataAuditRuns) ? state.metadataAuditRuns : [];
  const nextRuns = runs.filter((item) => item?.id !== trace.id);
  nextRuns.unshift(structuredClone(trace));
  state.metadataAuditRuns = nextRuns.slice(0, MAX_METADATA_AUDIT_RUNS);
  return structuredClone(trace);
}

function createInMemoryMetadataAuditStore(initialState = {}) {
  const state = structuredClone(initialState);
  return {
    async readState() {
      return structuredClone(state);
    },
    async writeTrace(trace) {
      return upsertMetadataAuditTrace(state, trace);
    },
  };
}

function createPostgresMetadataAuditStore({
  connectionString,
  ssl = false,
  appStateKey = 'main',
  PoolClass,
}) {
  if (!connectionString) throw new Error('metadata_audit_database_url_required');
  if (typeof PoolClass !== 'function') throw new Error('metadata_audit_pool_class_required');
  const pool = new PoolClass({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });

  return {
    async readState() {
      const result = await pool.query('SELECT data FROM app_state WHERE key = $1', [appStateKey]);
      if (!result.rows[0]?.data) throw new Error('metadata_audit_app_state_missing');
      return structuredClone(result.rows[0].data);
    },
    async writeTrace(trace) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `metadata-audit:${appStateKey}`,
        ]);
        const result = await client.query(
          'SELECT data FROM app_state WHERE key = $1 FOR UPDATE',
          [appStateKey],
        );
        if (!result.rows[0]?.data) throw new Error('metadata_audit_app_state_missing');
        const state = structuredClone(result.rows[0].data);
        upsertMetadataAuditTrace(state, trace);
        await client.query(
          `
            UPDATE app_state
            SET data = $2::jsonb,
                updated_at = now()
            WHERE key = $1
          `,
          [appStateKey, JSON.stringify(state)],
        );
        await client.query('COMMIT');
        return structuredClone(trace);
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original storage error.
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  MAX_METADATA_AUDIT_RUNS,
  createInMemoryMetadataAuditStore,
  createPostgresMetadataAuditStore,
  upsertMetadataAuditTrace,
};
