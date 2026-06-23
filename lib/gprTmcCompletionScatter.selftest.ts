import {
  buildGprTmcCompletionScatterPoints,
  resolveGprTmcCompletionScatterPointMeta,
  type GprTmcDependencyPoint,
} from "./gprTmcDependency";

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

console.log("[gprTmcCompletionScatter.selftest] OK");
