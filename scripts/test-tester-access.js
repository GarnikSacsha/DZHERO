const assert = require('node:assert/strict');

const {
  getActiveTesterGrant,
  getTesterDiscoveryPolicy,
  linkTesterGrant,
  normalizeTesterEmail,
  resolveAccessPlan,
  revokeTesterGrant,
  upsertTesterGrant,
} = require('../backend/services/testerAccess.cjs');

const db = { testerAccessGrants: [] };
const now = new Date('2026-07-14T10:00:00.000Z');
const grant = upsertTesterGrant(db, {
  email: ' Tester@Example.COM ',
  ownerUserId: 'usr_owner',
  note: 'July feedback group',
  createId: () => 'tester_grant_1',
  now,
});

assert.equal(normalizeTesterEmail(' Tester@Example.COM '), 'tester@example.com');
assert.equal(grant.status, 'pending');
assert.equal(db.testerAccessGrants.length, 1);

const duplicate = upsertTesterGrant(db, {
  email: 'tester@example.com',
  ownerUserId: 'usr_owner',
  createId: () => 'duplicate',
  now,
});
assert.equal(duplicate.id, grant.id);
assert.equal(db.testerAccessGrants.length, 1);

const user = { id: 'usr_tester', email: 'TESTER@example.com', workspaceId: 'ws_tester' };
assert.equal(linkTesterGrant(db, { user, now }).status, 'active');
assert.equal(getActiveTesterGrant(db, user).workspaceId, 'ws_tester');

const basePlan = { id: 'trial' };
const testerPlan = { id: 'tester_pro' };
assert.equal(resolveAccessPlan({ basePlan, testerPlan, grant, unlimited: false }).plan.id, 'tester_pro');
assert.equal(resolveAccessPlan({ basePlan, testerPlan, grant, unlimited: true }).accessSource, 'owner_unlimited');

assert.equal(revokeTesterGrant(db, { grantId: grant.id, now }).status, 'revoked');
assert.equal(getActiveTesterGrant(db, user), null);
assert.equal(resolveAccessPlan({ basePlan, testerPlan, grant, unlimited: false }).plan.id, 'trial');

const reactivated = upsertTesterGrant(db, {
  email: 'tester@example.com',
  ownerUserId: 'usr_owner',
  createId: () => 'another_duplicate',
  now: new Date('2026-07-15T10:00:00.000Z'),
});
assert.equal(reactivated.id, grant.id);
assert.equal(reactivated.status, 'active');
assert.equal(reactivated.revokedAt, null);

assert.deepEqual(getTesterDiscoveryPolicy('tester_pro'), {
  dailyBudgetUsd: 0.4,
  dailyTarget: 10,
  maxBudgetedRunsPerDay: 1,
  resultLimitPerPlatform: 5,
  maxPlannedCalls: 2,
});
assert.equal(getTesterDiscoveryPolicy('trial'), null);

console.log('tester access tests passed');
