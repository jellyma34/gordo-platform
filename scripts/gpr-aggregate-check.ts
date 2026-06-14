import fs from "fs";

import { findGprCsvRootTask } from "../lib/gprAggregateRoots";
import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import { computeGprStageCompletionInsight } from "../lib/gprStageCompletion";
import { durationDays, filterGprTasksByObjectScope } from "../lib/gprUtils";

const text = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync("data/gpr-report-sample.csv")));
const { tasks } = mergeGprTasksFromReportCsv([], text, { forcedPartId: 1 });
const part1 = filterGprTasksByObjectScope(tasks, 1);
const asOf = new Date();

const roots: Array<{ code: string; root: ReturnType<typeof findGprCsvRootTask> }> = [];
for (const code of ["2.04", "2.05"]) {
  roots.push({ code, root: findGprCsvRootTask(part1, code) });
}

let sumW = 0;
let weighted = 0;
for (const { code, root } of roots) {
  if (!root) continue;
  const ins = computeGprStageCompletionInsight(part1, root, asOf);
  const planD = durationDays(root.planStart, root.planEnd) ?? 1;
  sumW += planD;
  weighted += ins.factPercent * planD;
  console.log(
    `${code}: fact=${ins.factPercent}% planD=${planD} works=${ins.workTotal} completed=${ins.workCompleted}`,
  );
}
console.log("weighted aggregate (by plan duration):", (weighted / sumW).toFixed(1) + "%");
console.log("sum weights (plan days):", sumW);
