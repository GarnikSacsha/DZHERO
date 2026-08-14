import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'backend', 'server.js');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('backend did not start');
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function register(baseUrl, name, email) {
  const result = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password: 'test-password-123' }),
  });
  assert.equal(result.response.status, 201);
  return result.body;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tiktok-thumbnail-api-'));
const dbPath = path.join(tempDir, 'db.json');
const seed = JSON.parse(await readFile(path.join(ROOT, 'backend', 'data', 'db.example.json'), 'utf8'));
seed.users = [];
seed.sessions = [];
seed.workspaces = [];
seed.reels = [];
seed.subscriptions = [];
await writeFile(dbPath, `${JSON.stringify(seed, null, 2)}\n`);

let oEmbedRequestUrl = '';
const oEmbed = http.createServer((req, res) => {
  oEmbedRequestUrl = req.url || '';
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({
    thumbnail_url: 'https://p16-sign-va.tiktokcdn.com/refreshed-cover.jpeg',
  }));
});
const oEmbedPort = await listen(oEmbed);

const backendProbe = http.createServer();
const backendPort = await listen(backendProbe);
await new Promise((resolve) => backendProbe.close(resolve));
const baseUrl = `http://127.0.0.1:${backendPort}`;
const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(backendPort),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    DB_PATH: dbPath,
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    SHARED_SIGNAL_BANK_OWNER_EMAIL: 'bank-owner@example.com',
    TIKTOK_OEMBED_BASE_URL: `http://127.0.0.1:${oEmbedPort}/oembed`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let backendOutput = '';
child.stdout.on('data', (chunk) => { backendOutput += chunk; });
child.stderr.on('data', (chunk) => { backendOutput += chunk; });

try {
  await waitForServer(baseUrl, child);
  const owner = await register(baseUrl, 'Bank Owner', 'bank-owner@example.com');
  const member = await register(baseUrl, 'Trial Member', 'trial-member@example.com');
  const db = JSON.parse(await readFile(dbPath, 'utf8'));
  db.reels.push(
    {
      id: 'source_tiktok',
      workspaceId: owner.user.workspaceId,
      sourceUrl: 'https://www.tiktok.com/@dzhero/video/7380000000000000000',
      image: 'https://expired.example/cover.jpeg',
      curationStatus: 'approved',
      importedMetadata: {
        platform: 'tiktok',
        url: 'https://www.tiktok.com/@dzhero/video/7380000000000000000',
        image: 'https://expired.example/cover.jpeg',
        qualityGate: {
          decision: 'accept',
          admittedToBank: true,
        },
      },
    },
    {
      id: 'member_youtube',
      workspaceId: member.user.workspaceId,
      sourceUrl: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      image: '',
      importedMetadata: { platform: 'youtube' },
    },
  );
  await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`);

  const ownerRefresh = await request(
    baseUrl,
    `/api/workspaces/${owner.user.workspaceId}/reels/source_tiktok/thumbnail/refresh`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${owner.token}` },
      body: '{}',
    },
  );
  assert.equal(ownerRefresh.response.status, 200);
  assert.equal(ownerRefresh.body.thumbnailUrl, 'https://p16-sign-va.tiktokcdn.com/refreshed-cover.jpeg');

  const sharedRefresh = await request(
    baseUrl,
    `/api/workspaces/${member.user.workspaceId}/reels/shared_source_tiktok/thumbnail/refresh`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${member.token}` },
      body: '{}',
    },
  );
  assert.equal(sharedRefresh.response.status, 200);
  assert.match(oEmbedRequestUrl, /url=https%3A%2F%2Fwww\.tiktok\.com/);

  const persisted = JSON.parse(await readFile(dbPath, 'utf8'));
  const canonical = persisted.reels.find((reel) => reel.id === 'source_tiktok');
  assert.equal(canonical.image, 'https://p16-sign-va.tiktokcdn.com/refreshed-cover.jpeg');
  assert.equal(canonical.importedMetadata.image, canonical.image);
  assert.equal(persisted.reels.some((reel) => reel.id === 'shared_source_tiktok'), false);

  const invalid = await request(
    baseUrl,
    `/api/workspaces/${member.user.workspaceId}/reels/member_youtube/thumbnail/refresh`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${member.token}` },
      body: '{}',
    },
  );
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error, 'tiktok_video_url_required');

  const missing = await request(
    baseUrl,
    `/api/workspaces/${member.user.workspaceId}/reels/missing/thumbnail/refresh`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${member.token}` },
      body: '{}',
    },
  );
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.error, 'signal_not_found');

  console.log('TikTok thumbnail API tests passed');
} catch (error) {
  if (backendOutput) console.error(backendOutput);
  throw error;
} finally {
  await stop(child);
  await new Promise((resolve) => oEmbed.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
