import { chromium } from "playwright";
import path from "node:path";

const baseUrl = "http://localhost:3000";
const outDir = path.join(process.cwd(), "screenshots");

async function captureMode(page, chartBlock, mode, filename) {
  const levelSelect = chartBlock.locator("select").first();
  if (await levelSelect.count()) {
    await levelSelect.selectOption(mode);
    await page.waitForTimeout(3500);
  }
  await chartBlock.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(outDir, filename),
    fullPage: false,
    clip: await chartBlock.boundingBox(),
  });
  console.log("saved", filename);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent("/presentation/construction?section=gpr&partId=1")}`, {
    waitUntil: "domcontentloaded",
  });
  await page.fill('input[type="email"], input[name="email"]', "dev@test.local");
  await page.fill('input[type="password"]', "dev");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.goto(`${baseUrl}/presentation/construction?section=gpr&partId=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(8000);

  const heading = page.getByRole("heading", { name: "Динамика выполнения ГПР" });
  await heading.waitFor({ timeout: 60000 });
  const chartBlock = heading.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");

  await captureMode(page, chartBlock, "detailed", "plan-fact-detailed-level2-only.png");
  await captureMode(page, chartBlock, "full", "plan-fact-full-monolith-floors.png");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
