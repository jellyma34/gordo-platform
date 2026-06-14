import fs from "fs";

import { findGprCsvRootTask } from "../lib/gprAggregateRoots";
import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import { computeGprStageCompletionInsight } from "../lib/gprStageCompletion";
import { filterGprTasksByObjectScope } from "../lib/gprUtils";
import { parseGprReportCsvWithStats } from "../lib/gprReportCsv";

const buf = fs.readFileSync("data/gpr-report-sample.csv");
const utf8Wrong = new TextDecoder("utf-8", { fatal: false }).decode(buf);
const text = decodeCsvBytesWithBestEncoding(new Uint8Array(buf));
const line7Raw = buf.toString("hex").slice(0, 120);
const line7 = text.split(/\r?\n/)[6] ?? "";

console.log("=== 1. CSV encoding ===");
console.log("file bytes (line7 hex prefix):", line7Raw);
console.log("UTF-8 read (wrong):", utf8Wrong.split(/\r?\n/)[6]?.split(";")[1] ?? "");
console.log("decodeCsvBytesWithBestEncoding:", line7.split(";")[1] ?? "");

const { rows } = parseGprReportCsvWithStats(text);
const row7 = rows.find((r) => r.sourceRowIndex === 7);
console.log("parsed row 7 name:", row7?.name ?? "(missing)");

const { tasks } = mergeGprTasksFromReportCsv([], text, { forcedPartId: 1 });
const task7 = tasks.find((t) => t.globalTaskId.includes("__csv7"));
console.log("merged task __csv7 name:", task7?.name ?? "(missing)");

const part1 = filterGprTasksByObjectScope(tasks, 1);
console.log("\n=== 2. Percent stats (part scope 1) ===");
console.log("total tasks:", tasks.length, "part scope 1:", part1.length);
console.log("completed (completion>=100):", part1.filter((t) => t.completion >= 100).length);

let weightedSum = 0;
let weightTotal = 0;
for (const code of ["2.04", "2.05"]) {
  const root = findGprCsvRootTask(part1, code);
  if (!root) continue;
  const ins = computeGprStageCompletionInsight(part1, root, new Date());
  const w = root.planEnd && root.planStart ? 1 : 1;
  weightedSum += ins.factPercent * w;
  weightTotal += w;
  console.log(
    `stage ${code} insight: fact=${ins.factPercent}% plan=${ins.planPercent}% works=${ins.workTotal} completed=${ins.workCompleted}`,
  );
}
console.log("simple 2-stage avg fact%:", weightTotal > 0 ? (weightedSum / weightTotal).toFixed(1) : "n/a");

console.log("\n=== 3. Duplicate frontend ids ===");
const byId = new Map<string, Array<{ id: string; globalTaskId: string; code: string }>>();
for (const t of tasks) {
  const list = byId.get(t.id) ?? [];
  list.push({ id: t.id, globalTaskId: t.globalTaskId, code: t.code });
  byId.set(t.id, list);
}
const idDups = [...byId.entries()].filter(([, list]) => list.length > 1);
console.log("duplicate id groups:", idDups.length);
for (const [id, list] of idDups.slice(0, 20)) {
  console.log(`id=${id}`);
  for (const row of list) {
    console.log(`  code=${row.code} global_task_id=${row.globalTaskId}`);
  }
}
if (idDups.length > 20) console.log(`... and ${idDups.length - 20} more groups`);
