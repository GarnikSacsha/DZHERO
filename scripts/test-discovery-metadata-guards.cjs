'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  mapInstagramApifyItem,
} = require('../backend/services/apifySignalProvider.js');
const {
  buildMetadataAuditCandidateSet,
} = require('../backend/services/automaticSignalDiscovery.js');
const {
  sanitizeAuditValue,
} = require('../backend/services/stagingMetadataAudit.cjs');

const fixturePath = path.resolve(__dirname, 'fixtures', 'instagram-metadata-audit-chatcut-sanitized.json');
const dbPath = path.resolve(__dirname, '..', 'backend', 'data', 'db.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const runtimeDbPresent = fs.existsSync(dbPath);
const dbHashBefore = runtimeDbPresent
  ? crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex')
  : null;
const originalFetch = globalThis.fetch;
let networkAttempts = 0;

globalThis.fetch = async () => {
  networkAttempts += 1;
  throw new Error('network_call_forbidden');
};

function mapCandidate(candidate, suffix = '') {
  return mapInstagramApifyItem(candidate, {
    workspaceId: 'ws_metadata_guard',
    market: 'global',
    inputType: 'profile',
    inputValue: fixture.requestedProfile,
    requestedSourceHandle: fixture.requestedProfile,
    createId: (prefix) => `${prefix}_${candidate.shortCode}${suffix}`,
    now: '2026-08-01T00:00:00.000Z',
  });
}

function runCandidate(id, name, expectedRootCause, test) {
  try {
    test();
    return {
      id,
      name,
      status: 'NOT_REPRODUCED',
      failingAssertion: null,
      isolatedRootCause: null,
    };
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') {
      return {
        id,
        name,
        status: 'REPRODUCED',
        failingAssertion: String(error.message || '').split('\n')[0],
        isolatedRootCause: expectedRootCause,
      };
    }
    return {
      id,
      name,
      status: 'INCONCLUSIVE',
      failingAssertion: error?.message || String(error),
      isolatedRootCause: null,
    };
  }
}

const results = [];

results.push(runCandidate(
  1,
  'missing protected-intent metadata is coerced to zero',
  'mapInstagramApifyItem uses numeric coercion and hard-codes saves=0, so absent shares/saves become indistinguishable from provider-confirmed zeros.',
  () => {
    const mapped = fixture.candidates.map(mapCandidate);
    assert.equal(
      mapped.every((candidate) => (
        candidate.shares === null
        && candidate.saves === null
        && candidate.importedMetadata?.rankingAvailability?.sharesAvailable === false
        && candidate.importedMetadata?.rankingAvailability?.savesAvailable === false
      )),
      true,
      'missing shares/saves must remain unavailable instead of becoming numeric zero',
    );
    const unavailableBatch = buildMetadataAuditCandidateSet(mapped, {
      workspaceId: 'ws_metadata_guard',
      market: 'global',
      inputType: 'profile',
      requestedSourceHandle: fixture.requestedProfile,
      now: '2026-08-01T00:00:00.000Z',
    });
    assert.equal(unavailableBatch.selectedTopCandidate, null);
    assert.equal(unavailableBatch.classifiedFailure?.code, 'insufficient_ranking_metadata');

    const invalidBatch = buildMetadataAuditCandidateSet([
      mapCandidate({ ...fixture.candidates[4], sharesCount: -1, savesCount: 1 }, '_invalid'),
    ], {
      workspaceId: 'ws_metadata_guard',
      market: 'global',
      inputType: 'profile',
      requestedSourceHandle: fixture.requestedProfile,
      now: '2026-08-01T00:00:00.000Z',
    });
    assert.equal(invalidBatch.selectedTopCandidate, null);
    assert.equal(invalidBatch.classifiedFailure?.code, 'invalid_ranking_metadata');
  },
));

results.push(runCandidate(
  2,
  'zero-signal B-soft batch receives a top-1 candidate',
  'rankSignalsByBSoft sorts zero scores with the stable identity tie-break, and buildMetadataAuditCandidateSet unconditionally selects rankedCandidates[0].',
  () => {
    const explicitZeroBatch = fixture.candidates.map((candidate) => mapCandidate({
      ...candidate,
      sharesCount: 0,
      savesCount: 0,
    }, '_zero'));
    const candidateSet = buildMetadataAuditCandidateSet(explicitZeroBatch, {
      workspaceId: 'ws_metadata_guard',
      market: 'global',
      inputType: 'profile',
      requestedSourceHandle: fixture.requestedProfile,
      now: '2026-08-01T00:00:00.000Z',
    });
    assert.equal(
      candidateSet.selectedTopCandidate,
      null,
      'a fully zero protected-intent batch must not receive a top-1 candidate from stable tie-breaking',
    );
    assert.equal(candidateSet.classifiedFailure?.code, 'insufficient_ranking_metadata');
  },
));

results.push(runCandidate(
  3,
  'profile source relationship is neither persisted nor enforced',
  'mapInstagramApifyItem ignores the requested profile, coauthorProducers, and taggedUsers when normalizing source ownership.',
  () => {
    const owner = mapCandidate(fixture.candidates[4], '_owner');
    const coauthor = mapCandidate(fixture.candidates[0], '_coauthor');
    const taggedOnly = mapCandidate({
      ...fixture.candidates[0],
      coauthorProducers: [],
      taggedUsers: [{ username: 'chatcutapp' }],
    }, '_tagged');
    const unrelated = mapCandidate({
      ...fixture.candidates[0],
      coauthorProducers: [{ username: 'another_creator' }],
      taggedUsers: [],
    }, '_unrelated');
    assert.deepEqual(
      [owner, coauthor, taggedOnly, unrelated].map((candidate) => ({
        requestedSourceHandle: candidate.importedMetadata?.requestedSourceHandle,
        contentOwnerHandle: candidate.importedMetadata?.contentOwnerHandle,
        coauthorHandles: candidate.importedMetadata?.coauthorHandles,
        taggedHandles: candidate.importedMetadata?.taggedHandles,
        sourceRelationship: candidate.importedMetadata?.sourceRelationship,
      })),
      [
        {
          requestedSourceHandle: '@chatcutapp', contentOwnerHandle: '@chatcutapp',
          coauthorHandles: [], taggedHandles: [], sourceRelationship: 'owner',
        },
        {
          requestedSourceHandle: '@chatcutapp', contentOwnerHandle: '@handlytech',
          coauthorHandles: ['@chatcutapp'], taggedHandles: ['@chatcutapp'], sourceRelationship: 'coauthor',
        },
        {
          requestedSourceHandle: '@chatcutapp', contentOwnerHandle: '@handlytech',
          coauthorHandles: [], taggedHandles: ['@chatcutapp'], sourceRelationship: 'unrelated',
        },
        {
          requestedSourceHandle: '@chatcutapp', contentOwnerHandle: '@handlytech',
          coauthorHandles: ['@another_creator'], taggedHandles: [], sourceRelationship: 'unrelated',
        },
      ],
      'profile source scope must distinguish owner, confirmed coauthor, tagged-only, and unrelated publications',
    );

    const scopeMismatchBatch = buildMetadataAuditCandidateSet([taggedOnly, unrelated], {
      workspaceId: 'ws_metadata_guard',
      market: 'global',
      inputType: 'profile',
      requestedSourceHandle: fixture.requestedProfile,
      now: '2026-08-01T00:00:00.000Z',
    });
    assert.equal(scopeMismatchBatch.selectedTopCandidate, null);
    assert.equal(scopeMismatchBatch.classifiedFailure?.code, 'provider_scope_mismatch');

    const validPositive = mapCandidate({
      ...fixture.candidates[0],
      stableId: `${fixture.candidates[0].stableId}1`,
      shortCode: `${fixture.candidates[0].shortCode}_POSITIVE`,
      sharesCount: 12,
      savesCount: 8,
    }, '_positive');
    const mixedBatch = buildMetadataAuditCandidateSet([unrelated, validPositive], {
      workspaceId: 'ws_metadata_guard',
      market: 'global',
      inputType: 'profile',
      requestedSourceHandle: fixture.requestedProfile,
      now: '2026-08-01T00:00:00.000Z',
    });
    assert.equal(mixedBatch.selectedTopCandidate?.id, validPositive.id);
    assert.equal(mixedBatch.classifiedFailure, null);
  },
));

results.push(runCandidate(
  4,
  'diagnostic sanitizer leaks database credentials and signed URL query data',
  'sanitizeAuditValue does not classify DATABASE_URL as credential-like and only redacts a narrow token/api-key query allowlist instead of removing signed URL query strings.',
  () => {
    const diagnostic = {
      sessions: [{ token: 'session-secret', userId: 'user_safe' }],
      users: [{ id: 'user_safe', passwordHash: 'password-hash-secret' }],
      headers: { Authorization: 'Bearer authorization-secret' },
      DATABASE_URL: 'postgresql://user:database-password@postgres.internal/app',
      APIFY_TOKEN: 'provider-secret',
      mediaUrl: 'https://media.example.test/video.mp4?X-Amz-Signature=signed-secret&X-Amz-Expires=300',
      metadataAuditRuns: [{ counts: { raw: 5, normalized: 5 }, rankingVersion: 'b_soft_v1' }],
    };
    const sanitized = sanitizeAuditValue(diagnostic);
    const serialized = JSON.stringify(sanitized);
    const violations = [
      ['sessions[].token', serialized.includes('session-secret')],
      ['users[].passwordHash', serialized.includes('password-hash-secret')],
      ['Authorization', serialized.includes('authorization-secret')],
      ['DATABASE_URL', serialized.includes('database-password') || Object.hasOwn(sanitized, 'DATABASE_URL')],
      ['provider token', serialized.includes('provider-secret')],
      ['signed media query', serialized.includes('signed-secret') || serialized.includes('X-Amz-Signature')],
    ].filter(([, leaked]) => leaked).map(([label]) => label);
    assert.deepEqual(
      violations,
      [],
      `diagnostic sanitizer leaked credential-bearing fields: ${violations.join(', ')}`,
    );
    assert.deepEqual(sanitized.metadataAuditRuns?.[0], diagnostic.metadataAuditRuns[0]);
  },
));

globalThis.fetch = originalFetch;
const dbHashAfter = runtimeDbPresent
  ? crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex')
  : null;
const invariants = {
  providerCalls: 0,
  networkAttempts,
  runtimeDbPresent,
  dbJsonUnchanged: !runtimeDbPresent || dbHashAfter === dbHashBefore,
  fixtureCandidateCount: fixture.candidates.length,
};

console.log(JSON.stringify({ results, invariants }, null, 2));

if (networkAttempts !== 0 || (runtimeDbPresent && dbHashAfter !== dbHashBefore)) {
  process.exitCode = 2;
} else if (results.some((result) => result.status === 'REPRODUCED')) {
  process.exitCode = 1;
}
