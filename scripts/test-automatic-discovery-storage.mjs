import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import discovery from '../backend/services/automaticSignalDiscovery.js';
import storage from '../backend/services/automaticDiscoveryStorage.js';

const { createKeyedMutex, withPostgresStateTransaction } = storage;
const mutex = createKeyedMutex();
const now = new Date('2026-07-09T06:00:00.000Z');
const state = {
  workspaces: [{
    id: 'ws_atomic',
    createdAt: '2026-07-09T00:00:00.000Z',
    discoverySettings: {
      ...discovery.defaultDiscoverySettings(new Date('2026-07-09T00:00:00.000Z')),
      platforms: ['instagram'],
      nextRunAt: {
        accounts: now.toISOString(),
        keywords: '2026-07-10T00:00:00.000Z',
        hashtags: '2026-07-10T00:00:00.000Z',
        trends: '2026-07-10T00:00:00.000Z',
      },
    },
  }],
  sources: [{ id: 'atomic_source', workspaceId: 'ws_atomic', type: 'instagram', handle: '@atomic' }],
  competitors: [],
  instagramAccounts: [],
  tiktokAccounts: [],
  reels: [],
  discoveryRuns: [],
};

let providerExecutions = 0;
const attempt = async () => {
  const prepared = await mutex.run('ws_atomic', async () => discovery.prepareAutomaticDiscovery({
    state,
    workspaceId: 'ws_atomic',
    now,
  }));
  if (!prepared.execution) return null;
  providerExecutions += 1;
  return discovery.executeAutomaticDiscovery({
    state,
    workspaceId: 'ws_atomic',
    now,
    prepared,
    fetchSignals: async () => [],
  });
};

const [first, second] = await Promise.all([attempt(), attempt()]);
assert.equal([first, second].filter(Boolean).length, 1);
assert.equal(providerExecutions, 1);
assert.equal(state.discoveryRuns.length, 1);

let postgresState = structuredClone({
  ...state,
  discoveryRuns: [],
  workspaces: state.workspaces.map((workspace) => ({
    ...workspace,
    discoverySettings: {
      ...workspace.discoverySettings,
      nextRunAt: {
        accounts: now.toISOString(),
        keywords: '2026-07-10T00:00:00.000Z',
        hashtags: '2026-07-10T00:00:00.000Z',
        trends: '2026-07-10T00:00:00.000Z',
      },
    },
  })),
});
let postgresLockTail = Promise.resolve();
let postgresConnectCount = 0;
let postgresReleaseCount = 0;
const fakePool = {
  async connect() {
    postgresConnectCount += 1;
    let releaseTransactionLock = null;
    return {
      async query(sql, params = []) {
        if (sql.includes('pg_advisory_xact_lock')) {
          const previous = postgresLockTail;
          postgresLockTail = new Promise((resolve) => {
            releaseTransactionLock = resolve;
          });
          await previous;
          return { rows: [] };
        }
        if (sql.includes('SELECT data FROM app_state')) {
          return { rows: [{ data: structuredClone(postgresState) }] };
        }
        if (sql.includes('UPDATE app_state')) {
          postgresState = JSON.parse(params[1]);
          return { rows: [] };
        }
        if (sql === 'COMMIT' || sql === 'ROLLBACK') {
          releaseTransactionLock?.();
          releaseTransactionLock = null;
          return { rows: [] };
        }
        return { rows: [] };
      },
      release() {
        postgresReleaseCount += 1;
      },
    };
  },
};

const postgresAttempt = () => withPostgresStateTransaction({
  pool: fakePool,
  appStateKey: 'main',
  workspaceId: 'ws_atomic',
  normalizeState: (value) => value,
  task: async (transactionState) => discovery.prepareAutomaticDiscovery({
    state: transactionState,
    workspaceId: 'ws_atomic',
    now,
  }),
});
const postgresClaims = await Promise.all([postgresAttempt(), postgresAttempt()]);
let postgresProviderExecutions = 0;
for (const prepared of postgresClaims) {
  if (!prepared.execution) continue;
  postgresProviderExecutions += 1;
  await discovery.executeAutomaticDiscovery({
    state: postgresState,
    workspaceId: 'ws_atomic',
    now,
    prepared,
    fetchSignals: async () => [],
  });
}
assert.equal(postgresClaims.filter((claim) => claim.execution).length, 1);
assert.equal(postgresProviderExecutions, 1);
assert.equal(postgresState.discoveryRuns.length, 1);
assert.equal(postgresConnectCount, 2);
assert.equal(postgresReleaseCount, 2);

const serverSource = readFileSync(new URL('../backend/server.js', import.meta.url), 'utf8');
const storageSource = readFileSync(new URL('../backend/services/automaticDiscoveryStorage.js', import.meta.url), 'utf8');
assert.match(storageSource, /pool\.connect\(\)/);
assert.match(storageSource, /BEGIN/);
assert.match(storageSource, /pg_advisory_xact_lock/);
assert.match(storageSource, /FOR UPDATE/);
assert.match(serverSource, /withAutomaticDiscoveryStateLock/);
assert.match(serverSource, /function mergeAutomaticDiscoveryWriteSnapshot/);
assert.match(serverSource, /SELECT data FROM app_state WHERE key = \$1 FOR UPDATE/);
assert.match(serverSource, /preserveAutomaticDiscovery = true/);
assert.match(serverSource, /runAutomaticDiscoveryWorkerTick\(\)\.catch\(logAutomaticDiscoveryWorkerError\)/);

console.log('automatic discovery storage tests passed');
