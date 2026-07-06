import type { GPRTask } from "./gprUtils";
import {
  collapseMonolithBranchForKpi,
  filterGprTasksForKpiAnalytics,
  getGprKpiWorkItems,
  getGprStageWorkItems,
  GPR_MONOLITH_KPI_STAGE_CODE,
  isGprCsvArticleWork,
} from "./gprStageCompletion";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function task(code: string, name: string, articleNumber?: number): GPRTask {
  return {
    id: code,
    globalTaskId: code,
    code,
    name,
    articleNumber: articleNumber ?? null,
    level: code.split(".").length - 1,
    partId: 1,
    planStart: "2026-01-01",
    planEnd: "2026-12-31",
  };
}

const monolith = task(GPR_MONOLITH_KPI_STAGE_CODE, "Монолитные конструкции", 11);
const floors = Array.from({ length: 9 }, (_, i) =>
  task(`${GPR_MONOLITH_KPI_STAGE_CODE}.${i + 1}`, `Монолитные конструкции — ${i + 1} этаж`, i + 12),
);
const sibling = task("2.05.04.3", "Кровля", 20);
const root = task("2.05", "Строительство зданий и сооружений");
const allTasks = [root, monolith, ...floors, sibling];

const wbsLeaves = getGprStageWorkItems(allTasks, root);
assert(wbsLeaves.length === 10, `WBS leaves = 10, got ${wbsLeaves.length}`);

const kpiItems = getGprKpiWorkItems(allTasks, root);
assert(kpiItems.length === 11, `KPI items = 11 (article rows only), got ${kpiItems.length}`);
assert(kpiItems.every(isGprCsvArticleWork), "all KPI items have articleNumber");

const filtered = filterGprTasksForKpiAnalytics(allTasks);
assert(filtered.length === 11, `filtered flat list = 11, got ${filtered.length}`);

const collapsedOnly = collapseMonolithBranchForKpi(allTasks, wbsLeaves);
assert(collapsedOnly.length === 2, `collapsed branch = 2, got ${collapsedOnly.length}`);

console.log("[gprMonolithKpiCollapse.selftest] OK", {
  wbsLeaves: wbsLeaves.length,
  kpiItems: kpiItems.length,
  filtered: filtered.length,
});
