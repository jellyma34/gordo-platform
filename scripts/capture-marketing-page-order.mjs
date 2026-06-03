/**
 * Скриншот страницы маркетинга (презентация) + список заголовков блоков.
 * Запуск: node scripts/capture-marketing-page-order.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "tmp", "marketing-page-order.png");

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.goto(`${BASE}/presentation/marketing/sales-plan`, { waitUntil: "networkidle", timeout: 120_000 });

  const loginBtn = page.locator('button:has-text("Войти")');
  if (await loginBtn.count()) {
    await page.locator('input[type="email"], input[name="email"]').first().fill("dev@test.local");
    await page.locator('input[type="password"]').first().fill("dev");
    await loginBtn.click();
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/presentation/marketing/sales-plan`, { waitUntil: "networkidle", timeout: 120_000 });
  }

  await page.waitForTimeout(2500);

  const titles = await page.evaluate(() =>
    Array.from(document.querySelectorAll("h2, h3"))
      .map((el) => el.textContent?.trim())
      .filter(Boolean)
      .filter((t) => t.length < 120),
  );

  console.log("=== BLOCK TITLES (top to bottom) ===");
  titles.forEach((t, i) => console.log(`${i + 1}. ${t}`));

  await page.screenshot({ path: OUT, fullPage: true });
  console.log("\nScreenshot:", OUT);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
