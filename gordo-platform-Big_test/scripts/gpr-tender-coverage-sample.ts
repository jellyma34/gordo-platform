import { readFileSync } from "fs";
import { join } from "path";
import { TENDER_DATA } from "../lib/tenderData";
import type { GPRTask } from "../lib/gprUtils";
import { computeGprTenderCoverage } from "../lib/gprTenderCoverage";
import { gprTenderDependencyKpiAtDate } from "../lib/gprTmcDependency";

const root = join(import.meta.dirname ?? __dirname, "..");
const gprJson = JSON.parse(
  readFileSync(join(root, "data/gpr-import-default.json"), "utf8"),
) as { tasks: GPRTask[] };

const todayIso = "2026-06-01";
const part = "residential" as const;

const coverage = computeGprTenderCoverage(gprJson.tasks, TENDER_DATA, part);
const kpi = gprTenderDependencyKpiAtDate(gprJson.tasks, TENDER_DATA, todayIso, part);

console.log("=== KPI (residential, 2026-06-01) ===");
console.log(JSON.stringify(kpi, null, 2));
console.log("=== Coverage ===");
console.log(
  JSON.stringify(
    {
      coveragePercent: coverage.coveragePercent,
      coveredWeight: coverage.coveredWeight,
      totalWeight: coverage.totalWeight,
      leafCount: coverage.leafCount,
      coveredLeafCount: coverage.coveredLeafCount,
      belowRiskThreshold: coverage.belowRiskThreshold,
      unprovidedCount: coverage.unprovided.length,
      sampleUnprovided: coverage.unprovided.slice(0, 5),
    },
    null,
    2,
  ),
);
