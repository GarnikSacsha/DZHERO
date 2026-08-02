'use strict';

function createInMemorySignalFilterAuditStore(initialState = {}) {
  const state = structuredClone(initialState);
  return {
    async readState() {
      return structuredClone(state);
    },
    async mutateState(_workspaceId, mutation) {
      return mutation(state);
    },
  };
}

function createPostgresSignalFilterAuditStore({
  connectionString,
  ssl = false,
  appStateKey = 'main',
  PoolClass,
}) {
  if (!connectionString) throw new Error('signal_filter_audit_database_url_required');
  if (typeof PoolClass !== 'function') throw new Error('signal_filter_audit_pool_class_required');
  const pool = new PoolClass({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });

  return {
    async readState() {
      const result = await pool.query('SELECT data FROM app_state WHERE key = $1', [appStateKey]);
      if (!result.rows[0]?.data) throw new Error('signal_filter_audit_app_state_missing');
      return structuredClone(result.rows[0].data);
    },
    async mutateState(workspaceId, mutation) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `staging-signal-filter-audit:${workspaceId}`,
        ]);
        const result = await client.query(
          'SELECT data FROM app_state WHERE key = $1 FOR UPDATE',
          [appStateKey],
        );
        if (!result.rows[0]?.data) throw new Error('signal_filter_audit_app_state_missing');
        const state = structuredClone(result.rows[0].data);
        const value = await mutation(state);
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
        return value;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original mutation failure.
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
  createInMemorySignalFilterAuditStore,
  createPostgresSignalFilterAuditStore,
};
