import assert from 'node:assert/strict';
import {
  createWorkspaceRequestContext,
  isWorkspaceRequestCurrent,
} from '../src/workspaceRequestGuard.mjs';

const currentState = {
  workspaceId: 'ws_alpha',
  generation: 4,
};
const requestRef = { current: 12 };

const currentContext = createWorkspaceRequestContext('ws_alpha', requestRef.current, currentState);
assert.deepEqual(currentContext, {
  workspaceId: 'ws_alpha',
  generation: 4,
  requestId: 12,
});
assert.equal(isWorkspaceRequestCurrent(currentContext, currentState, requestRef), true);

const staleWorkspaceContext = createWorkspaceRequestContext('ws_alpha', 13, {
  workspaceId: 'ws_beta',
  generation: 7,
});
assert.equal(isWorkspaceRequestCurrent(staleWorkspaceContext, {
  workspaceId: 'ws_beta',
  generation: 7,
}, requestRef), false);

const staleGenerationContext = createWorkspaceRequestContext('ws_alpha', 14, currentState);
assert.equal(isWorkspaceRequestCurrent(staleGenerationContext, {
  workspaceId: 'ws_alpha',
  generation: 5,
}, requestRef), false);

console.log('workspace request guard tests passed');
