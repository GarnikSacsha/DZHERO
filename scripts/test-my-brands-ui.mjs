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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_WORKSPACE_ID = 'ws_demo_ua';

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
  ['product', 'offer', 'toneOfVoice'],
  'Missing required fields must follow the completion-contract order',
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

function createDatabase(tempDirectory, brief) {
  const source = JSON.parse(readFileSync(path.join(ROOT, 'backend', 'data', 'db.json'), 'utf8'));
  const workspace = source.workspaces.find((item) => item.id === DEMO_WORKSPACE_ID);
  const demoUser = source.users.find((item) => item.workspaceId === DEMO_WORKSPACE_ID);
  assert.ok(workspace, 'Demo workspace fixture is missing');
  assert.ok(demoUser, 'Demo user fixture is missing');
  workspace.brief = brief;
  demoUser.workspaceIds = [DEMO_WORKSPACE_ID, 'ws_test_secondary'];
  source.workspaces.push({
    id: 'ws_test_secondary',
    name: 'Secondary Test Workspace',
    handle: '@secondary_test',
    type: 'Test',
    brief: {
      businessType: 'Coffee shop',
      product: 'Espresso',
      audience: 'Commuters',
      offer: 'Breakfast set',
      cta: 'Visit today',
      toneOfVoice: 'Warm',
    },
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

async function withRuntime(brief, callback) {
  const backendPort = await freePort();
  const frontendPort = await freePort();
  const appUrl = `http://127.0.0.1:${frontendPort}/`;
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'dzhero-my-brands-'));
  const databasePath = createDatabase(tempDirectory, brief);
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
  await assert.doesNotReject(
    page.getByText(/start here once/i).first().waitFor({ state: 'visible', timeout: 5000 }),
    'First login must keep the one-time onboarding hint',
  );
  assert.equal(
    await page.locator('[data-tour="sidebar-transcript"]').isDisabled(),
    true,
    'Signals must stay locked until My Brands onboarding is saved',
  );
  assert.ok(
    await page.locator('.brand-brain textarea').count() > 0,
    'Empty My Brands must render onboarding inputs',
  );
  let incompleteSaveRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && /\/agent\/context$/.test(request.url())) incompleteSaveRequests += 1;
  });
  await page.getByRole('button', { name: /save memory/i }).click();
  await page.waitForTimeout(300);
  assert.equal(incompleteSaveRequests, 0, 'Incomplete Brand Brain saves must not reach persisted context');
  await assert.doesNotReject(
    page.getByRole('alert').waitFor({ state: 'visible', timeout: 5000 }),
    'Incomplete Brand Brain saves must show an accessible missing-fields error',
  );
  assert.equal(
    await page.getByRole('button', { name: /continue to signals/i }).isDisabled(),
    true,
    'An incomplete successful save must keep Continue to Signals locked',
  );
  await page.locator('.user-account-trigger').click();
  await page.getByRole('button', { name: /secondary test workspace/i }).click();
  await page.waitForFunction(() => {
    const signalsButton = document.querySelector('[data-tour="sidebar-transcript"]');
    return signalsButton instanceof HTMLButtonElement && !signalsButton.disabled;
  });
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
  await page.waitForSelector('.brand-brain textarea');
  assert.equal(brandBrainPuts, 0, 'Sparse Brand Scan must not persist Brand Brain through the Studio save action');
  assert.equal(
    await page.getByLabel(/brand name/i).inputValue(),
    '@car_finder_',
    'Sparse Brand Scan must keep the verified handle in the routed My Brands onboarding draft',
  );
  assert.equal(
    await page.locator('[data-tour="sidebar-transcript"]').isDisabled(),
    true,
    'Sparse Brand Scan must route to locked My Brands onboarding until manual completion',
  );
});

console.log('My Brands onboarding and locked-card UI tests passed');
