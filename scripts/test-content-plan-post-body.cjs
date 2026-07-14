const assert = require('node:assert/strict');
const { normalizeContentPlanBody } = require('../backend/services/contentPlanPostBody.cjs');

assert.equal(normalizeContentPlanBody('  Full AI scenario  '), 'Full AI scenario');
assert.equal(normalizeContentPlanBody(null), '');
assert.equal(normalizeContentPlanBody('x'.repeat(12005)).length, 12000);

console.log('content plan post body tests passed');
