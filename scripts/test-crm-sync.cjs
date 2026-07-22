const assert = require('node:assert/strict');

const {
  CONSENT_TYPES,
  CONSENT_VERSION,
  buildLeadSyncPayload,
  createCrmSyncClient,
  createLatestSyncScheduler,
  updateCommunicationPreferences,
} = require('../backend/services/crmSync.cjs');


const user = {
  id: 'usr_verified_1',
  email: 'Verified@Example.com',
  name: 'Verified Person',
  avatarUrl: 'https://images.example/avatar.png',
  authProvider: 'google',
  oauthProviders: ['google'],
  oauthSubject: 'google-subject-1',
};

assert.deepEqual(CONSENT_TYPES, ['product_updates', 'early_bird_offers', 'research_invites']);
assert.equal(CONSENT_VERSION, '2026-07-23');

const initial = buildLeadSyncPayload({
  user,
  visitorId: 'visitor_12345678',
  attribution: { utm_source: 'threads', utm_medium: 'social', utm_campaign: 'launch' },
});
assert.equal(initial.email, 'verified@example.com');
assert.equal(initial.google_id, 'google-subject-1');
assert.equal(initial.external_user_id, 'usr_verified_1');
assert.equal(initial.visitor_id, 'visitor_12345678');
assert.equal(initial.utm_source, 'threads');
assert.deepEqual(initial.consents, []);
assert.match(initial.idempotency_key, /^dzhero:usr_verified_1:/);

const recordedAt = new Date().toISOString();
const updatedUser = structuredClone(user);
updateCommunicationPreferences(updatedUser, {
  product_updates: true,
  early_bird_offers: false,
  research_invites: true,
  locale: 'uk',
  source: 'settings',
  recordedAt,
});
const decided = buildLeadSyncPayload({ user: updatedUser });
assert.deepEqual(decided.consents.map((item) => [item.consent_type, item.granted]), [
  ['product_updates', true],
  ['early_bird_offers', false],
  ['research_invites', true],
]);
assert.ok(decided.consents.every((item) => item.consent_version === CONSENT_VERSION));
assert.throws(() => updateCommunicationPreferences(structuredClone(user), {
  product_updates: 'yes', early_bird_offers: false, research_invites: false, locale: 'uk', source: 'settings', recordedAt,
}), /boolean/);
assert.throws(() => buildLeadSyncPayload({ user: { ...user, oauthSubject: null } }), /verified Google/);

const requests = [];
const client = createCrmSyncClient({
  apiUrl: 'https://crm.example/',
  token: 'server-secret',
  fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ status: 'synced', lead_id: 9 }) };
  },
});

(async () => {
  const response = await client.sync(initial);
  assert.equal(response.lead_id, 9);
  assert.equal(requests[0].url, 'https://crm.example/api/internal/leads/sync');
  assert.equal(requests[0].options.method, 'PUT');
  assert.equal(requests[0].options.headers['X-DZHero-Sync-Token'], 'server-secret');
  assert.equal(JSON.parse(requests[0].options.body).email, 'verified@example.com');

  const delivered = [];
  let releaseFirst;
  const scheduler = createLatestSyncScheduler(async (payload) => {
    delivered.push(payload.revision);
    if (payload.revision === 1) await new Promise((resolve) => { releaseFirst = resolve; });
  });
  const first = scheduler.schedule('usr_1', { revision: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  scheduler.schedule('usr_1', { revision: 2 });
  scheduler.schedule('usr_1', { revision: 3 });
  assert.equal(scheduler.pendingCount(), 1);
  releaseFirst();
  await first;
  await scheduler.idle('usr_1');
  assert.deepEqual(delivered, [1, 3]);
  console.log('CRM sync contract passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
