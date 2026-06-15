/**
 * Удаляет `.next` (кэш сборки Next.js).
 *
 * Обязательно перед каждым dev-запуском и после `npm run build`, если снова нужен dev.
 * См. `.cursor/rules/nextjs-dev-workflow.mdc`.
 *
 * Устраняет рассинхрон `.next/server/{id}.js` vs `.next/server/chunks/{id}.js`:
 * Cannot find module './611.js' | './1331.js', Loading chunk failed, 500.
 *
 * Запуск сразу с dev: `npm run dev:clean` (очистка + `next dev`, без Turbopack).
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
