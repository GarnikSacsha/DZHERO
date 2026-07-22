import assert from 'node:assert/strict';

import { syncTelemetryIdentity } from '../src/telemetry.mjs';


function makeWindow(url) {
  const parsed = new URL(url);
  const stored = new Map();
  const replacements = [];
  return {
    location: {
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
    },
    history: {
      state: { preserved: true },
      replaceState(state, title, nextUrl) { replacements.push({ state, title, nextUrl }); },
    },
    sessionStorage: {
      getItem(key) { return stored.get(key) || null; },
      setItem(key, value) { stored.set(key, String(value)); },
      dump() { return JSON.stringify(Object.fromEntries(stored)); },
    },
    replacements,
  };
}


const user = {
  id: 'user_42',
  provider: 'google',
  email: 'lead@example.com',
  name: 'Lead Example',
  avatarUrl: 'https://images.example/avatar.png',
  lastLoginAt: '2026-07-22T12:00:00.000Z',
};

const calls = [];
const telemetryClient = {
  authSuccess: (lead) => calls.push(['authSuccess', lead]),
  identify: (lead) => calls.push(['identify', lead]),
};
const windowRef = makeWindow('https://dzhero.com.ua/?auth=google&utm_source=threads#hero');

syncTelemetryIdentity({ user, telemetryClient, windowRef });
assert.equal(calls.length, 1);
assert.equal(calls[0][0], 'authSuccess');
assert.equal(calls[0][1].google_id, 'user_42');
assert.equal(calls[0][1].event_id, 'google_login:user_42:2026-07-22T12:00:00.000Z');
assert.equal(windowRef.replacements[0].nextUrl, '/?utm_source=threads#hero');
assert.equal(windowRef.sessionStorage.dump().includes('lead@example.com'), false);

syncTelemetryIdentity({ user, telemetryClient, windowRef: makeWindow('https://dzhero.com.ua/') });
assert.equal(calls.at(-1)[0], 'identify');

const duplicateWindow = makeWindow('https://dzhero.com.ua/?auth=google');
duplicateWindow.sessionStorage.setItem('dzhero_crm_google_login:user_42:2026-07-22T12:00:00.000Z', '1');
syncTelemetryIdentity({ user, telemetryClient, windowRef: duplicateWindow });
assert.equal(calls.at(-1)[0], 'identify');

const beforeDemo = calls.length;
syncTelemetryIdentity({
  user: { ...user, provider: 'demo' },
  telemetryClient,
  windowRef: makeWindow('https://dzhero.com.ua/?auth=google'),
});
assert.equal(calls.length, beforeDemo);
console.log('telemetry identity contract passed');

