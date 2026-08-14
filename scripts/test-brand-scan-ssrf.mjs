import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');
const require = createRequire(import.meta.url);
const { isBlockedPublicAddress, safeFetchPublicText } = require('../backend/services/safePublicFetch.cjs');

for (const address of [
  '127.0.0.1',
  '10.0.0.1',
  '169.254.169.254',
  '::1',
  'fc00::1',
  'fe80::1',
  'fec0::1',
  '::ffff:127.0.0.1',
  '64:ff9b:1::a9fe:a9fe',
  '2002:a9fe:a9fe::1',
]) {
  assert.equal(isBlockedPublicAddress(address), true, `${address} must be blocked`);
}
for (const address of ['8.8.8.8', '104.20.23.154', '2606:4700:4700::1111']) {
  assert.equal(isBlockedPublicAddress(address), false, `${address} must remain reachable`);
}

for (const input of [
  'http://127.0.0.1/',
  'http://10.0.0.1/',
  'http://[::1]/',
  'http://[::ffff:127.0.0.1]/',
  'http://2130706433/',
  'http://0x7f000001/',
  'http://0177.0.0.1/',
]) {
  await assert.rejects(
    safeFetchPublicText(input),
    (error) => error?.code === 'public_url_private_address_denied',
    `${input} must resolve to a denied private address without a network request`,
  );
}

await assert.rejects(
  safeFetchPublicText('http://mixed-dns.audit.test/', {
    lookup: async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ],
  }),
  (error) => error?.code === 'public_url_private_address_denied',
  'a hostname with any private DNS answer must be denied before transport',
);

function installMockHttpResponses(responses) {
  const originalRequest = http.request;
  const calls = [];
  http.request = (url, options, callback) => {
    const next = responses.shift();
    assert.ok(next, 'unexpected HTTP request in SSRF harness');
    const request = new EventEmitter();
    request.destroy = (error) => {
      if (error) request.emit('error', error);
    };
    request.end = () => {};
    calls.push({ url: String(url), options });
    queueMicrotask(() => {
      options.lookup(new URL(url).hostname, { all: false }, (error, address, family) => {
        if (error) {
          request.emit('error', error);
          return;
        }
        next.onLookup?.({ address, family });
        const response = new EventEmitter();
        response.statusCode = next.statusCode ?? 200;
        response.headers = next.headers || { 'content-type': 'text/plain' };
        response.complete = true;
        response.destroy = () => {};
        response.resume = () => {};
        callback(response);
        if (!next.headers?.location) {
          if (next.body) response.emit('data', Buffer.from(next.body));
          response.emit('end');
        }
      });
    });
    return request;
  };
  return {
    calls,
    restore() {
      http.request = originalRequest;
    },
  };
}

{
  let resolverCalls = 0;
  let pinnedAddress = '';
  const mock = installMockHttpResponses([{
    onLookup: ({ address }) => { pinnedAddress = address; },
    body: 'public response',
  }]);
  try {
    const result = await safeFetchPublicText('http://rebind.audit.test/', {
      lookup: async () => {
        resolverCalls += 1;
        return [{ address: '93.184.216.34', family: 4 }];
      },
    });
    assert.equal(result.ok, true);
    assert.equal(resolverCalls, 1, 'the original DNS resolver must run only for validation');
    assert.equal(pinnedAddress, '93.184.216.34', 'transport must use the validated address, not a later DNS answer');
    assert.equal(mock.calls.length, 1);
  } finally {
    mock.restore();
  }
}

{
  const mock = installMockHttpResponses([{
    statusCode: 302,
    headers: { location: 'http://127.0.0.1/private-target' },
  }]);
  try {
    await assert.rejects(
      safeFetchPublicText('http://redirect.audit.test/', {
        lookup: async () => [{ address: '93.184.216.34', family: 4 }],
      }),
      (error) => error?.code === 'public_url_private_address_denied',
      'redirects to a private address must be denied before a second request',
    );
    assert.equal(mock.calls.length, 1, 'private redirect must not receive a follow-up request');
  } finally {
    mock.restore();
  }
}

await assert.rejects(
  safeFetchPublicText('https://slow-dns.audit.example/', {
    timeoutMs: 120,
    lookup: async () => new Promise((resolve) => setTimeout(() => resolve([
      { address: '8.8.8.8', family: 4 },
    ]), 1_000)),
  }),
  (error) => error?.code === 'public_url_timeout',
  'DNS resolution must obey the overall public fetch timeout',
);

function listen(server, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.listen(0, host, () => resolve(server.address().port));
    server.on('error', reject);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function waitForBackend(baseUrl, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited early with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until the isolated backend is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('isolated backend did not start');
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-ssrf-repro-'));
const dbPath = path.join(tempDir, 'db.json');
await writeFile(dbPath, '{}\n', 'utf8');

let internalHits = 0;
const internalServer = http.createServer((request, response) => {
  internalHits += 1;
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>DZHERO_INTERNAL_AUDIT_MARKER</title>');
});

const internalPort = await listen(internalServer, '::1');
const backendPortProbe = http.createServer();
const backendPort = await listen(backendPortProbe);
await closeServer(backendPortProbe);
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
    CLIENT_URL: 'https://dzhero.com.ua',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    ALLOW_DEMO_LOGIN: 'false',
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '',
    APIFY_TOKEN: '',
    YOUTUBE_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

try {
  await waitForBackend(baseUrl, child);
  const response = await fetch(`${baseUrl}/api/brand-scan/preview`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://dzhero.com.ua',
      referer: 'https://dzhero.com.ua/',
    },
    body: JSON.stringify({ input: `http://[::1]:${internalPort}/internal-metadata` }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(
    internalHits,
    0,
    'REPRODUCED: public Brand Scan reached an IPv6 loopback service; private-network URL validation is incomplete.',
  );
  console.log('Brand Scan private-network URL check passed.');
} catch (error) {
  if (stdout.trim()) console.error(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await stopBackend(child);
  await closeServer(internalServer);
  await rm(tempDir, { recursive: true, force: true });
}
