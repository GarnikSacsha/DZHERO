'use strict';

function createKeyedMutex() {
  const tails = new Map();

  return {
    async run(key, task) {
      const lockKey = String(key || '');
      const previous = tails.get(lockKey) || Promise.resolve();
      let release;
      const current = new Promise((resolve) => {
        release = resolve;
      });
      const tail = previous.catch(() => {}).then(() => current);
      tails.set(lockKey, tail);
      await previous.catch(() => {});
      try {
        return await task();
      } finally {
        release();
        if (tails.get(lockKey) === tail) {
          tails.delete(lockKey);
        }
      }
    },
  };
}

async function withPostgresStateTransaction({
  pool,
  appStateKey,
  workspaceId,
  normalizeState,
  task,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `automatic-discovery:${workspaceId}`,
    ]);
    const result = await client.query(
      'SELECT data FROM app_state WHERE key = $1 FOR UPDATE',
      [appStateKey],
    );
    const state = normalizeState(result.rows[0]?.data || {});
    const value = await task(state);
    await client.query(
      `
        UPDATE app_state
        SET data = $2::jsonb,
            updated_at = now()
        WHERE key = $1
      `,
      [appStateKey, JSON.stringify(normalizeState(state))],
    );
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original transaction failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createKeyedMutex,
  withPostgresStateTransaction,
};
