import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');
const TRUSTED_ORIGIN = 'https://dzhero.com.ua';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function getFreePort() {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited early with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Meta OAuth test backend did not start.');
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-meta-oauth-'));
const dbPath = path.join(tempDir, 'db.json');
const now = new Date().toISOString();
await writeFile(dbPath, `${JSON.stringify({
  users: [{
    id: 'usr_meta',
    name: 'Meta Owner',
    email: 'meta-owner@example.com',
    role: 'owner',
    workspaceId: 'ws_meta',
    createdAt: now,
  }],
  sessions: [{
    token: 'session_meta',
    userId: 'usr_meta',
    createdAt: now,
    expiresAt: '2030-01-01T00:00:00.000Z',
  }],
  workspaces: [{
    id: 'ws_meta',
    name: 'Meta Workspace',
    owner: 'Meta Owner',
    brief: {},
    createdAt: now,
  }],
  subscriptions: [{
    id: 'sub_meta',
    workspaceId: 'ws_meta',
    planId: 'trial',
    status: 'trialing',
    trialEndsAt: '2030-01-01T00:00:00.000Z',
  }],
}, null, 2)}\n`, 'utf8');

let graphTokenRequests = 0;
const graphServer = http.createServer((req, res) => {
  if (req.url?.startsWith('/oauth/access_token')) {
    graphTokenRequests += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ access_token: 'local-meta-token', token_type: 'bearer' }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});
const graphPort = await listen(graphServer);
const backendPort = await getFreePort();
const baseUrl = `http://127.0.0.1:${backendPort}`;

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(backendPort),
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    CLIENT_URL: TRUSTED_ORIGIN,
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    META_APP_ID: 'local-meta-app',
    META_APP_SECRET: 'local-meta-secret',
    META_GRAPH_BASE_URL: `http://127.0.0.1:${graphPort}`,
    META_REDIRECT_URI: `${baseUrl}/api/auth/meta/callback`,
    META_SCOPES: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });

let testError = null;
try {
  await waitForServer(baseUrl, child);
  const startResponse = await fetch(`${baseUrl}/api/auth/meta/start?workspaceId=ws_meta`, {
    headers: { authorization: 'Bearer session_meta' },
  });
  const startText = await startResponse.text();
  assert.equal(startResponse.status, 200, startText);
  const startPayload = JSON.parse(startText);
  assert.ok(startPayload.state, 'Meta start did not return an OAuth state.');

  const callbackResponse = await fetch(
    `${baseUrl}/api/auth/meta/callback?code=local-code&state=${encodeURIComponent(startPayload.state)}`,
    { redirect: 'manual' },
  );
  const callbackText = await callbackResponse.text();
  assert.equal(
    callbackResponse.status,
    302,
    `REPRODUCED: a state created by /auth/meta/start was rejected by /auth/meta/callback: ${callbackResponse.status} ${callbackText}`,
  );
  assert.equal(
    graphTokenRequests,
    1,
    'The valid Meta callback did not reach the controlled token endpoint exactly once.',
  );
  console.log('Meta OAuth state contract passed.');
} catch (error) {
  if (backendOutput.trim()) console.error(backendOutput.trim());
  testError = error;
} finally {
  await stopProcess(child);
  await new Promise((resolve) => graphServer.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

if (testError) {
  console.error(testError);
  process.exitCode = 1;
}
