const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || process.argv[2] || 'http://127.0.0.1:5174/';

async function clickByText(page, text) {
  await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')]
      .find((node) => node.textContent.trim() === label || node.textContent.includes(label));
    if (!button) throw new Error(`Button not found: ${label}`);
    button.click();
  }, text);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  try {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    if (!await page.locator('.shell').count()) {
      await clickByText(page, 'Подивитись демо');
      await page.waitForSelector('.shell', { timeout: 15000 });
    }

    await clickByText(page, 'Контент-план');
    await page.waitForSelector('.page-content-plan .calendar-grid', { timeout: 15000 });

    const result = await page.evaluate(() => {
      const grid = document.querySelector('.page-content-plan .calendar-grid');
      const day = [...document.querySelectorAll('.page-content-plan .calendar-day')]
        .find((node) => node.querySelector('.calendar-posts'));
      if (!grid || !day) throw new Error('Calendar grid/day not found');

      const posts = day.querySelector('.calendar-posts');
      const before = {
        gridHeight: grid.getBoundingClientRect().height,
        dayHeight: day.getBoundingClientRect().height,
        postsClientHeight: posts.clientHeight,
      };

      posts.innerHTML = '';
      for (let index = 0; index < 5; index += 1) {
        const article = document.createElement('article');
        article.className = 'calendar-post';
        article.innerHTML = `
          <div class="calendar-post-meta"><label><input type="checkbox"></label><small>${10 + index}:00</small></div>
          <div class="calendar-post-format format-reels"><i></i><em>Short</em></div>
          <strong>AI generated content idea ${index + 1}: long title for overflow resilience</strong>
        `;
        posts.appendChild(article);
      }

      const after = {
        gridHeight: grid.getBoundingClientRect().height,
        dayHeight: day.getBoundingClientRect().height,
        postsClientHeight: posts.clientHeight,
        postsScrollHeight: posts.scrollHeight,
        postsOverflowY: getComputedStyle(posts).overflowY,
      };

      return {
        before,
        after,
        dayHeightStable: Math.abs(after.dayHeight - before.dayHeight) <= 1,
        internalScroll: after.postsScrollHeight > after.postsClientHeight && ['auto', 'scroll'].includes(after.postsOverflowY),
      };
    });

    if (!result.dayHeightStable || !result.internalScroll) {
      console.error(JSON.stringify(result, null, 2));
      throw new Error('Calendar overflow check failed');
    }

    console.log(JSON.stringify({
      ok: true,
      message: 'Calendar day keeps fixed height and uses internal scroll for 5 generated posts.',
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
