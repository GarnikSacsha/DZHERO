const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || process.argv[2] || 'http://127.0.0.1:5180/';

async function completeDemoBrandBrain(page) {
  const answers = {
    profileDescription: 'DZHERO calendar smoke-test demo workspace.',
    audience: 'Small businesses and content teams reviewing the local demo.',
    niche: 'Content marketing',
    market: 'Ukraine and global',
  };
  const wizard = page.locator('.brand-wizard');
  await page.waitForFunction(() => {
    const navigation = document.querySelector('[data-tour="sidebar-calendar"]');
    return document.querySelector('.brand-wizard') || (navigation && !navigation.disabled);
  }, null, { timeout: 20000 });
  if (!await wizard.isVisible()) return;

  for (let step = 0; step < 4 && await wizard.isVisible(); step += 1) {
    for (const [name, value] of Object.entries(answers)) {
      const input = page.locator(`[name="${name}"]`);
      if (await input.isVisible()) await input.fill(value);
    }
    const skip = page.getByRole('button', { name: /skip instagram|пропустити instagram/i });
    if (await skip.isVisible()) {
      await skip.click();
    } else {
      await page.getByRole('button', { name: /continue|продовжити/i }).click();
    }
    await page.waitForTimeout(250);
  }

  await page.waitForFunction(() => {
    const navigation = document.querySelector('[data-tour="sidebar-calendar"]');
    return navigation && !navigation.disabled;
  }, null, { timeout: 20000 });
}

async function openDemo(page) {
  if (await page.locator('.shell').isVisible()) {
    await completeDemoBrandBrain(page);
    return;
  }
  const loginButton = page.getByRole('button', { name: /^(log in|увійти)$/i }).first();
  await loginButton.waitFor({ state: 'visible', timeout: 15000 });
  await loginButton.click();
  const demoButton = page.getByRole('button', {
    name: /explore the demo workspace|explore the demo first|переглянути демо-простір|спочатку переглянути демо/i,
  }).first();
  await demoButton.waitFor({ state: 'visible', timeout: 15000 });
  await demoButton.click();
  await page.waitForSelector('.shell', { timeout: 15000 });
  await completeDemoBrandBrain(page);
}

async function openContentPlan(page) {
  const navButton = page.getByRole('button', { name: /content plan|контент/i }).first();
  await navButton.click();
  await page.waitForSelector('.page-content-plan .gcal-shell', { timeout: 15000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  try {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await openDemo(page);
    await openContentPlan(page);

    const month = await page.evaluate(() => ({
      rendered: Boolean(document.querySelector('.gcal-month')),
      cells: document.querySelectorAll('.gcal-month .calendar-day').length,
      events: document.querySelectorAll('.gcal-month .gcal-event').length,
      bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
    }));

    await page.locator('.gcal-view-switcher button').nth(1).click();
    await page.waitForSelector('.gcal-week');
    const week = await page.evaluate(() => ({
      rendered: Boolean(document.querySelector('.gcal-week')),
      columns: document.querySelectorAll('.gcal-week-column').length,
      events: document.querySelectorAll('.gcal-week-event').length,
    }));

    await page.locator('.gcal-view-switcher button').nth(2).click();
    await page.waitForSelector('.gcal-schedule');
    const schedule = await page.evaluate(() => ({
      rendered: Boolean(document.querySelector('.gcal-schedule')),
      groups: document.querySelectorAll('.gcal-schedule > section').length,
      events: document.querySelectorAll('.gcal-schedule .gcal-event').length,
    }));

    const result = {
      month,
      week,
      schedule,
      validMonthGrid: month.cells === 42,
      validWeekGrid: week.columns === 7,
      allViewsRender: month.rendered && week.rendered && schedule.rendered,
      noPageOverflow: month.bodyOverflow <= 2,
    };

    if (
      !result.validMonthGrid
      || !result.validWeekGrid
      || !result.allViewsRender
      || !result.noPageOverflow
    ) {
      console.error(JSON.stringify(result, null, 2));
      throw new Error('Content calendar regression check failed');
    }

    if (process.env.SCREENSHOT_PATH) {
      await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
    }

    console.log(JSON.stringify({
      ok: true,
      message: 'Month, Week, and Schedule views render a stable responsive content calendar, including an empty workspace.',
      result,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
