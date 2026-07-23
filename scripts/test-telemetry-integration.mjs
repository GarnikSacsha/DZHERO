import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';


const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const main = read('../src/main.jsx');
const agent = read('../src/AgentStudioPage.jsx');
const server = read('../backend/server.js');

assert.ok(main.includes("from './telemetry.mjs'"));
assert.ok(main.includes('telemetry.load()'));
assert.ok(main.includes('syncCrmSession'));
assert.equal(main.includes('syncTelemetryIdentity'), false);
assert.equal(main.includes('telemetry.logout()'), false);
assert.ok(main.includes('telemetry.pageView'));

for (const id of [
  'btn_brand_scan',
  'btn_google_signin',
  'btn_demo_entry',
  'btn_pricing_starter',
  'btn_pricing_pro',
  'btn_pricing_agency',
  'btn_open_pricing',
]) {
  assert.ok(main.includes(id), id);
}

for (const generation of ['url_adaptation', 'remix_generation']) {
  assert.ok(main.includes(`'generation', '${generation}'`), generation);
}
assert.ok(agent.includes('onGenerationComplete'));
assert.ok(agent.includes('previousRunStateRef'));
assert.ok(main.includes("'agent_studio_generation'"));
assert.ok(server.includes('https://crmdzhero-production.up.railway.app'));
assert.ok(server.includes('avatarUrl: user.avatarUrl || null'));
assert.ok(server.includes('generationId'));
assert.ok(server.includes('DZHERO CRM'));
assert.ok(server.includes('CRM DZHERO'));
assert.equal(server.includes('https://*.railway.app'), false);
assert.equal(main.includes('dzheroAuthSuccess'), false);
assert.equal(main.includes('dzheroIdentify'), false);
console.log('telemetry integration contract passed');
