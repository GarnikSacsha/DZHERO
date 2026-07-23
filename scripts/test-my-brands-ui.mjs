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
    await options.beforeLogin?.(page);
    if (options.skipLogin) {
      await page.addInitScript(() => {
        localStorage.setItem('insta-producer-language', 'en');
        localStorage.removeItem('dzhero-active-workspace');
        localStorage.removeItem('dzhero-sources-tab');
      });
      await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
    } else {
      await loginDemo(page, appUrl);
    }
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
  await page.waitForFunction(() => document.activeElement === document.querySelector('.page-signals'));
  assert.equal(await page.locator('.page-signals').evaluate((element) => document.activeElement === element), true, 'Closing the automatic preview must restore a meaningful Signals focus target');
});

let releaseDelayedRecommendationReels = false;
await withRuntime({
  schemaVersion: 2,
  answers: {
    profileDescription: 'Specialty coffee', audience: 'Commuters', niche: 'Coffee shop', market: 'Kyiv', instagramUrl: '',
  },
  recommendation: { signalId: 'reel_coffee_fixture' },
}, async (page) => {
  await page.locator('[data-tour="sidebar-settings"]').click();
  await page.getByRole('button', { name: /my brands|brand memory/i }).click();
  await page.getByRole('button', { name: /open recommended signal/i }).click();
  await page.waitForSelector('.page-signals');
  assert.equal(await page.locator('.video-preview-modal').count(), 0, 'A not-yet-loaded recommendation must not open a wrong preview');
  releaseDelayedRecommendationReels = true;
  await page.getByRole('button', { name: /refresh|оновити/i }).click();
  await page.locator('.video-preview-modal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.video-preview-modal').getByText('Breakfast coffee before the commute', { exact: true }).count(), 1, 'When reels arrive, the handoff must open only the exact matching signal');
  await page.keyboard.press('Escape');
  await page.locator('.video-preview-modal').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: /refresh|оновити/i }).click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.video-preview-modal').count(), 0, 'Later reel updates must not reopen a consumed recommendation handoff');
}, {
  beforeLogin: async (page) => {
    await page.route('**/api/workspaces/ws_demo_ua/reels', async (route) => {
      if (!releaseDelayedRecommendationReels) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ reels: [] }) });
        return;
      }
      await route.continue();
    });
  },
});

await withRuntime({
  schemaVersion: 2,
  answers: {
    profileDescription: 'Specialty coffee and fast breakfasts',
    audience: 'Busy Kyiv commuters',
    niche: 'Coffee shop',
    market: 'Kyiv, Ukraine',
    instagramUrl: 'https://instagram.com/northstar',
  },
  recommendation: { signalId: 'reel_coffee_fixture' },
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
    'A saved V2 brand must render as a locked card, not as inputs',
  );
  await expectVisible(page.getByText('Specialty coffee and fast breakfasts'));
  await expectVisible(page.getByText('Busy Kyiv commuters'));
  await expectVisible(page.getByText('Coffee shop'));
  await expectVisible(page.getByText('Kyiv, Ukraine'));
  assert.equal(await page.getByText(/offer|cta|tone of voice/i).count(), 0, 'Locked V2 cards must not expose derived legacy fields');
  assert.equal(await page.locator('.brand-facts-v2').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 2, 'The compact V2 facts card must render two computed columns on desktop');
  const editButton = page.getByRole('button', { name: /edit brand/i });
  assert.equal(await editButton.count(), 1, 'Saved brand card must expose one pencil edit action');
  await editButton.click();
  assert.equal(await page.locator('.brand-brain textarea').count(), 2, 'V2 editing exposes only the two authored long-answer fields');
  assert.equal(await page.locator('.brand-brain input').count(), 3, 'V2 editing exposes niche, market, and optional Instagram inputs');
  assert.equal(await page.getByLabel(/offer|cta|tone of voice/i).count(), 0, 'V2 editing must not expose derived legacy fields');
  assert.equal(await page.getByRole('button', { name: /save changes/i }).count(), 1);
  assert.equal(await page.getByRole('button', { name: /cancel/i }).count(), 1);
  const profileInput = page.locator('textarea[name="profileDescription"]');
  const audienceInput = page.locator('textarea[name="audience"]');
  await profileInput.fill('');
  await audienceInput.fill('');
  await page.getByRole('button', { name: /save changes/i }).click();
  await page.getByRole('alert').waitFor({ state: 'visible' });
  assert.equal(await profileInput.evaluate((element) => document.activeElement === element), true, 'A multi-field validation attempt must focus the first missing answer');
  await profileInput.type('Sp');
  assert.equal(await profileInput.evaluate((element) => document.activeElement === element), true, 'Typing into the first missing answer must not jump focus to the next missing field');
  assert.equal(await audienceInput.evaluate((element) => document.activeElement === element), false, 'The next missing field must not steal focus while the user is typing');
  await profileInput.fill('Unsaved latte');
  await page.getByRole('button', { name: /cancel/i }).click();
  await page.waitForSelector('.brand-card');
  assert.equal(await page.getByText('Specialty coffee and fast breakfasts', { exact: true }).count(), 1, 'Cancel must restore the saved snapshot');

  let settingsFinalizeRequests = 0;
  let blockInvalidInstagramFinalize = true;
  await page.route('**/api/workspaces/ws_demo_ua/agent/context/finalize', async (route) => {
    settingsFinalizeRequests += 1;
    if (blockInvalidInstagramFinalize) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_finalize_should_not_run' }) });
      return;
    }
    const submitted = route.request().postDataJSON();
    assert.equal(submitted.answers.market, 'Lviv, Ukraine');
    assert.equal(submitted.answers.instagramUrl, '');
    await route.continue();
  });
  await page.getByRole('button', { name: /edit brand/i }).click();
  await page.locator('input[name="instagramUrl"]').fill('instagram not a url');
  await page.getByRole('button', { name: /save changes/i }).click();
  await page.waitForTimeout(150);
  assert.equal(settingsFinalizeRequests, 0, 'An invalid non-empty Instagram value must block finalize');
  assert.equal(await page.locator('input[name="instagramUrl"]').evaluate((element) => document.activeElement === element), true, 'An invalid Instagram value must receive focus');
  await page.getByRole('button', { name: /cancel/i }).click();
  await page.waitForSelector('.brand-card');
  assert.equal(await page.getByRole('link', { name: 'https://instagram.com/northstar' }).count(), 1, 'An invalid Instagram attempt must not erase the saved URL');

  blockInvalidInstagramFinalize = false;
  await page.getByRole('button', { name: /edit brand/i }).click();
  await page.locator('input[name="instagramUrl"]').fill('');
  await page.locator('input[name="market"]').fill('Lviv, Ukraine');
  const saveResponse = page.waitForResponse((response) => (
    response.request().method() === 'POST' && /\/agent\/context\/finalize$/.test(response.url())
  ));
  await page.getByRole('button', { name: /save changes/i }).click();
  assert.equal((await saveResponse).ok(), true, 'Save Changes must receive a successful V2 finalize response');
  assert.equal(settingsFinalizeRequests, 1, 'Settings must finalize exactly once');
  await page.waitForSelector('.brand-card');
  assert.equal(await page.getByText('Lviv, Ukraine', { exact: true }).count(), 1, 'Save Changes must persist and render the edited market');
  assert.equal(await page.getByRole('button', { name: /my brands|brand memory/i }).count(), 1, 'Saving Settings must not navigate away');
  await page.getByRole('button', { name: /open recommended signal/i }).click();
  await page.locator('.video-preview-modal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.video-preview-modal').getByText('Breakfast coffee before the commute', { exact: true }).count(), 1, 'The returned recommendation must open its matching real signal');
  await page.keyboard.press('Escape');
  await page.locator('.video-preview-modal').waitFor({ state: 'hidden' });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.video-preview-modal').count(), 0, 'The one-shot recommendation handoff must not reopen the preview after close');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell');
  await page.locator('[data-tour="sidebar-settings"]').click();
  await page.getByRole('button', { name: /my brands|brand memory/i }).click();
  await page.waitForSelector('.brand-card');
  assert.equal(await page.getByText('Lviv, Ukraine', { exact: true }).count(), 1, 'Reloaded My Brands must render the persisted edited value');
});

await withRuntime({
  brandName: 'Legacy Coffee',
  businessType: 'Coffee shop',
  product: 'Espresso and fresh pastries',
  audience: 'Morning commuters',
  market: 'Legacy market',
  offer: 'Breakfast set',
  cta: 'Visit today',
  toneOfVoice: 'Warm',
}, async (page) => {
  await page.locator('[data-tour="sidebar-settings"]').click();
  await page.getByRole('button', { name: /my brands|brand memory/i }).click();
  await page.waitForSelector('.brand-card');
  await expectVisible(page.getByText('Espresso and fresh pastries', { exact: true }));
  await page.getByRole('button', { name: /edit brand/i }).click();
  assert.equal(await page.locator('.brand-brain textarea').count(), 2, 'Editing a legacy card must project it into the V2 authored-answer contract');
  assert.equal(await page.locator('input[name="market"]').inputValue(), 'Legacy market', 'Legacy upgrades must project brief.market before falling back to location');
  await page.getByRole('button', { name: /save changes/i }).click();
  await page.waitForSelector('.brand-card');
  assert.equal(await page.getByText(/offer|cta|tone of voice/i).count(), 0, 'A completed legacy edit must upgrade the card to the locked V2 authored fields');
});

await withRuntime({
  schemaVersion: 2,
  answers: {
    profileDescription: 'Specialty coffee and fast breakfasts',
    audience: 'Commuters',
    niche: 'Coffee shop',
    market: 'Kyiv',
    instagramUrl: '',
  },
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
  let draftPuts = 0;
  let finalizeRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && /\/agent\/context\/draft$/.test(request.url())) draftPuts += 1;
    if (request.method() === 'POST' && /\/agent\/context\/finalize$/.test(request.url())) finalizeRequests += 1;
  });
  await page.locator('[data-tour="sidebar-settings"]').click();
  await page.locator('.source-scan-form textarea').fill('https://www.instagram.com/car_finder_/');
  await page.getByRole('button', { name: /analyze/i }).click();
  await page.getByRole('button', { name: /open.*studio/i }).click();
  await page.getByRole('button', { name: /brand brain/i }).click();
  await expectVisible(page.getByRole('button', { name: /save changes/i }));
  assert.equal(draftPuts, 0, 'Sparse Brand Scan must not write a draft for a completed workspace');
  assert.equal(finalizeRequests, 0, 'Sparse Brand Scan must not finalize automatically');
  assert.equal(
    await page.getByLabel(/profile and product/i).inputValue(),
    'Specialty coffee and fast breakfasts',
    'Sparse Brand Scan must not replace a non-empty authored answer with an empty suggestion',
  );
  assert.match(
    await page.getByLabel(/instagram/i).inputValue(),
    /instagram\.com\/car_finder_/,
    'Sparse Brand Scan must copy its non-empty Instagram suggestion into the edit draft',
  );
  assert.equal(
    await page.locator('[data-tour="sidebar-transcript"]').isDisabled(),
    false,
    'A completed workspace must remain unlocked after sparse Brand Scan handoff',
  );
  await page.getByRole('button', { name: /cancel/i }).click();
  await page.waitForSelector('.brand-card');
  assert.equal(await page.getByText('Specialty coffee and fast breakfasts', { exact: true }).count(), 1, 'Cancel must restore the unchanged saved card after a sparse suggestion');
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
  let releaseDraft;
  let draftRequests = 0;
  let finalizeRequests = 0;
  let forbiddenMutationRequests = 0;
  const delayedDraft = new Promise((resolve) => { releaseDraft = resolve; });
  await page.route('**/api/workspaces/ws_demo_ua/agent/context/draft', async (route) => {
    draftRequests += 1;
    const body = route.request().postDataJSON();
    assert.equal(body.currentStep, 1, 'The Studio Brand Scan handoff must save a sparse step-one draft');
    assert.equal(body.answers.audience, '');
    assert.equal(body.answers.instagramUrl, 'https://www.instagram.com/car_finder_/');
    await delayedDraft;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        complete: false,
        draft: {
          currentStep: 2,
          answers: { profileDescription: 'Sparse scan profile', audience: '', niche: '', market: '', instagramUrl: '' },
        },
      }),
    });
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/agent\/context\/finalize$/.test(request.url())) finalizeRequests += 1;
    if (/\/remix\/generate$|\/content-plan$/.test(request.url()) && ['POST', 'PUT', 'PATCH'].includes(request.method())) forbiddenMutationRequests += 1;
  });
  await page.route('**/api/brand-scan/preview', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        metadata: {
          source: { label: 'Instagram', tone: 'instagram' },
          sourceStatus: 'instagram_web_profile',
          handle: '@car_finder_',
          url: 'https://www.instagram.com/car_finder_/',
          title: '1,642 Followers, 55 Following, 322 Posts - See Instagram photos and videos',
          description: '',
          stats: { followers: '1,642', following: '55', posts: '322' },
        },
        capabilities: {},
      }),
    });
  });
  await page.locator('.auth-scan-form textarea').fill('https://www.instagram.com/car_finder_/');
  await page.getByRole('button', { name: /build content plan/i }).click();
  await expectVisible(page.getByRole('button', { name: /view demo/i }));
  await page.getByRole('button', { name: /view demo/i }).click();
  await page.waitForSelector('.brand-studio-panel');
  await expectVisible(page.getByRole('button', { name: /save to brand brain/i }));
  const pendingStudio = page.locator('[data-pending-brand-scan-only]');
  assert.equal(await pendingStudio.count(), 1, 'Incomplete scans must use the restricted Studio handoff');
  assert.equal(await pendingStudio.getByRole('button').count(), 2, 'Restricted Studio handoff must expose only Back and Save actions');
  assert.equal(await pendingStudio.getByRole('button', { name: /generate|перегенерувати/i }).count(), 0, 'Pending incomplete scans must not expose Remix generation');
  assert.equal(await pendingStudio.getByRole('button', { name: /add to content plan|додати в контент-план/i }).count(), 0, 'Pending incomplete scans must not expose Content Plan mutation');
  await page.waitForTimeout(100);
  assert.equal(forbiddenMutationRequests, 0, 'Pending incomplete scans must not call Remix or Content Plan mutations');
  const firstDraftRequest = page.waitForRequest((request) => request.method() === 'PUT' && /\/agent\/context\/draft$/.test(request.url()));
  await page.getByRole('button', { name: /save to brand brain/i }).click();
  await firstDraftRequest;
  assert.equal(draftRequests, 1, 'An incomplete source scan must write exactly one draft through the Studio Save to Brand Brain path');
  assert.equal(finalizeRequests, 0, 'An incomplete source scan must never finalize');
  assert.equal(await page.locator('[data-tour="sidebar-transcript"]').isDisabled(), true, 'The incomplete Studio source scan must remain navigation-locked while its draft saves');
  await page.locator('.user-account-trigger').click();
  await page.getByRole('button', { name: /secondary test workspace/i }).click();
  await expectVisible(page.getByRole('heading', { name: /describe your profile/i }));
  releaseDraft();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('[data-tour="sidebar-transcript"]').isDisabled(), true, 'A stale incomplete draft response must keep workspace B locked');
  assert.equal(await page.getByRole('heading', { name: /describe your profile/i }).count(), 1, 'A stale incomplete draft response must not advance workspace B');
  assert.equal(finalizeRequests, 0, 'A stale incomplete draft response must still issue zero finalize requests');
}, {
  secondaryBrief: {},
  skipLogin: true,
});

await withRuntime({}, async (page) => {
  let draftRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && /\/agent\/context\/draft$/.test(request.url())) draftRequests += 1;
  });
  await page.route('**/api/brand-scan/preview', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        metadata: {
          source: { label: 'Instagram', tone: 'instagram' },
          sourceStatus: 'instagram_web_profile',
          handle: '@car_finder_',
          url: 'https://www.instagram.com/car_finder_/',
          title: '1,642 Followers, 55 Following, 322 Posts - See Instagram photos and videos',
          description: '',
          stats: { followers: '1,642', following: '55', posts: '322' },
        },
        capabilities: {},
      }),
    });
  });
  await page.locator('.auth-scan-form textarea').fill('https://www.instagram.com/car_finder_/');
  await page.getByRole('button', { name: /build content plan/i }).click();
  await page.getByRole('button', { name: /view demo/i }).click();
  await page.waitForSelector('.brand-studio-panel');
  await expectVisible(page.getByRole('button', { name: /save to brand brain/i }));
  await page.locator('.user-account-trigger').click();
  await page.getByRole('button', { name: /secondary test workspace/i }).click();
  await expectVisible(page.getByRole('heading', { name: /describe your profile/i }));
  assert.equal(await page.locator('.brand-studio-panel').count(), 0, 'A pending scan preview must disappear when switching workspaces before Save');
  assert.equal(await page.getByRole('button', { name: /save to brand brain/i }).count(), 0, 'Workspace B must not inherit workspace A pending scan actions');
  assert.equal(draftRequests, 0, 'Switching before Save must not write workspace A scan data into workspace B');
}, {
  secondaryBrief: {},
  skipLogin: true,
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
