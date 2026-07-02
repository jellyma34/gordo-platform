import { readFileSync } from "node:fs";
import { normalizeGprCodeFinal } from "./gprUtils";
import {
  computeGprStageCompletionInsight,
  filterGprTasksForKpiAnalytics,
  formatGprStageKpiFactDisplay,
  formatGprStageKpiPlanDisplay,
} from "./gprStageCompletion";
import { buildPlanFactWorkTypeChartModel } from "./planFactWorkTypeTimeline";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const data = JSON.parse(readFileSync("./data/gpr-import-default.json", "utf8"));
const tasks = data.tasks;
const today = "2026-06-23";
const asOf = new Date(`${today}T12:00:00`);

const residentialOnly205 = tasks.filter(
  (t: { code?: string }) =>
    String(t.code ?? "").startsWith("2.05") || String(t.code ?? "") === "2.05",
);

const kpiPool = filterGprTasksForKpiAnalytics(tasks);
const root205 = kpiPool.find((t) => normalizeGprCodeFinal(t.code) === "2.05");
assert(root205 != null, "2.05 root required in KPI pool");
const insight = computeGprStageCompletionInsight(kpiPool, root205!, asOf);

const model = buildPlanFactWorkTypeChartModel(
  residentialOnly205,
  "residential",
  today,
  "simplified",
  tasks,
);
assert(model != null, "simplified model should exist for 2.05 branch");
assert(model!.labels.length === 1, "residential simplified: one row 2.05");
assert(model!.labels[0]!.includes("2.05"), "row label should be 2.05");
assert(model!.percentScaleMode === true, "simplified uses percent scale");
assert(model!.xMin === 0 && model!.xMax === 100, "simplified x axis 0–100");

const i = 0;
assert(model!.planRanges[i] != null, "plan bar range required");
assert(model!.factRanges[i] != null, "fact bar range required");
assert(model!.planRanges[i]![0] === 0, "plan bar starts at 0%");
assert(model!.factRanges[i]![0] === 0, "fact bar starts at 0%");

const expectedPlan = insight.planPercent ?? 0;
const expectedFact = insight.factPercent;
assert(
  Math.abs(model!.planRanges[i]![1]! - expectedPlan) < 1e-6,
  `plan bar end must match KPI planPercent (${expectedPlan})`,
);
assert(
  Math.abs(model!.factRanges[i]![1]! - expectedFact) < 1e-6,
  `fact bar end must match KPI factPercent (${expectedFact})`,
);

const expectedPlanLabel = formatGprStageKpiPlanDisplay(insight.planPercent);
const expectedFactLabel = formatGprStageKpiFactDisplay(insight);
assert(model!.planCompletionLabels?.[i] === expectedPlanLabel, "plan label must match KPI");
assert(model!.factCompletionLabels[i] === expectedFactLabel, "fact label must match KPI");

console.log("[planFactSimplified205.selftest] OK", {
  planPercent: expectedPlanLabel,
  factPercent: expectedFactLabel,
  planRange: model!.planRanges[i],
  factRange: model!.factRanges[i],
});
