const assert = require('node:assert/strict');

const {
  getUserWorkspaces,
  buildAuthWorkspacePayload,
} = require('../backend/services/authWorkspacePayload.cjs');

const db = {
  workspaces: [
    { id: 'ws_demo_ua', name: 'Demo', brief: { product: 'demo' } },
    { id: 'ws_owner', name: 'Owner workspace', brief: { product: 'кава' } },
    { id: 'ws_extra', name: 'Extra workspace', brief: { product: 'десерти' } },
    { id: 'ws_other', name: 'Other workspace', brief: { product: 'одяг' } },
  ],
};

const user = {
  id: 'usr_1',
  email: 'owner@example.com',
  name: 'Owner',
  role: 'owner',
  workspaceId: 'ws_owner',
  workspaceIds: ['ws_extra', 'ws_owner'],
};

const workspaces = getUserWorkspaces(db, user);
assert.deepEqual(workspaces.map((workspace) => workspace.id), ['ws_owner', 'ws_extra']);
assert.equal(workspaces[0].brief, undefined, 'auth workspace list should not leak Brand Brain payloads');

const payload = buildAuthWorkspacePayload(db, user);
assert.equal(payload.user.workspaceId, 'ws_owner');
assert.deepEqual(payload.workspaces.map((workspace) => workspace.id), ['ws_owner', 'ws_extra']);

const adminPayload = buildAuthWorkspacePayload(db, { ...user, role: 'admin', workspaceId: 'ws_owner' });
assert.deepEqual(adminPayload.workspaces.map((workspace) => workspace.id), ['ws_owner', 'ws_demo_ua', 'ws_extra', 'ws_other']);

console.log('auth workspace payload tests passed');
