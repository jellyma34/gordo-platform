import fs from "fs";
import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { parseGprReportCsvWithStats } from "../lib/gprReportCsv";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import { inferGprPartIdFromObjectLabel } from "../lib/gprUtils";
import { normalizeGprCodeFinal } from "../lib/gprUtils";

const text = decodeCsvBytesWithBestEncoding(
  new Uint8Array(fs.readFileSync("data/Исполнение ГПР_май.csv")),
);
const { rows } = parseGprReportCsvWithStats(text);

let objectCtx = "";
const res205: typeof rows = [];
for (const r of rows) {
  if (!r.code && r.objectType) objectCtx = r.objectType;
  const c = normalizeGprCodeFinal(r.code);
  if (!c.startsWith("2.05")) continue;
  const part = inferGprPartIdFromObjectLabel(objectCtx) ?? inferGprPartIdFromObjectLabel(r.objectType) ?? 1;
  if (part !== 1) continue;
  res205.push({ ...r, objectType: objectCtx || r.objectType });
}

const withArt = res205.filter((r) => r.articleNumber != null);
const arts = withArt.map((r) => r.articleNumber!).sort((a, b) => a - b);
console.log("Residential 2.05 CSV rows:", res205.length);
console.log("With № статей:", withArt.length);
console.log("Min/max article:", arts[0], arts[arts.length - 1]);
console.log("Unique articles:", new Set(arts).size);

const p1 = mergeGprTasksFromReportCsv([], text, { forcedPartId: 1 }).tasks;
const p1art = p1.filter(
  (t) => normalizeGprCodeFinal(t.code).startsWith("2.05") && t.articleNumber != null,
);
console.log("Part1 merge tasks 2.05 with article:", p1art.length);

import { findGprCsvRootTask } from "../lib/gprAggregateRoots";
import {
  filterGprTasksForKpiAnalytics,
  getGprKpiWorkItems,
  isGprTaskFactCompleted,
} from "../lib/gprStageCompletion";
import { filterGprTasksByObjectScope } from "../lib/gprUtils";

const flat = filterGprTasksForKpiAnalytics(filterGprTasksByObjectScope(p1, 1));
const root = findGprCsvRootTask(flat, "2.05")!;
const kpi = getGprKpiWorkItems(flat, root);
const asOf = new Date();
const done = kpi.filter((t) => isGprTaskFactCompleted(t, asOf));
const art = kpi.filter((t) => t.articleNumber != null);
console.log("KPI total:", kpi.length, "completed:", done.length);
console.log("Article rows in KPI:", art.length, "article completed:", art.filter((t) => isGprTaskFactCompleted(t, asOf)).length);
