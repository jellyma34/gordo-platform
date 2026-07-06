/**
 * Пересборка снимка задач ГПР из CSV «Исполнение ГПР_май.csv».
 * Запуск: npx tsx scripts/rebuild-gpr-from-csv.ts [путь-к-csv]
 */
import fs from "fs";
import path from "path";

import { findGprCsvRootTask } from "../lib/gprAggregateRoots";
import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { getGprKpiWorkItems } from "../lib/gprStageCompletion";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import { normalizeGprCodeFinal, type GPRTask } from "../lib/gprUtils";

const root = process.cwd();
const csvPath = process.argv[2] ?? path.join(root, "data", "gpr-report-sample.csv");

const buf = fs.readFileSync(csvPath);
const text = decodeCsvBytesWithBestEncoding(new Uint8Array(buf));

const part1 = mergeGprTasksFromReportCsv([], text, { forcedPartId: 1 });
const part2 = mergeGprTasksFromReportCsv([], text, { forcedPartId: 2 });

const byId = new Map<string, GPRTask>();
for (const t of [...part1.tasks, ...part2.tasks]) {
  byId.set(t.id, t);
}
const tasks = [...byId.values()];

const outJson = path.join(root, "data", "gpr-import-default.json");
fs.writeFileSync(
  outJson,
  JSON.stringify(
    {
      projectId: "default",
      updatedAt: new Date().toISOString(),
      sourceCsv: path.basename(csvPath),
      tasks,
    },
    null,
    2,
  ),
  "utf-8",
);

console.log("Wrote", outJson, "tasks:", tasks.length);
console.log("Part 1:", part1.stats.parsedRowCount, "Part 2:", part2.stats.parsedRowCount);

const stageRoots = ["2.04", "2.05", "2.06", "2.07"] as const;
console.log("\n=== KPI works per stage (residential + parking) ===");
for (const rootCode of stageRoots) {
  const scoped =
    rootCode.startsWith("2.06") || rootCode.startsWith("2.07")
      ? part2.tasks
      : part1.tasks;
  const root = findGprCsvRootTask(scoped, rootCode);
  if (!root) {
    console.log(`${rootCode}: (no root)`);
    continue;
  }
  const works = getGprKpiWorkItems(scoped, root);
  console.log(
    `${rootCode} ${root.name.trim()}: ${works.length} works`,
    works.map((w) => w.articleNumber ?? w.code).join(", "),
  );
}

const withArticle = tasks.filter((t) => t.articleNumber != null);
console.log("\nTasks with articleNumber:", withArticle.length, "/", tasks.length);
