import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');
const PROVIDER_DELAY_MS = 1_800;

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

async function waitForFile(filePath, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited early with ${child.exitCode}`);
    try {
      await access(filePath);
      return;
    } catch {
      // The delayed provider has not started yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('delayed provider call did not start');
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

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-concurrency-repro-'));
const dbPath = path.join(tempDir, 'db.json');
const preloadPath = path.join(tempDir, 'delayed-gemini-provider.cjs');
const providerMarkerPath = path.join(tempDir, 'provider-started');
const now = '2026-07-22T00:00:00.000Z';
const db = {
  users: [
    { id: 'usr_a', name: 'Owner A', email: 'a@example.com', role: 'owner', workspaceId: 'ws_a', createdAt: now },
    { id: 'usr_b', name: 'Owner B', email: 'b@example.com', role: 'owner', workspaceId: 'ws_b', createdAt: now },
  ],
  sessions: [
    { token: 'session_a', userId: 'usr_a', createdAt: now, expiresAt: '2030-01-01T00:00:00.000Z' },
    { token: 'session_b', userId: 'usr_b', createdAt: now, expiresAt: '2030-01-01T00:00:00.000Z' },
  ],
  workspaces: [
    { id: 'ws_a', name: 'Workspace A', owner: 'Owner A', brief: {}, contentPlanPosts: [], createdAt: now },
    { id: 'ws_b', name: 'Workspace B', owner: 'Owner B', brief: {}, contentPlanPosts: [], createdAt: now },
  ],
  subscriptions: [
    { id: 'sub_a', workspaceId: 'ws_a', planId: 'trial', status: 'trialing', trialEndsAt: '2030-01-01T00:00:00.000Z' },
    { id: 'sub_b', workspaceId: 'ws_b', planId: 'trial', status: 'trialing', trialEndsAt: '2030-01-01T00:00:00.000Z' },
  ],
  usageCounters: [],
};
await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
await writeFile(preloadPath, `'use strict';
const fs = require('node:fs');
const originalFetch = global.fetch;
global.fetch = async function auditFetch(input, options) {
  const url = String(input || '');
  if (url.includes('/models/audit-model:generateContent')) {
    fs.writeFileSync(process.env.AUDIT_PROVIDER_MARKER, String(Date.now()));
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.AUDIT_PROVIDER_DELAY_MS)));
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'A short audit response.' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return originalFetch(input, options);
};
`, 'utf8');

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--require', preloadPath, SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    CLIENT_URL: 'https://dzhero.com.ua',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: 'audit-key',
    GEMINI_TEXT_MODEL: 'audit-model',
    GEMINI_REMIX_MODEL: 'audit-model',
    APIFY_TOKEN: '',
    YOUTUBE_API_KEY: '',
    AUDIT_PROVIDER_MARKER: providerMarkerPath,
    AUDIT_PROVIDER_DELAY_MS: String(PROVIDER_DELAY_MS),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

const trustedHeaders = {
  'content-type': 'application/json',
  origin: 'https://dzhero.com.ua',
  referer: 'https://dzhero.com.ua/',
};

try {
  await waitForBackend(baseUrl, child);
  const slowRequest = fetch(`${baseUrl}/api/workspaces/ws_a/agent/chat`, {
    method: 'POST',
    headers: { ...trustedHeaders, authorization: 'Bearer session_a' },
    body: JSON.stringify({ message: 'Give one short content idea.' }),
  });

  await waitForFile(providerMarkerPath, child);
  const quickStartedAt = Date.now();
  const quickResponse = await fetch(`${baseUrl}/api/workspaces/ws_b/brief`, {
    method: 'PUT',
    headers: { ...trustedHeaders, authorization: 'Bearer session_b' },
    body: JSON.stringify({ businessType: 'Independent audit workspace' }),
  });
  const quickDurationMs = Date.now() - quickStartedAt;
  const slowResponse = await slowRequest;

  assert.equal(quickResponse.status, 200, await quickResponse.text());
  assert.equal(slowResponse.status, 201, await slowResponse.text());
  assert.ok(
    quickDurationMs < PROVIDER_DELAY_MS / 2,
    `REPRODUCED: an unrelated workspace write waited ${quickDurationMs}ms behind a ${PROVIDER_DELAY_MS}ms AI request.`,
  );
  const persistedDb = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(
    persistedDb.workspaces.find((workspace) => workspace.id === 'ws_b')?.brief?.businessType,
    'Independent audit workspace',
    'workspace B state was lost after workspace A completed',
  );
  assert.ok(
    persistedDb.aiJobs.some((job) => job.workspaceId === 'ws_a' && job.type === 'agent_chat'),
    'workspace A AI result was not persisted',
  );
  assert.equal(
    persistedDb.usageCounters.find((counter) => counter.workspaceId === 'ws_a' && counter.metric === 'ai_operations')?.value,
    1,
    'workspace A provider usage reservation was not persisted exactly once',
  );
  console.log(`Mutating API concurrency check passed in ${quickDurationMs}ms.`);
} catch (error) {
  if (stdout.trim()) console.error(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await stopBackend(child);
  await rm(tempDir, { recursive: true, force: true });
}
