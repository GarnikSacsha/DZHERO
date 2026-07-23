const assert = require('node:assert/strict');
const {
  TRIAL_DAILY_LIMITS,
  buildDailyTrialSnapshot,
  getKyivDayKey,
  getNextKyivResetAt,
  releaseDailyTrialAction,
  reserveDailyTrialAction,
  resolveProviderAttemptBudget,
} = require('../backend/services/dailyTrialQuota.cjs');

const now = new Date('2026-07-24T10:00:00.000Z');
const db = { usageCounters: [] };

assert.deepEqual(TRIAL_DAILY_LIMITS, {
  remix: 5,
  agentChat: 100,
  providerAttempts: 250,
});

assert.equal(getKyivDayKey(new Date('2026-07-24T20:59:59.000Z')), '2026-07-24');
assert.equal(getKyivDayKey(new Date('2026-07-24T21:00:00.000Z')), '2026-07-25');
assert.equal(getNextKyivResetAt(now).toISOString(), '2026-07-24T21:00:00.000Z');
assert.equal(
  getNextKyivResetAt(new Date('2026-03-29T12:00:00.000Z')).toISOString(),
  '2026-03-29T21:00:00.000Z',
  'the Kyiv midnight reset must accommodate the spring DST transition',
);

for (let index = 0; index < 5; index += 1) {
  reserveDailyTrialAction(db, {
    workspaceId: 'ws_trial',
    action: 'remix',
    planId: 'trial',
    now,
  });
}
assert.throws(
  () => reserveDailyTrialAction(db, {
    workspaceId: 'ws_trial',
    action: 'remix',
    planId: 'trial',
    now,
  }),
  (error) => error.payload?.error === 'daily_remix_limit_reached'
    && error.payload.limit === 5
    && error.payload.used === 5
    && error.payload.remaining === 0
    && error.payload.period === '2026-07-24'
    && error.payload.resetsAt === '2026-07-24T21:00:00.000Z',
);

assert.deepEqual(buildDailyTrialSnapshot(db, {
  workspaceId: 'ws_trial',
  planId: 'trial',
  now: new Date('2026-07-24T20:59:59.000Z'),
}).remix, { limit: 5, used: 5, remaining: 0 });
assert.deepEqual(buildDailyTrialSnapshot(db, {
  workspaceId: 'ws_trial',
  planId: 'trial',
  now: new Date('2026-07-24T21:00:00.000Z'),
}).remix, { limit: 5, used: 0, remaining: 5 });

for (let index = 0; index < 100; index += 1) {
  reserveDailyTrialAction(db, {
    workspaceId: 'ws_chat',
    action: 'agentChat',
    planId: 'trial',
    now,
  });
}
assert.throws(
  () => reserveDailyTrialAction(db, {
    workspaceId: 'ws_chat',
    action: 'agentChat',
    planId: 'trial',
    now,
  }),
  (error) => error.payload?.error === 'daily_agent_chat_limit_reached',
);

const reservation = reserveDailyTrialAction(db, {
  workspaceId: 'ws_release',
  action: 'agentChat',
  planId: 'trial',
  now,
});
releaseDailyTrialAction(db, reservation, { now });
releaseDailyTrialAction(db, reservation, { now });
assert.equal(buildDailyTrialSnapshot(db, {
  workspaceId: 'ws_release',
  planId: 'trial',
  now,
}).agentChat.used, 0, 'releases must not make a counter negative');

for (const access of [
  { planId: 'starter' },
  { planId: 'trial', unlimited: true },
  { planId: 'trial', accessSource: 'tester_grant' },
]) {
  const before = db.usageCounters.length;
  assert.equal(reserveDailyTrialAction(db, {
    workspaceId: `ws_unbounded_${before}`,
    action: 'remix',
    now,
    ...access,
  }), null);
  const snapshot = buildDailyTrialSnapshot(db, {
    workspaceId: `ws_unbounded_${before}`,
    now,
    ...access,
  });
  assert.deepEqual(snapshot.remix, { limit: null, used: 0, remaining: null });
  assert.deepEqual(snapshot.agentChat, { limit: null, used: 0, remaining: null });
  assert.equal(db.usageCounters.length, before, 'unbounded access must not create counters');
}

assert.deepEqual(resolveProviderAttemptBudget({
  plan: { id: 'trial', limits: { aiOperations: 750 } },
  unlimited: false,
  accessSource: 'subscription',
}, now), {
  metric: 'trial_provider_attempts_daily',
  limit: 250,
  period: '2026-07-24',
  unlimited: false,
});
assert.deepEqual(resolveProviderAttemptBudget({
  plan: { id: 'starter', limits: { aiOperations: 50 } },
  period: '2026-07',
  unlimited: false,
}, now), {
  metric: 'ai_operations',
  limit: 50,
  period: '2026-07',
  unlimited: false,
});

console.log('daily trial quota tests passed');
