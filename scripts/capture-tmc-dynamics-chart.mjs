import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { dirname } from "path";

const out = "docs/screenshots/tmc-gpr-impact-chart.png";
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

try {
  await page.addInitScript(() => {
    window.localStorage.setItem("gordo:mode", "presentation");
    window.localStorage.setItem("gordo_token", "mock-dev-token");
    window.localStorage.setItem("gordo_role", "manager");
    window.localStorage.setItem(
      "gordo_allowed_sections",
      JSON.stringify(["gpr", "tenders", "materials", "marketing"]),
    );
    window.localStorage.setItem("gordo_user_label", "screenshot@test.local");
  });

  await page.goto("http://localhost:3000/presentation/construction?section=tmc&partId=1", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForTimeout(12000);

  const block = page
    .locator('[data-pdf-section-title="Влияние дефицита ТМЦ на выполнение ГПР"]')
    .first();
  await block.waitFor({ state: "visible", timeout: 60000 });
  await block.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
  await block.screenshot({ path: out });
  console.log("saved", out);
} finally {
  await browser.close();
}
