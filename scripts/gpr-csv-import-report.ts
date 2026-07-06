/**
 * Отчёт по импорту CSV ГПР: этапы, число работ, нумерация.
 * Запуск: npx tsx scripts/gpr-csv-import-report.ts [путь-к-csv]
 */
import fs from "fs";
import path from "path";

import { findGprCsvRootTask } from "../lib/gprAggregateRoots";
import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { getGprKpiWorkItems } from "../lib/gprStageCompletion";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import { normalizeGprCodeFinal } from "../lib/gprUtils";

const csvPath = process.argv[2] ?? path.join(process.cwd(), "data", "gpr-report-sample.csv");
const text = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(csvPath)));

const part1 = mergeGprTasksFromReportCsv([], text, { forcedPartId: 1 });
const part2 = mergeGprTasksFromReportCsv([], text, { forcedPartId: 2 });

const byId = new Map<string, (typeof part1.tasks)[number]>();
for (const t of [...part1.tasks, ...part2.tasks]) byId.set(t.id, t);
const allTasks = [...byId.values()];

const stageRoots = ["2.04", "2.05", "2.06", "2.07"] as const;

console.log("=== Импорт CSV ГПР ===");
console.log("Файл:", csvPath);
console.log("Всего задач после импорта:", allTasks.length);
console.log("Жилой дом (строк CSV):", part1.stats.parsedRowCount);
console.log("Автостоянка (строк CSV):", part2.stats.parsedRowCount);
console.log("С номером «№ статей»:", allTasks.filter((t) => t.articleNumber != null).length);
console.log("");

console.log("=== Работы по этапам (KPI) ===");
for (const rootCode of stageRoots) {
  const scoped =
    rootCode.startsWith("2.06") || rootCode.startsWith("2.07") ? part2.tasks : part1.tasks;
  const root = findGprCsvRootTask(scoped, rootCode);
  if (!root) {
    console.log(`${rootCode}: корень не найден`);
    continue;
  }
  const works = getGprKpiWorkItems(scoped, root);
  const numbered = works.filter((w) => w.articleNumber != null);
  console.log(`\n${rootCode} — ${root.name.trim()}`);
  console.log(`  KPI-работ: ${works.length} (с № из CSV: ${numbered.length})`);
  console.log(
    "  Номера:",
    works
      .map((w) => (w.articleNumber != null ? String(w.articleNumber) : w.code))
      .join(", "),
  );
}

const subStages = allTasks.filter((t) => {
  const c = normalizeGprCodeFinal(t.code);
  const depth = c.split(".").length;
  return depth === 3 && (c.startsWith("2.05.") || c.startsWith("2.04.") || c.startsWith("2.06.") || c.startsWith("2.07."));
});

console.log("\n=== Подэтапы WBS (уровень 3) ===");
for (const stage of subStages.slice(0, 20)) {
  const children = allTasks.filter((t) => {
    const c = normalizeGprCodeFinal(t.code);
    return c.startsWith(`${normalizeGprCodeFinal(stage.code)}.`) && c !== normalizeGprCodeFinal(stage.code);
  });
  const kpiChildren = getGprKpiWorkItems(
    allTasks.filter((t) => t.partId === stage.partId),
    stage,
  );
  if (kpiChildren.length > 0) {
    console.log(`${stage.code}: ${kpiChildren.length} работ KPI`);
  }
}
console.log("(полный список — см. verify-gpr-csv-import.ts)");
