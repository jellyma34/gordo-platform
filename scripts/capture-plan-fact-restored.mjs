import { chromium } from "playwright";
import path from "node:path";

async function capture(page, chartBlock, mode, file) {
  await chartBlock.locator("select").first().selectOption(mode);
  await page.waitForTimeout(4000);
  await chartBlock.scrollIntoViewIfNeeded();
  const box = await chartBlock.boundingBox();
  if (box) await page.screenshot({ path: path.join(process.cwd(), "screenshots", file), clip: box });
  console.log("saved", file);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto("http://localhost:3000/login");
  await page.fill('input[type="email"]', "dev@test.local");
  await page.fill('input[type="password"]', "dev");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.goto("http://localhost:3000/presentation/construction?section=gpr&partId=1");
  await page.waitForTimeout(8000);
  const chartBlock = page
    .getByRole("heading", { name: "Динамика выполнения ГПР" })
    .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
  await capture(page, chartBlock, "detailed", "plan-fact-restored-detailed.png");
  await capture(page, chartBlock, "simplified", "plan-fact-restored-simplified.png");
  await browser.close();
}

main();
