const assert = require('node:assert/strict');

const {
  isEmailTrialLoginAllowed,
} = require('../backend/services/emailTrialAccess.cjs');

assert.equal(isEmailTrialLoginAllowed({ NODE_ENV: 'development' }), true);
assert.equal(isEmailTrialLoginAllowed({ NODE_ENV: 'production' }), false);
assert.equal(isEmailTrialLoginAllowed({ NODE_ENV: 'production', ALLOW_EMAIL_TRIAL_LOGIN: 'false' }), false);
assert.equal(isEmailTrialLoginAllowed({ NODE_ENV: 'production', ALLOW_EMAIL_TRIAL_LOGIN: 'true' }), true);

console.log('email trial access tests passed');
