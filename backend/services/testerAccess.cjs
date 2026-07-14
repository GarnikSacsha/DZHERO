const TESTER_PLAN_ID = 'tester_pro';

function normalizeTesterEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function ensureTesterGrants(db = {}) {
  db.testerAccessGrants ||= [];
  return db.testerAccessGrants;
}

function upsertTesterGrant(db, {
  email,
  ownerUserId,
  note = '',
  createId,
  now = new Date(),
}) {
  const normalizedEmail = normalizeTesterEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) return null;

  const grants = ensureTesterGrants(db);
  const timestamp = new Date(now).toISOString();
  let grant = grants.find((item) => normalizeTesterEmail(item.email) === normalizedEmail);
  if (!grant) {
    grant = {
      id: createId('tester_grant'),
      email: normalizedEmail,
      createdAt: timestamp,
    };
    grants.unshift(grant);
  }

  Object.assign(grant, {
    email: normalizedEmail,
    status: grant.userId && grant.workspaceId ? 'active' : 'pending',
    planId: TESTER_PLAN_ID,
    ownerUserId,
    note: String(note || '').trim(),
    grantedAt: timestamp,
    revokedAt: null,
    updatedAt: timestamp,
  });
  return grant;
}

function linkTesterGrant(db, { user, now = new Date() }) {
  const email = normalizeTesterEmail(user?.email);
  const grant = ensureTesterGrants(db).find((item) => (
    normalizeTesterEmail(item.email) === email && item.status !== 'revoked'
  ));
  if (!grant || !user?.workspaceId) return null;

  const timestamp = new Date(now).toISOString();
  Object.assign(grant, {
    status: 'active',
    userId: user.id,
    workspaceId: user.workspaceId,
    activatedAt: grant.activatedAt || timestamp,
    updatedAt: timestamp,
  });
  return grant;
}

function revokeTesterGrant(db, { grantId, now = new Date() }) {
  const grant = ensureTesterGrants(db).find((item) => item.id === grantId);
  if (!grant) return null;

  const timestamp = new Date(now).toISOString();
  grant.status = 'revoked';
  grant.revokedAt = timestamp;
  grant.updatedAt = timestamp;
  return grant;
}

function getActiveTesterGrant(db, user) {
  const email = normalizeTesterEmail(user?.email);
  return ensureTesterGrants(db).find((item) => (
    item.status === 'active'
    && item.planId === TESTER_PLAN_ID
    && (item.userId === user?.id || normalizeTesterEmail(item.email) === email)
  )) || null;
}

function resolveAccessPlan({ basePlan, testerPlan, grant, unlimited }) {
  if (unlimited) return { plan: basePlan, accessSource: 'owner_unlimited' };
  if (grant?.status === 'active' && testerPlan) {
    return { plan: testerPlan, accessSource: 'tester_grant' };
  }
  return { plan: basePlan, accessSource: 'subscription' };
}

function getTesterDiscoveryPolicy(planId) {
  if (planId !== TESTER_PLAN_ID) return null;
  return {
    dailyBudgetUsd: 0.4,
    dailyTarget: 10,
    maxBudgetedRunsPerDay: 1,
    resultLimitPerPlatform: 5,
    maxPlannedCalls: 2,
  };
}

module.exports = {
  TESTER_PLAN_ID,
  getActiveTesterGrant,
  getTesterDiscoveryPolicy,
  linkTesterGrant,
  normalizeTesterEmail,
  resolveAccessPlan,
  revokeTesterGrant,
  upsertTesterGrant,
};
