import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

const appUrl = argumentValue('--url') || process.env.UI_AUDIT_URL || 'http://127.0.0.1:5180/';
const outputDir = argumentValue('--output') || process.env.UI_AUDIT_DIR || path.resolve('ui-audit-artifacts');
const runLiveAgentStudio = process.argv.includes('--live') || process.env.UI_AUDIT_LIVE_AGENT === '1';
const resumeRunId = argumentValue('--resume') || process.env.UI_AUDIT_RESUME_RUN_ID || '';
const auditTheme = argumentValue('--theme') || process.env.UI_AUDIT_THEME || 'light';
const viewportFilter = argumentValue('--viewport') || process.env.UI_AUDIT_VIEWPORT || '';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'laptop', width: 1180, height: 780 },
  { name: 'mobile', width: 390, height: 844 },
].filter((viewport) => !viewportFilter || viewport.name === viewportFilter);

const pages = [
  ['home', 'sidebar-home'],
  ['signals', 'sidebar-transcript'],
  ['studio', 'sidebar-remix'],
  ['agent-studio', 'sidebar-agent-studio'],
  ['content-plan', 'sidebar-calendar'],
  ['settings', 'sidebar-settings'],
];

function safeName(value) {
  return value.replaceAll(/[^a-z0-9_-]+/gi, '-').replaceAll(/^-|-$/g, '');
}

async function isVisible(locator) {
  return locator.count().then((count) => count > 0 && locator.first().isVisible()).catch(() => false);
}

async function enterAgentStudioDemo(page) {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  if (await isVisible(page.locator('.shell'))) return;
  const dedicatedDemo = page.getByRole('button', { name: /open agent studio demo/i });
  if (await isVisible(dedicatedDemo)) {
    await dedicatedDemo.click();
  } else {
    await page.getByRole('button', { name: /view demo|start with demo/i }).first().click();
  }
  await page.waitForSelector('.shell', { timeout: 20000 });
}

async function openMobileMenu(page) {
  const trigger = page.locator('.mobile-menu-trigger');
  if (await isVisible(trigger)) {
    await trigger.click();
    await page.waitForTimeout(120);
  }
}

async function navigate(page, tourTarget) {
  let nav = page.locator(`[data-tour="${tourTarget}"]`);
  if (!(await isVisible(nav))) {
    await openMobileMenu(page);
    nav = page.locator(`[data-tour="${tourTarget}"]`);
  }
  await nav.click();
  await page.waitForTimeout(220);
}

async function auditLayout(page, viewportName, pageName, report) {
  const findings = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0
        && element.getClientRects().length > 0;
    };
    const selector = (element) => {
      if (element.id) return `#${element.id}`;
      const classes = [...element.classList].slice(0, 3).join('.');
      return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
    };
    const insideHorizontalScroller = (element) => {
      let current = element.parentElement;
      while (current && current !== document.body) {
        const style = getComputedStyle(current);
        if (['auto', 'scroll'].includes(style.overflowX)) return true;
        current = current.parentElement;
      }
      return false;
    };
    const horizontalOverflow = [];
    const clippedText = [];
    const smallControls = [];
    for (const element of document.querySelectorAll('body *')) {
      if (!visible(element)) continue;
      const rect = element.getBoundingClientRect();
      if (
        (rect.right > window.innerWidth + 2 || (rect.left < -2 && rect.right > 0))
        && !insideHorizontalScroller(element)
      ) {
        horizontalOverflow.push({
          selector: selector(element),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          text: element.textContent?.trim().replaceAll(/\s+/g, ' ').slice(0, 90) || '',
        });
      }
      const style = getComputedStyle(element);
      const text = element.textContent?.trim().replaceAll(/\s+/g, ' ') || '';
      const clips = text
        && element.children.length === 0
        && element.scrollWidth > element.clientWidth + 2
        && ['hidden', 'clip'].includes(style.overflowX)
        && !element.getAttribute('title');
      if (clips) {
        clippedText.push({
          selector: selector(element),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          text: text.slice(0, 100),
        });
      }
      if (element.matches('button, a, input[type="checkbox"], input[type="radio"]')) {
        const hasAccessibleName = element.getAttribute('aria-label') || element.getAttribute('title') || text;
        if (hasAccessibleName && (rect.width < 36 || rect.height < 36)) {
          smallControls.push({
            selector: selector(element),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            text: String(hasAccessibleName).slice(0, 80),
          });
        }
      }
    }
    return {
      bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
      horizontalOverflow: horizontalOverflow.slice(0, 25),
      clippedText: clippedText.slice(0, 25),
      smallControls: smallControls.slice(0, 30),
    };
  });
  report.layout.push({ viewport: viewportName, page: pageName, ...findings });
}

async function screenshot(page, viewportName, pageName) {
  await page.screenshot({
    path: path.join(outputDir, `${safeName(viewportName)}-${safeName(pageName)}.png`),
    fullPage: true,
  });
}

async function interactWithPage(page, pageName, viewportName, report) {
  if (pageName === 'signals') {
    const tabs = page.locator('.signal-source-tabs button');
    if (await tabs.count() > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(150);
      await tabs.first().click();
    }
    const preview = page.locator('[aria-label*="preview" i], [aria-label*="прев" i]').first();
    if (await isVisible(preview)) {
      await preview.click();
      await page.waitForTimeout(180);
      await screenshot(page, viewportName, `${pageName}-preview`);
      const close = page.locator('.video-preview-close');
      if (await isVisible(close)) await close.click();
    }
  }

  if (pageName === 'agent-studio') {
    if (resumeRunId && viewportName === 'desktop') {
      await page.waitForSelector('.agent-studio-run-layout', { timeout: 10000 }).catch(() => {});
    }
    const hasExistingRun = await isVisible(page.locator('.agent-studio-run-layout'));
    if (!hasExistingRun) {
      const adapt = page.getByRole('button', { name: /adapt a reel/i });
      if (await isVisible(adapt)) await adapt.click();
      const objective = page.locator('.agent-studio-field textarea').first();
      if (await isVisible(objective)) {
        await objective.fill('Bring more weekday morning visits to a neighborhood coffee shop with a low-budget Reel anyone can shoot.');
      }
      const signal = page.locator('.agent-studio-source-grid select');
      if (await isVisible(signal) && await signal.locator('option').count() > 1) {
        await signal.selectOption({ index: 1 });
      } else {
        const sourceUrl = page.locator('.agent-studio-source-grid input[type="url"]');
        if (await isVisible(sourceUrl)) {
          await sourceUrl.fill(process.env.UI_AUDIT_SOURCE_URL || 'https://www.instagram.com/p/DaiZ2p-J0qG/');
        }
      }
    }
    if (runLiveAgentStudio && viewportName === 'desktop') {
      if (!hasExistingRun) {
        const start = page.getByRole('button', { name: /start agent team/i });
        if (!await isVisible(start)) return;
        await start.click();
        await page.waitForSelector('.agent-studio-run-layout', { timeout: 20000 });
      }
      await page.waitForFunction(() => {
        const status = document.querySelector('.agent-studio-run-status strong')?.textContent?.trim().toLowerCase();
        return ['awaiting approval', 'completed', 'failed', 'cancelled', 'needs context'].includes(status || '');
      }, null, { timeout: 12 * 60 * 1000 });
      report.liveAgentStatus = await page.locator('.agent-studio-run-status strong').innerText();
      await screenshot(page, viewportName, `${pageName}-live-result`);
      if (report.liveAgentStatus.trim().toLowerCase() === 'awaiting approval') {
        const hybridExists = await page.locator('.agent-studio-candidate-top small')
          .filter({ hasText: /hybrid production script/i })
          .count();
        if (!hybridExists) {
          const combine = page.getByRole('button', { name: /combine two directions/i });
          if (await isVisible(combine)) {
            await combine.click();
            const candidates = page.locator('.agent-studio-candidate');
            if (await candidates.count() >= 2) {
              await candidates.nth(0).click();
              await candidates.nth(1).click();
              const createHybrid = page.getByRole('button', { name: /create hybrid from selected ideas/i });
              await createHybrid.click();
              await page.waitForFunction(() => {
                const status = document.querySelector('.agent-studio-run-status strong')?.textContent?.trim().toLowerCase();
                const hybrid = [...document.querySelectorAll('.agent-studio-candidate-top small')]
                  .some((element) => /hybrid production script/i.test(element.textContent || ''));
                return status === 'awaiting approval' && hybrid;
              }, null, { timeout: 12 * 60 * 1000 });
              await screenshot(page, viewportName, `${pageName}-live-hybrid`);
            }
          }
        }
        const approve = page.getByRole('button', { name: /approve and add 7 days to content plan/i });
        if (await isVisible(approve)) {
          const approvalResponsePromise = page.waitForResponse((response) => (
            response.request().method() === 'POST'
            && response.url().includes(`/agent-studio/runs/${resumeRunId || ''}`)
            && response.url().endsWith('/approve')
          ), { timeout: 15000 });
          await approve.click();
          const approvalResponse = await approvalResponsePromise;
          const approvalBody = await approvalResponse.json().catch(() => ({}));
          report.approvalResponse = {
            status: approvalResponse.status(),
            body: approvalBody,
          };
          if (!approvalResponse.ok()) {
            await screenshot(page, viewportName, `${pageName}-live-approval-error`);
            throw new Error(`Agent Studio approval failed with HTTP ${approvalResponse.status()}: ${JSON.stringify(approvalBody)}`);
          }
          await page.waitForFunction(() => (
            document.querySelector('.agent-studio-run-status strong')?.textContent?.trim().toLowerCase() === 'completed'
          ), null, { timeout: 30000 });
          report.liveAgentStatus = 'completed';
          await screenshot(page, viewportName, `${pageName}-live-approved`);
          const openPlan = page.getByRole('button', { name: /open content plan/i });
          if (await isVisible(openPlan)) {
            await openPlan.click();
            await page.waitForSelector('.page-content-plan', { timeout: 15000 });
            await screenshot(page, viewportName, `${pageName}-live-content-plan`);
          }
        }
      }
    }
  }

  if (pageName === 'content-plan') {
    const day = page.locator('.calendar-day').filter({ has: page.locator('.calendar-post') }).first();
    const target = await isVisible(day) ? day.locator('.calendar-post').first() : page.locator('.calendar-day').first();
    if (await isVisible(target)) {
      await target.click();
      await page.waitForTimeout(180);
      if (await isVisible(page.locator('.calendar-post-modal'))) {
        await screenshot(page, viewportName, `${pageName}-modal`);
        await page.locator('.calendar-post-modal-head button').click();
      }
    }
    const notesToggle = page.locator('.content-notes-toggle');
    if (await isVisible(notesToggle)) {
      await notesToggle.click();
      await notesToggle.click();
    }
  }

  if (pageName === 'settings') {
    const tabs = page.locator('.page > .tabs button');
    for (let index = 0; index < await tabs.count(); index += 1) {
      await tabs.nth(index).click();
      await page.waitForTimeout(80);
    }
  }
}

async function runViewport(browser, viewport, report) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push({ viewport: viewport.name, text: message.text() });
  });
  page.on('pageerror', (error) => report.pageErrors.push({ viewport: viewport.name, text: error.message }));
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    if (failure?.errorText !== 'net::ERR_ABORTED') {
      report.requestFailures.push({ viewport: viewport.name, url: request.url(), error: failure?.errorText || 'unknown' });
    }
  });
  await page.addInitScript(({ theme, runId }) => {
    localStorage.setItem('insta-producer-language', 'en');
    localStorage.setItem('insta-producer-theme-mode-v1', theme);
    if (runId) {
      localStorage.setItem('dzhero-agent-studio-run:ws_demo_agent_studio_coffee', runId);
    }
  }, { theme: auditTheme, runId: resumeRunId });

  try {
    await enterAgentStudioDemo(page);
    for (const [pageName, tourTarget] of pages) {
      await navigate(page, tourTarget);
      await interactWithPage(page, pageName, viewport.name, report);
      await auditLayout(page, viewport.name, pageName, report);
      await screenshot(page, viewport.name, pageName);
    }

    const assistant = page.locator('.jeryk-idle-card');
    if (await isVisible(assistant)) {
      await assistant.click();
      await page.waitForTimeout(160);
      await screenshot(page, viewport.name, 'assistant-open');
      await auditLayout(page, viewport.name, 'assistant-open', report);
      const close = page.locator('.jeryk-drawer button[aria-label*="close" i], .jeryk-drawer button[aria-label*="закр" i]').first();
      if (await isVisible(close)) {
        await close.click();
      } else {
        await page.keyboard.press('Escape');
      }
    }
  } finally {
    await context.close();
  }
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = {
  appUrl,
  outputDir,
  theme: auditTheme,
  resumedRunId: resumeRunId || null,
  liveAgentStatus: null,
  approvalResponse: null,
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
  layout: [],
};

try {
  for (const viewport of viewports) {
    await runViewport(browser, viewport, report);
  }
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
if (process.env.UI_AUDIT_VERBOSE === '1') {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(JSON.stringify({
    outputDir,
    liveAgentStatus: report.liveAgentStatus,
    consoleErrors: report.consoleErrors.length,
    pageErrors: report.pageErrors.length,
    requestFailures: report.requestFailures.length,
    layouts: report.layout.map((item) => ({
      viewport: item.viewport,
      page: item.page,
      bodyOverflow: item.bodyOverflow,
      overflow: item.horizontalOverflow.length,
      clipped: item.clippedText.length,
      smallControls: item.smallControls.length,
    })),
  }, null, 2));
}
