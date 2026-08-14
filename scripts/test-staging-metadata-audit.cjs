'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const {
  runApifyActor,
} = require('../backend/services/apifySignalProvider.js');
const {
  createInMemoryMetadataAuditStore,
  createPostgresMetadataAuditStore,
} = require('../backend/services/metadataAuditStorage.cjs');
const {
  buildMetadataAuditPreflight,
  runStagingMetadataAudit,
  sanitizeAuditValue,
} = require('../backend/services/stagingMetadataAudit.cjs');

const dbPath = path.resolve(__dirname, '..', 'backend', 'data', 'db.example.json');
const dbHashBefore = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
const commitA = 'a'.repeat(40);
const commitB = 'b'.repeat(40);
const commitC = 'c'.repeat(40);

function createState() {
  return {
    users: [{ id: 'user_audit', workspaceId: 'ws_audit', email: 'audit@example.test', role: 'owner' }],
    workspaces: [{
      id: 'ws_audit',
      discoverySettings: { enabled: true, dailyBudgetUsd: 0.8 },
      productBrandBrain: {
        id: 'brand_audit',
        name: 'Audit Brand',
        brain: {
          profileDescription: 'AI workflow product for small teams.',
          audience: 'Small product teams',
          niche: 'AI automation',
          market: 'Ukraine and Europe',
          instagramUrl: 'https://www.instagram.com/chatcutapp/',
        },
      },
    }],
    reels: [{
      id: 'verified_existing',
      workspaceId: 'ws_audit',
      importedMetadata: { qualityGate: { decision: 'accept', admittedToBank: true } },
    }],
    discoveryRuns: [],
    subscriptions: [],
    plans: [],
    metadataAuditRuns: [],
  };
}

function createEnv(commit = commitA) {
  return {
    RAILWAY_ENVIRONMENT_NAME: 'staging',
    RAILWAY_ENVIRONMENT_ID: 'env_staging',
    STAGING_METADATA_AUDIT_ENVIRONMENT_ID: 'env_staging',
    RAILWAY_PROJECT_ID: 'project_staging',
    STAGING_METADATA_AUDIT_PROJECT_ID: 'project_staging',
    RAILWAY_SERVICE_NAME: 'backend',
    RAILWAY_DEPLOYMENT_ID: 'deployment_staging',
    RAILWAY_REPLICA_ID: 'replica_staging',
    RAILWAY_GIT_COMMIT_SHA: commit,
    ENABLE_STAGING_METADATA_AUDIT: 'true',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    DATABASE_URL: 'postgresql://audit:database-secret@postgres.internal/audit',
    APIFY_TOKEN: 'apify-secret-never-persist',
    GEMINI_API_KEY: '',
    BETA_OWNER_TEST_ENABLED: 'true',
    BETA_OWNER_TEST_SCOPE: 'staging',
    BETA_OWNER_TEST_USER_ID: 'user_audit',
    BETA_OWNER_TEST_WORKSPACE_ID: 'ws_audit',
  };
}

function createOptions(commit = commitA, overrides = {}) {
  return {
    workspaceId: 'ws_audit',
    platform: 'instagram',
    inputType: 'profile',
    source: '@chatcutapp',
    limit: 5,
    hardCapUsd: 0.3,
    deployedCommitSha: commit,
    preflightOnly: true,
    ...overrides,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code, code);
}

async function main() {
const state = createState();
const env = createEnv();
const basePreflight = buildMetadataAuditPreflight({ state, env, options: createOptions() });
assert.equal(basePreflight.estimatedCostUsd, 0.15);
assert.equal(basePreflight.effectiveBudgetUsd, 0.3, 'workspace budget 0.8 must not widen command cap');
assert.equal(basePreflight.actorInput.includeDownloadedVideo, false);
assert.equal(basePreflight.invariants.downloads, 0);
assert.equal(basePreflight.invariants.geminiCalls, 0);
assert.equal(basePreflight.invariants.signalFilterCalls, 0);
assert.equal(basePreflight.invariants.maxVideoAnalysesPerRun, 1);

for (const environmentName of ['production', 'local', 'unknown', '']) {
  expectCode(
    () => buildMetadataAuditPreflight({
      state,
      env: { ...env, RAILWAY_ENVIRONMENT_NAME: environmentName },
      options: createOptions(),
    }),
    'metadata_audit_staging_required',
  );
}
const tiktokCapPreflight = buildMetadataAuditPreflight({
  state,
  env,
  options: createOptions(commitA, {
    platform: 'tiktok',
    hardCapUsd: 0.5,
  }),
});
assert.equal(tiktokCapPreflight.estimatedCostUsd, 0.2);
assert.equal(tiktokCapPreflight.hardCapUsd, 0.5);
assert.equal(tiktokCapPreflight.effectiveBudgetUsd, 0.5);
expectCode(
  () => buildMetadataAuditPreflight({ state, env: { ...env, ENABLE_STAGING_METADATA_AUDIT: 'false' }, options: createOptions() }),
  'metadata_audit_feature_disabled',
);
expectCode(
  () => buildMetadataAuditPreflight({ state, env: { ...env, RAILWAY_REPLICA_ID: '' }, options: createOptions() }),
  'metadata_audit_railway_runtime_required',
);
expectCode(
  () => buildMetadataAuditPreflight({ state, env, options: createOptions(commitA, { hardCapUsd: 0.51 }) }),
  'metadata_audit_hard_cap_invalid',
);
expectCode(
  () => buildMetadataAuditPreflight({ state, env, options: createOptions(commitA, { limit: 6 }) }),
  'metadata_audit_limit_invalid',
);
expectCode(
  () => buildMetadataAuditPreflight({ state, env, options: createOptions(commitA, { hardCapUsd: 0.14 }) }),
  'metadata_audit_estimate_exceeds_effective_budget',
);
expectCode(
  () => buildMetadataAuditPreflight({ state, env: { ...env, GEMINI_API_KEY: 'forbidden' }, options: createOptions() }),
  'metadata_audit_gemini_credentials_forbidden',
);

let preflightProviderCalls = 0;
const preflightStore = createInMemoryMetadataAuditStore(state);
const preflightResult = await runStagingMetadataAudit({
  env,
  options: createOptions(),
  store: preflightStore,
  runActor: async () => { preflightProviderCalls += 1; return { items: [] }; },
});
assert.equal(preflightProviderCalls, 0);
assert.equal(preflightResult.trace, null);
assert.equal((await preflightStore.readState()).metadataAuditRuns.length, 0);

let overEstimateProviderCalls = 0;
await assert.rejects(
  runStagingMetadataAudit({
    env,
    options: createOptions(commitA, { hardCapUsd: 0.5, preflightOnly: false }),
    store: createInMemoryMetadataAuditStore(state),
    estimateRunCost: () => 0.51,
    runActor: async () => {
      overEstimateProviderCalls += 1;
      return { items: [] };
    },
  }),
  (error) => error?.code === 'metadata_audit_estimate_exceeds_effective_budget',
  'an estimate above the staging audit cap must fail before the provider',
);
assert.equal(overEstimateProviderCalls, 0);

const rawCandidates = [
  {
    id: 'ig_1', shortCode: 'CHATCUT_A', ownerUsername: 'chatcutapp',
    caption: 'AI editing workflow apify-secret-never-persist',
    url: 'https://www.instagram.com/reel/CHATCUT_A/', videoPlayCount: 8000,
    likesCount: 400, commentsCount: 20, sharesCount: 120, savesCount: 80, videoDuration: 44,
    apiToken: 'raw-token-must-be-redacted', Authorization: 'Bearer raw-auth-must-be-redacted',
  },
  {
    id: 'ig_1', shortCode: 'CHATCUT_A', ownerUsername: 'chatcutapp',
    caption: 'Duplicate snapshot', url: 'https://www.instagram.com/reel/CHATCUT_A/?utm_source=duplicate',
    videoPlayCount: 8100, likesCount: 410, commentsCount: 21, sharesCount: 121, savesCount: 81, videoDuration: 44,
  },
  {
    id: 'ig_2', shortCode: 'OTHER_B', ownerUsername: 'othercreator',
    coauthorProducers: [{ username: 'chatcutapp' }],
    caption: 'Another AI workflow', url: 'https://www.instagram.com/reel/OTHER_B/',
    videoPlayCount: 50000, likesCount: 1000, commentsCount: 10, sharesCount: 20, savesCount: 10, videoDuration: 20,
  },
];
let liveProviderCalls = 0;
const liveStore = createInMemoryMetadataAuditStore(state);
const liveResult = await runStagingMetadataAudit({
  env,
  options: createOptions(commitA, { hardCapUsd: 0.5, preflightOnly: false }),
  store: liveStore,
  runActor: async (request) => {
    liveProviderCalls += 1;
    assert.equal(request.maxTotalChargeUsd, 0.5);
    assert.equal(request.maxItems, 5);
    assert.equal(request.input.includeDownloadedVideo, false);
    return { items: rawCandidates, actualCostUsd: 0.021, runId: 'provider_run_one' };
  },
});
assert.equal(liveProviderCalls, 1);
assert.equal(liveResult.trace.state, 'completed');
assert.equal(liveResult.trace.counts.raw, 3);
assert.equal(liveResult.trace.counts.normalized, 3);
assert.equal(liveResult.trace.counts.deduplicatedEligible, 2);
assert.equal(liveResult.trace.rankingVersion, 'b_soft_v1');
assert.equal(liveResult.trace.topCandidates.length, 2);
assert.ok(liveResult.trace.selectedTopCandidate);
assert.equal(liveResult.trace.invariants.downloads, 0);
assert.equal(liveResult.trace.invariants.geminiCalls, 0);
assert.equal(liveResult.trace.invariants.signalFilterCalls, 0);
assert.equal(liveResult.trace.mutationGuardPassed, true);
assert.equal(liveResult.trace.tracePersistenceConfirmed, true);
const persistedLiveState = await liveStore.readState();
assert.equal(persistedLiveState.reels.length, state.reels.length);
assert.equal(persistedLiveState.discoveryRuns.length, state.discoveryRuns.length);
assert.equal(persistedLiveState.metadataAuditRuns.length, 1);
const persistedText = JSON.stringify(persistedLiveState.metadataAuditRuns[0]);
assert.doesNotMatch(persistedText, /apify-secret-never-persist|raw-token-must-be-redacted|raw-auth-must-be-redacted|database-secret/);
assert.doesNotMatch(persistedText, /Authorization|apiToken/);
expectCode(
  () => buildMetadataAuditPreflight({
    state: persistedLiveState,
    env,
    options: createOptions(commitA, { preflightOnly: false }),
  }),
  'metadata_audit_provider_call_already_recorded',
);

const sanitizedInstagramFixture = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, 'fixtures', 'instagram-metadata-audit-chatcut-sanitized.json'),
  'utf8',
));
let blockedMockProviderCalls = 0;
const blockedStore = createInMemoryMetadataAuditStore(createState());
const blockedResult = await runStagingMetadataAudit({
  env: createEnv(commitC),
  options: createOptions(commitC, { preflightOnly: false }),
  store: blockedStore,
  runActor: async () => {
    blockedMockProviderCalls += 1;
    return { items: sanitizedInstagramFixture.candidates, actualCostUsd: 0, runId: 'provider_fixture_only' };
  },
});
assert.equal(blockedMockProviderCalls, 1, 'one local provider stub supplies the saved metadata fixture');
assert.equal(blockedResult.trace.state, 'failed');
assert.equal(blockedResult.trace.classifiedFailure.code, 'insufficient_ranking_metadata');
assert.equal(blockedResult.trace.selectedTopCandidate, null);
assert.equal(blockedResult.trace.invariants.downloads, 0);
assert.equal(blockedResult.trace.invariants.geminiCalls, 0);
assert.equal(blockedResult.trace.invariants.signalFilterCalls, 0);
assert.equal(blockedResult.trace.invariants.reelsWrites, 0);
assert.equal(blockedResult.trace.invariants.collectionWrites, 0);
assert.equal(blockedResult.trace.invariants.bankWrites, 0);
assert.equal(blockedResult.trace.mutationGuardPassed, true);
const blockedPersistedState = await blockedStore.readState();
assert.equal(blockedPersistedState.metadataAuditRuns[0].classifiedFailure.code, 'insufficient_ranking_metadata');
assert.equal(blockedPersistedState.metadataAuditRuns[0].selectedTopCandidate, null);
assert.equal(blockedPersistedState.reels.length, state.reels.length);

let failedProviderCalls = 0;
const failedStore = createInMemoryMetadataAuditStore(createState());
const failedResult = await runStagingMetadataAudit({
  env: createEnv(commitB),
  options: createOptions(commitB, { preflightOnly: false }),
  store: failedStore,
  runActor: async () => {
    failedProviderCalls += 1;
    throw Object.assign(new Error('provider failed token=apify-secret-never-persist'), { status: 502 });
  },
});
assert.equal(failedProviderCalls, 1);
assert.equal(failedResult.trace.state, 'failed');
assert.equal(failedResult.trace.classifiedFailure.code, 'metadata_audit_provider_failed');
assert.doesNotMatch(JSON.stringify(await failedStore.readState()), /apify-secret-never-persist/);

const providerRequests = [];
const providerResult = await runApifyActor({
  token: 'provider-header-secret',
  actorId: 'apify/test-actor',
  input: { includeDownloadedVideo: false },
  maxTotalChargeUsd: 0.5,
  maxItems: 5,
  fetchImpl: async (url, options = {}) => {
    providerRequests.push({ url, options });
    if (url.includes('/runs?')) {
      return { ok: true, json: async () => ({ data: { id: 'run_cap', status: 'SUCCEEDED', defaultDatasetId: 'dataset_cap', usageTotalUsd: 0.02 } }) };
    }
    return { ok: true, json: async () => ([{ id: 'one' }]) };
  },
});
assert.equal(providerResult.runId, 'run_cap');
assert.equal(providerRequests.length, 2);
assert.match(providerRequests[0].url, /maxTotalChargeUsd=0\.5/);
assert.match(providerRequests[0].url, /maxItems=5/);
assert.doesNotMatch(providerRequests[0].url, /provider-header-secret|token=/);
assert.equal(providerRequests[0].options.headers.Authorization, 'Bearer provider-header-secret');
assert.match(providerRequests[1].url, /limit=5/);
assert.doesNotMatch(providerRequests[1].url, /provider-header-secret|token=/);

let fakeState = createState();
class FakePool {
  async query(sql) {
    if (sql.includes('SELECT data')) return { rows: [{ data: structuredClone(fakeState) }] };
    throw new Error(`unexpected pool query: ${sql}`);
  }
  async connect() {
    return {
      query: async (sql, params = []) => {
        if (sql.includes('SELECT data')) return { rows: [{ data: structuredClone(fakeState) }] };
        if (sql.includes('UPDATE app_state')) {
          fakeState = JSON.parse(params[1]);
          return { rows: [] };
        }
        return { rows: [] };
      },
      release() {},
    };
  }
  async end() {}
}
const postgresStore = createPostgresMetadataAuditStore({
  connectionString: 'postgresql://fake',
  appStateKey: 'audit',
  PoolClass: FakePool,
});
await postgresStore.writeTrace({ id: 'persisted_trace', state: 'completed' });
assert.equal((await postgresStore.readState()).metadataAuditRuns[0].id, 'persisted_trace');
await postgresStore.close();

const sanitized = sanitizeAuditValue({
  token: 'secret',
  nested: { Authorization: 'Bearer secret', url: 'https://example.test/?token=secret' },
  DATABASE_URL: 'postgresql://user:password@postgres.internal/app',
  users: [{ passwordHash: 'hash-secret', id: 'safe-user' }],
  sessions: [{ token: 'session-secret', userId: 'safe-user' }],
  signedMediaUrl: 'https://media.example.test/video.mp4?X-Amz-Signature=signed-secret',
  auditCounts: { raw: 5, normalized: 5, rankingVersion: 'b_soft_v1' },
});
assert.equal(sanitized.token, undefined);
assert.equal(sanitized.nested.Authorization, undefined);
assert.equal(sanitized.nested.url, 'https://example.test/');
assert.equal(sanitized.DATABASE_URL, undefined);
assert.equal(sanitized.users[0].passwordHash, undefined);
assert.equal(sanitized.sessions[0].token, undefined);
assert.equal(sanitized.signedMediaUrl, 'https://media.example.test/video.mp4');
assert.deepEqual(sanitized.auditCounts, { raw: 5, normalized: 5, rankingVersion: 'b_soft_v1' });

const dbHashAfter = crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
assert.equal(dbHashAfter, dbHashBefore, 'backend/data/db.example.json must remain unchanged');

console.log('Staging metadata audit guard, budget, provider, ranking, mutation, redaction, and storage tests passed with zero network calls.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
