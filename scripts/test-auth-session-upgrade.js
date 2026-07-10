const assert = require('node:assert/strict');
const {
  findAuthSession,
  getAuthTokenCandidates,
} = require('../backend/services/authSession.cjs');

const db = {
  users: [
    { id: 'usr_demo', email: 'demo@dzhero.app', workspaceId: 'ws_demo_ua' },
    { id: 'usr_google', email: 'owner@example.com', workspaceId: 'ws_owner' },
  ],
  sessions: [
    {
      token: 'demo-token',
      userId: 'usr_demo',
      createdAt: '2026-07-10T10:00:00.000Z',
      expiresAt: '2026-08-10T10:00:00.000Z',
    },
    {
      token: 'google-token',
      userId: 'usr_google',
      createdAt: '2026-07-10T10:05:00.000Z',
      expiresAt: '2026-08-10T10:05:00.000Z',
    },
  ],
};

const duplicateCookieRequest = {
  headers: {
    cookie: 'dzhero_session=google-token; dzhero_session=demo-token',
  },
};

assert.deepEqual(
  getAuthTokenCandidates(duplicateCookieRequest, 'dzhero_session'),
  ['google-token', 'demo-token'],
  'duplicate session cookies should be preserved as ordered candidates',
);

assert.equal(
  findAuthSession(db, duplicateCookieRequest, 'dzhero_session')?.userId,
  'usr_google',
  'newer Google session should replace an older demo session when duplicate cookies exist',
);

assert.equal(
  findAuthSession(db, { headers: { cookie: 'dzhero_session=demo-token' } }, 'dzhero_session')?.userId,
  'usr_demo',
  'single demo session cookie should still work for demo login',
);

console.log('auth session upgrade regression passed');
