import { isGprPlanFactChartExcludedMiscStageName } from "./planFactWorkTypeTimeline";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(isGprPlanFactChartExcludedMiscStageName("Прочие земляные работы"), "Прочие");
assert(isGprPlanFactChartExcludedMiscStageName("Прочее оборудование дома"), "Прочее");
assert(!isGprPlanFactChartExcludedMiscStageName("Земляные работы"), "normal stage");
assert(
  isGprPlanFactChartExcludedMiscStageName("2.05.99 — Прочие расходы зданий"),
  "label with Прочие",
);

console.log("[planFactMiscStageFilter.selftest] OK");
