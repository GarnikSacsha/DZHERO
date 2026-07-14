import assert from 'node:assert/strict';
import { formatTesterStatus, getTesterUsageRows } from '../src/testerAccessUi.mjs';

assert.equal(formatTesterStatus('pending', 'en'), 'Pending first Google sign-in');
assert.equal(formatTesterStatus('active', 'uk'), 'Активний');
assert.equal(formatTesterStatus('revoked', 'en'), 'Revoked');
assert.deepEqual(getTesterUsageRows({
  billing: {
    usage: { aiOperations: 12, reelImports: 7 },
    plan: { limits: { aiOperations: 50, reelImports: 30 } },
  },
  discovery: { status: { dailySpendUsd: 0.18, dailyBudgetUsd: 0.4 } },
}), [
  { key: 'aiOperations', used: 12, limit: 50 },
  { key: 'reelImports', used: 7, limit: 30 },
  { key: 'apifyDailyUsd', used: 0.18, limit: 0.4 },
]);

console.log('tester access UI tests passed');
