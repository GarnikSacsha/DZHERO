'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const {
  buildSharedSignalBankReels,
  isSharedSignalBankPlan,
  resolveSharedSignalBankWorkspace,
} = require('../backend/services/sharedSignalBank.cjs');

const db = {
  users: [
    { id: 'owner', email: 'bank@example.com', workspaceId: 'ws_small', workspaceIds: ['ws_large'] },
  ],
  workspaces: [
    { id: 'ws_small' },
    { id: 'ws_large' },
    { id: 'ws_trial' },
  ],
  reels: [
    { id: 'one', workspaceId: 'ws_small', title: 'Small bank signal', score: 99 },
    { id: 'two', workspaceId: 'ws_large', title: 'Public signal two', score: 82, remixResult: { private: true } },
    { id: 'three', workspaceId: 'ws_large', title: 'Public signal three', score: 94, privateNotes: 'do not share' },
  ],
};

assert.equal(resolveSharedSignalBankWorkspace(db, { ownerEmail: ' BANK@example.com ' }), 'ws_large');
assert.equal(resolveSharedSignalBankWorkspace(db, { workspaceId: 'ws_small', ownerEmail: 'bank@example.com' }), 'ws_small');
assert.equal(resolveSharedSignalBankWorkspace(db, { ownerEmail: 'missing@example.com' }), '');
assert.equal(isSharedSignalBankPlan({ plan: { id: 'trial' } }), true);
assert.equal(isSharedSignalBankPlan({ plan: { id: 'tester_pro' } }), false);

const shared = buildSharedSignalBankReels(db, {
  targetWorkspaceId: 'ws_trial',
  ownerEmail: 'bank@example.com',
  limit: 10,
});
assert.equal(shared.sourceWorkspaceId, 'ws_large');
assert.deepEqual(shared.reels.map((reel) => reel.id), ['shared_three', 'shared_two']);
assert.ok(shared.reels.every((reel) => reel.workspaceId === 'ws_trial'));
assert.ok(shared.reels.every((reel) => reel.sharedBank === true));
assert.ok(shared.reels.every((reel) => !Object.hasOwn(reel, 'remixResult')));
assert.ok(shared.reels.every((reel) => !Object.hasOwn(reel, 'privateNotes')));

const root = path.resolve(__dirname, '..');
const serverSource = readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');
const appSource = readFileSync(path.join(root, 'src', 'main.jsx'), 'utf8');
assert.match(serverSource, /ENABLE_BILLING_PURCHASES === 'true'/);
assert.match(serverSource, /shared_signal_bank_only/);
assert.match(serverSource, /ENABLE_PUBLIC_APIFY_BRAND_SCAN && APIFY_TOKEN/);
assert.match(
  serverSource,
  /const GEMINI_API_BASE = process\.env\.GEMINI_API_BASE \|\| 'https:\/\/generativelanguage\.googleapis\.com\/v1beta'/,
  'Focused provider tests need an explicit Gemini base URL while production keeps the official default',
);
assert.match(serverSource, /function getAccessibleWorkspaceSignals\(db, workspaceId, authUser\)/);
assert.match(serverSource, /const reels = getAccessibleWorkspaceSignals\(db, req\.params\.workspaceId, req\.authUser\)/);
assert.ok(serverSource.includes('agent\\/context\\/finalize'));
assert.match(
  serverSource,
  /async function reserveBrandBrainFinalizeIntent[\s\S]*?assertCurrentWorkspaceAccess\(db, workspaceId, actorUser\)/,
);
assert.match(
  serverSource,
  /async function persistBrandBrainFinalizeResult[\s\S]*?assertCurrentWorkspaceAccess\(db, workspaceId, actorUser\)/,
);
const finalizeSource = serverSource.slice(serverSource.indexOf("app.post('/api/workspaces/:workspaceId/agent/context/finalize'"));
assert.ok(finalizeSource.includes('runBrandBrainFinalizeSingleFlight'));
assert.ok(finalizeSource.includes('beforeProviderAttempt'));
assert.ok(finalizeSource.indexOf('fetchPublicSourceMetadata') < finalizeSource.indexOf('persistBrandBrainFinalizeResult'));
assert.ok(finalizeSource.indexOf('finalizeBrandBrainV2') < finalizeSource.indexOf('persistBrandBrainFinalizeResult'));
assert.match(appSource, /Agent Studio · Coming soon/);
assert.match(appSource, /purchaseEnabled/);
assert.match(appSource, /Спільний банк сигналів/);

console.log('public beta guards: ok');
