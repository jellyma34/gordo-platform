import { chromium } from "playwright";

const BASE = process.env.VALIDATE_BASE_URL || "http://localhost:3000";
const routes = [
  "/presentation/construction?section=tmc&partId=1",
  "/presentation/construction?section=tenders&partId=1",
  "/presentation/construction?section=gpr&partId=1",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const allErrors = [];

page.on("pageerror", (err) => {
  allErrors.push({ type: "pageerror", text: String(err), stack: err.stack });
});

page.on("console", (msg) => {
  if (msg.type() === "error") {
    allErrors.push({ type: "console", text: msg.text() });
  }
});

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#email", { timeout: 60000 });
await page.fill("#email", process.env.VALIDATE_ADMIN_EMAIL || "marislova34@gmail.com");
await page.fill("#password", process.env.VALIDATE_ADMIN_PASSWORD || "1234");
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });

for (const route of routes) {
  const before = allErrors.length;
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(4000);
  const routeErrors = allErrors.slice(before);
  console.log(`\n=== ${route} ===`);
  if (routeErrors.length === 0) {
    console.log("OK: no runtime errors");
  } else {
    for (const e of routeErrors) {
      console.log(e.type, e.text);
      if (e.stack) console.log(e.stack.split("\n").slice(0, 8).join("\n"));
    }
  }
}

await browser.close();

if (allErrors.some((e) => e.text.includes("reading 'call'"))) {
  process.exit(1);
}
