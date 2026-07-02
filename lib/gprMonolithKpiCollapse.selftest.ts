import type { GPRTask } from "./gprUtils";
import {
  collapseMonolithBranchForKpi,
  filterGprTasksForKpiAnalytics,
  getGprKpiWorkItems,
  getGprStageWorkItems,
  GPR_MONOLITH_KPI_STAGE_CODE,
} from "./gprStageCompletion";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function task(code: string, name: string): GPRTask {
  return {
    id: code,
    globalTaskId: code,
    code,
    name,
    level: code.split(".").length - 1,
    partId: 1,
    planStart: "2026-01-01",
    planEnd: "2026-12-31",
  };
}

const monolith = task(GPR_MONOLITH_KPI_STAGE_CODE, "Монолитные конструкции");
const floors = Array.from({ length: 9 }, (_, i) =>
  task(`${GPR_MONOLITH_KPI_STAGE_CODE}.${i + 1}`, `Монолитные конструкции — ${i + 1} этаж`),
);
const sibling = task("2.05.04.3", "Кровля");
const root = task("2.05", "Строительство зданий и сооружений");
const allTasks = [root, monolith, ...floors, sibling];

const wbsLeaves = getGprStageWorkItems(allTasks, root);
assert(wbsLeaves.length === 10, `WBS leaves = 10, got ${wbsLeaves.length}`);

const kpiItems = getGprKpiWorkItems(allTasks, root);
assert(kpiItems.length === 2, `KPI items = 2 (monolith + sibling), got ${kpiItems.length}`);
assert(
  kpiItems.some((t) => t.code === GPR_MONOLITH_KPI_STAGE_CODE),
  "KPI set includes monolith parent",
);
assert(!kpiItems.some((t) => t.code.startsWith(`${GPR_MONOLITH_KPI_STAGE_CODE}.`)), "KPI set excludes floors");

const filtered = filterGprTasksForKpiAnalytics(allTasks);
assert(filtered.length === 3, `filtered flat list = 3, got ${filtered.length}`);
assert(!filtered.some((t) => t.code.startsWith(`${GPR_MONOLITH_KPI_STAGE_CODE}.`)), "filter removes floor rows");

const collapsedOnly = collapseMonolithBranchForKpi(allTasks, wbsLeaves);
assert(collapsedOnly.length === 2, `collapsed branch = 2, got ${collapsedOnly.length}`);

console.log("[gprMonolithKpiCollapse.selftest] OK", {
  wbsLeaves: wbsLeaves.length,
  kpiItems: kpiItems.length,
  filtered: filtered.length,
});
