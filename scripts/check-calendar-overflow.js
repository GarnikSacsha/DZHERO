const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || process.argv[2] || 'http://127.0.0.1:5180/';

async function openDemo(page) {
  if (await page.locator('.shell').count()) return;
  const demoButton = page.getByRole('button', { name: /demo|демо/i }).first();
  await demoButton.click();
  await page.waitForSelector('.shell', { timeout: 15000 });
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
      cells: document.querySelectorAll('.gcal-month .calendar-day').length,
      events: document.querySelectorAll('.gcal-month .gcal-event').length,
      bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
    }));

    await page.locator('.gcal-view-switcher button').nth(1).click();
    await page.waitForSelector('.gcal-week');
    const week = await page.evaluate(() => ({
      columns: document.querySelectorAll('.gcal-week-column').length,
      events: document.querySelectorAll('.gcal-week-event').length,
    }));

    await page.locator('.gcal-view-switcher button').nth(2).click();
    await page.waitForSelector('.gcal-schedule');
    const schedule = await page.evaluate(() => ({
      groups: document.querySelectorAll('.gcal-schedule > section').length,
      events: document.querySelectorAll('.gcal-schedule .gcal-event').length,
    }));

    const result = {
      month,
      week,
      schedule,
      validMonthGrid: month.cells === 42,
      validWeekGrid: week.columns === 7,
      allViewsContainEvents: month.events > 0 && week.events > 0 && schedule.events > 0,
      noPageOverflow: month.bodyOverflow <= 2,
    };

    if (
      !result.validMonthGrid
      || !result.validWeekGrid
      || !result.allViewsContainEvents
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
      message: 'Month, Week, and Schedule views render a stable responsive content calendar.',
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
