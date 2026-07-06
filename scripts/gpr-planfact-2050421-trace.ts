/**
 * Диагностика 2.05.04.2.1: источник plan/fact.
 * npx tsx scripts/gpr-planfact-2050421-trace.ts
 */
import fs from "fs";
import path from "path";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { parseGprReportCsv } from "../lib/gprReportCsv";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import { buildPlanFactWorkTypeChartModel } from "../lib/planFactWorkTypeTimeline";
import {
  filterGprTasksByObjectScope,
  filterZhDomPlanFactTasksTo205Branch,
  flattenTasks,
  normalizeGprCodeFinal,
  type GPRTask,
} from "../lib/gprUtils";
import seed from "../data/gpr-import-default.json";

const TARGET = "2.05.04.2.1";
const csvPath = path.join(process.cwd(), "data", "Исполнение ГПР_май.csv");
const todayIso = "2026-05-31";

const csvText = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(csvPath)));
const csvRows = parseGprReportCsv(csvText).filter(
  (r) => normalizeGprCodeFinal(r.code) === TARGET,
);
const merged = mergeGprTasksFromReportCsv((seed as { tasks: GPRTask[] }).tasks, csvText, {
  forcedPartId: 1,
});
const flat = flattenTasks(
  filterZhDomPlanFactTasksTo205Branch(filterGprTasksByObjectScope(merged.tasks, 1)),
).filter((t) => t.partId === 1);

const task = flat.find((t) => normalizeGprCodeFinal(t.code) === TARGET);

console.log("=== CSV rows ===");
for (const r of csvRows) {
  console.log({
    sourceRowIndex: r.sourceRowIndex,
    code: r.code,
    articleNumber: r.articleNumber,
    planStart: r.planStart,
    planEnd: r.planEnd,
    factStart: r.factStart,
    factEnd: r.factEnd,
    completion: r.completion,
  });
}

console.log("\n=== Merged task ===");
console.log(
  task
    ? {
        id: task.id,
        globalTaskId: task.globalTaskId,
        code: task.code,
        articleNumber: task.articleNumber,
        planStart: task.planStart,
        planEnd: task.planEnd,
        factStart: task.factStart,
        factEnd: task.factEnd,
        completion: task.completion,
      }
    : "(not found)",
);

const model = buildPlanFactWorkTypeChartModel(flat, "residential", todayIso, "full", flat);
const idx = model?.labels.findIndex((l) => l.startsWith(TARGET)) ?? -1;
if (idx < 0 || !model) {
  console.log("\n=== Chart row: NOT IN MODEL ===");
} else {
  const d = model.rowDetails[idx]!;
  console.log("\n=== Chart model row ===");
  console.log({
    index: idx,
    label: model.labels[idx],
    planStart: d.planStart,
    planEnd: d.planEnd,
    factStart: d.factStart,
    factEnd: d.factEnd,
    planRange: model.planRanges[idx],
    factRange: model.factRanges[idx],
    factLabel: model.factCompletionLabels[idx],
  });
}
