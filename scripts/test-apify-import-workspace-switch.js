const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || process.argv[2] || 'http://127.0.0.1:5173/';

function makeJsonResponse(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

async function waitFor(check, timeoutMs = 10000, intervalMs = 50) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('timed out waiting for condition');
}

function makeApifyImportPayload(workspaceId) {
  return {
    importedCount: 1,
    reusedCount: 0,
    reels: [
      {
        id: `reel_apify_${workspaceId}`,
        workspaceId,
        title: `Imported reel for ${workspaceId}`,
        handle: '@alpha_apify',
        sourceHandle: '@alpha_apify',
        sourceUrl: `https://example.com/apify/${workspaceId}`,
        score: 99,
        views: '1K',
        likes: '120',
        comments: '15',
        status: ['Imported'],
        importedMetadata: { provider: 'apify', platform: 'instagram' },
      },
    ],
  };
}

async function openApifyModal(page) {
  await page.locator('.signals-automation-actions button:last-child').click();
  await page.locator('.apify-signal-modal').waitFor({ state: 'visible' });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  const counts = {
    discovery: {},
    reels: {},
    import: 0,
  };
  const importGate = {};
  importGate.started = new Promise((resolve) => {
    importGate.resolveStarted = resolve;
  });
  importGate.released = new Promise((resolve) => {
    importGate.resolveReleased = resolve;
  });

  const workspaceA = 'ws_demo_ua';
  const workspaceB = 'ws_demo_cafe';
  const currentUser = {
    user: {
      id: 'user-demo',
      email: 'demo@example.com',
      name: 'Demo User',
      provider: 'demo',
      workspaceId: workspaceA,
    },
  };
  const workspaces = {
    workspaces: [
      { id: workspaceA, name: 'Alpha Workspace', handle: '@alpha.brand', type: 'Brand' },
      { id: workspaceB, name: 'Beta Workspace', handle: '@beta.brand', type: 'Brand' },
    ],
  };

  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const pathname = requestUrl.pathname.replace(/\/$/, '');
    const method = route.request().method();

    if (pathname === '/api/auth/me') {
      await route.fulfill(makeJsonResponse(currentUser));
      return;
    }

    if (pathname === '/api/workspaces' && method === 'GET') {
      await route.fulfill(makeJsonResponse(workspaces));
      return;
    }

    const discoveryMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/signals\/discovery$/);
    if (discoveryMatch) {
      const workspaceId = discoveryMatch[1];
      counts.discovery[workspaceId] = (counts.discovery[workspaceId] || 0) + 1;
      await route.fulfill(makeJsonResponse({
        settings: {
          enabled: true,
          dailyBudgetUsd: 0.8,
          viralScoreThreshold: 70,
          platforms: ['instagram', 'tiktok'],
        },
        status: {
          code: 'ready',
          running: false,
          tokenConfigured: true,
          dailySpendUsd: 0,
          dailyBudgetUsd: 0.8,
          canRunNow: true,
          latestRun: null,
          activeRun: null,
          lastRunAt: null,
          nextRunAt: null,
        },
      }));
      return;
    }

    const reelsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/reels$/);
    if (reelsMatch && method === 'GET') {
      const workspaceId = reelsMatch[1];
      counts.reels[workspaceId] = (counts.reels[workspaceId] || 0) + 1;
      await route.fulfill(makeJsonResponse({ reels: [] }));
      return;
    }

    const apifyImportMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/signals\/apify\/import$/);
    if (apifyImportMatch && method === 'POST') {
      const workspaceId = apifyImportMatch[1];
      counts.import += 1;

      if (counts.import === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'apify-import-failed' }),
        });
        return;
      }

      if (counts.import === 2) {
        await route.fulfill(makeJsonResponse(makeApifyImportPayload(workspaceId)));
        return;
      }

      importGate.resolveStarted?.();
      await importGate.released;
      await route.fulfill(makeJsonResponse(makeApifyImportPayload(workspaceId)));
      return;
    }

    await route.fulfill(makeJsonResponse({}));
  });

  try {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.shell', { timeout: 15000 });

    await page.locator('[data-tour="sidebar-transcript"]').click();
    await waitFor(() => (counts.discovery[workspaceA] || 0) >= 1 && (counts.reels[workspaceA] || 0) >= 1);

    await openApifyModal(page);
    await page.locator('.apify-signal-modal input').fill('https://example.com/apify-source');
    await page.locator('.apify-signal-modal .quick-modal-actions button.dark').click();
    await waitFor(async () => (await page.locator('.toast').textContent() || '').includes('apify-import-failed'));
    assert.equal(await page.locator('.apify-signal-modal').count(), 1, 'failed import should keep the modal open');
    assert.equal(
      await page.locator('.apify-signal-modal input').inputValue(),
      'https://example.com/apify-source',
      'failed import should preserve the entered URL',
    );

    await page.locator('.apify-signal-modal .quick-modal-actions button.dark').click();
    await waitFor(async () => (await page.locator('.apify-signal-modal').count()) === 0);

    await openApifyModal(page);
    await page.locator('.apify-signal-modal input').fill('https://example.com/apify-source-stale');
    await page.locator('.apify-signal-modal .quick-modal-actions button.dark').click();
    await importGate.started;

    await page.locator('.user-account-trigger').click();
    await page.getByRole('button', { name: /Beta Workspace/i }).click();
    await waitFor(() => (counts.discovery[workspaceB] || 0) >= 1 && (counts.reels[workspaceB] || 0) >= 1);

    const beforeRelease = {
      discoveryA: counts.discovery[workspaceA] || 0,
      reelsA: counts.reels[workspaceA] || 0,
      discoveryB: counts.discovery[workspaceB] || 0,
      reelsB: counts.reels[workspaceB] || 0,
      toast: await page.locator('.toast').textContent(),
    };

    importGate.resolveReleased();
    await importGate.released;
    await waitFor(async () => (await page.locator('.apify-signal-modal').count()) === 1);

    assert.equal(counts.discovery[workspaceA] || 0, beforeRelease.discoveryA, 'stale Apify import should not refresh old workspace discovery');
    assert.equal(counts.reels[workspaceA] || 0, beforeRelease.reelsA, 'stale Apify import should not refresh old workspace reels');
    assert.equal(counts.discovery[workspaceB] || 0, beforeRelease.discoveryB, 'switching workspaces should not be disturbed by stale import');
    assert.equal(counts.reels[workspaceB] || 0, beforeRelease.reelsB, 'switching workspaces should not be disturbed by stale import');
    assert.equal(await page.locator('.apify-signal-modal input').inputValue(), 'https://example.com/apify-source-stale', 'stale import should preserve the current workspace modal input');
    assert.equal(await page.locator('.toast').textContent(), beforeRelease.toast, 'stale import should stay silent');

    console.log('apify import workspace switch regression passed');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
