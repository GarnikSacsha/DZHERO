import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');
const QUICK_REQUEST_DEADLINE_MS = 1_500;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForServer(baseUrl, child) {
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

async function waitForFile(filePath, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited early with ${child.exitCode}`);
    try {
      await access(filePath);
      return;
    } catch {
      // The upload provider has not reached its gate yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('upload provider did not reach its gate');
}

async function requestJson(baseUrl, pathname, token, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text && (response.headers.get('content-type') || '').includes('application/json')
    ? JSON.parse(text)
    : null;
  return { response, body, text };
}

async function requestUpload(baseUrl, token) {
  const response = await fetch(`${baseUrl}/api/workspaces/ws_1/agent-studio/uploads`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'video/mp4',
      'x-file-name': encodeURIComponent('queue-test.mp4'),
    },
    body: Buffer.from('isolated-fake-video-bytes'),
  });
  const text = await response.text();
  const body = text && (response.headers.get('content-type') || '').includes('application/json')
    ? JSON.parse(text)
    : null;
  return { response, body, text };
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

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-studio-upload-queue-'));
const dbPath = path.join(tempDir, 'db.json');
const providerPath = path.join(tempDir, 'held-upload-provider.cjs');
const providerStartedPath = path.join(tempDir, 'provider-started');
const providerReleasePath = path.join(tempDir, 'provider-release');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const now = '2026-07-25T00:00:00.000Z';

await writeFile(dbPath, `${JSON.stringify({
  users: [
    { id: 'usr_1', name: 'Owner One', email: 'one@example.com', role: 'owner', workspaceId: 'ws_1', createdAt: now },
    { id: 'usr_2', name: 'Owner Two', email: 'two@example.com', role: 'owner', workspaceId: 'ws_2', createdAt: now },
  ],
  sessions: [
    { token: 'session_1', userId: 'usr_1', createdAt: now, expiresAt: '2030-01-01T00:00:00.000Z' },
    { token: 'session_2', userId: 'usr_2', createdAt: now, expiresAt: '2030-01-01T00:00:00.000Z' },
  ],
  workspaces: [
    { id: 'ws_1', name: 'Workspace One', owner: 'Owner One', brief: {}, contentPlanPosts: [], createdAt: now },
    { id: 'ws_2', name: 'Workspace Two', owner: 'Owner Two', brief: {}, contentPlanPosts: [], createdAt: now },
  ],
  sources: [],
  syncJobs: [],
}, null, 2)}\n`, 'utf8');

await writeFile(providerPath, `'use strict';
const { existsSync, writeFileSync } = require('node:fs');

module.exports = {
  async uploadVideo({ mimeType, displayName }) {
    writeFileSync(process.env.UPLOAD_PROVIDER_STARTED_PATH, 'started', 'utf8');
    while (!existsSync(process.env.UPLOAD_PROVIDER_RELEASE_PATH)) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return {
      name: 'files/held-upload',
      uri: 'https://gemini.invalid/files/held-upload',
      mimeType,
      originalName: displayName,
    };
  },
  async analyzeVideo() {
    throw new Error('analyzeVideo must not run in the upload queue reproducer');
  },
  async runAgent() {
    throw new Error('runAgent must not run in the upload queue reproducer');
  },
};
`, 'utf8');

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    CLIENT_URL: 'http://127.0.0.1:5173',
    ENABLE_AGENT_STUDIO: 'true',
    AGENT_STUDIO_TEST_PROVIDER: providerPath,
    UPLOAD_PROVIDER_STARTED_PATH: providerStartedPath,
    UPLOAD_PROVIDER_RELEASE_PATH: providerReleasePath,
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    APIFY_TOKEN: '',
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '',
    YOUTUBE_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
let uploadPromise;
let quickPromise;
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

try {
  await waitForServer(baseUrl, child);
  uploadPromise = requestUpload(baseUrl, 'session_1');
  uploadPromise.catch(() => {});
  await waitForFile(providerStartedPath, child);

  quickPromise = requestJson(baseUrl, '/api/workspaces/ws_2/sources', 'session_2', {
    method: 'POST',
    body: JSON.stringify({
      type: 'manual_competitor',
      label: 'Independent queue probe',
    }),
  });
  quickPromise.catch(() => {});

  const completedBeforeRelease = await Promise.race([
    quickPromise.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), QUICK_REQUEST_DEADLINE_MS)),
  ]);
  assert.equal(
    completedBeforeRelease,
    true,
    `REPRODUCED: workspace 2 source creation stayed queued for ${QUICK_REQUEST_DEADLINE_MS}ms behind workspace 1 upload.`,
  );

  const quick = await quickPromise;
  assert.equal(quick.response.status, 201, quick.text);
  assert.equal(quick.body?.source?.workspaceId, 'ws_2');

  await writeFile(providerReleasePath, 'release', 'utf8');
  const upload = await uploadPromise;
  assert.equal(upload.response.status, 201, upload.text);
  assert.ok(upload.body?.uploadId);

  console.log('Agent Studio upload queue isolation check passed.');
} catch (error) {
  if (stdout.trim()) console.error(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await writeFile(providerReleasePath, 'release', 'utf8').catch(() => {});
  await Promise.allSettled([uploadPromise, quickPromise].filter(Boolean));
  await stopBackend(child);
  await rm(tempDir, { recursive: true, force: true });
}
