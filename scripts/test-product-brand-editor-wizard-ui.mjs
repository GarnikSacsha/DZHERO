import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
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
  const processHandle = spawn(process.execPath, [
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
  return processHandle;
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

try {
  await waitForUrl(`${BASE_URL}/`, vite);
  const page = await browser.newPage();
  const runtimeErrors = [];

  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('request', (request) => {
    const url = request.url();
    const hostname = new URL(url).hostname;
    if (/(^|\.)api\.apify\.com$|(^|\.)generativelanguage\.googleapis\.com$|(^|\.)api\.openai\.com$/i.test(hostname)) {
      providerCalls.push(url);
    }
  });

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('insta-producer-language', 'en');
  });
  await page.route('**/api/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto(`${BASE_URL}/?preview=product&tab=discover`, {
    waitUntil: 'networkidle',
    timeout: 30_000,
  });
  await page.getByRole('button', { name: /^settings$/i }).click();
  await page.getByRole('button', { name: /^my brands$/i }).click();
  await page.getByRole('button', { name: /^create brand$/i }).first().click();

  const editor = page.locator('.settings-brand-brain-editor');
  const continueButton = editor.getByRole('button', { name: /^continue$/i });
  const backButton = editor.getByRole('button', { name: /^back$/i });
  const stepTitle = editor.locator('.settings-brand-onboarding-heading h3');
  const brandName = page.getByLabel(/^brand name$/i);
  const profile = page.locator('#settings-brand-profileDescription');
  const audience = page.locator('#settings-brand-audience');

  assert.equal(await continueButton.isDisabled(), true, 'Invalid empty step 1 must not continue');
  await brandName.fill('North Star Studio');
  await profile.fill('Short');
  assert.equal(await continueButton.isDisabled(), true, 'Invalid short profile must not continue');

  await profile.fill('AI tools and practical content for creators');
  assert.equal(await continueButton.isDisabled(), false, 'Valid step 1 must enable Continue');
  await continueButton.click();
  await expectStep(stepTitle, 'Who are you creating this for?');

  await audience.fill('Creators');
  assert.equal(await continueButton.isDisabled(), false, 'Valid step 2 must enable Continue');
  await continueButton.click();
  await expectStep(stepTitle, 'Set the niche and market');

  const niche = page.getByLabel(/^niche$/i);
  const market = page.getByLabel(/^market$/i);
  await niche.fill('AI creator tools');
  await market.fill('Ukraine');
  assert.equal(await continueButton.isDisabled(), false, 'Valid step 3 must enable Continue');
  await continueButton.click();
  await expectStep(stepTitle, 'Add Instagram');

  assert.equal(await backButton.count(), 1, 'Step 4 must expose Back');
  await backButton.click();
  await expectStep(stepTitle, 'Set the niche and market');

  await continueButton.click();
  await expectStep(stepTitle, 'Add Instagram');
  const instagram = page.getByLabel(/instagram url/i);
  await instagram.fill('not-a-url');
  const finishButton = editor.locator('button.primary');
  assert.equal(await finishButton.isDisabled(), true, 'Invalid Instagram must not allow saving');
  assert.equal(await page.locator('.settings-brand-list').count(), 0, 'Invalid step 4 must not create a brand');

  await instagram.fill('');
  assert.equal(await finishButton.isDisabled(), false, 'Valid optional step 4 must enable saving');
  await finishButton.click();
  await page.locator('.settings-brand-list article').getByText('North Star Studio', { exact: true }).waitFor();
  assert.equal(await page.locator('.settings-brand-brain-editor').count(), 0, 'One valid save click must close the editor');
  assert.equal(await page.locator('.settings-brand-list article').count(), 1, 'One valid save click must create exactly one brand');

  assert.deepEqual(runtimeErrors, [], 'Redesign must not emit runtime errors');
  assert.deepEqual(providerCalls, [], 'Focused UI regression must make zero provider calls');

  const dbAfter = sha256File(DB_PATH);
  assert.equal(dbAfter, dbBefore, 'Focused UI regression must not modify backend/data/db.json');
  console.log('GREEN regression passed on the real redesign wizard path.');
  console.log('provider calls: 0');
  console.log('backend/data/db.json: unchanged');
} catch (error) {
  console.log(`RED assertion: ${error.message.split('\n')[0]}`);
  console.log(`provider calls: ${providerCalls.length}`);
  if (providerCalls.length > 0) console.log(`provider URLs: ${providerCalls.join(', ')}`);
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
