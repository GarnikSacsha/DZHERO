const assert = require('node:assert/strict');
const { reserveUsageCounter } = require('../backend/services/paidUsage.cjs');

const db = { usageCounters: [] };
for (let index = 0; index < 50; index += 1) {
  reserveUsageCounter(db, {
    workspaceId: 'ws_tester',
    metric: 'ai_operations',
    period: '2026-07',
    limit: 50,
  });
}

assert.equal(db.usageCounters[0].value, 50);
assert.throws(() => reserveUsageCounter(db, {
  workspaceId: 'ws_tester',
  metric: 'ai_operations',
  period: '2026-07',
  limit: 50,
}), (error) => error.status === 402 && error.payload.remaining === 0);
assert.equal(db.usageCounters[0].value, 50);

reserveUsageCounter(db, {
  workspaceId: 'ws_owner',
  metric: 'ai_operations',
  period: '2026-07',
  limit: 0,
  unlimited: true,
});
assert.equal(db.usageCounters.find((item) => item.workspaceId === 'ws_owner').value, 1);

console.log('paid usage tests passed');
