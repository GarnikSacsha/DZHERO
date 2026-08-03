import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const PORT = 5187;
const BASE_URL = `http://${HOST}:${PORT}`;
const DB_PATH = path.join(ROOT, 'backend', 'data', 'db.json');

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function waitForUrl(url, processHandle, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = async () => {
      if (processHandle.exitCode !== null) {
        reject(new Error(`Vite exited before ${url} was ready`));
        return;
      }
      try {
        const response = await fetch(url);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // Vite is still starting.
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(check, 100);
    };
    void check();
  });
}

function startVite() {
  return spawn(process.execPath, [
    path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host', HOST,
    '--port', String(PORT),
    '--strictPort',
  ], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) return;
  processHandle.kill();
  await new Promise((resolve) => {
    processHandle.once('exit', resolve);
    setTimeout(resolve, 2_000);
  });
}

const dbBefore = sha256File(DB_PATH);
const vite = startVite();
const browser = await chromium.launch({ headless: true });
let providerCalls = [];
let backendNetworkCalls = [];

try {
  await waitForUrl(`${BASE_URL}/`, vite);
  const page = await browser.newPage();
  const runtimeErrors = [];

  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('request', (request) => {
    const requestUrl = new URL(request.url());
    const hostname = requestUrl.hostname;
    if (hostname === HOST && requestUrl.pathname.startsWith('/api/')) {
      backendNetworkCalls.push(request.url());
    }
    if (/(^|\.)api\.apify\.com$|(^|\.)generativelanguage\.googleapis\.com$|(^|\.)api\.openai\.com$/i.test(hostname)) {
      providerCalls.push(request.url());
    }
  });

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('insta-producer-language', 'en');
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const requestUrl = new URL(typeof input === 'string' ? input : input.url, window.location.href);
      if (requestUrl.pathname.startsWith('/api/')) {
        return Promise.resolve(new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      return originalFetch(input, init);
    };
  });

  await page.goto(`${BASE_URL}/?preview=product&tab=discover`, {
    waitUntil: 'networkidle',
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /^settings$/i }).click();
  await page.getByRole('button', { name: /^my brands$/i }).click();
  await page.getByRole('button', { name: /^create brand$/i }).first().click();

  const editor = page.locator('.settings-brand-brain-editor');
  const actionButton = editor.locator('button.primary');
  const backButton = editor.getByRole('button', { name: /^back$/i });
  const stepTitle = editor.locator('.settings-brand-onboarding-heading h3');
  const progress = editor.locator('.settings-brand-onboarding-progress i');
  const brandName = page.getByLabel(/^brand name$/i);
  const profile = page.locator('#settings-brand-profileDescription');
  const audience = page.locator('#settings-brand-audience');

  assert.equal(await actionButton.isDisabled(), true, 'Invalid empty step 1 must not continue');
  await brandName.fill('North Star Studio');
  await profile.fill('Short');
  assert.equal(await actionButton.isDisabled(), true, 'Invalid short profile must not continue');

  await profile.fill('AI tools and practical content for creators');
  assert.equal(await actionButton.isDisabled(), false, 'Valid step 1 must enable Continue');
  await actionButton.click();
  await expectStep(stepTitle, 'Who are you creating this for?');
  const progressSegmentCount = await progress.count();
  const nicheCount = await page.getByLabel(/^niche$/i).count();
  const marketCount = await page.getByLabel(/^market$/i).count();
  const instagramCount = await page.getByLabel(/instagram url/i).count();

  await audience.fill('x');
  assert.equal(await actionButton.isDisabled(), true, 'Invalid step 2 must not save');
  assert.equal(await page.locator('.settings-brand-list').count(), 0, 'Invalid step 2 must not create a brand');

  await audience.fill('Creators');
  assert.equal(await actionButton.isDisabled(), false, 'Valid step 2 must enable save');
  await actionButton.click();
  await page.waitForTimeout(100);
  if (await editor.count() > 0) {
    assert.fail(`Expected valid step 2 to save and close the wizard; actual current title: "${await stepTitle.innerText()}"`);
  }
  await page.locator('.settings-brand-list article').getByText('North Star Studio', { exact: true }).waitFor();
  assert.equal(await page.locator('.settings-brand-list article').count(), 1, 'Valid step 2 must create exactly one brand');
  assert.equal(progressSegmentCount, 2, 'The two-step wizard must render exactly two progress segments');
  assert.equal(nicheCount, 0, 'New wizard must not render niche');
  assert.equal(marketCount, 0, 'New wizard must not render market');
  assert.equal(instagramCount, 0, 'New wizard must not render Instagram');

  await page.getByRole('button', { name: /^edit brand$/i }).click();
  const editEditor = page.locator('.settings-brand-brain-editor');
  const editTitle = editEditor.locator('.settings-brand-onboarding-heading h3');
  const editBack = editEditor.getByRole('button', { name: /^back$/i });
  const editAction = editEditor.locator('button.primary');
  await editAction.click();
  await expectStep(editTitle, 'Who are you creating this for?');
  await editBack.click();
  await expectStep(editTitle, 'Tell us about your brand.');
  await editEditor.getByRole('button', { name: /close/i }).click();

  assert.deepEqual(runtimeErrors, [], 'Redesign must not emit runtime errors');
  assert.deepEqual(providerCalls, [], 'Focused regression must make zero provider calls');
  assert.deepEqual(backendNetworkCalls, [], 'Focused regression must make zero backend network calls');
  assert.equal(sha256File(DB_PATH), dbBefore, 'Focused regression must not modify backend/data/db.json');

  console.log('GREEN two-step regression passed on the real redesign wizard path.');
  console.log('provider calls: 0');
  console.log('backend network calls: 0');
  console.log('backend/data/db.json: unchanged');
} catch (error) {
  console.log(`RED assertion: ${error.message.split('\n')[0]}`);
  console.log(`provider calls: ${providerCalls.length}`);
  console.log(`backend/data/db.json: ${sha256File(DB_PATH) === dbBefore ? 'unchanged' : 'CHANGED'}`);
  throw error;
} finally {
  await browser.close();
  await stopProcess(vite);
}

async function expectStep(locator, title) {
  await locator.waitFor({ state: 'visible' });
  assert.equal(await locator.innerText(), title);
}
