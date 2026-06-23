import { readFileSync } from "node:fs";
import { buildPlanFactWorkTypeChartModel } from "./planFactWorkTypeTimeline";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const data = JSON.parse(readFileSync("./data/gpr-import-default.json", "utf8"));
const tasks = data.tasks;
const today = "2026-06-23";

const residentialOnly205 = tasks.filter(
  (t: { code?: string }) =>
    String(t.code ?? "").startsWith("2.05") || String(t.code ?? "") === "2.05",
);

const model = buildPlanFactWorkTypeChartModel(residentialOnly205, "residential", today, "simplified", tasks);
assert(model != null, "simplified model should exist for 2.05 branch");
assert(model!.labels.length === 1, "residential simplified: one row 2.05");
assert(model!.labels[0]!.includes("2.05"), "row label should be 2.05");

const i = 0;
const d = model!.rowDetails[i]!;
assert(Boolean(d.planStart && d.planEnd), "planStart/planEnd required");
assert(Boolean(d.factStart && d.factEnd), "factStart/factEnd required");
assert(model!.planRanges[i] != null, "plan bar range required");
assert(model!.factRanges[i] != null, "fact bar range required");
assert((model!.factCompletionLabels[i] ?? "").length > 0, "factPercent label required");

console.log("[planFactSimplified205.selftest] OK", {
  planStart: d.planStart,
  planEnd: d.planEnd,
  factStart: d.factStart,
  factEnd: d.factEnd,
  factPercent: model!.factCompletionLabels[i],
});
