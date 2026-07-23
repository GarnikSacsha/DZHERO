import assert from 'node:assert/strict';

import { createTelemetry, syncCrmSession } from '../src/telemetry.mjs';


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

const delayedRequests = [];
let delayedScript;
const delayedWindow = {
  location: { pathname: '/', search: '?auth=google', hash: '' },
  history: { state: {}, replaceState() {} },
};
const delayedDocument = {
  head: {
    appendChild(script) {
      delayedScript = script;
    },
  },
  createElement() {
    return { dataset: {} };
  },
};
const delayedTelemetry = createTelemetry({
  windowRef: delayedWindow,
  documentRef: delayedDocument,
  enabled: true,
});
delayedTelemetry.load();

const delayedSync = syncCrmSession({
  user,
  telemetryClient: delayedTelemetry,
  windowRef: delayedWindow,
  apiBase: '/api',
  fetcher: async (url, options) => {
    delayedRequests.push({ url, options });
    return { ok: true };
  },
});
delayedWindow.dzheroGetVisitorId = () => 'visitor_delayed_1234';
delayedScript.onload();
await delayedSync;

assert.equal(delayedRequests.length, 1);
assert.equal(
  JSON.parse(delayedRequests[0].options.body).visitor_id,
  'visitor_delayed_1234',
  'verified sign-in must wait for the anonymous tracker visitor ID',
);
console.log('telemetry identity contract passed');
