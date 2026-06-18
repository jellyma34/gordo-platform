import { readFileSync } from "fs";
import {
  computeTmcMaterialPlanFact,
  computeTmcVolumeDynamics,
  diagnoseTmcVolumeDynamicsExclusions,
  enrichTmcItems,
  TMC_MATERIAL_PLAN_FACT_TOP_N,
} from "../lib/tmcPresentationAnalytics";
import type { TMCItem } from "../lib/tmcData";

const raw = JSON.parse(readFileSync("./data/tmc-import-default.json", "utf8"));
const items = raw.items as TMCItem[];
const today = new Date("2026-06-18");
const enriched = enrichTmcItems(items, today);

const planFact = computeTmcMaterialPlanFact(enriched, undefined, today);
const volumeDynamics = computeTmcVolumeDynamics(enriched, { today });
const diag = diagnoseTmcVolumeDynamicsExclusions(enriched, { today });

const atRisk = diag.filter((r) => r.remainingQty > 0);
const missingAtRisk = atRisk.filter((r) => !r.shownInRiskBlock);

console.log("=== СВЕРКА: План/Факт vs Риск дефицита ТМЦ ===\n");
console.log("Источник данных: enriched TMC items (tmc-import-default.json)");
console.log("План/Факт: computeTmcMaterialPlanFact — top-N =", TMC_MATERIAL_PLAN_FACT_TOP_N, "по planCost");
console.log("Риск: computeTmcVolumeDynamics — без top-N, фильтр remainingQty > 0");
console.log("План/Факт строк:", planFact.length);
console.log("Риск строк:", volumeDynamics.rows.length);
console.log("Материалов с remainingQty > 0:", atRisk.length);
console.log("Пропущено при remainingQty > 0:", missingAtRisk.length);

console.log("\n=== ПРОВЕРКА ФИЛЬТРОВ ===");
console.log({
  topN_planFact: TMC_MATERIAL_PLAN_FACT_TOP_N,
  topN_risk: "нет (по умолчанию)",
  minimumThreshold: "remainingQty > 0 (remainingPercent для отображения)",
  gprStageFilter: "нет (только подпись/tooltip)",
  aggregation: "tmcMaterialPlanFactBucketKey (арматура: ниже/выше 0.000)",
  hiddenMaterials: "нет",
});

console.log("\n=== ПОЛНАЯ ДИАГНОСТИЧЕСКАЯ ТАБЛИЦА ===");
console.table(
  diag.map((r) => ({
    Материал: r.material,
    "Плановый объём": `${r.volumePlan} ${r.unit}`,
    "Закупленный объём": `${r.volumeFact} ${r.unit}`,
    Осталось: `${r.remainingQty} ${r.unit}`,
    remainingPercent: r.remainingPercent,
    "Связь с ГПР": r.gprLinkLabel,
    "План/Факт": r.shownInPlanFactBlock ? "да" : "нет",
    "Блок риска": r.shownInRiskBlock ? "да" : "нет",
    "Причина исключения": r.exclusionReason,
  })),
);

console.log("\n=== ПГС / Сваи / Фанера (детально) ===");
for (const name of ["ПГС", "Сваи С80.35-13.1.у", "Фанера ламинированная 1220*2440*18мм сорт 1/1"]) {
  const row = diag.find((r) => r.material === name);
  if (!row) {
    console.log(name, "— не найден в данных");
    continue;
  }
  console.log({
    material: row.material,
    volumePlan: row.volumePlan,
    volumeFact: row.volumeFact,
    remainingQty: row.remainingQty,
    remainingPercent: row.remainingPercent,
    planCost: row.planCost,
    factCost: row.factCost,
    costGap: row.planCost - row.factCost,
    gprLinked: row.gprLinked,
    shownInRiskBlock: row.shownInRiskBlock,
    reason: row.exclusionReason,
  });
}

if (missingAtRisk.length > 0) {
  console.error("\n!!! ОШИБКА: материалы с remainingPercent > 0 не в блоке риска:");
  console.table(missingAtRisk);
  process.exit(1);
}

console.log("\n✓ Все материалы с remainingQty > 0 отображаются в блоке риска.");
