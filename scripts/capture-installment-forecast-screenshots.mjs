/**
 * Скриншоты блока «Прогноз поступлений (рассрочки)» — помесячно и накопительно.
 * Запуск: node scripts/capture-installment-forecast-screenshots.mjs
 * Требует: dev-сервер на http://localhost:3000 и playwright (`npx playwright install chromium` один раз).
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "tmp", "installment-forecast-screenshots");

async function waitForChart(page) {
  await page.waitForSelector('[data-analytics-section="installment-forecast"] svg', {
    timeout: 120_000,
  });
  await page.waitForTimeout(800);
}

async function shot(page, name) {
  const el = page.locator('[data-analytics-section="installment-forecast"]');
  await el.screenshot({ path: path.join(OUT, name) });
  console.log("saved", name);
}

const PREVIEW = path.join(process.cwd(), "tmp", "installment-forecast-screenshots", "preview.html");
const USE_PREVIEW = !process.env.CAPTURE_LIVE_UI;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  if (USE_PREVIEW && fs.existsSync(PREVIEW)) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 420 } });
    const fileUrl = `file:///${PREVIEW.replace(/\\/g, "/")}`;
    await page.goto(fileUrl);
    await page.waitForTimeout(400);
    const svgs = page.locator("svg");
    await svgs.nth(0).screenshot({ path: path.join(OUT, "monthly.png") });
    await svgs.nth(1).screenshot({ path: path.join(OUT, "cumulative.png") });
    console.log("saved monthly.png, cumulative.png from preview.html");
    await browser.close();
    console.log("Done:", OUT);
    return;
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE}/marketing`, { waitUntil: "networkidle" });
  await waitForChart(page);
  await shot(page, "monthly.png");

  const cumulativeTab = page.locator('[aria-label="Режим графика прогноза"] button', { hasText: "Накопительно" });
  await cumulativeTab.click();
  await page.waitForTimeout(500);
  await shot(page, "cumulative.png");

  await browser.close();
  console.log("Done:", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
