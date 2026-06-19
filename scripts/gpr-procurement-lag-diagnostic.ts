import { readFileSync } from "fs";
import { gprMockData } from "../lib/gprMockData";
import {
  computeGprStageInfluenceScore,
  computeGprStageLagCauseAnalysis,
  gprStageDependencyStatusColor,
} from "../lib/gprProcurementLagRisk";
import { enrichTmcItems } from "../lib/tmcPresentationAnalytics";
import type { TMCItem } from "../lib/tmcData";
import type { Tender } from "../lib/tenderData";

const tmcRaw = JSON.parse(readFileSync("./data/tmc-import-default.json", "utf8"));
const items = tmcRaw.items as TMCItem[];
const today = new Date("2026-06-18");
const enriched = enrichTmcItems(items, today);

let tenders: Tender[] = [];
try {
  const tenderRaw = JSON.parse(readFileSync("./data/tender-import-default.json", "utf8"));
  tenders = tenderRaw.tenders ?? [];
} catch {
  tenders = [];
}

const rows = computeGprStageLagCauseAnalysis(gprMockData, enriched, tenders, 1, today);

console.log("=== Анализ причин отставания этапов ГПР ===");
console.log("Этапов:", rows.length);

console.log("\nВсе этапы (сортировка по отставанию):");
console.table(
  rows.map((row) => ({
    code: row.stageCode,
    lag: row.lagPp,
    plan: row.planPct,
    fact: row.factPct,
    cause: row.causeLabel,
    status: row.dependencyLabel,
    influence: row.influenceScore,
    contracts: row.unclosedContractCount,
    tmc: row.tmcDeficits.map((d) => `${d.material} ${d.remainingPercent}%`).join("; ") || "—",
  })),
);

const top3 = rows.filter((r) => r.lagPp > 0).slice(0, 3);
console.log("\n=== Примеры для 3 этапов с отставанием ===");
for (const row of top3) {
  const maxTmc = row.tmcDeficits[0]?.remainingPercent ?? 0;
  const influenceBreakdown = {
    lagPart: Math.round(Math.min(100, row.lagPp) * 0.45 * 10) / 10,
    tmcPart:
      row.tmcDeficits.length > 0
        ? Math.round(maxTmc * 0.4 * 10) / 10
        : 0,
    contractPart:
      row.unclosedContractCount > 0
        ? Math.round(Math.min(100, row.unclosedContractCount * 25) * 0.15 * 10) / 10
        : 0,
  };
  console.log({
    stage: `${row.stageCode} — ${row.stageTitle}`,
    plan: row.planPct,
    fact: row.factPct,
    deviation: row.deviationPct,
    lagPp: row.lagPp,
    cause: row.causeLabel,
    tmcDeficits: row.tmcDeficits,
    unclosedContracts: row.unclosedContractCount,
    dependencyStatus: row.dependencyLabel,
    statusColor: gprStageDependencyStatusColor(row.dependencyStatus),
    influenceScore: row.influenceScore,
    influenceBreakdown,
    recalculated: computeGprStageInfluenceScore(
      row.lagPp,
      maxTmc,
      row.unclosedContractCount,
      row.tmcDeficits.length > 0,
      row.unclosedContractCount > 0,
    ),
  });
}

console.log("\n=== Формула влияния ===");
console.log(
  "influence = min(lagPp, 100)×0.45 + (hasTmcDeficit ? maxTmcRemaining×0.40 : 0) + (hasContractGap ? min(100, contracts×25)×0.15 : 0)",
);
console.log("\n=== Правила причины ===");
console.log("lagPp ≤ 0 → причина не установлена");
console.log("lagPp > 0 + дефицит ТМЦ + договоры → обе причины");
console.log("lagPp > 0 + только дефицит ТМЦ → дефицит ТМЦ");
console.log("lagPp > 0 + только договоры → отсутствие договоров");
console.log("lagPp > 0 без ресурсов → причина не установлена");
console.log("\n=== Правила статуса ===");
console.log("Критичная: lag > 10 п.п. и (обе причины | max ТМЦ ≥ 50% | ≥ 2 договоров)");
console.log("Средняя: lag ≥ 5 п.п. и (обе причины | max ТМЦ ≥ 25% | ≥ 1 договор)");
console.log("Слабая: lag > 0 и подтверждённая причина, но ниже порогов");
console.log("Не подтверждено: нет отставания или нет подтверждённой причины");
