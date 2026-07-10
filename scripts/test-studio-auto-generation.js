const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5174/';

async function clickDemoIfNeeded(page) {
  if (await page.locator('.shell').count()) return;
  const demoButton = page.locator('button').filter({ hasText: /демо/i }).first();
  await demoButton.click();
  await page.waitForSelector('.shell', { timeout: 15000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let remixRequests = 0;

  try {
    await page.route('**/api/workspaces/*/remix/generate', async (route) => {
      remixRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          remixes: Array.from({ length: 3 }, (_, index) => ({
            title: `Тестова адаптація ${index + 1}`,
            hook: `Новий хук ${index + 1}`,
            visualFlow: [
              { timeframe: '0:00-0:03', actionDescription: 'Показати звичайну покупку крупним планом.', onScreenText: 'Зараз буде сюрприз', audioVoiceover: 'Дивись до кінця.' },
              { timeframe: '0:03-0:09', actionDescription: 'Клієнт запускає механіку випадкової винагороди.', onScreenText: 'Обирай', audioVoiceover: 'Один вибір без перегравань.' },
              { timeframe: '0:09-0:15', actionDescription: 'Показати бонус і справжню реакцію клієнта.', onScreenText: 'Що додати далі?', audioVoiceover: 'Напиши варіант у коментарях.' },
            ],
            cta: 'Запропонуй наступний бонус у коментарях.',
          })),
        }),
      });
    });

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await clickDemoIfNeeded(page);
    await page.locator('[data-tour="sidebar-transcript"]').click();
    await page.waitForSelector('.signal-adapt-button', { timeout: 15000 });
    await page.locator('.signal-adapt-button').first().click();

    await page.waitForSelector('.page-remix-studio .jeryk-loading', { timeout: 3000 });
    assert.equal(remixRequests, 1, 'Adapt must issue exactly one remix generation request');
    await page.waitForSelector('.studio-ai-note', { timeout: 5000 });
    assert.match(await page.locator('.remix-script-timeline').innerText(), /Тестова адаптація|Новий хук|сюрприз/i);

    console.log('studio auto-generation browser test passed');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
