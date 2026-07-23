import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_WORKSPACE_ID = 'ws_demo_ua';
const BROKEN_TITLE = 'Expired TikTok media preview fixture';
const YOUTUBE_TITLE = 'YouTube embed preview fixture';
const POSTER = 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="360" height="640"%3E%3Crect width="360" height="640" fill="%2316263a"/%3E%3Ctext x="24" y="320" fill="white"%3EPreview poster%3C/text%3E%3C/svg%3E';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function startNode(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-12000); });
  child.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-12000); });
  child.getOutput = () => output;
  return child;
}

async function waitForUrl(url, processHandle, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Process exited before ${url} was ready:\n${processHandle.getOutput()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Runtime is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}:\n${processHandle.getOutput()}`);
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) return;
  processHandle.kill();
  await Promise.race([
    new Promise((resolve) => processHandle.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
}

function createDatabase(tempDirectory) {
  const source = JSON.parse(readFileSync(path.join(ROOT, 'backend', 'data', 'db.json'), 'utf8'));
  const workspace = source.workspaces.find((item) => item.id === DEMO_WORKSPACE_ID);
  assert.ok(workspace, 'Demo workspace fixture is missing');
  workspace.brief = {
    brandName: 'Preview Test Brand',
    businessType: 'Test studio',
    product: 'Content production',
    audience: 'Creators',
    toneOfVoice: 'Clear',
  };
  source.sessions = [];
  source.reels = [
    {
      id: 'reel_expired_media_fixture',
      workspaceId: DEMO_WORKSPACE_ID,
      handle: '@preview_fixture',
      sourceHandle: '@preview_fixture',
      sourceUrl: 'https://www.tiktok.com/@preview_fixture/video/1234567890',
      sourceStatus: 'apify_video',
      scanLabel: 'TikTok',
      sourceType: 'TikTok',
      market: 'global',
      title: BROKEN_TITLE,
      image: POSTER,
      videoUrl: 'https://expired-media.test/video.mp4',
      views: 402100,
      likes: 39800,
      comments: 398,
      score: 96,
      status: ['TikTok', 'Source', 'Metadata'],
      importedMetadata: {
        platform: 'tiktok',
        url: 'https://www.tiktok.com/@preview_fixture/video/1234567890',
        image: POSTER,
        videoUrl: 'https://expired-media.test/video.mp4',
      },
      createdAt: '2026-07-23T00:00:00.000Z',
    },
    {
      id: 'reel_youtube_embed_fixture',
      workspaceId: DEMO_WORKSPACE_ID,
      handle: '@youtube_fixture',
      sourceHandle: '@youtube_fixture',
      sourceUrl: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      sourceStatus: 'youtube_oembed',
      scanLabel: 'YouTube Shorts',
      sourceType: 'YouTube Shorts',
      market: 'global',
      title: YOUTUBE_TITLE,
      image: POSTER,
      videoUrl: '',
      views: 120000,
      likes: 8000,
      comments: 120,
      score: 92,
      status: ['YouTube', 'Source', 'Metadata'],
      importedMetadata: {
        platform: 'youtube',
        url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
        image: POSTER,
        youtube: {
          videoId: 'dQw4w9WgXcQ',
          thumbnailUrl: POSTER,
        },
      },
      createdAt: '2026-07-23T00:00:00.000Z',
    },
    ...source.reels.filter((item) => item.workspaceId !== DEMO_WORKSPACE_ID),
  ];
  const databasePath = path.join(tempDirectory, 'db.json');
  writeFileSync(databasePath, JSON.stringify(source, null, 2));
  return databasePath;
}

const backendPort = await freePort();
const frontendPort = await freePort();
const appUrl = `http://127.0.0.1:${frontendPort}/`;
const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'dzhero-signal-preview-'));
const databasePath = createDatabase(tempDirectory);
const backend = startNode(['backend/server.js'], {
  PORT: String(backendPort),
  CLIENT_URL: appUrl.slice(0, -1),
  DB_PATH: databasePath,
  DATABASE_URL: '',
  AUTOMATIC_DISCOVERY_ENABLED: 'false',
});
let frontend;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await page.route('https://expired-media.test/video.mp4', (route) => route.fulfill({
    status: 410,
    contentType: 'text/plain',
    body: 'expired',
  }));
  await page.addInitScript(() => {
    localStorage.setItem('insta-producer-language', 'en');
    localStorage.removeItem('dzhero-active-workspace');
  });
  await waitForUrl(`http://127.0.0.1:${backendPort}/api/health`, backend);
  frontend = startNode(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(frontendPort)], {
    VITE_API_URL: `http://127.0.0.1:${backendPort}/api`,
  });
  await waitForUrl(appUrl, frontend);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  if (!(await page.locator('.shell').count())) {
    await page.getByRole('button', { name: /view demo|start with demo/i }).first().click();
  }
  await page.waitForSelector('.shell', { timeout: 15000 });
  await page.locator('[data-tour="sidebar-transcript"]').click();
  await page.getByText(BROKEN_TITLE).waitFor({ state: 'visible', timeout: 10000 });

  await page.locator('.reel-row', { hasText: BROKEN_TITLE }).locator('.thumb').click();
  await page.waitForSelector('.video-preview-modal');
  await page.waitForTimeout(500);
  assert.equal(
    await page.locator('.video-preview-modal video.signal-preview-video').count(),
    0,
    'An expired media URL must not leave a black video player visible',
  );
  assert.equal(
    await page.locator('.video-preview-modal .video-preview-frame.has-media').count(),
    1,
    'Expired media must fall back to the saved poster',
  );
  assert.equal(
    await page.getByRole('link', { name: /open original/i }).count(),
    1,
    'Fallback preview must preserve the original source link',
  );
  await page.locator('.video-preview-close').click();

  await page.locator('.reel-row', { hasText: YOUTUBE_TITLE }).locator('.thumb').click();
  await page.waitForSelector('.video-preview-modal');
  const youtubeFrame = page.locator('.video-preview-modal iframe[src*="youtube.com/embed/dQw4w9WgXcQ"]');
  assert.equal(
    await youtubeFrame.count(),
    1,
    'A YouTube signal must use the existing embed URL instead of a generic poster',
  );

  console.log('signal preview fallback and YouTube embed UI tests passed');
} finally {
  await browser.close();
  await stopProcess(frontend);
  await stopProcess(backend);
  rmSync(tempDirectory, { recursive: true, force: true });
}
