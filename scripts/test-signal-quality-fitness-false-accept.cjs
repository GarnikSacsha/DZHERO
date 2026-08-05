const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  applySignalQualityPolicy,
  loadSignalQualityGateConfig,
} = require('../backend/services/signalQualityGate.cjs');

const fixturePath = path.join(
  __dirname,
  'fixtures',
  'signal-filter-false-accept-fitness-2026-08-05.json',
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const actual = applySignalQualityPolicy(
  fixture.assessment,
  loadSignalQualityGateConfig(),
);

assert.deepEqual(
  {
    decision: actual.decision,
    admissionMode: actual.admissionMode,
    admittedToBank: actual.admittedToBank,
  },
  fixture.ownerExpected,
  [
    'Owner-labelled false-accept expectation failed.',
    `Actual production policy result: decision=${actual.decision}`,
    `admissionMode=${actual.admissionMode || 'none'}`,
    `admittedToBank=${actual.admittedToBank}`,
  ].join('; '),
);

assert.equal(
  actual.rejectionReasons.includes('content_mechanic_outcome_not_grounded'),
  true,
);

const positiveActual = applySignalQualityPolicy(
  fixture.positiveControl.assessment,
  loadSignalQualityGateConfig(),
);
assert.deepEqual(
  {
    decision: positiveActual.decision,
    admissionMode: positiveActual.admissionMode,
    admittedToBank: positiveActual.admittedToBank,
  },
  fixture.positiveControl.ownerExpected,
);

console.log('fitness false-accept regression and positive control passed');
