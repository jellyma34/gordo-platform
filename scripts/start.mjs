/**
 * Запуск production Next.js: слушает HOSTNAME (по умолчанию 0.0.0.0) и PORT (Railway).
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const port = process.env.PORT ?? "3000";
/** Railway / Docker: слушать все интерфейсы (healthcheck извне). */
const hostname = "0.0.0.0";
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");

const child = spawn(
  process.execPath,
  [nextBin, "start", "-H", hostname, "-p", port],
  { stdio: "inherit", cwd: root },
);

child.on("exit", (code) => process.exit(code ?? 0));
