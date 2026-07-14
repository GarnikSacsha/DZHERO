import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'backend', 'server.js');

function createEmptyDb() {
  return {
    users: [],
    sessions: [],
    workspaces: [],
    competitors: [],
    reels: [],
    ideas: [],
    leads: [],
    syncJobs: [],
    sources: [],
    metaStates: [],
    instagramAccounts: [],
    tiktokAccounts: [],
    aiMemory: [],
    aiJobs: [],
    remixes: [],
    contentPlanItems: [],
    videoJobs: [],
    dataDeletionRequests: [],
    plans: [],
    subscriptions: [],
    usageCounters: [],
    demoSessions: [],
    discoveryRuns: [],
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
    server.on('error', reject);
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep polling until the server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('timed out waiting for backend health check');
}

async function waitForFile(filePath) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      await access(filePath);
      return;
    } catch {
      // Keep polling until the file appears.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for file ${filePath}`);
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  let body = null;
  if (text && contentType.includes('application/json')) {
    body = JSON.parse(text);
  }
  return { response, body, text };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'automatic-discovery-api-'));
const dbPath = path.join(tempDir, 'db.json');
const providerPath = path.join(tempDir, 'automatic-provider.cjs');
const providerStartedPath = path.join(tempDir, 'provider-started');
const providerReleasePath = path.join(tempDir, 'provider-release');
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;

await writeFile(dbPath, `${JSON.stringify(createEmptyDb(), null, 2)}\n`, 'utf8');
await writeFile(providerPath, `'use strict';

const fs = require('fs/promises');

module.exports = async function automaticDiscoveryTestProvider(call = {}) {
  const startedPath = process.env.AUTOMATIC_DISCOVERY_TEST_PROVIDER_STARTED_PATH;
  const releasePath = process.env.AUTOMATIC_DISCOVERY_TEST_PROVIDER_RELEASE_PATH;
  if (startedPath) {
    await fs.writeFile(startedPath, JSON.stringify({
      platform: call.platform || null,
      mode: call.mode || call.inputType || null,
      input: call.input || call.inputValue || null,
      limit: Number(call.limit || 0),
      downloadVideos: Boolean(call.downloadVideos || call.downloadVideo),
    }, null, 2));
  }
  if (releasePath) {
    while (true) {
      try {
        await fs.access(releasePath);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
  return [];
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
    APIFY_TOKEN: 'test-apify-token',
    ADMIN_TOKEN: 'test-admin-token',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
    AUTOMATIC_DISCOVERY_TEST_PROVIDER: providerPath,
    AUTOMATIC_DISCOVERY_TEST_PROVIDER_STARTED_PATH: providerStartedPath,
    AUTOMATIC_DISCOVERY_TEST_PROVIDER_RELEASE_PATH: providerReleasePath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  await waitForServer(baseUrl, child);

  const auth = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Automatic Discovery Smoke',
      email: 'automatic-discovery-smoke@example.com',
      password: 'test-password-1',
    }),
  });
  assert.equal(auth.response.status, 201);
  assert.ok(auth.body?.token);
  assert.ok(auth.body?.user?.workspaceId);

  const authSecond = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Automatic Discovery Other',
      email: 'automatic-discovery-other@example.com',
      password: 'test-password-2',
    }),
  });
  assert.equal(authSecond.response.status, 201);
  assert.ok(authSecond.body?.token);
  assert.ok(authSecond.body?.user?.workspaceId);

  const token = auth.body.token;
  const workspaceId = auth.body.user.workspaceId;
  const otherWorkspaceId = authSecond.body.user.workspaceId;
  const headers = {
    authorization: `Bearer ${token}`,
  };
  const otherHeaders = {
    authorization: `Bearer ${authSecond.body.token}`,
  };

  const verifiedGoogleState = JSON.parse(await readFile(dbPath, 'utf8'));
  const verifiedGoogleUser = verifiedGoogleState.users.find((user) => user.id === auth.body.user.id);
  verifiedGoogleUser.authProvider = 'google';
  verifiedGoogleUser.oauthProviders = ['google'];
  await writeFile(dbPath, `${JSON.stringify(verifiedGoogleState, null, 2)}\n`, 'utf8');

  const testerGrant = await requestJson(baseUrl, '/api/admin/testers/grant', {
    method: 'POST',
    headers: { 'x-admin-token': 'test-admin-token' },
    body: JSON.stringify({ email: 'automatic-discovery-smoke@example.com' }),
  });
  assert.equal(testerGrant.response.status, 201);
  assert.equal(testerGrant.body?.tester?.status, 'active');

  const unauthenticatedGet = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery`);
  assert.equal(unauthenticatedGet.response.status, 401);

  const unauthenticatedPatch = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(unauthenticatedPatch.response.status, 401);

  const initialStatus = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery`, {
    headers,
  });
  assert.equal(initialStatus.response.status, 200);
  assert.equal(initialStatus.body?.settings?.enabled, true);
  assert.equal(initialStatus.body?.settings?.dailyBudgetUsd, 0.4);
  assert.equal(initialStatus.body?.settings?.viralScoreThreshold, 70);
  assert.equal(initialStatus.body?.status?.dailySpendUsd, 0);
  assert.equal(initialStatus.body?.status?.dailySpendIsEstimated, false);

  const repeatedInitialStatus = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery`, {
    headers,
  });
  assert.deepEqual(
    repeatedInitialStatus.body?.settings?.nextRunAt,
    initialStatus.body?.settings?.nextRunAt,
    'untouched discovery defaults must remain stable across reads',
  );

  const patchedStatus = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      enabled: true,
      dailyBudgetUsd: 0.8,
      viralScoreThreshold: 56,
      platforms: ['instagram', 'tiktok'],
    }),
  });
  assert.equal(patchedStatus.response.status, 200);
  assert.equal(patchedStatus.body?.settings?.enabled, true);
  assert.equal(patchedStatus.body?.settings?.dailyBudgetUsd, 0.4);
  assert.equal(patchedStatus.body?.settings?.viralScoreThreshold, 56);
  assert.deepEqual(patchedStatus.body?.settings?.platforms, ['instagram', 'tiktok']);

  const forbiddenGet = await requestJson(baseUrl, `/api/workspaces/${otherWorkspaceId}/signals/discovery`, {
    headers,
  });
  assert.equal(forbiddenGet.response.status, 403);

  const forbiddenPatch = await requestJson(baseUrl, `/api/workspaces/${otherWorkspaceId}/signals/discovery`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(forbiddenPatch.response.status, 403);

  const notFoundGet = await requestJson(baseUrl, '/api/workspaces/ws_missing/signals/discovery', {
    headers,
  });
  assert.equal(notFoundGet.response.status, 404);

  const otherOwnerStatus = await requestJson(baseUrl, `/api/workspaces/${otherWorkspaceId}/signals/discovery`, {
    headers: otherHeaders,
  });
  assert.equal(otherOwnerStatus.response.status, 200);

  const duplicateReelState = JSON.parse(await readFile(dbPath, 'utf8'));
  duplicateReelState.reels.unshift(
    {
      id: 'youtube_duplicate_weak',
      workspaceId,
      title: 'Same YouTube Short',
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
      views: 0,
      likes: 0,
      score: 78,
      importedMetadata: {
        source: { label: 'YouTube Shorts', tone: 'shorts' },
        youtube: { videoId: 'abc123' },
        url: 'https://www.youtube.com/shorts/abc123?feature=share',
      },
    },
    {
      id: 'youtube_duplicate_strong',
      workspaceId,
      title: 'Same YouTube Short',
      sourceUrl: 'https://www.youtube.com/watch?v=abc123',
      views: '60M',
      likes: '472K',
      score: 78,
      importedMetadata: {
        source: { label: 'YouTube Shorts', tone: 'shorts' },
        youtube: { videoId: 'abc123' },
        url: 'https://www.youtube.com/watch?v=abc123',
      },
    },
    {
      id: 'instagram_unique',
      workspaceId,
      title: 'Unique Instagram Reel',
      sourceUrl: 'https://www.instagram.com/reel/xyz/',
      importedMetadata: {
        provider: 'apify',
        platform: 'instagram',
        shortCode: 'xyz',
        url: 'https://www.instagram.com/reel/xyz/',
      },
    },
  );
  await writeFile(dbPath, `${JSON.stringify(duplicateReelState, null, 2)}\n`, 'utf8');

  const dedupedReels = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/reels`, {
    headers,
  });
  assert.equal(dedupedReels.response.status, 200);
  assert.equal(dedupedReels.body?.reels?.length, 2);
  assert.equal(dedupedReels.body?.reels?.filter((reel) => reel.title === 'Same YouTube Short').length, 1);
  assert.equal(dedupedReels.body?.reels?.find((reel) => reel.title === 'Same YouTube Short')?.views, '60M');

  const runState = JSON.parse(await readFile(dbPath, 'utf8'));
  const workspace = runState.workspaces.find((item) => item.id === workspaceId);
  workspace.discoverySettings = {
    ...(workspace.discoverySettings || {}),
    enabled: true,
    dailyBudgetUsd: 0.8,
    viralScoreThreshold: 56,
    platforms: ['instagram', 'tiktok'],
  };
  workspace.notes = 'pre-existing workspace note';
  runState.sources.unshift({
    id: 'src_api_1',
    workspaceId,
    handle: '@fitlab',
    label: 'Fit Lab',
    type: 'instagram',
  });
  runState.discoveryRuns.unshift({
    id: 'stale_automatic_run',
    workspaceId,
    lane: 'automatic',
    status: 'running',
    claimedAt: '2026-07-08T00:00:00.000Z',
    startedAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
  });
  await writeFile(dbPath, `${JSON.stringify(runState, null, 2)}\n`, 'utf8');

  const manualRunPromise = requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  await waitForFile(providerStartedPath);

  const startedProviderCall = JSON.parse(await readFile(providerStartedPath, 'utf8'));
  assert.equal(startedProviderCall.limit, 5);

  const persistedClaimState = JSON.parse(await readFile(dbPath, 'utf8'));
  const activeRun = persistedClaimState.discoveryRuns?.find((run) => run.workspaceId === workspaceId && run.status === 'running');
  const recoveredRun = persistedClaimState.discoveryRuns?.find((run) => run.id === 'stale_automatic_run');

  assert.equal(activeRun?.lane, 'automatic');
  assert.equal(activeRun?.status, 'running');
  assert.equal(recoveredRun?.status, 'failed');
  assert.equal(recoveredRun?.reason, 'stale_run_recovered');
  assert.ok(recoveredRun?.finishedAt);

  const overlappingRun = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  assert.equal(overlappingRun.response.status, 409);
  assert.equal(overlappingRun.body?.error, 'automatic_discovery_running');
  assert.equal(overlappingRun.body?.run?.status, 'running');

  persistedClaimState.workspaces.find((item) => item.id === workspaceId).reviewNote = 'survives concurrent merge';
  persistedClaimState.reels.unshift({
    id: 'reel_concurrent_unrelated',
    workspaceId,
    title: 'Concurrent unrelated reel',
    sourceUrl: 'https://example.com/concurrent-reel',
    importedMetadata: {
      provider: 'manual',
      platform: 'instagram',
      externalId: 'concurrent-reel',
    },
  });
  await writeFile(dbPath, `${JSON.stringify(persistedClaimState, null, 2)}\n`, 'utf8');
  await writeFile(providerReleasePath, 'release\n', 'utf8');

  const manualRun = await manualRunPromise;
  assert.equal(manualRun.response.status, 201);
  assert.equal(manualRun.body?.run?.status, 'completed');
  assert.equal(manualRun.body?.run?.budgetUsd, 0.4);
  assert.equal(manualRun.body?.run?.actualCostUsd, null);
  assert.equal(manualRun.body?.run?.attemptedCallCount, 2);
  assert.equal(manualRun.body?.run?.requestedCount, 2);
  assert.equal(manualRun.body?.acceptedSignals, 0);
  assert.ok(manualRun.body?.run?.estimatedCostUsd > 0 && manualRun.body?.run?.estimatedCostUsd <= 0.4);

  const persistedState = JSON.parse(await readFile(dbPath, 'utf8'));
  const persistedRun = persistedState.discoveryRuns?.find((run) => run.id === activeRun.id);
  const persistedWorkspace = persistedState.workspaces.find((item) => item.id === workspaceId);
  const persistedConcurrentReel = persistedState.reels?.find((reel) => reel.id === 'reel_concurrent_unrelated');
  assert.equal(persistedRun?.status, 'completed');
  assert.equal(persistedWorkspace?.reviewNote, 'survives concurrent merge');
  assert.equal(persistedConcurrentReel?.sourceUrl, 'https://example.com/concurrent-reel');

  const estimatedSpendStatus = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery`, {
    headers,
  });
  assert.ok(estimatedSpendStatus.body?.status?.dailySpendUsd > 0);
  assert.equal(estimatedSpendStatus.body?.status?.dailySpendIsEstimated, true);
  assert.equal(estimatedSpendStatus.body?.status?.canRunNow, false);

  const secondTesterRun = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  assert.equal(secondTesterRun.response.status, 429);
  assert.equal(secondTesterRun.body?.error, 'automatic_daily_run_limit_reached');

  const budgetBlockedState = JSON.parse(await readFile(dbPath, 'utf8'));
  const budgetWorkspace = budgetBlockedState.workspaces.find((item) => item.id === workspaceId);
  budgetWorkspace.discoverySettings = {
    ...(budgetWorkspace.discoverySettings || {}),
    enabled: true,
  };
  budgetBlockedState.discoveryRuns.unshift({
    id: 'automatic_budget_cap_reached',
    workspaceId,
    lane: 'automatic',
    status: 'completed',
    actualCostUsd: 0.8,
    completedAt: new Date().toISOString(),
  });
  await writeFile(dbPath, `${JSON.stringify(budgetBlockedState, null, 2)}\n`, 'utf8');

  const blockedRun = await requestJson(baseUrl, `/api/workspaces/${workspaceId}/signals/discovery/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  assert.equal(blockedRun.response.status, 429);
  assert.equal(blockedRun.body?.error, 'automatic_daily_run_limit_reached');

  console.log('automatic discovery API smoke tests passed');
} catch (error) {
  if (stdout.trim()) {
    console.error(stdout.trim());
  }
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  throw error;
} finally {
  await stopServer(child);
  await rm(tempDir, { recursive: true, force: true });
}
