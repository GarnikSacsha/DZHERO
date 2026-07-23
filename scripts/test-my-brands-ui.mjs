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
import {
  getMissingRequiredBrandFields,
  isBrandProfileComplete,
  normalizeSourceLinks,
} from '../src/myBrandsState.mjs';
import {
  BRAND_BRAIN_WIZARD_STEPS,
  getMissingWizardAnswers,
  normalizeWizardAnswers,
  normalizeWizardDraft,
  validateWizardStep,
} from '../src/brandBrainWizardState.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_WORKSPACE_ID = 'ws_demo_ua';

assert.equal(BRAND_BRAIN_WIZARD_STEPS.length, 4);
assert.deepEqual(
  getMissingWizardAnswers({
    profileDescription: 'Coffee',
    audience: 'Commuters',
    niche: 'Coffee shop',
    market: 'Kyiv',
  }),
  [],
);
assert.deepEqual(validateWizardStep(4, { instagramUrl: '' }), []);
assert.deepEqual(validateWizardStep(4, { instagramUrl: 'not-a-url' }), ['instagramUrl']);
assert.equal(normalizeWizardDraft({ currentStep: 7 }).currentStep, 4);
assert.deepEqual(normalizeWizardAnswers({
  profileDescription: 123,
  audience: true,
  niche: null,
  market: false,
}), {
  profileDescription: '',
  audience: '',
  niche: '',
  market: '',
  instagramUrl: '',
});
assert.deepEqual(normalizeWizardAnswers(null), {
  profileDescription: '',
  audience: '',
  niche: '',
  market: '',
  instagramUrl: '',
});
assert.equal(normalizeWizardDraft(null).currentStep, 1);
assert.equal(
  normalizeWizardAnswers({ instagramUrl: 'https://instagram.com/northstar#about' }).instagramUrl,
  'https://instagram.com/northstar',
);
assert.equal(normalizeWizardAnswers({ instagramUrl: 'https://example.com/northstar' }).instagramUrl, '');
assert.equal(normalizeWizardAnswers({ instagramUrl: 'ftp://instagram.com/northstar' }).instagramUrl, '');

assert.deepEqual(
  normalizeSourceLinks('https://example.com  https://example.com, ftp://invalid.example\nhttp://valid.example/path not-a-url'),
  ['https://example.com/', 'http://valid.example/path'],
  'Source links must discard invalid entries and preserve the first unique HTTP(S) URLs',
);
assert.deepEqual(
  getMissingRequiredBrandFields({
    businessType: 'Coffee shop',
    audience: 'Commuters',
    cta: 'Visit today',
  }),
  ['profileDescription', 'audience', 'niche', 'market'],
  'Incomplete legacy profiles must use the Version 2 authored-answer contract',
);
assert.equal(
  isBrandProfileComplete({
    businessType: 'Coffee shop',
    product: 'Espresso',
    audience: 'Commuters',
    offer: 'Breakfast set',
    cta: 'Visit today',
    toneOfVoice: 'Warm',
  }),
  true,
  'A profile containing every required field must be complete',
);

if (process.env.MY_BRANDS_STATE_ONLY === '1') {
  console.log('My Brands state contract tests passed');
  process.exit(0);
}

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

async function expectVisible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 5000 });
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

function createDatabase(tempDirectory, brief, { draft = null, secondaryBrief = {} } = {}) {
  const source = JSON.parse(readFileSync(path.join(ROOT, 'backend', 'data', 'db.json'), 'utf8'));
  const workspace = source.workspaces.find((item) => item.id === DEMO_WORKSPACE_ID);
  const demoUser = source.users.find((item) => item.workspaceId === DEMO_WORKSPACE_ID);
  assert.ok(workspace, 'Demo workspace fixture is missing');
  assert.ok(demoUser, 'Demo user fixture is missing');
  workspace.brief = brief;
  workspace.brandBrainDraft = draft;
  source.reels.push({
    id: 'reel_coffee_fixture',
    workspaceId: DEMO_WORKSPACE_ID,
    handle: '@coffee_fixture',
    sourceHandle: '@coffee_fixture',
    sourceUrl: 'https://www.tiktok.com/@coffee/video/123',
    sourceStatus: 'fixture',
    sourceType: 'TikTok',
    market: 'ua',
    title: 'Breakfast coffee before the commute',
    views: 42000,
    likes: 2100,
    comments: 84,
    score: 91,
    status: ['TikTok', 'Fixture'],
  });
  demoUser.workspaceIds = [DEMO_WORKSPACE_ID, 'ws_test_secondary'];
  source.workspaces.push({
    id: 'ws_test_secondary',
    name: 'Secondary Test Workspace',
    handle: '@secondary_test',
    type: 'Test',
    brief: secondaryBrief,
  });
  source.sessions = [];
  const databasePath = path.join(tempDirectory, 'db.json');
  writeFileSync(databasePath, JSON.stringify(source, null, 2));
  return databasePath;
}

async function loginDemo(page, appUrl) {
  await page.addInitScript(() => {
    localStorage.setItem('insta-producer-language', 'en');
    localStorage.removeItem('dzhero-active-workspace');
    localStorage.removeItem('dzhero-sources-tab');
  });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  if (!(await page.locator('.shell').count())) {
    await page.getByRole('button', { name: /view demo|start with demo/i }).first().click();
  }
  await page.waitForSelector('.shell', { timeout: 15000 });
}

async function withRuntime(brief, callback, options = {}) {
  const backendPort = await freePort();
  const frontendPort = await freePort();
  const appUrl = `http://127.0.0.1:${frontendPort}/`;
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'dzhero-my-brands-'));
  const databasePath = createDatabase(tempDirectory, brief, options);
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
    await waitForUrl(`http://127.0.0.1:${backendPort}/api/health`, backend);
    frontend = startNode(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(frontendPort)], {
      VITE_API_URL: `http://127.0.0.1:${backendPort}/api`,
    });
    await waitForUrl(appUrl, frontend);
    await loginDemo(page, appUrl);
    await callback(page);
  } finally {
    await browser.close();
    await stopProcess(frontend);
    await stopProcess(backend);
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

await withRuntime({}, async (page) => {
  assert.equal(
    await page.locator('[data-tour="sidebar-transcript"]').isDisabled(),
    true,
    'Signals must stay locked until My Brands onboarding is saved',
  );
  await expectVisible(page.getByRole('heading', { name: /describe your profile|опиши профіль/i }));
  assert.equal(await page.getByText(/1 of 4|1 з 4/i).count(), 1);

  let draftRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && /\/agent\/context\/draft$/.test(request.url())) draftRequests += 1;
  });
  await page.getByLabel(/profile and product|профіль та продукт/i).fill('Specialty coffee and fast breakfasts');
  const firstDraftResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && /\/agent\/context\/draft$/.test(response.url()));
  await page.getByRole('button', { name: /continue|продовжити/i }).click();
  assert.equal((await firstDraftResponse).ok(), true);
  await page.getByLabel(/target audience|цільова аудиторія/i).fill('Busy Kyiv commuters');
  const secondDraftResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && /\/agent\/context\/draft$/.test(response.url()));
  await page.getByRole('button', { name: /continue|продовжити/i }).click();
  assert.equal((await secondDraftResponse).ok(), true);
  assert.equal(draftRequests, 2, 'Each completed wizard step must persist its canonical draft');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell');
  await expectVisible(page.getByRole('heading', { name: /your niche and market|ніша та ринок/i }));
  assert.equal(await page.getByLabel(/target audience|цільова аудиторія/i).count(), 0, 'Refresh must resume the saved step');

  await page.getByLabel(/niche|ніша/i).fill('Coffee shop');
  await page.getByLabel(/market|ринок/i).fill('Kyiv, Ukraine');
  const thirdDraftResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && /\/agent\/context\/draft$/.test(response.url()));
  await page.getByRole('button', { name: /continue|продовжити/i }).click();
  assert.equal((await thirdDraftResponse).ok(), true);
  assert.equal(await page.getByRole('button', { name: /skip instagram|пропустити instagram/i }).count(), 1);
  let finalizeRequests = 0;
  let releaseFinalize;
  const finalizeGate = new Promise((resolve) => { releaseFinalize = resolve; });
  await page.route('**/api/workspaces/ws_demo_ua/agent/context/finalize', async (route) => {
    finalizeRequests += 1;
    await finalizeGate;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        complete: true,
        brief: {
          schemaVersion: 2,
          answers: {
            profileDescription: 'Specialty coffee and fast breakfasts',
            audience: 'Busy Kyiv commuters',
            niche: 'Coffee shop',
            market: 'Kyiv, Ukraine',
            instagramUrl: '',
          },
          derivedBrief: {},
          recommendation: {
            signalId: 'reel_coffee_fixture',
            reason: 'Best fit',
            selectionMode: 'deterministic',
          },
        },
        recommendation: {
          signalId: 'reel_coffee_fixture',
          reason: 'Best fit',
          selectionMode: 'deterministic',
        },
        signal: {
          id: 'reel_coffee_fixture',
          title: 'Breakfast coffee before the commute',
          sourceUrl: 'https://www.tiktok.com/@coffee/video/123',
        },
      }),
    });
  });
  const skipInstagram = page.getByRole('button', { name: /skip instagram|пропустити instagram/i });
  const firstFinalizeRequest = page.waitForRequest((request) => request.method() === 'POST' && /\/agent\/context\/finalize$/.test(request.url()));
  await skipInstagram.click();
  await firstFinalizeRequest;
  assert.equal(await skipInstagram.isDisabled(), true, 'Finish and Skip must lock while finalizing');
  await skipInstagram.click({ force: true });
  assert.equal(finalizeRequests, 1, 'Duplicate Skip must issue exactly one finalize request');
  releaseFinalize();
  await page.locator('.video-preview-modal').waitFor({ state: 'visible', timeout: 5000 });
  const previewDialog = page.getByRole('dialog', { name: 'Breakfast coffee before the commute' });
  assert.equal(await previewDialog.getAttribute('aria-modal'), 'true', 'Automatic preview must be announced as a modal dialog');
  assert.equal(await page.locator('.video-preview-close').evaluate((element) => document.activeElement === element), true, 'Automatic preview must transfer focus to its close control');
  assert.equal(await page.locator('.video-preview-modal').getByText('Breakfast coffee before the commute', { exact: true }).count(), 1, 'Finish must open the returned recommendation preview');
  assert.equal(await page.locator('[data-tour="sidebar-transcript"]').isDisabled(), false, 'Finish must unlock Signals');
  await page.keyboard.press('Escape');
  await page.locator('.video-preview-modal').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.page-signals').evaluate((element) => document.activeElement === element), true, 'Closing the automatic preview must restore a meaningful Signals focus target');
});

await withRuntime({
  brandName: 'North Star Coffee',
  businessType: 'Neighborhood coffee shop',
  product: 'Espresso and fresh pastries',
  audience: 'Morning commuters nearby',
  location: 'Kyiv',
  offer: 'Coffee and pastry breakfast',
  cta: 'Visit before work',
  toneOfVoice: 'Warm and concise',
  stopTopics: ['unsupported best-in-city claims'],
  proof: 'Public menu and customer reviews',
}, async (page) => {
  assert.equal(
    await page.locator('[data-tour="sidebar-home"]').count(),
    0,
    'Saved My Brands must not remain a standalone sidebar destination',
  );
  await page.locator('[data-tour="sidebar-settings"]').click();
  assert.equal(
    await page.getByRole('button', { name: /back to brand brain/i }).count(),
    0,
    'Completed users must not get an onboarding route from Settings',
  );
  await page.getByRole('button', { name: /my brands|brand memory/i }).click();
  await page.waitForSelector('.brand-brain');

  assert.equal(
    await page.locator('.brand-brain textarea').count(),
    0,
    'A saved brand must render as a locked card, not as inputs',
  );
  const editButton = page.getByRole('button', { name: /edit brand/i });
  assert.equal(await editButton.count(), 1, 'Saved brand card must expose one pencil edit action');
  await editButton.click();
  assert.ok(
    await page.locator('.brand-brain textarea').count() > 0,
    'Pencil action must unlock brand fields',
  );
  assert.equal(await page.getByRole('button', { name: /save changes/i }).count(), 1);
  assert.equal(await page.getByRole('button', { name: /cancel/i }).count(), 1);
  const productInput = page.locator('textarea[name="product"]');
  await productInput.fill('Unsaved latte');
  await page.getByRole('button', { name: /cancel/i }).click();
  await page.waitForSelector('.brand-card');
  assert.equal(await page.getByText('Espresso and fresh pastries', { exact: true }).count(), 1, 'Cancel must restore the saved snapshot');

  await page.getByRole('button', { name: /edit brand/i }).click();
  await page.locator('textarea[name="product"]').fill('Iced espresso');
  const saveResponse = page.waitForResponse((response) => (
    response.request().method() === 'PUT' && /\/agent\/context$/.test(response.url())
  ));
  await page.getByRole('button', { name: /save changes/i }).click();
  assert.equal((await saveResponse).ok(), true, 'Save Changes must receive a successful persisted-context response');
  await page.waitForSelector('.brand-card');
  assert.equal(await page.getByText('Iced espresso', { exact: true }).count(), 1, 'Save Changes must persist and render the edited value');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell');
  await page.locator('[data-tour="sidebar-settings"]').click();
  await page.getByRole('button', { name: /my brands|brand memory/i }).click();
  await page.waitForSelector('.brand-card');
  assert.equal(await page.getByText('Iced espresso', { exact: true }).count(), 1, 'Reloaded My Brands must render the persisted edited value');
});

await withRuntime({
  brandName: 'Saved Coffee',
  businessType: 'Coffee shop',
  product: 'Espresso',
  audience: 'Commuters',
  offer: 'Breakfast set',
  cta: 'Visit today',
  toneOfVoice: 'Warm',
}, async (page) => {
  await page.route('**/api/brand-scan/preview', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        metadata: {
          source: { label: 'Instagram', tone: 'instagram' },
          sourceStatus: 'instagram_web_profile',
          handle: '@car_finder_',
          title: '1,642 Followers, 55 Following, 322 Posts - See Instagram photos and videos',
          description: '',
          stats: { followers: '1,642', following: '55', posts: '322' },
        },
        capabilities: {},
      }),
    });
  });
  let brandBrainPuts = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && /\/agent\/context$/.test(request.url())) brandBrainPuts += 1;
  });
  await page.locator('[data-tour="sidebar-settings"]').click();
  await page.locator('.source-scan-form textarea').fill('https://www.instagram.com/car_finder_/');
  await page.getByRole('button', { name: /analyze/i }).click();
  await page.getByRole('button', { name: /open.*studio/i }).click();
  await page.getByRole('button', { name: /brand brain/i }).click();
  await page.waitForSelector('.brand-card');
  assert.equal(brandBrainPuts, 0, 'Sparse Brand Scan must not overwrite a completed Brand Brain');
  assert.equal(
    await page.getByText('Espresso', { exact: true }).count(),
    1,
    'Completed Brand Brain must remain unchanged until Settings accepts the transient suggestion',
  );
  assert.equal(
    await page.locator('[data-tour="sidebar-transcript"]').isDisabled(),
    false,
    'A completed workspace must remain unlocked after sparse Brand Scan handoff',
  );
});

await withRuntime({}, async (page) => {
  await expectVisible(page.getByRole('heading', { name: /target audience|цільова аудиторія/i }));
  await page.getByRole('alert').waitFor({ state: 'visible' });
  assert.equal(await page.locator('textarea[name="audience"]').evaluate((element) => document.activeElement === element), true, 'A resumed draft must rewind and focus the first missing required answer');
}, {
  draft: {
    currentStep: 4,
    answers: {
      profileDescription: 'Specialty coffee',
      audience: '',
      niche: 'Coffee shop',
      market: 'Kyiv',
      instagramUrl: '',
    },
  },
});

await withRuntime({}, async (page) => {
  let resolveFinalize;
  const delayedFinalize = new Promise((resolve) => { resolveFinalize = resolve; });
  await page.route('**/api/workspaces/ws_demo_ua/agent/context/finalize', async (route) => {
    await delayedFinalize;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        complete: true,
        brief: {
          schemaVersion: 2,
          answers: {
            profileDescription: 'Specialty coffee', audience: 'Commuters', niche: 'Coffee shop', market: 'Kyiv', instagramUrl: '',
          },
          recommendation: { signalId: 'reel_coffee_fixture' },
        },
        recommendation: { signalId: 'reel_coffee_fixture' },
      }),
    });
  });
  await page.getByLabel(/profile and product/i).fill('Specialty coffee');
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByLabel(/target audience/i).fill('Commuters');
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByLabel(/^niche$/i).fill('Coffee shop');
  await page.getByLabel(/^market$/i).fill('Kyiv');
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('button', { name: /skip instagram/i }).click();
  await page.locator('.user-account-trigger').click();
  await page.getByRole('button', { name: /secondary test workspace/i }).click();
  await expectVisible(page.getByRole('heading', { name: /describe your profile/i }));
  resolveFinalize();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-tour="sidebar-transcript"]').isDisabled(), true, 'A stale finalize must not unlock an incomplete workspace B');
  assert.equal(await page.getByRole('heading', { name: /describe your profile/i }).count(), 1, 'A stale finalize must keep workspace B on onboarding');
  assert.equal(await page.locator('.video-preview-modal').count(), 0, 'A stale recommendation must not open in workspace B');
}, {
  secondaryBrief: {},
});

console.log('My Brands onboarding and locked-card UI tests passed');
