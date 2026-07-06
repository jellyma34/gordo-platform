/** npx tsx scripts/gpr-gantt-empty-row-verify.ts */
import fs from "fs";
import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
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

const csv = decodeCsvBytesWithBestEncoding(
  new Uint8Array(fs.readFileSync("data/Исполнение ГПР_май.csv")),
);
const merged = mergeGprTasksFromReportCsv((seed as { tasks: GPRTask[] }).tasks, csv, {
  forcedPartId: 1,
});
const flat = flattenTasks(
  filterZhDomPlanFactTasksTo205Branch(filterGprTasksByObjectScope(merged.tasks, 1)),
).filter((t) => t.partId === 1);

const codes = ["2.05.10.5", "2.05.04.9"] as const;
for (const code of codes) {
  const inModel = flat.some((t) => normalizeGprCodeFinal(t.code) === code);
  console.log(`${code} in model:`, inModel);
}
const m = buildPlanFactWorkTypeChartModel(flat, "residential", "2026-05-31", "full", flat);
for (const code of codes) {
  console.log(`${code} in chart:`, m?.labels.some((l) => l.startsWith(code)) ?? false);
}
console.log("chart rows:", m?.labels.length ?? 0);
