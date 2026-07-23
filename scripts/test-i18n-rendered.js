const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { copyFileSync, mkdtempSync, rmSync } = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const CYRILLIC = /[А-Яа-яІіЇїЄєҐґ]/;

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
  child.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-8000); });
  child.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-8000); });
  child.getOutput = () => output;
  return child;
}

async function waitForUrl(url, processHandle, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Server exited before ${url} was ready:\n${processHandle.getOutput()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
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

async function unexpectedInterfaceCopy(page) {
  return page.evaluate(() => {
    const cyrillic = /[А-Яа-яІіЇїЄєҐґ]/;
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const issues = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      const value = node.nodeValue.trim();
      if (!parent || !value || !visible(parent) || parent.closest('[data-i18n-content]')) continue;
      if (cyrillic.test(value)) issues.push({ kind: 'text', value, tag: parent.tagName, className: parent.className });
    }
    for (const element of document.querySelectorAll('[placeholder], [title], [aria-label]')) {
      if (!visible(element) || element.closest('[data-i18n-content]')) continue;
      for (const attribute of ['placeholder', 'title', 'aria-label']) {
        const value = element.getAttribute(attribute) || '';
        if (cyrillic.test(value)) issues.push({ kind: attribute, value, tag: element.tagName, className: element.className });
      }
    }
    return issues;
  });
}

async function assertEnglishSurface(page, label) {
  await page.waitForTimeout(50);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en', `${label} has the wrong html lang`);
  const issues = await unexpectedInterfaceCopy(page);
  assert.deepEqual(issues, [], `${label} contains untranslated UI: ${JSON.stringify(issues, null, 2)}`);
}

async function runAudit(appUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.addInitScript(() => {
      localStorage.setItem('insta-producer-language', 'en');
      window.__initialEnglishCyrillic = [];
      const cyrillic = /[А-Яа-яІіЇїЄєҐґ]/;
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          const roots = record.type === 'characterData' ? [record.target] : [...record.addedNodes];
          for (const root of roots) {
            const textNodes = [];
            if (root.nodeType === Node.TEXT_NODE) {
              textNodes.push(root);
            } else {
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) textNodes.push(walker.currentNode);
            }
            for (const node of textNodes) {
              const value = node.textContent?.trim() || '';
              if (value && cyrillic.test(value) && !node.parentElement?.closest('script, style, [data-i18n-content]')) {
                window.__initialEnglishCyrillic.push(value);
              }
            }
          }
        }
      });
      observer.observe(document, { childList: true, characterData: true, subtree: true });
      window.__initialEnglishObserver = observer;
    });

    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
    if (!(await page.locator('.shell').count())) {
      await assertEnglishSurface(page, 'Authentication');
      await page.getByRole('button', { name: /view demo|start with demo/i }).first().click();
      await page.waitForSelector('.shell', { timeout: 15000 });
    }

    const initialCyrillic = await page.evaluate(() => {
      window.__initialEnglishObserver.disconnect();
      return [...new Set(window.__initialEnglishCyrillic)];
    });
    assert.deepEqual(initialCyrillic, [], `Initial English render flashed Cyrillic: ${initialCyrillic.join(' | ')}`);

    await assertEnglishSurface(page, 'Brand Brain');
    const signalsNavigation = page.locator('[data-tour="sidebar-transcript"]');
    if (await signalsNavigation.isDisabled()) {
      await page.getByLabel(/profile and product/i).fill('Coffee shop serving espresso');
      await page.getByRole('button', { name: /continue/i }).click();
      await page.getByLabel(/target audience/i).fill('Morning commuters');
      await page.getByRole('button', { name: /continue/i }).click();
      await page.getByLabel(/^niche$/i).fill('Coffee shop');
      await page.getByLabel(/^market$/i).fill('Kyiv, Ukraine');
      await page.getByRole('button', { name: /continue/i }).click();
      await page.getByRole('button', { name: /skip instagram/i }).click();
      await page.waitForFunction(() => {
        const button = document.querySelector('[data-tour="sidebar-transcript"]');
        return button instanceof HTMLButtonElement && !button.disabled;
      });
      await assertEnglishSurface(page, 'Completed My Brands onboarding');
    }
    for (const [selector, label] of [
      ['[data-tour="sidebar-transcript"]', 'Signals'],
      ['[data-tour="sidebar-remix"]', 'Studio'],
      ['[data-tour="sidebar-calendar"]', 'Content plan'],
      ['[data-tour="sidebar-settings"]', 'Settings'],
    ]) {
      await page.locator(selector).click();
      await assertEnglishSurface(page, label);
    }

    const settingsTabs = page.locator('.page > .tabs button');
    const settingsTabCount = await settingsTabs.count();
    assert.ok(settingsTabCount >= 3, 'Settings tabs are not reachable by the rendered audit');
    assert.equal(await page.locator('[data-tour="sidebar-home"]').count(), 0, 'My Brands must not be a permanent sidebar destination');
    assert.equal(await page.getByRole('button', { name: /my brands/i }).count(), 1, 'Settings must expose the My Brands tab');
    for (let index = 0; index < settingsTabCount; index += 1) {
      await settingsTabs.nth(index).click();
      await assertEnglishSurface(page, `Settings tab ${index + 1}`);
    }

    const assistantButton = page.locator('.jeryk-idle-card').first();
    assert.equal(await assistantButton.count(), 1, 'Assistant entry point is not reachable by the rendered audit');
    await assistantButton.click();
    await assertEnglishSurface(page, 'Assistant');
    await page.locator('.jeryk-backdrop').click();

    await page.locator('.language-switch button', { hasText: 'UK' }).first().click();
    await page.waitForTimeout(50);
    assert.equal(await page.locator('html').getAttribute('lang'), 'uk');
    assert.equal(await page.locator('[data-tour="sidebar-home"]').count(), 0, 'My Brands must remain outside the sidebar after a language switch');
    await page.evaluate(() => {
      window.__englishSwitchCyrillic = [];
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          const roots = record.type === 'characterData' ? [record.target] : [...record.addedNodes];
          for (const root of roots) {
            const textNodes = [];
            if (root.nodeType === Node.TEXT_NODE) {
              textNodes.push(root);
            } else {
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) textNodes.push(walker.currentNode);
            }
            for (const node of textNodes) {
              const text = node.textContent?.trim() || '';
              if (/[А-Яа-яІіЇїЄєҐґ]/.test(text) && !node.parentElement?.closest('[data-i18n-content]')) {
                window.__englishSwitchCyrillic.push(text);
              }
            }
          }
        }
      });
      observer.observe(document.getElementById('root'), { childList: true, characterData: true, subtree: true });
      window.__englishSwitchObserver = observer;
    });
    await page.locator('.language-switch button', { hasText: 'EN' }).first().click();
    await page.waitForTimeout(300);
    const switchedCyrillic = await page.evaluate(() => {
      window.__englishSwitchObserver.disconnect();
      return window.__englishSwitchCyrillic;
    });
    assert.deepEqual(switchedCyrillic, [], `English switch rendered transient Cyrillic: ${switchedCyrillic.join(' | ')}`);
    await assertEnglishSurface(page, 'English language switch');

    for (const [route, label] of [
      ['privacy', 'Privacy page'],
      ['terms', 'Terms page'],
      ['data-deletion', 'Data deletion page'],
    ]) {
      await page.goto(new URL(route, appUrl).href, { waitUntil: 'domcontentloaded' });
      await assertEnglishSurface(page, label);
    }

    console.log('rendered i18n audit passed');
  } finally {
    await browser.close();
  }
}

async function main() {
  if (process.env.APP_URL) {
    await runAudit(process.env.APP_URL);
    return;
  }

  const backendPort = await freePort();
  const frontendPort = await freePort();
  const appUrl = `http://127.0.0.1:${frontendPort}/`;
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'dzhero-i18n-'));
  const tempDatabase = path.join(tempDirectory, 'db.json');
  copyFileSync(path.join(ROOT, 'backend', 'data', 'db.json'), tempDatabase);

  const backend = startNode(['backend/server.js'], {
    PORT: String(backendPort),
    CLIENT_URL: appUrl.slice(0, -1),
    DB_PATH: tempDatabase,
    DATABASE_URL: '',
    AUTOMATIC_DISCOVERY_ENABLED: 'false',
  });
  let frontend;
  try {
    await waitForUrl(`http://127.0.0.1:${backendPort}/api/health`, backend);
    frontend = startNode(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(frontendPort)], {
      VITE_API_URL: `http://127.0.0.1:${backendPort}/api`,
    });
    await waitForUrl(appUrl, frontend);
    await runAudit(appUrl);
  } finally {
    await stopProcess(frontend);
    await stopProcess(backend);
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
