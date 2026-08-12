import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');
const FRONTEND_ORIGIN = 'https://frontend.example.test';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function getFreePort() {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitForBackend(baseUrl, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`OAuth test backend exited early: ${output()}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // Keep polling until the isolated backend is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`OAuth test backend did not start: ${output()}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

function cookieFromSetCookie(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return values.find((value) => value.startsWith('dzhero_session=')) || '';
}

function cookiePair(setCookie) {
  return setCookie.split(';', 1)[0];
}

function seedDb() {
  const now = new Date().toISOString();
  return {
    users: [],
    sessions: [],
    workspaces: [],
    subscriptions: [],
    metaStates: [],
    reels: [],
    workspaceSavedUrls: [],
    workspaceUrlAdaptations: [],
    contentPlanItems: [],
    syncJobs: [],
    createdAt: now,
  };
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-google-oauth-flow-'));
const dbPath = path.join(tempDir, 'db.json');
await writeFile(dbPath, `${JSON.stringify(seedDb(), null, 2)}\n`, 'utf8');

let tokenRequests = 0;
let userInfoRequests = 0;
const googleMock = http.createServer(async (req, res) => {
  if (req.url === '/token' && req.method === 'POST') {
    tokenRequests += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ access_token: 'mock-google-access-token', token_type: 'Bearer' }));
    return;
  }
  if (req.url === '/userinfo' && req.method === 'GET') {
    userInfoRequests += 1;
    assert.equal(req.headers.authorization, 'Bearer mock-google-access-token');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      sub: 'google-subject-1',
      email: 'oauth-user@example.com',
      email_verified: true,
      name: 'OAuth User',
      picture: 'https://example.test/oauth-user.png',
    }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

const googlePort = await listen(googleMock);
const backendPort = await getFreePort();
const backendUrl = `http://127.0.0.1:${backendPort}`;
const googleMockUrl = `http://127.0.0.1:${googlePort}`;
const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(backendPort),
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    CLIENT_URL: FRONTEND_ORIGIN,
    GOOGLE_CLIENT_ID: 'mock-google-client-id',
    GOOGLE_CLIENT_SECRET: 'mock-google-client-secret',
    GOOGLE_REDIRECT_URI: `${backendUrl}/api/auth/callback/google`,
    GOOGLE_TOKEN_URL: `${googleMockUrl}/token`,
    GOOGLE_USERINFO_URL: `${googleMockUrl}/userinfo`,
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    GEMINI_API_KEY: '',
    APIFY_TOKEN: '',
    YOUTUBE_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });

const failures = [];
try {
  await waitForBackend(backendUrl, child, () => backendOutput);

  const startResponse = await fetch(`${backendUrl}/api/auth/google/start?destination=${encodeURIComponent('/?preview=product&tab=discover')}`, {
    headers: { origin: FRONTEND_ORIGIN, referer: `${FRONTEND_ORIGIN}/?preview=product&tab=discover` },
  });
  const startText = await startResponse.text();
  assert.equal(startResponse.status, 200, startText);
  const startPayload = JSON.parse(startText);
  assert.ok(startPayload.state, 'Google start did not return an OAuth state.');
  assert.match(startPayload.authUrl, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);

  const callbackResponse = await fetch(
    `${backendUrl}/api/auth/callback/google?code=mock-code&state=${encodeURIComponent(startPayload.state)}`,
    { redirect: 'manual', headers: { origin: FRONTEND_ORIGIN, referer: `${FRONTEND_ORIGIN}/?preview=product&tab=discover` } },
  );
  const callbackText = await callbackResponse.text();
  assert.equal(callbackResponse.status, 302, callbackText);
  assert.equal(tokenRequests, 1, 'Google token exchange should use the local mock exactly once.');
  assert.equal(userInfoRequests, 1, 'Google userinfo should use the local mock exactly once.');

  const setCookie = cookieFromSetCookie(callbackResponse);
  assert.ok(setCookie, 'Google callback did not set dzhero_session.');
  assert.match(setCookie, /(?:^|; )Path=\//);
  assert.match(setCookie, /(?:^|; )HttpOnly(?:;|$)/);
  assert.match(setCookie, /(?:^|; )SameSite=Lax(?:;|$)/);
  assert.match(setCookie, /(?:^|; )Max-Age=\d+(?:;|$)/);
  assert.match(setCookie, /(?:^|; )Secure(?:;|$)/);

  const location = new URL(callbackResponse.headers.get('location') || '');
  const expectedProductRoute = new URL('/?preview=product&tab=discover&auth=google', FRONTEND_ORIGIN);
  if (location.origin !== expectedProductRoute.origin || location.pathname !== expectedProductRoute.pathname
    || location.searchParams.get('preview') !== expectedProductRoute.searchParams.get('preview')
    || location.searchParams.get('tab') !== expectedProductRoute.searchParams.get('tab')
    || location.searchParams.get('auth') !== 'google') {
    failures.push(`REPRODUCED candidate #1: OAuth callback redirected to ${location.href || '(missing location)'} instead of preserving ${expectedProductRoute.href}`);
  }

  const meResponse = await fetch(`${backendUrl}/api/auth/me`, {
    headers: {
      cookie: cookiePair(setCookie),
      origin: FRONTEND_ORIGIN,
      referer: `${FRONTEND_ORIGIN}/?preview=product&tab=discover`,
    },
  });
  const meText = await meResponse.text();
  assert.equal(meResponse.status, 200, meText);
  const mePayload = JSON.parse(meText);
  assert.equal(mePayload.user.email, 'oauth-user@example.com');
  assert.equal(mePayload.user.provider, 'google');
  const persistedDb = JSON.parse(await readFile(dbPath, 'utf8'));
  const persistedUser = persistedDb.users.find((user) => user.email === 'oauth-user@example.com');
  assert.equal(persistedUser.oauthSubject, 'google-subject-1');

  const frontendSource = await readFile(path.join(ROOT_DIR, 'src', 'main.jsx'), 'utf8');
  if (!frontendSource.includes("const authReturn = new URL(window.location.href).searchParams.get('auth') === 'google';")
    || !frontendSource.includes('if (productPreview && !authReturn)')) {
    failures.push('REPRODUCED candidate #2: auth/me failure path does not distinguish an OAuth return from a direct guest product entry.');
  }

  assert.deepEqual(failures, [], failures.join('\n'));
  console.log('Google OAuth session flow passed.');
  console.log(`local mock token calls: ${tokenRequests}`);
  console.log(`local mock userinfo calls: ${userInfoRequests}`);
  console.log('external Google/provider calls: 0');
} catch (error) {
  if (backendOutput.trim()) console.error(backendOutput.trim());
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopProcess(child);
  await new Promise((resolve) => googleMock.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
