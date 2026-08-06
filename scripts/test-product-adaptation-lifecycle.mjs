import assert from 'node:assert/strict';

import {
  getProductAdaptationRequestIdentity,
  isCurrentProductAdaptationRequest,
} from '../src/productAdaptationLifecycle.mjs';

const brandA = getProductAdaptationRequestIdentity({ workspaceId: 'ws-a', signalId: 'signal-1', brandRevision: 'brand-a' });
const brandB = getProductAdaptationRequestIdentity({ workspaceId: 'ws-a', signalId: 'signal-1', brandRevision: 'brand-b' });

assert.equal(isCurrentProductAdaptationRequest({
  requestRevision: 1,
  currentRevision: 1,
  requestIdentity: brandA,
  currentIdentity: brandA,
}), true);
assert.equal(isCurrentProductAdaptationRequest({
  requestRevision: 1,
  currentRevision: 2,
  requestIdentity: brandA,
  currentIdentity: brandB,
}), false);
assert.equal(isCurrentProductAdaptationRequest({
  requestRevision: 1,
  currentRevision: 1,
  requestIdentity: brandA,
  currentIdentity: brandB,
}), false);

console.log('product adaptation lifecycle tests passed');
