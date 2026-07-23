const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const {
  hasStoredBrandBrain,
  shouldChargeBrandBrainSave,
} = require('../backend/services/brandBrainPersistence.cjs');

assert.equal(hasStoredBrandBrain({}), false);
assert.equal(hasStoredBrandBrain({ contentRubrics: ['client FAQ'] }), true);
assert.equal(hasStoredBrandBrain({ updatedAt: '2026-07-13T00:00:00.000Z' }), false);
assert.equal(hasStoredBrandBrain({ product: 'десерти' }), true);
assert.equal(hasStoredBrandBrain({ stopTopics: ['не вигадувати цифри'] }), true);

assert.equal(
  shouldChargeBrandBrainSave({ existingBrief: {}, nextBrief: { product: 'десерти' } }),
  true,
  'first useful Brand Brain save should consume the plan save',
);

assert.equal(
  shouldChargeBrandBrainSave({
    existingBrief: { product: 'старий продукт', updatedAt: '2026-07-13T00:00:00.000Z' },
    nextBrief: { product: 'десерти', audience: 'Чернівці' },
  }),
  false,
  'editing an existing Brand Brain must not be blocked by the one-time save limit',
);

assert.equal(
  shouldChargeBrandBrainSave({ existingBrief: {}, nextBrief: { updatedAt: '2026-07-13T00:00:00.000Z' } }),
  false,
  'empty payload metadata should not consume usage',
);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Brand Brain test server exited early: ${output}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Brand Brain test server did not start: ${output}`);
}

let output = '';
async function testDirectApiWriteBoundary() {
  const root = path.resolve(__dirname, '..');
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'dzhero-brand-brain-'));
  const databasePath = path.join(tempDirectory, 'db.json');
  const database = JSON.parse(readFileSync(path.join(root, 'backend', 'data', 'db.json'), 'utf8'));
  const workspace = database.workspaces.find((item) => item.id === 'ws_demo_ua');
  assert.ok(workspace, 'Demo workspace fixture is missing');
  workspace.brief = {};
  database.usageCounters = (database.usageCounters || []).filter((item) => item.workspaceId !== 'ws_demo_ua');
  writeFileSync(databasePath, JSON.stringify(database));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['backend/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: databasePath,
      DATABASE_URL: '',
      AUTOMATIC_DISCOVERY_ENABLED: 'false',
      ALLOW_DEMO_LOGIN: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  try {
    await waitForHealth(baseUrl, child);
    const login = await fetch(`${baseUrl}/api/auth/demo`, { method: 'POST' });
    const auth = await login.json();
    assert.equal(login.status, 200, 'Demo authentication must succeed for the direct API regression');
    const headers = { 'content-type': 'application/json', cookie: `dzhero_session=${auth.token}` };
    const incomplete = await fetch(`${baseUrl}/api/workspaces/ws_demo_ua/agent/context`, {
      method: 'PUT', headers, body: JSON.stringify({ businessType: 'Coffee shop' }),
    });
    assert.equal(incomplete.status, 422, 'Incomplete direct Brand Brain writes must be rejected');
    const incompleteBody = await incomplete.json();
    assert.equal(incompleteBody.error, 'brand_brain_required_fields_missing');
    assert.deepEqual(incompleteBody.missingFields, ['product', 'audience', 'offer', 'cta', 'toneOfVoice']);

    const afterRejectedWrite = await fetch(`${baseUrl}/api/workspaces/ws_demo_ua/agent/context`, { headers });
    assert.deepEqual((await afterRejectedWrite.json()).brief, {}, 'Rejected direct writes must not mutate Brand Brain');

    const complete = await fetch(`${baseUrl}/api/workspaces/ws_demo_ua/agent/context`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        businessType: 'Coffee shop', product: 'Espresso', audience: 'Commuters', offer: 'Breakfast set', cta: 'Visit today', toneOfVoice: 'Warm',
        sourceLinks: ['https://EXAMPLE.com:443/shop', 'https://example.com/shop', 'ftp://invalid.example', 'not a url', 'http://valid.example/path'],
      }),
    });
    assert.equal(complete.status, 200, 'Complete direct Brand Brain writes must succeed');
    const completeBody = await complete.json();
    assert.deepEqual(completeBody.brief.sourceLinks, ['https://example.com/shop', 'http://valid.example/path']);
    const persisted = JSON.parse(readFileSync(databasePath, 'utf8'));
    assert.deepEqual(
      persisted.workspaces.find((item) => item.id === 'ws_demo_ua').brief.sourceLinks,
      ['https://example.com/shop', 'http://valid.example/path'],
      'The persisted Brand Brain must contain canonical unique HTTP(S) source links only',
    );
  } finally {
    if (child.exitCode === null) child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

testDirectApiWriteBoundary()
  .then(() => console.log('brand brain persistence tests passed'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
