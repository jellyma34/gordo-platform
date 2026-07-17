import fs from "fs";

import {
  filterGprTasksByObjectScope,
  gprTaskFromApiItem,
  type GprTaskApiItem,
} from "../lib/gprUtils";
import { filterGprTasksForKpiAnalytics } from "../lib/gprStageCompletion";

const raw = JSON.parse(
  fs.readFileSync("scripts/_e2e-gpr-get-railway-dev.json", "utf8").replace(/^\uFEFF/, ""),
) as GprTaskApiItem[];
const tasks = raw.map(gprTaskFromApiItem);

console.log("=== KPI filter proof (Railway dev GET /gpr/tasks) ===\n");
for (const scope of [1, 2, "project"] as const) {
  const scoped = filterGprTasksByObjectScope(tasks, scope);
  const filtered = filterGprTasksForKpiAnalytics(scoped);
  console.log(`scope=${scope}: received=${scoped.length}, after filter=${filtered.length}`);
}

console.log("\nCriteria (isGprKpiWorkItem):");
console.log("- not missingFromImport");
console.log("- code matches 2.xx… (normalizeGprCodeFinal)");
console.log("- WBS leaf (no child code in same scope)");
console.log("- wbsLevel >= 3 OR segCount >= 4 OR (wbsLevel >= 2 AND segCount >= 3)");
