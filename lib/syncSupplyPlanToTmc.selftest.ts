import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createEmptyTmcItem, type TMCItem } from "./tmcData";
import { parseSupplyPlanCsvText } from "./supplyPlanCsvImport";
import { extractSupplyPlanMaterialRows, syncSupplyPlanToTmc } from "./syncSupplyPlanToTmc";

const samplePath = resolve(__dirname, "../data/supply-plan-gpr-sample.csv");
const parsed = parseSupplyPlanCsvText(readFileSync(samplePath, "utf8"));
const materialRows = extractSupplyPlanMaterialRows(parsed);

if (materialRows.length !== 2) {
  throw new Error(`Expected 2 material rows, got ${materialRows.length}`);
}

const baseTmc: TMCItem[] = [
  createEmptyTmcItem("residential", {
    id: "tmc-1",
    itemCode: "2.05.05.1.1",
    name: "Старое название",
    gprStage: "Строительство зданий и сооружений",
    unit: "шт",
    volumePlan: 1,
    volumeFact: 0,
    supplier: "ООО Поставщик",
    contract: "DOG-001",
    status: "план",
    supplyPlanDate: "2026-05-01",
    contractPlanDate: "2026-04-01",
  }),
];

const { items: upserted, stats } = syncSupplyPlanToTmc(baseTmc, parsed, "residential");

if (stats.updated !== 1) {
  throw new Error(`Expected 1 updated item, got ${stats.updated}`);
}
if (stats.created !== 1) {
  throw new Error(`Expected 1 created item, got ${stats.created}`);
}
if (stats.stageMatchFailed !== 0) {
  throw new Error(`Expected 0 stage failures, got ${stats.stageMatchFailed}`);
}
if (upserted.length !== 2) {
  throw new Error(`Expected 2 TMC items total, got ${upserted.length}`);
}

const updated = upserted.find((item) => item.id === "tmc-1")!;
if (updated.volumePlan !== 47) {
  throw new Error(`Updated row volumePlan expected 47, got ${updated.volumePlan}`);
}
if (updated.name !== "Кирпич керамический полнотелый") {
  throw new Error(`Updated row name mismatch: ${updated.name}`);
}
if (updated.supplier !== "ООО Поставщик") {
  throw new Error(`Supplier must be preserved: ${updated.supplier}`);
}

const created = upserted.find((item) => item.id !== "tmc-1")!;
if (created.name !== "Арматура А500С d12") {
  throw new Error(`Created row name mismatch: ${created.name}`);
}

const emptyBase = syncSupplyPlanToTmc([], parsed, "residential");
if (emptyBase.stats.created !== 2) {
  throw new Error(`Expected 2 created from empty base, got ${emptyBase.stats.created}`);
}
if (emptyBase.stats.procurementDiagnostics.totalMaterials !== 2) {
  throw new Error(
    `Expected diagnostics totalMaterials=2, got ${emptyBase.stats.procurementDiagnostics.totalMaterials}`,
  );
}

console.log("syncSupplyPlanToTmc.selftest: OK", {
  updated: stats.updated,
  created: stats.created,
  total: upserted.length,
  diagnostics: stats.procurementDiagnostics,
});
