/**
 * Трассировка KPI-карточек UI vs модель (без исправлений).
 * npx tsx scripts/tmc-kpi-ui-trace.ts
 */
import fs from "fs";

import type { TMCItem } from "../lib/tmcData";
import {
  alignTmcMonthlySeriesToTimeline,
  buildTmcMonthlyProcurementSeries,
  buildTmcMonthlyRequestSeries,
  computeTmcProcurementFinancialResult,
  computeTmcProcurementKpi,
  countTmcRequestFactsThroughToday,
  enrichTmcItems,
  fillTmcMonthlyProcurementTimeline,
  getTmcRequestChartFactCumulative,
  isTmcRequestFactThroughToday,
} from "../lib/tmcPresentationAnalytics";
import { tmcItemFactCostRub } from "../lib/tmcPresentationAnalytics";

const jsonPath = "data/tmc-import-default.json";
const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { items: TMCItem[] };
const allItems = raw.items ?? [];

const today = new Date(); // как в TmcPresentation: useMemo(() => new Date(), [])
const todayIso = today.toISOString().slice(0, 10);

function simulateUiPath(items: TMCItem[], label: string) {
  const enriched = enrichTmcItems(items, today);
  const kpi = computeTmcProcurementKpi(enriched, today, []);
  const fin = computeTmcProcurementFinancialResult(enriched);

  const monthlySeries = buildTmcMonthlyProcurementSeries(enriched, today, "cost");
  const chartTimeline = fillTmcMonthlyProcurementTimeline(monthlySeries, today);
  const requestSeries = buildTmcMonthlyRequestSeries(enriched, today);
  const requestTimeline =
    chartTimeline.length > 0
      ? alignTmcMonthlySeriesToTimeline(requestSeries, chartTimeline, today)
      : fillTmcMonthlyProcurementTimeline(requestSeries, today);

  const modelCount = countTmcRequestFactsThroughToday(enriched, today);
  const rawSeriesCount = getTmcRequestChartFactCumulative(requestSeries, today);
  const uiCardCount = getTmcRequestChartFactCumulative(requestTimeline, today);

  const receiptCostExecutionPct =
    kpi.receiptsPlanRub > 0
      ? Math.round((kpi.receiptsFactRub / kpi.receiptsPlanRub) * 1000) / 10
      : 0;

  console.log(`\n${"=".repeat(60)}\nSCOPE: ${label} (${items.length} items)\n${"=".repeat(60)}`);
  console.log({
    today: todayIso,
    procurementSeriesMonths: monthlySeries.length,
    chartTimelineMonths: chartTimeline.length,
    requestSeriesMonths: requestSeries.length,
    requestTimelineMonths: requestTimeline.length,
    procurementLastMonth: chartTimeline.at(-1)?.iso?.slice(0, 7),
    requestSeriesLastMonth: requestSeries.at(-1)?.iso?.slice(0, 7),
  });

  console.log("\n## Закуплено по договору — все реализации");
  console.table([
    {
      impl: "countTmcRequestFactsThroughToday (модель)",
      value: modelCount,
      file: "lib/tmcPresentationAnalytics.ts",
      fn: "countTmcRequestFactsThroughToday",
    },
    {
      impl: "getTmcRequestChartFactCumulative(requestSeries)",
      value: rawSeriesCount,
      file: "lib/tmcPresentationAnalytics.ts",
      fn: "getTmcRequestChartFactCumulative",
    },
    {
      impl: "getTmcRequestChartFactCumulative(requestTimeline) ← UI",
      value: uiCardCount,
      file: "components/tmc/TmcPresentation.tsx:795-797",
      fn: "requestContractFactCount useMemo",
    },
    {
      impl: "computeTmcRequestDynamicsKpi.submittedFactCount",
      value: enriched.filter((i) => isTmcRequestFactThroughToday(i, today)).length,
      file: "lib/tmcPresentationAnalytics.ts",
      fn: "isTmcRequestFactThroughToday",
    },
  ]);

  if (modelCount !== uiCardCount) {
    console.log("\n⚠ РАСХОЖДЕНИЕ model vs UI card:", modelCount, "→", uiCardCount);
    const missing = enriched.filter(
      (i) =>
        isTmcRequestFactThroughToday(i, today) &&
        !requestTimeline.some((p) => {
          const mk = i.contractFactDate!.slice(0, 7);
          return p.iso.slice(0, 7) === mk && (p.factMln ?? 0) > 0;
        }),
    );
    console.log("Позиции в модели, но месяц отсутствует/нулевой на requestTimeline:");
    console.table(
      missing.map((i) => ({
        code: i.itemCode,
        name: i.name.slice(0, 50),
        contractFactDate: i.contractFactDate,
        factCost: i.factCost,
        tmcItemFactCostRub: tmcItemFactCostRub(i),
        monthOnChart: chartTimeline.some(
          (p) => p.iso.slice(0, 7) === i.contractFactDate!.slice(0, 7),
        ),
      })),
    );
  }

  console.log("\n## Все KPI-карточки (model → UI field)");
  console.table([
    { KPI: "Поставлено", model: kpi.deliveryCount, ui: "kpi.deliveryCount", match: true },
    {
      KPI: "Закуплено по договору",
      model: modelCount,
      ui: uiCardCount,
      match: modelCount === uiCardCount,
    },
    {
      KPI: "В работе (заголовок)",
      model: kpi.overdueAmongRemainingCount,
      ui: "kpi.overdueAmongRemainingCount (НЕ inProgress!)",
      match: true,
    },
    {
      KPI: "Не закуплено",
      model: kpi.notPurchasedAmongRemainingCount,
      ui: "kpi.notPurchasedAmongRemainingCount",
      match: true,
    },
    { KPI: "Потрачено", model: fin.purchasedFactRub, ui: "financialResult.purchasedFactRub", match: true },
    { KPI: "Экономия", model: fin.economyRub, ui: "financialResult.economyRub", match: true },
    { KPI: "Перерасход", model: fin.overrunRub, ui: "financialResult.overrunRub", match: true },
    {
      KPI: "Средняя просрочка (карточка 2)",
      model: kpi.averageOverdueDays,
      ui: "kpi.averageOverdueDays",
      match: true,
    },
    {
      KPI: "Освоение бюджета",
      model: receiptCostExecutionPct,
      ui: "receiptCostExecutionPct (local calc)",
      match: true,
    },
  ]);
}

// project scope
simulateUiPath(allItems, "project (all parts)");

// residential only
const residential = allItems.filter((i) => i.projectPart === "residential");
simulateUiPath(residential, "residential (Жилой дом)");

// parking
const parking = allItems.filter((i) => i.projectPart === "parking");
if (parking.length) simulateUiPath(parking, "parking");

// Items with contractFactDate but zero fact cost
const zeroCostFacts = allItems.filter((i) => {
  const d = i.contractFactDate?.trim();
  return d && d <= todayIso && tmcItemFactCostRub(i) === 0;
});
console.log("\n## Позиции: contractFactDate ≤ today, factCostRub = 0:", zeroCostFacts.length);
if (zeroCostFacts.length) {
  console.table(
    zeroCostFacts.map((i) => ({
      code: i.itemCode,
      name: i.name.slice(0, 45),
      contractFactDate: i.contractFactDate,
      factCost: i.factCost,
    })),
  );
}
