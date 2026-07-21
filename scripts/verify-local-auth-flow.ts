/**
 * Проверка: backend login → /auth/me → доступ к ключевым API (без браузера).
 * Запуск: npx tsx scripts/verify-local-auth-flow.ts
 */
process.env.NEXT_PUBLIC_AUTH_MOCK = "false";
process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const EMAIL =
  process.env.BOOTSTRAP_ADMIN_EMAIL ||
  process.env.E2E_ADMIN_EMAIL ||
  "marislova34@gmail.com";
const PASSWORD =
  process.env.BOOTSTRAP_ADMIN_PASSWORD ||
  process.env.E2E_ADMIN_PASSWORD ||
  "1234";

const FRONT = process.env.FRONT_URL || "http://127.0.0.1:3000";

const UI_ROUTES = ["/", "/presentation", "/edit", "/presentation/finance", "/edit/finance", "/presentation/construction"];

async function main() {
  const { loginRequest, fetchAuthMe } = await import("../lib/auth");
  const { buildApiUrl, fetchAuthorizedApi } = await import("../lib/apiClient");

  console.log("API:", process.env.NEXT_PUBLIC_API_URL);
  console.log("Login as:", EMAIL);

  const snap = await loginRequest(EMAIL, PASSWORD);
  if (snap.role !== "admin" && snap.role !== "manager") {
    throw new Error(`Expected admin/manager, got ${snap.role}`);
  }
  console.log("login OK role=", snap.role, "sections=", snap.allowedSections.join(","));

  const fresh = await fetchAuthMe(snap.token);
  if (!fresh) throw new Error("/auth/me returned null — session invalid");
  console.log("auth/me OK role=", fresh.role);

  const gpr = await fetchAuthorizedApi(buildApiUrl("/gpr/tasks"), snap.token, { method: "GET" });
  if (!gpr.ok) throw new Error(`GET /gpr/tasks HTTP ${gpr.status}`);
  console.log("GET /gpr/tasks OK");

  for (const path of UI_ROUTES) {
    const res = await fetch(`${FRONT}${path}`, { redirect: "manual" });
    if (res.status >= 500) throw new Error(`${path} HTTP ${res.status}`);
    console.log(`GET ${path} → ${res.status}`);
  }

  console.log("\nverify-local-auth-flow: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
