/**
 * Проверка модели KPI: работа = строка CSV с «№ статей».
 * npx tsx scripts/gpr-kpi-article-model-verify.ts
 */
import fs from "fs";
import path from "path";

import {
  aggregateRootCodesForPart,
  discoverGprAggregateRootCodesFromTasks,
  findGprCsvRootTask,
  resolveStageCardRootTasks,
} from "../lib/gprAggregateRoots";
import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import {
  filterGprTasksForKpiAnalytics,
  getGprKpiWorkItems,
  getGprStageWorkItems,
  isGprCsvArticleWork,
} from "../lib/gprStageCompletion";
import {
  filterGprTasksByObjectScope,
  normalizeGprCodeFinal,
  type GPRTask,
} from "../lib/gprUtils";

const ROOT = process.cwd();
const csvPath = process.argv[2] ?? path.join(ROOT, "data", "Исполнение ГПР_май.csv");
const text = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(csvPath)));

const part1 = mergeGprTasksFromReportCsv([], text, { forcedPartId: 1 }).tasks;
const part2 = mergeGprTasksFromReportCsv([], text, { forcedPartId: 2 }).tasks;

function countArticlesInBranch(tasks: GPRTask[], stageCode: string): number {
  return tasks.filter(
    (t) =>
      isGprCsvArticleWork(t) &&
      (normalizeGprCodeFinal(t.code) === stageCode ||
        normalizeGprCodeFinal(t.code).startsWith(`${stageCode}.`)),
  ).length;
}

console.log("=== GPR KPI: модель articleNumber ===\n");

for (const [label, scoped] of [
  ["Жилой дом (part1)", filterGprTasksByObjectScope(part1, 1)],
  ["Автостоянка (part2)", filterGprTasksByObjectScope(part2, 2)],
] as const) {
  console.log(`--- ${label} ---`);
  const partKey = label.includes("Авто") ? "parking" : "residential";
  const discovered = discoverGprAggregateRootCodesFromTasks(scoped);
  console.log(`  Этапы (из CSV объекта): ${discovered.join(", ") || "—"}`);
  const roots = resolveStageCardRootTasks(
    scoped,
    aggregateRootCodesForPart(partKey as "residential" | "parking", scoped),
  );

  for (const root of roots) {
    const code = normalizeGprCodeFinal(root.code);
    const leaves = getGprStageWorkItems(scoped, root).length;
    const articles = countArticlesInBranch(scoped, code);
    const kpi = getGprKpiWorkItems(scoped, root).length;
    const ok = articles === kpi ? "OK" : "MISMATCH";
    console.log(
      `  ${code}: WBS-листья=${leaves}, articleNumber=${articles}, KPI=${kpi}  [${ok}]`,
    );
  }
  console.log();
}

const allArticle = filterGprTasksForKpiAnalytics([...part1, ...part2]);
console.log(`Всего KPI-работ в проекте: ${allArticle.length}`);
console.log(`  part1: ${filterGprTasksForKpiAnalytics(part1).length}`);
console.log(`  part2: ${filterGprTasksForKpiAnalytics(part2).length}`);
