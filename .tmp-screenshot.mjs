const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:3007/presentation/construction', { waitUntil: 'networkidle', timeout: 120000 });
  const heading = page.locator('h3', { hasText: 'Динамика стоимости единицы ТМЦ' }).first();
  await heading.waitFor({ timeout: 30000 });
  await heading.scrollIntoViewIfNeeded();
  const block = heading.locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
  await block.screenshot({ path: 'tmc-cost-dynamics-block.png' });
  await browser.close();
  console.log('screenshot saved');
})().catch((e) => { console.error(e); process.exit(1); });
