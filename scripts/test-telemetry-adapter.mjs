import assert from 'node:assert/strict';

import {
  TRACKER_INTEGRITY,
  TRACKER_URL,
  createTelemetry,
} from '../src/telemetry.mjs';


const scripts = [];
const calls = [];
const windowRef = {};
const documentRef = {
  createElement() { return { dataset: {} }; },
  head: { appendChild(node) { scripts.push(node); } },
};
const client = createTelemetry({
  windowRef,
  documentRef,
  enabled: true,
  trackerUrl: TRACKER_URL,
  integrity: TRACKER_INTEGRITY,
  maxQueue: 2,
});

client.track('click', 'first');
client.track('click', 'second');
client.track('click', 'third');
client.load();
client.load();

assert.equal(scripts.length, 1);
assert.equal(scripts[0].src, 'https://crmdzhero-production.up.railway.app/static/dzhero-tracker.v1.3.0.min.js');
assert.equal(scripts[0].async, true);
assert.equal(scripts[0].crossOrigin, 'anonymous');
assert.equal(scripts[0].integrity, 'sha384-QN3eJBX5Fi2HH/RS9Mqgfnlyd6zQeTXfdI3jmDent/EJEy1ZXL8cIgS9a6w62nfg');
assert.equal(scripts[0].dataset.site, 'dzhero.com.ua');

windowRef.dzheroTrack = (...args) => calls.push(args);
scripts[0].onload();
assert.deepEqual(calls, [
  ['click', 'second', undefined],
  ['click', 'third', undefined],
]);

const failedScripts = [];
const failedClient = createTelemetry({
  windowRef: {},
  documentRef: {
    createElement() { return { dataset: {} }; },
    head: { appendChild(node) { failedScripts.push(node); } },
  },
  enabled: true,
});
failedClient.track('click', 'queued');
failedClient.load();
failedScripts[0].onerror();
assert.doesNotThrow(() => failedClient.track('generation', 'url_adaptation'));

const disabledScripts = [];
const disabledClient = createTelemetry({
  windowRef: {},
  documentRef: {
    createElement() { return { dataset: {} }; },
    head: { appendChild(node) { disabledScripts.push(node); } },
  },
  enabled: false,
});
disabledClient.load();
assert.equal(disabledScripts.length, 0);
console.log('telemetry adapter contract passed');

