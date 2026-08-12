import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');
const FRONTEND_ENTRY = path.join(ROOT_DIR, 'frontend', 'server.mjs');

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

async function waitForService(url, child, output, serviceName) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${serviceName} exited early: ${output()}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Keep polling until the isolated service is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${serviceName} did not start: ${output()}`);
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
const distPath = path.join(tempDir, 'dist');
await mkdir(distPath);
await writeFile(dbPath, `${JSON.stringify(seedDb(), null, 2)}\n`, 'utf8');
await writeFile(path.join(distPath, 'index.html'), '<!doctype html><title>same-origin-product-route</title>', 'utf8');

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
const frontendPort = await getFreePort();
const backendUrl = `http://127.0.0.1:${backendPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const googleMockUrl = `http://127.0.0.1:${googlePort}`;
const backendChild = spawn(process.execPath, [BACKEND_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(backendPort),
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    CLIENT_URL: frontendUrl,
    GOOGLE_CLIENT_ID: 'mock-google-client-id',
    GOOGLE_CLIENT_SECRET: 'mock-google-client-secret',
    GOOGLE_REDIRECT_URI: `${frontendUrl}/api/auth/callback/google`,
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
backendChild.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
backendChild.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });

const frontendChild = spawn(process.execPath, [FRONTEND_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(frontendPort),
    HOST: '127.0.0.1',
    FRONTEND_DIST_PATH: distPath,
    API_PROXY_TARGET: backendUrl,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let frontendOutput = '';
frontendChild.stdout.on('data', (chunk) => { frontendOutput += chunk.toString(); });
frontendChild.stderr.on('data', (chunk) => { frontendOutput += chunk.toString(); });

const browserRequestOrigins = [];
function browserFetch(route, options = {}) {
  const url = new URL(route, frontendUrl);
  browserRequestOrigins.push(url.origin);
  return fetch(url, options);
}

const failures = [];
try {
  await waitForService(`${backendUrl}/api/health`, backendChild, () => backendOutput, 'OAuth test backend');
  await waitForService(frontendUrl, frontendChild, () => frontendOutput, 'OAuth test frontend');

  for (const unsafeDestination of [
    'https://attacker.example/?preview=product&tab=discover',
    '//attacker.example/?preview=product&tab=discover',
  ]) {
    const unsafeStartResponse = await browserFetch(
      `/api/auth/google/start?destination=${encodeURIComponent(unsafeDestination)}`,
      { headers: { origin: frontendUrl, referer: `${frontendUrl}/?preview=product&tab=discover` } },
    );
    assert.equal(unsafeStartResponse.status, 200);
    const unsafeStartPayload = await unsafeStartResponse.json();
    const stateDb = JSON.parse(await readFile(dbPath, 'utf8'));
    const stateRecord = stateDb.metaStates.find((item) => item.state === unsafeStartPayload.state);
    assert.equal(stateRecord?.destination, '/', `Unsafe OAuth destination was not rejected: ${unsafeDestination}`);
    assert.equal(new URL(unsafeStartPayload.authUrl).searchParams.get('redirect_uri'), `${frontendUrl}/api/auth/callback/google`);
  }

  const startResponse = await browserFetch(`/api/auth/google/start?destination=${encodeURIComponent('/?preview=product&tab=discover')}`, {
    headers: { origin: frontendUrl, referer: `${frontendUrl}/?preview=product&tab=discover` },
  });
  const startText = await startResponse.text();
  assert.equal(startResponse.status, 200, startText);
  const startPayload = JSON.parse(startText);
  assert.ok(startPayload.state, 'Google start did not return an OAuth state.');
  assert.match(startPayload.authUrl, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.equal(new URL(startPayload.authUrl).searchParams.get('redirect_uri'), `${frontendUrl}/api/auth/callback/google`);

  const callbackResponse = await browserFetch(
    `/api/auth/callback/google?code=mock-code&state=${encodeURIComponent(startPayload.state)}`,
    { redirect: 'manual', headers: { referer: 'https://accounts.google.com/' } },
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
  assert.match(setCookie, /(?:^|; )Max-Age=2592000(?:;|$)/);
  assert.match(setCookie, /(?:^|; )Secure(?:;|$)/);

  const location = new URL(callbackResponse.headers.get('location') || '');
  const expectedProductRoute = new URL('/?preview=product&tab=discover&auth=google', frontendUrl);
  if (location.origin !== expectedProductRoute.origin || location.pathname !== expectedProductRoute.pathname
    || location.searchParams.get('preview') !== expectedProductRoute.searchParams.get('preview')
    || location.searchParams.get('tab') !== expectedProductRoute.searchParams.get('tab')
    || location.searchParams.get('auth') !== 'google') {
    failures.push(`REPRODUCED candidate #1: OAuth callback redirected to ${location.href || '(missing location)'} instead of preserving ${expectedProductRoute.href}`);
  }
  assert.equal(location.searchParams.has('code'), false);
  assert.equal(location.searchParams.has('state'), false);
  assert.equal(location.searchParams.has('token'), false);

  const meResponse = await browserFetch('/api/auth/me', {
    headers: {
      cookie: cookiePair(setCookie),
      origin: frontendUrl,
      referer: `${frontendUrl}/?preview=product&tab=discover`,
    },
  });
  const meText = await meResponse.text();
  assert.equal(meResponse.status, 200, meText);
  const mePayload = JSON.parse(meText);
  assert.equal(mePayload.user.email, 'oauth-user@example.com');
  assert.equal(mePayload.user.provider, 'google');

  const productResponse = await browserFetch(location.pathname + location.search, {
    headers: { cookie: cookiePair(setCookie) },
  });
  assert.equal(productResponse.status, 200);
  assert.match(await productResponse.text(), /same-origin-product-route/);

  const untrustedWriteResponse = await browserFetch('/api/auth/logout', {
    method: 'POST',
    headers: { cookie: cookiePair(setCookie), origin: 'https://attacker.example' },
  });
  assert.equal(untrustedWriteResponse.status, 403);
  assert.equal((await untrustedWriteResponse.json()).error, 'cors_origin_denied');

  const logoutResponse = await browserFetch('/api/auth/logout', {
    method: 'POST',
    headers: { cookie: cookiePair(setCookie), origin: frontendUrl },
  });
  assert.equal(logoutResponse.status, 200);
  const clearCookie = cookieFromSetCookie(logoutResponse);
  assert.match(clearCookie, /^dzhero_session=;/);
  assert.match(clearCookie, /(?:^|; )Path=\//);
  assert.match(clearCookie, /(?:^|; )HttpOnly(?:;|$)/);
  assert.match(clearCookie, /(?:^|; )SameSite=Lax(?:;|$)/);
  assert.match(clearCookie, /(?:^|; )Max-Age=0(?:;|$)/);
  assert.match(clearCookie, /(?:^|; )Secure(?:;|$)/);

  assert.deepEqual(
    new Set(browserRequestOrigins),
    new Set([frontendUrl]),
    'The browser-facing OAuth, session, and product route must use only the frontend origin.',
  );
  const persistedDb = JSON.parse(await readFile(dbPath, 'utf8'));
  const persistedUser = persistedDb.users.find((user) => user.email === 'oauth-user@example.com');
  assert.equal(persistedUser.oauthSubject, 'google-subject-1');
  assert.equal(persistedDb.sessions.length, 0, 'Logout should remove the temporary session after the flow is verified.');

  const frontendSource = await readFile(path.join(ROOT_DIR, 'src', 'main.jsx'), 'utf8');
  if (!frontendSource.includes("const authReturn = new URL(window.location.href).searchParams.get('auth') === 'google';")
    || !frontendSource.includes('if (productPreview && !authReturn)')) {
    failures.push('REPRODUCED candidate #2: auth/me failure path does not distinguish an OAuth return from a direct guest product entry.');
  }

  assert.deepEqual(failures, [], failures.join('\n'));
  console.log('Google OAuth same-origin session flow passed.');
  console.log(`browser-facing origins: ${[...new Set(browserRequestOrigins)].join(', ')}`);
  console.log(`local mock token calls: ${tokenRequests}`);
  console.log(`local mock userinfo calls: ${userInfoRequests}`);
  console.log('external Google/provider calls: 0');
} catch (error) {
  if (backendOutput.trim()) console.error(backendOutput.trim());
  if (frontendOutput.trim()) console.error(frontendOutput.trim());
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopProcess(frontendChild);
  await stopProcess(backendChild);
  await new Promise((resolve) => googleMock.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
