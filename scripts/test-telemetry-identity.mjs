import assert from 'node:assert/strict';

import { syncCrmSession } from '../src/telemetry.mjs';


const requests = [];
const replacements = [];
const windowRef = {
  location: { pathname: '/', search: '?auth=google&utm_source=threads&utm_medium=social&utm_campaign=launch', hash: '#hero' },
  history: { state: {}, replaceState(state, title, url) { replacements.push(url); } },
};
const telemetryClient = { getVisitorId: () => 'visitor_12345678' };
const user = { id: 'private-user-id', provider: 'google', email: 'private@example.com', name: 'Private Name' };

await syncCrmSession({
  user,
  telemetryClient,
  windowRef,
  apiBase: '/api',
  fetcher: async (url, options) => {
    requests.push({ url, options });
    return { ok: true };
  },
});

assert.equal(requests.length, 1);
assert.equal(requests[0].url, '/api/account/crm-sync');
const body = JSON.parse(requests[0].options.body);
assert.deepEqual(body, {
  visitor_id: 'visitor_12345678',
  utm_source: 'threads',
  utm_medium: 'social',
  utm_campaign: 'launch',
});
assert.equal(JSON.stringify(body).includes('private@example.com'), false);
assert.equal(JSON.stringify(body).includes('private-user-id'), false);
assert.equal(replacements[0], '/?utm_source=threads&utm_medium=social&utm_campaign=launch#hero');

await syncCrmSession({ user: { ...user, provider: 'demo' }, telemetryClient, windowRef, apiBase: '/api', fetcher: async () => { throw new Error('should not call'); } });
assert.equal(requests.length, 1);
console.log('telemetry identity contract passed');
