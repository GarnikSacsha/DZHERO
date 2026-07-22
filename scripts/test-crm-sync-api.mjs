import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-crm-sync-'));
const dbPath = path.join(tempDir, 'db.json');
const emptyDb = {
  users: [], sessions: [], workspaces: [], competitors: [], reels: [], ideas: [], leads: [], syncJobs: [],
  discoveryRuns: [], sources: [], metaStates: [], instagramAccounts: [], tiktokAccounts: [], aiMemory: [],
  aiJobs: [], remixes: [], contentPlanItems: [], videoJobs: [], dataDeletionRequests: [], subscriptions: [],
  usageCounters: [], testerAccessGrants: [], demoSessions: [], agentStudioRuns: [], agentStudioUploads: [], plans: [],
};
await writeFile(dbPath, `${JSON.stringify(emptyDb, null, 2)}\n`, 'utf8');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    server.on('error', reject);
  });
}

const received = [];
const crmServer = http.createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    received.push({ method: request.method, url: request.url, headers: request.headers, body: JSON.parse(body || '{}') });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'synced', lead_id: 1 }));
  });
});
const crmPort = await listen(crmServer);

const portProbe = http.createServer();
const appPort = await listen(portProbe);
await new Promise((resolve) => portProbe.close(resolve));
const baseUrl = `http://127.0.0.1:${appPort}`;
const child = spawn(process.execPath, [path.join(ROOT, 'backend', 'server.js')], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(appPort), HOST: '127.0.0.1', NODE_ENV: 'test', DB_PATH: dbPath,
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    DZHERO_CRM_API_URL: `http://127.0.0.1:${crmPort}`,
    DZHERO_CRM_SYNC_TOKEN: 'sync-secret',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start: ${stderr}`);
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

try {
  await waitForHealth();
  const registered = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Verified Owner', email: 'owner@example.com', password: 'password-123' }) });
  assert.equal(registered.status, 201);
  const token = registered.body.token;
  const db = JSON.parse(await readFile(dbPath, 'utf8'));
  const user = db.users.find((item) => item.id === registered.body.user.id);
  user.authProvider = 'google';
  user.oauthProviders = ['google'];
  user.oauthSubject = 'google-owner-subject';
  await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  const headers = { authorization: `Bearer ${token}` };

  const empty = await request('/api/account/communication-preferences', { headers });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.has_decisions, false);
  assert.equal(empty.body.product_updates, null);

  const forged = await request('/api/account/crm-sync', {
    method: 'POST', headers,
    body: JSON.stringify({ email: 'forged@example.com', google_id: 'forged', visitor_id: 'visitor_12345678', utm_source: 'threads' }),
  });
  assert.equal(forged.status, 202);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(received.at(-1).body.email, 'owner@example.com');
  assert.equal(received.at(-1).body.google_id, 'google-owner-subject');
  assert.equal(received.at(-1).body.visitor_id, 'visitor_12345678');
  assert.equal(received.at(-1).headers['x-dzhero-sync-token'], 'sync-secret');

  const saved = await request('/api/account/communication-preferences', {
    method: 'PUT', headers,
    body: JSON.stringify({ product_updates: true, early_bird_offers: false, research_invites: true, locale: 'uk', source: 'settings' }),
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.product_updates, true);
  assert.equal(saved.body.early_bird_offers, false);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(received.at(-1).body.consents.map((item) => [item.consent_type, item.granted]), [
    ['product_updates', true], ['early_bird_offers', false], ['research_invites', true],
  ]);
  console.log('CRM sync API contract passed');
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
  await new Promise((resolve) => crmServer.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
