import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');

function createDb() {
  const now = '2026-07-25T10:00:00.000Z';
  return {
    users: [{
      id: 'usr_1',
      name: 'Upload Owner',
      email: 'upload-owner@example.com',
      role: 'owner',
      workspaceId: 'ws_1',
      createdAt: now,
    }],
    sessions: [{
      token: 'session_1',
      userId: 'usr_1',
      expiresAt: '2030-01-01T00:00:00.000Z',
    }],
    workspaces: [{
      id: 'ws_1',
      name: 'Upload Cleanup Workspace',
      owner: 'Upload Owner',
      brief: {},
      contentPlanPosts: [],
    }],
    subscriptions: [{
      id: 'sub_1',
      workspaceId: 'ws_1',
      planId: 'trial',
      status: 'trialing',
      trialEndsAt: '2030-01-01T00:00:00.000Z',
    }],
    usageCounters: [],
    agentStudioRuns: [],
    agentStudioUploads: [],
    dataDeletionRequests: [],
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
    server.on('error', reject);
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until the local server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Agent Studio upload cleanup server did not start.');
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function requestUpload(baseUrl) {
  const response = await fetch(`${baseUrl}/api/workspaces/ws_1/agent-studio/uploads`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer session_1',
      'content-type': 'video/mp4',
      'x-file-name': encodeURIComponent('cleanup-test.mp4'),
    },
    body: Buffer.from('fake-video-bytes'),
  });
  const text = await response.text();
  const body = text && (response.headers.get('content-type') || '').includes('application/json')
    ? JSON.parse(text)
    : null;
  return { response, body, text };
}

async function readProviderCalls(providerCallsPath) {
  try {
    const raw = await readFile(providerCallsPath, 'utf8');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function waitForDeletedFile(providerCallsPath, fileName) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const calls = await readProviderCalls(providerCallsPath);
    if (calls.some((call) => call.kind === 'deleteFile' && call.fileName === fileName)) {
      return calls;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return readProviderCalls(providerCallsPath);
}

function startServer({ port, baseUrl, dbPath, providerPath, providerCallsPath }) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      DB_PATH: dbPath,
      CLIENT_URL: baseUrl,
      ENABLE_AGENT_STUDIO: 'true',
      OPENAI_API_KEY: 'test-openai-key',
      GEMINI_API_KEY: 'test-gemini-key',
      AUTOMATIC_DISCOVERY_ENABLED: 'false',
      AGENT_STUDIO_TEST_PROVIDER: providerPath,
      AGENT_STUDIO_TEST_CALLS_PATH: providerCallsPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  return {
    child,
    getOutput: () => ({ stdout, stderr }),
  };
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-studio-upload-cleanup-'));
const dbPath = path.join(tempDir, 'db.json');
const providerPath = path.join(tempDir, 'agent-studio-provider.cjs');
const providerCallsPath = path.join(tempDir, 'provider-calls.ndjson');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;

await writeFile(dbPath, `${JSON.stringify(createDb(), null, 2)}\n`, 'utf8');
await writeFile(providerPath, `'use strict';
const { appendFileSync, readFileSync } = require('node:fs');

const callsPath = process.env.AGENT_STUDIO_TEST_CALLS_PATH;
const originalFetch = globalThis.fetch;

function readCalls() {
  try {
    return readFileSync(callsPath, 'utf8')
      .trim()
      .split('\\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function record(entry) {
  appendFileSync(callsPath, JSON.stringify(entry) + '\\n', 'utf8');
}

globalThis.fetch = async (input, init = {}) => {
  const url = String(input && input.url ? input.url : input);
  const method = String(init.method || (input && input.method) || 'GET').toUpperCase();
  const prefix = 'https://generativelanguage.googleapis.com/v1beta/';
  if (method === 'DELETE' && url.startsWith(prefix)) {
    const fileName = url.slice(prefix.length);
    record({ kind: 'deleteFile', fileName });
    return new Response(null, { status: 204 });
  }
  if (/^https?:\\/\\//i.test(url) && !/^http:\\/\\/(127\\.0\\.0\\.1|localhost)(?::\\d+)?\\//i.test(url)) {
    throw new Error('Unexpected external network request in upload cleanup test: ' + method + ' ' + url);
  }
  return originalFetch(input, init);
};

module.exports = {
  async uploadVideo({ bytes, mimeType, displayName }) {
    if (!bytes || !bytes.length) throw new Error('test upload missing bytes');
    const sequence = readCalls().filter((call) => call.kind === 'uploadVideo').length + 1;
    const name = 'files/test-upload-' + sequence;
    record({ kind: 'uploadVideo', fileName: name });
    return {
      name,
      uri: 'https://gemini.invalid/' + name,
      mimeType,
      originalName: displayName,
    };
  },
  async runAgent() {
    throw new Error('runAgent must not be called by upload cleanup test');
  },
  async analyzeVideo() {
    throw new Error('analyzeVideo must not be called by upload cleanup test');
  },
};
`, 'utf8');

let server = null;
try {
  server = startServer({ port, baseUrl, dbPath, providerPath, providerCallsPath });
  await waitForServer(baseUrl, server.child);

  const firstUpload = await requestUpload(baseUrl);
  assert.equal(firstUpload.response.status, 201, firstUpload.text);

  await stopServer(server.child);
  server = null;

  const afterFirstUpload = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(afterFirstUpload.agentStudioUploads.length, 1);
  const firstRecord = afterFirstUpload.agentStudioUploads[0];
  assert.equal(firstRecord.file.name, 'files/test-upload-1');
  firstRecord.expiresAt = '2000-01-01T00:00:00.000Z';
  await writeFile(dbPath, `${JSON.stringify(afterFirstUpload, null, 2)}\n`, 'utf8');

  server = startServer({ port, baseUrl, dbPath, providerPath, providerCallsPath });
  await waitForServer(baseUrl, server.child);

  const secondUpload = await requestUpload(baseUrl);
  assert.equal(secondUpload.response.status, 201, secondUpload.text);

  const persisted = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.deepEqual(
    persisted.agentStudioUploads.map((upload) => upload.file.name),
    ['files/test-upload-2'],
    'The expired upload record should be removed when the next upload is stored.',
  );

  const providerCalls = await waitForDeletedFile(providerCallsPath, 'files/test-upload-1');
  assert.deepEqual(
    providerCalls
      .filter((call) => call.kind === 'deleteFile')
      .map((call) => call.fileName),
    ['files/test-upload-1'],
    'Removing an expired upload record must delete its temporary provider file.',
  );

  console.log('Agent Studio expired upload cleanup check passed.');
} catch (error) {
  const output = server?.getOutput();
  if (output?.stdout.trim()) console.error(output.stdout.trim());
  if (output?.stderr.trim()) console.error(output.stderr.trim());
  throw error;
} finally {
  await stopServer(server?.child);
  await rm(tempDir, { recursive: true, force: true });
}
