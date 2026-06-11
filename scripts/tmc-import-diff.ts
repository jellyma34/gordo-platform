import fs from "fs";
import { execSync } from "child_process";

import { enrichTmcItems, computeTmcProcurementKpi } from "../lib/tmcPresentationAnalytics";

const current = JSON.parse(fs.readFileSync("data/tmc-import-default.json", "utf8")) as {
  items: Array<{ id: string; itemCode: string; name: string; gprStage: string }>;
  updatedAt: string;
};
const prevRaw = execSync("git show e1da1c8:data/tmc-import-default.json", { encoding: "utf8" });
const prev = JSON.parse(prevRaw) as typeof current;

const stageKey = (i: (typeof current.items)[0]) =>
  `${i.name.trim()} | ${i.gprStage.trim()}`;
const idKey = (i: (typeof current.items)[0]) => i.id;

const curById = new Map(current.items.map((i) => [idKey(i), i]));
const prevById = new Map(prev.items.map((i) => [idKey(i), i]));

const curStages = new Set(current.items.map(stageKey));
const prevStages = new Set(prev.items.map(stageKey));

const removedById = prev.items.filter((i) => !curById.has(idKey(i)));
const removedByStage = prev.items.filter((i) => !curStages.has(stageKey(i)));
const addedByStage = current.items.filter((i) => !prevStages.has(stageKey(i)));

console.log("=== COUNTS ===");
console.log("Before import (git e1da1c8):", prev.items.length, "updatedAt:", prev.updatedAt);
console.log("After import (current file):", current.items.length, "updatedAt:", current.updatedAt);

console.log("\n=== KPI ===");
for (const [label, items] of [
  ["BEFORE", prev.items],
  ["AFTER", current.items],
] as const) {
  const kpi = computeTmcProcurementKpi(enrichTmcItems(items));
  console.log(
    `${label}: Поставлено ${kpi.deliveryCount} из ${kpi.totalItemCount} (закуплено ${kpi.purchasedItemCount})`,
  );
}

console.log("\n=== REMOVED by stable id (", removedById.length, ") ===");
removedById.forEach((i, n) => {
  console.log(`${n + 1}. [${i.itemCode}] ${i.name} — ${i.gprStage.slice(0, 80)}`);
});

console.log("\n=== REMOVED by name+stage (", removedByStage.length, ") ===");
removedByStage.forEach((i, n) => {
  console.log(`${n + 1}. [${i.itemCode}] ${i.name} — ${i.gprStage.slice(0, 80)}`);
});

console.log("\n=== ADDED by name+stage (", addedByStage.length, ") ===");
addedByStage.forEach((i, n) => {
  console.log(`${n + 1}. [${i.itemCode}] ${i.name} — ${i.gprStage.slice(0, 80)}`);
});
