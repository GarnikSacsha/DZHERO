import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');
const PERIOD = new Date().toISOString().slice(0, 7);
const NOW = new Date().toISOString();

function createDb({ exhaustedLegacyUsage }) {
  return {
    users: [{
      id: 'user_trial',
      email: 'trial@example.test',
      role: 'owner',
      workspaceId: 'ws_trial',
      createdAt: NOW,
    }],
    sessions: [{
      token: 'trial_session',
      userId: 'user_trial',
      expiresAt: '2030-01-01T00:00:00.000Z',
    }],
    workspaces: [{
      id: 'ws_trial',
      name: 'Free Trial workspace',
      owner: 'Trial owner',
      brief: { businessType: 'Coffee shop' },
      createdAt: NOW,
    }],
    subscriptions: [{
      id: 'sub_trial',
      workspaceId: 'ws_trial',
      planId: 'trial',
      status: 'trialing',
      trialEndsAt: '2030-01-01T00:00:00.000Z',
      createdAt: NOW,
      updatedAt: NOW,
    }],
    usageCounters: exhaustedLegacyUsage ? [{
      id: 'usage_legacy_ai_operations',
      workspaceId: 'ws_trial',
      metric: 'ai_operations',
      period: PERIOD,
      value: 5,
      createdAt: NOW,
      updatedAt: NOW,
    }] : [],
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The temporary server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${baseUrl}/api/health`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

async function startServer(tempDir, db) {
  const dbPath = path.join(tempDir, `db-${Math.random().toString(36).slice(2)}.json`);
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      DB_PATH: dbPath,
      DATABASE_URL: '',
      CLIENT_URL: baseUrl,
      AUTOMATIC_DISCOVERY_ENABLED: 'false',
      OPENAI_API_KEY: '',
      GEMINI_API_KEY: '',
      APIFY_TOKEN: '',
      YOUTUBE_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  child.getOutput = () => output;
  await waitForServer(baseUrl, child);
  return { baseUrl, child };
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      authorization: 'Bearer trial_session',
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-free-trial-ai-api-'));
  const failures = [];
  const check = async (label, assertion) => {
    try {
      await assertion();
    } catch (error) {
      error.message = `${label}: ${error.message}`;
      failures.push(error);
    }
  };

  let exhausted;
  let providerless;
  try {
    exhausted = await startServer(tempDir, createDb({ exhaustedLegacyUsage: true }));
    const chat = await requestJson(exhausted.baseUrl, '/api/workspaces/ws_trial/agent/chat', {
      method: 'POST',
      body: { message: 'Прочитай мій Brand Brain' },
    });
    await check('legacy shared counter', () => assert.notEqual(
      chat.status,
      402,
      'legacy ai_operations must not block the promised daily chat quota',
    ));

    const remix = await requestJson(exhausted.baseUrl, '/api/workspaces/ws_trial/remix/generate', {
      method: 'POST',
      body: { globalInsight: { title: 'Signal', hook: 'Hook', script: 'Observed source facts' } },
    });
    await check('shared counter must not become Remix fallback success', () => {
      assert.notEqual(remix.body?._generation?.provider, 'fallback');
      assert.notEqual(remix.body?.provider, 'fallback');
    });

    providerless = await startServer(tempDir, createDb({ exhaustedLegacyUsage: false }));
    const providerlessChat = await requestJson(providerless.baseUrl, '/api/workspaces/ws_trial/agent/chat', {
      method: 'POST',
      body: { message: 'Прочитай мій Brand Brain' },
    });
    await check('providerless chat must reject instead of succeeding with a local template', () => {
      assert.equal(providerlessChat.status, 503);
      assert.equal(providerlessChat.body?.error, 'ai_provider_not_configured');
    });

    const providerlessRemix = await requestJson(providerless.baseUrl, '/api/workspaces/ws_trial/remix/generate', {
      method: 'POST',
      body: { globalInsight: { title: 'Signal', hook: 'Hook', script: 'Observed source facts' } },
    });
    await check('providerless Remix must reject instead of succeeding with a local template', () => {
      assert.equal(providerlessRemix.status, 503);
      assert.equal(providerlessRemix.body?.error, 'ai_provider_not_configured');
    });

    if (failures.length) {
      throw new AggregateError(failures, 'Free Trial API regression assertions failed');
    }
    console.log('Free Trial API regression checks passed.');
  } finally {
    if (exhausted?.child?.getOutput()?.trim()) console.error(exhausted.child.getOutput().trim());
    if (providerless?.child?.getOutput()?.trim()) console.error(providerless.child.getOutput().trim());
    await Promise.all([stopServer(providerless?.child), stopServer(exhausted?.child)]);
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
