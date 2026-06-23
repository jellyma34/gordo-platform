import { chromium } from "playwright";
import path from "node:path";

const outDir = path.join(process.cwd(), "screenshots");

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const audits = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("Строительство зданий") && text.includes("render audit")) {
      audits.push(text);
    }
  });

  await page.goto("http://localhost:3000/login");
  await page.fill('input[type="email"]', "dev@test.local");
  await page.fill('input[type="password"]', "dev");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.goto("http://localhost:3000/presentation/construction?section=gpr&partId=1");
  await page.waitForTimeout(6000);

  const chartBlock = page
    .getByRole("heading", { name: "Динамика выполнения ГПР" })
    .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
  const levelSelect = chartBlock.locator("select").first();
  await levelSelect.selectOption("simplified");
  await page.waitForTimeout(4000);

  const filename = process.argv[2] || "plan-fact-simplified-fixed.png";
  const box = await chartBlock.boundingBox();
  if (box) {
    await page.screenshot({ path: path.join(outDir, filename), clip: box });
    console.log("saved", filename);
  }
  console.log("audits", audits.slice(-2));
  await browser.close();
}

main();
