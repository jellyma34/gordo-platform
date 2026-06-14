/**
 * Удаляет `.next` (кэш сборки Next.js). Устраняет 500 / «Cannot find module './611.js'»
 * при рассинхроне чанков после прерванной сборки или параллельных процессов.
 * Запуск сразу с dev: `npm run dev:clean` (очистка + `next dev` без Turbopack).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const nextDir = path.join(root, ".next");

if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log("Removed:", nextDir);
} else {
  console.log("No folder to remove:", nextDir);
}
