/**
 * Валидация раздела «Строительство» после рефакторинга PostgreSQL.
 * Запуск: node scripts/validate-construction-ui.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.VALIDATE_BASE_URL || "http://localhost:3000";
const API = process.env.VALIDATE_API_URL || "http://localhost:8000";
const OUT_DIR = path.join(process.cwd(), "validation-screenshots");
const ADMIN_EMAIL = process.env.VALIDATE_ADMIN_EMAIL || "marislova34@gmail.com";
const ADMIN_PASSWORD = process.env.VALIDATE_ADMIN_PASSWORD || "1234";

fs.mkdirSync(OUT_DIR, { recursive: true });

const routes = [
  "/construction",
  "/edit/construction?section=gpr&partId=1",
  "/presentation/construction?section=gpr&partId=1",
  "/edit/construction?section=tenders&partId=1",
  "/edit/construction?section=tmc&partId=1",
];

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#email", { timeout: 60000 });
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });
}

async function testBulkApi(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const gprRes = await fetch(`${API}/gpr/tasks`, { headers });
  const tenderRes = await fetch(`${API}/tender`, { headers });
  const tmcRes = await fetch(`${API}/tmc`, { headers });
  return {
    gpr: gprRes.status,
    tender: tenderRes.status,
    tmc: tmcRes.status,
  };
}

async function main() {
  const pageErrors = [];
  const consoleErrors = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  console.log("→ Login");
  await login(page);
  await page.screenshot({ path: path.join(OUT_DIR, "00-after-login.png"), fullPage: true });

  let token = null;
  const authState = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem("gordo_auth");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.token ?? null;
    } catch {
      return null;
    }
  });
  token = authState;

  if (token) {
    const apiStatus = await testBulkApi(token);
    console.log("→ API status:", apiStatus);
    fs.writeFileSync(path.join(OUT_DIR, "api-status.json"), JSON.stringify(apiStatus, null, 2));
  }

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    console.log(`→ Open ${route}`);
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2000);
    const safeName = route.replace(/[?&=]/g, "_").replace(/\//g, "-").replace(/^-/, "");
    await page.screenshot({ path: path.join(OUT_DIR, `${String(i + 1).padStart(2, "0")}${safeName}.png`), fullPage: true });
  }

  await browser.close();

  const report = {
    ok: pageErrors.length === 0,
    pageErrors,
    consoleErrors: consoleErrors.filter((e) => !e.includes("favicon")),
    screenshotsDir: OUT_DIR,
  };
  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
