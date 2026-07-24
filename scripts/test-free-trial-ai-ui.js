const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const PRIMARY_WORKSPACE_ID = 'ws_demo_ua';
const SECONDARY_WORKSPACE_ID = 'ws_trial_secondary';
const NOW = '2026-07-24T08:00:00.000Z';

function createMinimalDb() {
  const completeBrief = {
    businessType: 'Coffee shop',
    product: 'Coffee and pastries',
    location: 'Kyiv',
    audience: 'Local customers',
    toneOfVoice: 'Clear',
    goals: ['Adapt a signal'],
    objective: 'Bring more weekday visits',
    cta: 'Visit today',
  };
  return {
    users: [{
      id: 'usr_demo_ui',
      name: 'Demo UI',
      email: 'demo@dzhero.app',
      role: 'owner',
      workspaceId: PRIMARY_WORKSPACE_ID,
      workspaceIds: [SECONDARY_WORKSPACE_ID],
      createdAt: NOW,
    }],
    sessions: [],
    workspaces: [
      {
        id: PRIMARY_WORKSPACE_ID,
        name: 'Primary Coffee',
        owner: 'Demo UI',
        mode: 'own_business',
        marketFocus: ['ua'],
        brief: completeBrief,
        contentPlanPosts: [],
        createdAt: NOW,
      },
      {
        id: SECONDARY_WORKSPACE_ID,
        name: 'Unlimited Coffee',
        owner: 'Demo UI',
        mode: 'own_business',
        marketFocus: ['ua'],
        brief: completeBrief,
        contentPlanPosts: [],
        createdAt: NOW,
      },
    ],
    subscriptions: [
      {
        id: 'sub_primary',
        workspaceId: PRIMARY_WORKSPACE_ID,
        planId: 'trial',
        status: 'trialing',
        trialEndsAt: '2030-01-01T00:00:00.000Z',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'sub_secondary',
        workspaceId: SECONDARY_WORKSPACE_ID,
        planId: 'trial',
        status: 'trialing',
        trialEndsAt: '2030-01-01T00:00:00.000Z',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    reels: [
      {
        id: 'reel_primary',
        workspaceId: PRIMARY_WORKSPACE_ID,
        title: 'A controlled coffee reveal',
        handle: '@controlled',
        sourceUrl: 'https://example.com/coffee-primary',
        caption: 'Wait for the coffee reveal.',
        market: 'global',
        views: '12K',
        likes: '900',
        comments: '22',
        score: 91,
        status: ['Віральний', 'До адаптації'],
        createdAt: NOW,
      },
      {
        id: 'reel_secondary',
        workspaceId: SECONDARY_WORKSPACE_ID,
        title: 'An unlimited workspace signal',
        handle: '@controlled',
        sourceUrl: 'https://example.com/coffee-secondary',
        caption: 'A second controlled signal.',
        market: 'global',
        views: '8K',
        likes: '600',
        comments: '12',
        score: 88,
        status: ['Віральний', 'До адаптації'],
        createdAt: NOW,
      },
    ],
    ideas: [],
    usageCounters: [],
    competitors: [],
    sources: [],
    aiMemory: [],
    aiJobs: [],
    remixes: [],
    contentPlanItems: [],
    videoJobs: [],
    testerAccessGrants: [],
    demoSessions: [],
  };
}

function dailySnapshot(remixLimit, remixUsed, chatLimit, chatUsed) {
  return {
    timezone: 'Europe/Kyiv',
    period: '2026-07-24',
    resetsAt: '2026-07-24T21:00:00.000Z',
    remix: {
      limit: remixLimit,
      used: remixUsed,
      remaining: remixLimit == null ? null : Math.max(0, remixLimit - remixUsed),
    },
    agentChat: {
      limit: chatLimit,
      used: chatUsed,
      remaining: chatLimit == null ? null : Math.max(0, chatLimit - chatUsed),
    },
  };
}

const FREE_DAILY_ZERO = dailySnapshot(5, 0, 100, 0);
const FREE_DAILY_REMIX_USED = dailySnapshot(5, 1, 100, 0);
const FREE_DAILY_CHAT_USED = dailySnapshot(5, 1, 100, 1);
const FREE_DAILY_IMPORT_USED = dailySnapshot(5, 2, 100, 1);
const STALE_PRIMARY_DAILY = dailySnapshot(5, 4, 100, 77);
const UNLIMITED_DAILY = dailySnapshot(null, 12, null, 345);
const OLDER_DAILY = {
  ...dailySnapshot(5, 5, 100, 99),
  period: '2026-07-23',
  resetsAt: '2026-07-23T21:00:00.000Z',
};

function realRemixPayload() {
  return {
    deconstruction: {
      coreMechanics: 'A quiet setup followed by a sensory coffee reveal.',
      psychologicalTriggers: ['curiosity', 'sensory proof'],
      removedCulturalContext: [],
    },
    viabilityFilter: {
      isAdaptable: true,
      uaMentalityCheck: 'Keep the promise concrete and local.',
      productionFeasibility: 'Shootable on a phone in the coffee shop.',
    },
    remixes: [{
      title: 'Morning coffee reveal',
      hook: 'Your calmest five minutes in Kyiv start here.',
      visualFlow: [
        {
          timeframe: '0:00-0:03',
          actionDescription: 'Close-up of espresso pouring.',
          onScreenText: 'Five-minute reset',
          audioVoiceover: 'Start with the sound of fresh espresso.',
        },
        {
          timeframe: '0:03-0:10',
          actionDescription: 'Barista serves coffee and a pastry.',
          onScreenText: 'Coffee + pastry',
          audioVoiceover: 'Show the real morning ritual.',
        },
        {
          timeframe: '0:10-0:15',
          actionDescription: 'Customer leaves smiling.',
          onScreenText: 'Visit before work',
          audioVoiceover: 'Invite people to stop by today.',
        },
      ],
      cta: 'Visit before work',
    }],
    _generation: {
      provider: 'gemini',
      model: 'controlled-ui-model',
      fallback: false,
      attempts: 1,
    },
    generationId: 'remix_generation_controlled_ui',
    daily: FREE_DAILY_REMIX_USED,
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

function startProcess(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: ROOT_DIR,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  child.getOutput = () => output;
  return child;
}

async function waitForUrl(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`process exited before ${url} was ready:\n${child.getOutput()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Runtime is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${url}:\n${child.getOutput()}`);
}

async function waitForCondition(predicate, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

async function enterDemo(page) {
  if (await page.locator('.shell').count()) return;
  await page.getByRole('button', { name: /demo|демо/i }).first().click();
  await page.waitForSelector('.shell', { timeout: 20_000 });
}

async function switchWorkspace(page, name) {
  await page.locator('.user-account-trigger').click();
  await page.locator('.workspace-menu button').filter({ hasText: name }).click();
  await page.waitForSelector('.shell', { timeout: 20_000 });
}

async function waitForJeryk(page) {
  await page.waitForFunction(() => !document.querySelector('.jeryk-prompts button')?.hasAttribute('disabled'));
  await page.waitForTimeout(3_000);
}

async function optionalText(locator) {
  if (await locator.count() === 0) return '';
  return locator.first().innerText();
}

async function main() {
  let tempDir = null;
  let backend = null;
  let frontend = null;
  let browser = null;
  let page = null;
  let pendingStaleBilling = null;
  let pendingConcurrentRemix = null;
  let holdNextPrimaryBilling = false;
  const failures = [];
  const check = async (label, assertion) => {
    try {
      await assertion();
    } catch (error) {
      error.message = `${label}: ${error.message}`;
      failures.push(error);
    }
  };

  try {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'dzhero-free-trial-ai-ui-'));
    const dbPath = path.join(tempDir, 'db.json');
    await writeFile(dbPath, `${JSON.stringify(createMinimalDb(), null, 2)}\n`, 'utf8');
    const backendPort = await getFreePort();
    const frontendPort = await getFreePort();
    const backendUrl = `http://127.0.0.1:${backendPort}`;
    const frontendUrl = `http://127.0.0.1:${frontendPort}`;

    backend = startProcess(['backend/server.js'], {
      PORT: String(backendPort),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      DB_PATH: dbPath,
      DATABASE_URL: '',
      CLIENT_URL: frontendUrl,
      ALLOW_DEMO_LOGIN: 'true',
      AUTOMATIC_DISCOVERY_ENABLED: 'false',
      OPENAI_API_KEY: '',
      GEMINI_API_KEY: '',
      APIFY_TOKEN: '',
      YOUTUBE_API_KEY: '',
    });
    frontend = startProcess([
      'node_modules/vite/bin/vite.js',
      '--host', '127.0.0.1',
      '--port', String(frontendPort),
      '--strictPort',
    ], {
      VITE_API_URL: `${backendUrl}/api`,
    });

    await Promise.all([
      waitForUrl(`${backendUrl}/api/health`, backend),
      waitForUrl(frontendUrl, frontend),
    ]);
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    let primaryBillingRequests = 0;
    await page.route('**/api/workspaces/*/billing', async (route) => {
      const workspaceId = new URL(route.request().url()).pathname.split('/').at(-2);
      if (workspaceId === PRIMARY_WORKSPACE_ID) {
        primaryBillingRequests += 1;
        if (holdNextPrimaryBilling) {
          holdNextPrimaryBilling = false;
          await new Promise((resolve) => {
            pendingStaleBilling = { route, resolve };
          });
          return;
        }
      }
      const daily = workspaceId === SECONDARY_WORKSPACE_ID ? UNLIMITED_DAILY : FREE_DAILY_ZERO;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ daily }),
      });
    });
    await page.route('**/api/workspaces/*/agent/context', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        complete: true,
        brief: createMinimalDb().workspaces[0].brief,
      }),
    }));
    await page.route('**/api/workspaces/*/reels/import-url', (route) => route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        reel: {
          id: 'reel_imported_controlled',
          workspaceId: PRIMARY_WORKSPACE_ID,
          title: 'Controlled imported signal',
          handle: '@controlled-import',
          sourceUrl: 'https://www.youtube.com/shorts/controlled-import',
          caption: 'Controlled import result.',
          market: 'global',
          views: '3K',
          likes: '300',
          comments: '9',
          score: 82,
          status: ['Імпортовано', 'До адаптації'],
          sourceStatus: 'youtube_api',
        },
        billing: { daily: FREE_DAILY_IMPORT_USED },
        remix: realRemixPayload(),
      }),
    }));

    let remixRequests = 0;
    await page.route('**/api/workspaces/*/remix/generate', (route) => {
      remixRequests += 1;
      if (remixRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'ai_provider_not_configured' }),
        });
      }
      if (remixRequests === 2) {
        return route.fulfill({
          status: 402,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'trial_expired' }),
        });
      }
      if (remixRequests === 4) {
        return new Promise((resolve) => {
          pendingConcurrentRemix = { route, resolve };
        });
      }
      if (remixRequests === 5) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...realRemixPayload(),
            daily: OLDER_DAILY,
            generationId: 'remix_generation_older_period_ui',
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(realRemixPayload()),
      });
    });

    let chatRequests = 0;
    await page.route('**/api/workspaces/*/agent/chat', (route) => {
      chatRequests += 1;
      if (chatRequests === 1) {
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            reply: 'Controlled Gemini reply.',
            provider: 'gemini',
            model: 'controlled-ui-model',
            daily: FREE_DAILY_CHAT_USED,
          }),
        });
      }
      if (chatRequests === 2) {
        return route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'daily_agent_chat_limit_reached' }),
        });
      }
      if (chatRequests === 3) {
        return route.fulfill({
          status: 402,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'trial_expired' }),
        });
      }
      if (chatRequests === 5) {
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            reply: 'Concurrent controlled Gemini reply.',
            provider: 'gemini',
            model: 'controlled-ui-model',
            daily: dailySnapshot(5, 2, 100, 2),
          }),
        });
      }
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'ai_provider_failed' }),
      });
    });

    await page.goto(frontendUrl, { waitUntil: 'domcontentloaded' });
    await enterDemo(page);
    await page.waitForFunction(() => !document.querySelector('[data-tour="sidebar-transcript"]')?.hasAttribute('disabled'));
    await page.locator('[data-tour="sidebar-transcript"]').click();
    await page.waitForSelector('.signal-adapt-button', { timeout: 20_000 });
    await page.locator('.signal-adapt-button').first().click();
    await page.waitForSelector('.studio-error-note', { timeout: 10_000 });
    await page.waitForFunction(() => (
      document.querySelector('.daily-ai-usage')?.textContent?.includes('Адаптації сьогодні: 0/5')
    ));

    await check('Studio shows the initial daily remix allowance', async () => {
      assert.equal(
        await optionalText(page.locator('.daily-ai-usage').filter({ hasText: 'Адаптації сьогодні' })),
        'Адаптації сьогодні: 0/5',
      );
    });
    await check('Studio keeps provider failure as a localized non-AI draft', async () => {
      const providerFailureStudioText = await page.locator('.remix-bottom').innerText();
      assert.match(providerFailureStudioText, /Чернетка без AI/);
      assert.doesNotMatch(providerFailureStudioText, /Готова структура/);
      assert.match(providerFailureStudioText, /Gemini не налаштований на сервері\./);
    });

    await page.getByRole('button', { name: /Перегенерувати AI/i }).click();
    await check('Studio processes the trial-ended error before asserting it', async () => {
      await page.locator('.studio-error-note').filter({
        hasText: 'Безкоштовний тестовий період завершився. Обери тариф, щоб продовжити.',
      }).waitFor({ state: 'visible', timeout: 10_000 });
    });
    await check('Studio reports trial expiration without blaming Gemini', async () => {
      const trialEndedStudioText = await page.locator('.remix-bottom').innerText();
      assert.match(
        trialEndedStudioText,
        /Безкоштовний тестовий період завершився\. Обери тариф, щоб продовжити\./,
      );
    });
    await check('Studio trial expiration does not blame Gemini', async () => {
      const trialEndedStudioText = await page.locator('.remix-bottom').innerText();
      assert.doesNotMatch(trialEndedStudioText, /Gemini/);
    });

    await page.getByRole('button', { name: /Перегенерувати AI/i }).click();
    await page.waitForFunction(() => document.querySelector('.remix-bottom')?.innerText.includes('Готова структура'));
    await check('A real Studio success updates usage and may show the ready state', async () => {
      assert.equal(
        await optionalText(page.locator('.daily-ai-usage').filter({ hasText: 'Адаптації сьогодні' })),
        'Адаптації сьогодні: 1/5',
      );
      assert.match(await page.locator('.remix-bottom').innerText(), /Готова структура/);
    });

    await page.locator('.jeryk-idle-card').click();
    await check('Jeryk shows the initial daily message allowance', async () => {
      assert.equal(
        await optionalText(page.locator('.daily-ai-usage').filter({ hasText: 'Повідомлення сьогодні' })),
        'Повідомлення сьогодні: 0/100',
      );
    });
    await page.locator('.jeryk-prompts button').first().click();
    await waitForJeryk(page);
    await check('A real Jeryk success updates usage and provider state', async () => {
      assert.equal(
        await optionalText(page.locator('.daily-ai-usage').filter({ hasText: 'Повідомлення сьогодні' })),
        'Повідомлення сьогодні: 1/100',
      );
      assert.match(await page.locator('.jeryk-context em').innerText(), /gemini/i);
    });

    await page.locator('.jeryk-prompts button').nth(1).click();
    await waitForJeryk(page);
    await check('Jeryk renders quota copy and a quota state, never OFFLINE', async () => {
      const quotaThreadText = await page.locator('.jeryk-thread').innerText();
      assert.match(quotaThreadText, /Сьогодні використано 100 із 100 повідомлень Джерика\. Новий ліміт буде доступний після 00:00 за Києвом\./);
      assert.match(await page.locator('.jeryk-context em').innerText(), /limit/i);
      assert.doesNotMatch(await page.locator('.jeryk-context em').innerText(), /offline/i);
    });

    await page.locator('.jeryk-prompts button').nth(2).click();
    await waitForJeryk(page);
    await check('Jeryk reports trial expiration without OFFLINE', async () => {
      const trialThreadText = await page.locator('.jeryk-thread').innerText();
      assert.match(
        trialThreadText,
        /Безкоштовний тестовий період завершився\. Обери тариф, щоб продовжити\./,
      );
    });
    await check('Jeryk trial expiration does not blame Gemini', async () => {
      const trialThreadText = await page.locator('.jeryk-thread').innerText();
      assert.doesNotMatch(trialThreadText, /Gemini/);
    });
    await check('Jeryk marks trial expiration as trial, never OFFLINE', async () => {
      assert.match(await page.locator('.jeryk-context em').innerText(), /trial/i);
      assert.doesNotMatch(await page.locator('.jeryk-context em').innerText(), /offline/i);
    });

    await page.locator('.jeryk-prompts button').nth(3).click();
    await waitForJeryk(page);
    await check('Jeryk restricts OFFLINE to provider failures', async () => {
      assert.match(await page.locator('.jeryk-context em').innerText(), /offline/i);
      assert.match(await page.locator('.jeryk-thread').innerText(), /Gemini не зміг виконати запит\. Спробуй ще раз трохи згодом\./);
    });

    await page.locator('.jeryk-backdrop').click();
    await page.locator('[data-tour="sidebar-transcript"]').click();
    const signalSearch = page.locator('.page-signals .search-row input');
    await signalSearch.fill('https://www.youtube.com/shorts/controlled-import');
    await page.getByRole('button', { name: /Адаптувати автоматично/i }).click();
    await page.waitForSelector('.page-remix-studio', { timeout: 10_000 });
    await check('URL import refreshes root daily usage from payload.billing.daily', async () => {
      assert.equal(
        await optionalText(page.locator('.daily-ai-usage').filter({ hasText: 'Адаптації сьогодні' })),
        'Адаптації сьогодні: 2/5',
      );
      assert.match(await page.locator('.remix-bottom').innerText(), /Готова структура/);
    });

    await page.getByRole('button', { name: /Перегенерувати AI/i }).click();
    await waitForCondition(
      () => pendingConcurrentRemix !== null,
      'the controlled concurrent Remix request was not captured',
    );
    await page.locator('.jeryk-idle-card').click();
    await page.locator('.jeryk-prompts button').first().click();
    await waitForJeryk(page);
    await pendingConcurrentRemix.route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...realRemixPayload(),
        daily: dailySnapshot(5, 3, 100, 1),
        generationId: 'remix_generation_concurrent_ui',
      }),
    });
    pendingConcurrentRemix.resolve();
    await page.waitForFunction(() => !document.querySelector('.page-remix-studio .actions button')?.hasAttribute('disabled'));
    await check('Out-of-order same-workspace AI responses cannot roll either counter backward', async () => {
      assert.equal(
        await optionalText(page.locator('.daily-ai-usage').filter({ hasText: 'Адаптації сьогодні' })),
        'Адаптації сьогодні: 3/5',
      );
      assert.equal(
        await optionalText(page.locator('.daily-ai-usage').filter({ hasText: 'Повідомлення сьогодні' })),
        'Повідомлення сьогодні: 2/100',
      );
    });

    await page.locator('.jeryk-backdrop').click();
    await page.getByRole('button', { name: /Перегенерувати AI/i }).click();
    await page.waitForFunction(() => !document.querySelector('.page-remix-studio .actions button')?.hasAttribute('disabled'));
    await check('A delayed older daily period cannot replace the current day', async () => {
      assert.equal(
        await optionalText(page.locator('.daily-ai-usage').filter({ hasText: 'Адаптації сьогодні' })),
        'Адаптації сьогодні: 3/5',
      );
      assert.equal(
        await optionalText(page.locator('.daily-ai-usage').filter({ hasText: 'Повідомлення сьогодні' })),
        'Повідомлення сьогодні: 2/100',
      );
    });

    await switchWorkspace(page, 'Unlimited Coffee');
    await check('Unlimited snapshots hide numeric daily caps', async () => {
      assert.equal(await page.locator('.daily-ai-usage').count(), 0);
    });

    if (primaryBillingRequests === 0) {
      await check('Authenticated app root fetches daily billing usage', async () => {
        assert.fail('no workspace billing request was made');
      });
    } else {
      holdNextPrimaryBilling = true;
      await switchWorkspace(page, 'Primary Coffee');
      await waitForCondition(
        () => pendingStaleBilling !== null,
        'the controlled stale primary billing request was not captured',
      );
      await switchWorkspace(page, 'Unlimited Coffee');
      await pendingStaleBilling.route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ daily: STALE_PRIMARY_DAILY }),
      });
      pendingStaleBilling.resolve();
      await page.waitForTimeout(250);
      await check('Stale billing responses cannot overwrite the active workspace usage', async () => {
        assert.equal(await page.locator('.daily-ai-usage').count(), 0);
      });
    }

    if (failures.length) {
      throw new AggregateError(failures, 'Free Trial UI regression assertions failed');
    }
    console.log('Free Trial UI regression checks passed.');
  } finally {
    if (browser) await browser.close().catch(() => {});
    await Promise.all([stopProcess(frontend), stopProcess(backend)]);
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
