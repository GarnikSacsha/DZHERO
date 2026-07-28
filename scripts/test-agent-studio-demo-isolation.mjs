import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');
const TRUSTED_ORIGIN = 'https://dzhero.com.ua';
const PRIVATE_NOTE = 'visitor-a-private-launch-note';

async function getFreePort() {
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
      // Keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Agent Studio demo-isolation backend did not start.');
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

async function demoLogin(baseUrl, token = '') {
  const response = await fetch(`${baseUrl}/api/auth/demo`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: TRUSTED_ORIGIN,
      referer: `${TRUSTED_ORIGIN}/`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ experience: 'agent_studio' }),
  });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-agent-demo-isolation-'));
const dbPath = path.join(tempDir, 'db.json');
const now = '2026-07-25T10:00:00.000Z';
await writeFile(dbPath, `${JSON.stringify({
  users: [{
    id: 'usr_demo_agent',
    name: 'Coffee Demo User',
    email: 'agent-studio-demo@dzhero.app',
    role: 'owner',
    workspaceId: 'ws_demo_agent_studio_coffee',
    createdAt: now,
  }],
  sessions: [],
  workspaces: [{
    id: 'ws_demo_agent_studio_coffee',
    name: 'Reset Coffee Kyiv',
    owner: 'Coffee Demo User',
    mode: 'own_business',
    marketFocus: ['ua'],
    brief: {
      businessType: 'Coffee shop',
      product: 'Coffee',
      audience: 'Commuters',
      offer: 'Morning coffee',
      cta: 'Visit today',
      toneOfVoice: 'Warm',
    },
    createdAt: now,
  }],
  subscriptions: [{
    id: 'sub_demo_agent',
    workspaceId: 'ws_demo_agent_studio_coffee',
    planId: 'demo',
    status: 'active',
    createdAt: now,
  }],
  agentStudioRuns: [{
    id: 'agent_run_visitor_a',
    workspaceId: 'ws_demo_agent_studio_coffee',
    userId: 'usr_demo_agent',
    input: {
      mode: 'adapt_reel',
      outputLanguage: 'en',
      objective: 'Visitor A confidential launch objective',
      sourceUrl: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      userNotes: PRIVATE_NOTE,
    },
    status: 'completed',
    currentStage: 'completed',
    artifacts: {},
    trace: [],
    contextRequest: null,
    contextHistory: [],
    outputRepairCount: 0,
    criticRevisionCount: 0,
    approval: null,
    error: null,
    usage: { calls: [] },
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  }],
}, null, 2)}\n`, 'utf8');

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    DB_PATH: dbPath,
    DATABASE_URL: '',
    CLIENT_URL: TRUSTED_ORIGIN,
    ALLOW_DEMO_LOGIN: 'true',
    ENABLE_AGENT_STUDIO: 'true',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '',
    APIFY_TOKEN: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { backendOutput += chunk.toString(); });

try {
  await waitForServer(baseUrl, child);
  const visitorA = await demoLogin(baseUrl);
  const visitorARepeat = await demoLogin(baseUrl, visitorA.token);
  const visitorB = await demoLogin(baseUrl);
  assert.equal(visitorARepeat.token, visitorA.token, 'The same browser created a redundant demo session.');
  assert.equal(
    visitorARepeat.user.workspaceId,
    visitorA.user.workspaceId,
    'The same browser created a redundant demo workspace.',
  );
  assert.notEqual(visitorA.token, visitorB.token, 'Demo visitors did not receive distinct sessions.');
  assert.notEqual(
    visitorA.user.workspaceId,
    visitorB.user.workspaceId,
    'Demo visitors did not receive distinct workspaces.',
  );

  const latestResponse = await fetch(
    `${baseUrl}/api/workspaces/${visitorB.user.workspaceId}/agent-studio/runs/latest?language=en`,
    { headers: { authorization: `Bearer ${visitorB.token}` } },
  );
  const latestBody = await latestResponse.json().catch(() => ({}));
  if (latestResponse.status === 200) {
    assert.notEqual(
      latestBody.run?.input?.userNotes,
      PRIVATE_NOTE,
      'REPRODUCED: visitor B received visitor A userNotes from the shared Agent Studio demo workspace.',
    );
    assert.notEqual(
      latestBody.run?.id,
      'agent_run_visitor_a',
      'REPRODUCED: visitor B received visitor A completed run from the shared Agent Studio demo workspace.',
    );
  } else {
    assert.ok(
      [403, 404].includes(latestResponse.status),
      `Demo isolation returned unexpected status ${latestResponse.status}: ${JSON.stringify(latestBody)}`,
    );
  }
  const persisted = JSON.parse(await readFile(dbPath, 'utf8'));
  assert.equal(
    persisted.users.some((user) => user.email === 'agent-studio-demo@dzhero.app'),
    false,
    'Legacy shared demo user was not revoked.',
  );
  assert.equal(
    persisted.workspaces.some((workspace) => workspace.id === 'ws_demo_agent_studio_coffee'),
    false,
    'Legacy shared demo workspace was not removed.',
  );
  console.log('Agent Studio public demo isolation contract passed.');
} catch (error) {
  if (backendOutput.trim()) console.error(backendOutput.trim());
  throw error;
} finally {
  await stopProcess(child);
  await rm(tempDir, { recursive: true, force: true });
}
