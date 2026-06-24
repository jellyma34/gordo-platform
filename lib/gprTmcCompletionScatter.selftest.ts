import {
  buildGprTmcCompletionInsightSummary,
  buildGprTmcCompletionScatterPoints,
  buildGprTmcCompletionScatterTooltipDetail,
  countGprTmcCompletionPointsByQuadrant,
  listGprDirectChildWorkCodes,
  listTmcSupplyLinesForWorkCode,
  resolveGprTmcCompletionScatterPointMeta,
  type GprTmcDependencyPoint,
} from "./gprTmcDependency";
import type { TMCItem } from "./tmcData";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(
  resolveGprTmcCompletionScatterPointMeta(100, 100).quadrant === "normal",
  "100/100 = normal",
);
assert(
  resolveGprTmcCompletionScatterPointMeta(100, 78).quadrant === "lag_not_tmc",
  "100/78 = lag not tmc",
);
assert(
  resolveGprTmcCompletionScatterPointMeta(87, 78).quadrant === "lag_not_tmc",
  "87/78 = lag not tmc",
);
assert(
  resolveGprTmcCompletionScatterPointMeta(13, 62).quadrant === "tmc_confirmed",
  "13/62 = tmc confirmed",
);
assert(
  resolveGprTmcCompletionScatterPointMeta(50, 90).quadrant === "tmc_risk",
  "50/90 = tmc risk",
);

const series: GprTmcDependencyPoint[] = [
  {
    groupKey: "build",
    stageTitle: "Земляные работы",
    stageFull: "Строительство",
    stageShort: "2.05.01",
    planGpr: 100,
    factGpr: 100,
    deviationDays: 0,
    progressDeltaPp: 0,
    tmcSupply: 100,
    impact: "ok",
    statusLabel: "В срок",
    zoneBar: 100,
    zone: "none",
  },
  {
    groupKey: "build",
    stageTitle: "Отделка фасада",
    stageFull: "Строительство",
    stageShort: "2.05.05",
    planGpr: 10,
    factGpr: null,
    deviationDays: null,
    progressDeltaPp: null,
    tmcSupply: 0,
    impact: "na",
    statusLabel: "Нет данных",
    zoneBar: 100,
    zone: "none",
  },
];

const points = buildGprTmcCompletionScatterPoints(series);
assert(points.length === 1, "only rows with fact+tmc");
assert(points[0]?.stageShort === "2.05.01", "stage code preserved");

const counts = countGprTmcCompletionPointsByQuadrant(points);
assert(counts.normal === 1, "one normal point");

const insight = buildGprTmcCompletionInsightSummary(points);
assert(insight.includes("нормы"), "all-normal insight");

const childTasks = [
  { code: "2.05.04", name: "Этап", partId: 1, level: 2 } as import("./gprUtils").GPRTask,
  { code: "2.05.04.01", name: "A", partId: 1, level: 3 } as import("./gprUtils").GPRTask,
  { code: "2.05.04.02", name: "B", partId: 1, level: 3 } as import("./gprUtils").GPRTask,
  { code: "2.05.04.02.1", name: "B1", partId: 1, level: 4 } as import("./gprUtils").GPRTask,
];
const children = listGprDirectChildWorkCodes(childTasks, "2.05.04");
assert(children.join(",") === "2.05.04.01,2.05.04.02", "direct child work codes");

const tmcItems: TMCItem[] = [
  {
    id: "1",
    itemCode: "2.05.04.01",
    name: "Арматура А500С",
    gprStage: "2.05.04.01",
    unit: "т",
    volumePlan: 10,
    volumeFact: 4.5,
    pricePlan: 100,
    priceFact: 100,
    totalPlan: 1000,
    totalFact: 450,
    supplier: "",
    contract: "",
    status: "partial",
    planCost: 1000,
    factCost: 450,
    supplyPlanDate: null,
    supplyFactDate: null,
    contractPlanDate: null,
    contractFactDate: null,
    projectPart: "residential",
  },
];
const tmcLines = listTmcSupplyLinesForWorkCode(tmcItems, "2.05.04");
assert(tmcLines.length === 1 && tmcLines[0]?.supplyPercent === 45, "tmc line supply");

const tooltip = buildGprTmcCompletionScatterTooltipDetail("2.05.04", childTasks, tmcItems, {
  stageShort: "2.05.04",
  tmcPercent: 9,
  gprPercent: 62,
  quadrant: "tmc_confirmed",
});
assert(tooltip.childWorkCodes.length === 2, "tooltip children");
assert(tooltip.tmcLines[0]?.name === "Арматура А500С", "tooltip tmc name");

console.log("[gprTmcCompletionScatter.selftest] OK");
