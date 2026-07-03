/**
 * Полная диагностика цепочки KPI ТМЦ: CSV → parser → normalizer → model → KPI → UI.
 * Запуск: npx tsx scripts/tmc-kpi-full-diagnostic.ts [path/to/Тмц_Май.csv]
 */
import fs from "fs";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import {
  buildTmcColumnMap,
  cleanNumber,
  describeTmcColumnMap,
  detectTripletMetricLayout,
  isValidTmcRow,
  normalizeTmcCsvRows,
  parseImportNumber,
  parseTmcCsvText,
} from "../lib/tmcCsvImport";
import type { TMCItem } from "../lib/tmcData";
import {
  buildTmcMonthlyRequestSeries,
  classifyTmcPipelineStatus,
  computeTmcDeliveryPipelineCounts,
  computeTmcKpiDonutDistributions,
  computeTmcProcurementFinancialResult,
  computeTmcProcurementKpi,
  computeTmcPurchasedDeliveryDonutCounts,
  enrichTmcItems,
  getTmcRequestChartFactCumulative,
  isTmcDeliveredSupplyStatus,
  isTmcPurchasedPosition,
} from "../lib/tmcPresentationAnalytics";

const csvPath =
  process.argv[2] ?? "C:\\Users\\m.suslova\\Downloads\\Тмц_Май.csv";

if (!fs.existsSync(csvPath)) {
  console.error("CSV not found:", csvPath);
  process.exit(1);
}

const buf = fs.readFileSync(csvPath);
const text = decodeCsvBytesWithBestEncoding(new Uint8Array(buf));
const physicalLines = text.split(/\r?\n/).filter((l) => l.trim() !== "").length;

const parsed = parseTmcCsvText(text);
const { rows: parserRows, headers } = parsed;
const metric = detectTripletMetricLayout(headers);
const colMap = buildTmcColumnMap(headers);

// Отчётная дата из CSV (строка 3)
const reportDateMatch = text.match(/отчетная дата:\s*;?\s*([\d.]+)/i);
const reportDateIso = reportDateMatch
  ? (() => {
      const m = reportDateMatch[1]!.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (!m) return null;
      return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    })()
  : null;
const today = reportDateIso
  ? new Date(`${reportDateIso}T12:00:00`)
  : new Date("2026-05-31T12:00:00");

type Exclusion = { rowIndex: number; name: string; reason: string; preview: string };

function rowPreview(row: Record<string, unknown>): string {
  const nameKey = headers.find((h) => h.toLowerCase().includes("наименование")) ?? headers[2] ?? "";
  return String(row[nameKey] ?? "").slice(0, 60);
}

// --- Normalizer exclusions (mirror normalizeTmcCsvRows) ---
const exclusions: Exclusion[] = [];
let leadingDropped = 0;
let i = 0;
while (i < parserRows.length && i < 5 && !isValidTmcRow(parserRows[i]!)) {
  exclusions.push({
    rowIndex: i,
    name: rowPreview(parserRows[i]!),
    reason: "dropLeadingJunkRows: не isValidTmcRow в начале файла",
    preview: JSON.stringify(parserRows[i]).slice(0, 120),
  });
  leadingDropped += 1;
  i += 1;
}
const afterLeading = parserRows.slice(leadingDropped);

// carry-forward resolution + usable filter
const normalizedItems = normalizeTmcCsvRows(parserRows, headers);

// Re-walk for per-row exclusion after carry-forward (approximate)
const junkAfterParse: Exclusion[] = [];
for (let ri = 0; ri < afterLeading.length; ri += 1) {
  const row = afterLeading[ri]!;
  const name = rowPreview(row);
  if (!name.trim()) {
    junkAfterParse.push({
      rowIndex: ri + leadingDropped,
      name: "(пустое наименование после carry-forward)",
      reason: "normalize: !name.trim()",
      preview: rowPreview(row),
    });
    continue;
  }
  // isJunkTmcLabel is private — check via isValidTmcRow on raw row name
  if (!isValidTmcRow(row)) {
    junkAfterParse.push({
      rowIndex: ri + leadingDropped,
      name,
      reason: "normalize: isJunkTmcLabel / isValidTmcRow=false",
      preview: name,
    });
  }
}

// JSON model (UI persistence)
let jsonItems: TMCItem[] = [];
const jsonPath = "data/tmc-import-default.json";
if (fs.existsSync(jsonPath)) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { items: TMCItem[] };
  jsonItems = raw.items ?? [];
}

const enrichedFromCsv = enrichTmcItems(normalizedItems, today);
const enrichedFromJson = enrichTmcItems(jsonItems, today);
const tenders: never[] = [];

const kpiCsv = computeTmcProcurementKpi(enrichedFromCsv, today, tenders);
const kpiJson = computeTmcProcurementKpi(enrichedFromJson, today, tenders);
const finCsv = computeTmcProcurementFinancialResult(enrichedFromCsv);
const finJson = computeTmcProcurementFinancialResult(enrichedFromJson);

const requestSeries = buildTmcMonthlyRequestSeries(enrichedFromCsv, today);
const requestContractFactCount = getTmcRequestChartFactCumulative(requestSeries, today);

const deliveryPipeline = computeTmcDeliveryPipelineCounts(enrichedFromCsv);
const purchasedDonut = computeTmcPurchasedDeliveryDonutCounts(enrichedFromCsv);
const donuts = computeTmcKpiDonutDistributions(enrichedFromCsv, {}, today, tenders);

const receiptCostExecutionPct =
  kpiCsv.receiptsPlanRub > 0
    ? Math.round((kpiCsv.receiptsFactRub / kpiCsv.receiptsPlanRub) * 1000) / 10
    : 0;

// CSV raw sums (plan/fact cost columns via triplet if possible)
let csvRawPlanCostSum = 0;
let csvRawFactCostSum = 0;
let csvRowsWithCost = 0;
for (const row of afterLeading) {
  if (!isValidTmcRow(row)) continue;
  const costPlanIdx = colMap.costPlan;
  const costFactIdx = colMap.costFact;
  if (costPlanIdx >= 0) {
    const h = headers[costPlanIdx];
    const v = parseImportNumber(row[h ?? ""]);
    if (v != null) {
      csvRawPlanCostSum += v;
      csvRowsWithCost += 1;
    }
  }
  if (costFactIdx >= 0) {
    const h = headers[costFactIdx];
    const v = parseImportNumber(row[h ?? ""]);
    if (v != null) csvRawFactCostSum += v;
  }
}

function sumField(items: TMCItem[], pick: (i: TMCItem) => number | null | undefined): number {
  return items.reduce((s, i) => s + (pick(i) ?? 0), 0);
}

console.log("=".repeat(72));
console.log("TMC KPI FULL DIAGNOSTIC");
console.log("CSV:", csvPath);
console.log("Report date (from CSV):", reportDateIso ?? "not found", "→ today:", today.toISOString().slice(0, 10));
console.log("=".repeat(72));

console.log("\n## PIPELINE COUNTS\n");
console.table([
  {
    Stage: "CSV physical lines (non-empty)",
    Count: physicalLines,
    "Σ planCost": "—",
    "Σ factCost": "—",
  },
  {
    Stage: "Parser (parseTmcCsvText objects)",
    Count: parserRows.length,
    "Σ planCost": "—",
    "Σ factCost": "—",
  },
  {
    Stage: "After dropLeadingJunkRows",
    Count: afterLeading.length,
    "Σ planCost": "—",
    "Σ factCost": "—",
  },
  {
    Stage: "Normalizer (normalizeTmcCsvRows)",
    Count: normalizedItems.length,
    "Σ planCost": sumField(normalizedItems, (i) => i.planCost),
    "Σ factCost": sumField(normalizedItems, (i) => i.factCost),
  },
  {
    Stage: "JSON model (tmc-import-default.json)",
    Count: jsonItems.length,
    "Σ planCost": sumField(jsonItems, (i) => i.planCost),
    "Σ factCost": sumField(jsonItems, (i) => i.factCost),
  },
  {
    Stage: "Enriched (from CSV)",
    Count: enrichedFromCsv.length,
    "Σ planCost": sumField(enrichedFromCsv, (i) => i.planCost),
    "Σ factCost": sumField(enrichedFromCsv, (i) => i.factCost),
  },
]);

console.log("\nParser layout:", metric.layout, "| tripletStart:", metric.tripletStart);
console.log("Column map:", describeTmcColumnMap(headers, colMap));

console.log("\n## EXCLUSIONS\n");
console.log("Leading junk dropped:", leadingDropped);
if (exclusions.length) console.table(exclusions);
console.log("Post-parse junk/empty:", junkAfterParse.length);
if (junkAfterParse.length) console.table(junkAfterParse.slice(0, 30));
if (junkAfterParse.length > 30) console.log(`... and ${junkAfterParse.length - 30} more`);

const parserMinusNorm = afterLeading.filter(isValidTmcRow).length - normalizedItems.length;
if (parserMinusNorm !== 0) {
  console.log("\n⚠ Parser valid rows vs normalized:", parserMinusNorm, "difference (carry-forward merges empty names into previous)");
}

console.log("\n## KPI: CSV chain vs JSON model vs UI mapping\n");
const kpiRows = [
  {
    KPI: "Поставлено (deliveryCount)",
    "CSV→Model": kpiCsv.deliveryCount,
    "JSON model": kpiJson.deliveryCount,
    "UI field": "kpi.deliveryCount",
    Note: "computeTmcPipelineStatusDistribution.deliveredCount",
  },
  {
    KPI: "Закуплено по договору",
    "CSV→Model": requestContractFactCount,
    "JSON model": getTmcRequestChartFactCumulative(
      buildTmcMonthlyRequestSeries(enrichedFromJson, today),
      today,
    ),
    "UI field": "requestContractFactCount",
    Note: "cumulative contractFactDate count ≤ report month",
  },
  {
    KPI: "Закуплено (purchasedItemCount)",
    "CSV→Model": kpiCsv.purchasedItemCount,
    "JSON model": kpiJson.purchasedItemCount,
    "UI field": "kpi.purchasedItemCount",
    Note: "isTmcPurchasedPosition",
  },
  {
    KPI: "В работе (inProgress remaining)",
    "CSV→Model": kpiCsv.inProgressAmongRemainingCount,
    "JSON model": kpiJson.inProgressAmongRemainingCount,
    "UI field": "kpi.inProgressAmongRemainingCount",
    Note: "pipeline remainder",
  },
  {
    KPI: "Не закуплено",
    "CSV→Model": kpiCsv.notPurchasedAmongRemainingCount,
    "JSON model": kpiJson.notPurchasedAmongRemainingCount,
    "UI field": "kpi.notPurchasedAmongRemainingCount",
    Note: "",
  },
  {
    KPI: "Потрачено (ПОТРАЧЕНО)",
    "CSV→Model": finCsv.purchasedFactRub,
    "JSON model": finJson.purchasedFactRub,
    "UI field": "financialResult.purchasedFactRub",
    Note: "computeTmcProcurementFinancialResult",
  },
  {
    KPI: "Экономия",
    "CSV→Model": finCsv.economyRub,
    "JSON model": finJson.economyRub,
    "UI field": "financialResult.economyRub",
    Note: "",
  },
  {
    KPI: "Перерасход",
    "CSV→Model": finCsv.overrunRub,
    "JSON model": finJson.overrunRub,
    "UI field": "financialResult.overrunRub",
    Note: "",
  },
  {
    KPI: "Средняя просрочка",
    "CSV→Model": kpiCsv.averageOverdueDays,
    "JSON model": kpiJson.averageOverdueDays,
    "UI field": "kpi.averageOverdueDays",
    Note: "deliveryOverdue only",
  },
  {
    KPI: "Освоение бюджета %",
    "CSV→Model": receiptCostExecutionPct,
    "JSON model":
      kpiJson.receiptsPlanRub > 0
        ? Math.round((kpiJson.receiptsFactRub / kpiJson.receiptsPlanRub) * 1000) / 10
        : 0,
    "UI field": "receiptCostExecutionPct",
    Note: "receiptsFact/receiptsPlan delivered items",
  },
  {
    KPI: "Всего позиций",
    "CSV→Model": kpiCsv.totalItemCount,
    "JSON model": kpiJson.totalItemCount,
    "UI field": "kpi.totalItemCount",
    Note: "",
  },
  {
    KPI: "Фактическая стоимость поставок ₽",
    "CSV→Model": kpiCsv.receiptsFactRub,
    "JSON model": kpiJson.receiptsFactRub,
    "UI field": "kpi.receiptsFactRub",
    Note: "",
  },
];
console.table(kpiRows);

console.log("\n## DONUTS (from CSV chain)\n");
console.log("Delivery pipeline:", deliveryPipeline);
console.log("Purchased delivery donut:", purchasedDonut);
console.log(
  "KPI donut segments:",
  Object.fromEntries(
    Object.entries(donuts).map(([k, v]) => [k, v.map((s) => ({ label: s.label, value: s.value }))]),
  ),
);

console.log("\n## FIRST DIVERGENCE CHECK\n");
const divergences: string[] = [];
if (normalizedItems.length !== jsonItems.length) {
  divergences.push(
    `COUNT: normalizer=${normalizedItems.length} vs JSON model=${jsonItems.length} (Δ${jsonItems.length - normalizedItems.length})`,
  );
}
const normPlan = sumField(normalizedItems, (i) => i.planCost);
const jsonPlan = sumField(jsonItems, (i) => i.planCost);
if (Math.abs(normPlan - jsonPlan) > 0.01) {
  divergences.push(`Σ planCost: CSV normalizer=${normPlan} vs JSON=${jsonPlan} (Δ${jsonPlan - normPlan})`);
}
const normFact = sumField(normalizedItems, (i) => i.factCost ?? 0);
const jsonFact = sumField(jsonItems, (i) => i.factCost ?? 0);
if (Math.abs(normFact - jsonFact) > 0.01) {
  divergences.push(`Σ factCost: CSV normalizer=${normFact} vs JSON=${jsonFact} (Δ${jsonFact - normFact})`);
}
for (const row of kpiRows) {
  if (row["CSV→Model"] !== row["JSON model"]) {
    divergences.push(`${row.KPI}: CSV=${row["CSV→Model"]} vs JSON=${row["JSON model"]}`);
  }
}

if (divergences.length === 0) {
  console.log("CSV normalizer and JSON model produce identical KPI values at report date.");
} else {
  console.log("DIVERGENCES FOUND (first stage is top):");
  divergences.forEach((d, n) => console.log(`${n + 1}. ${d}`));
}

// Item-level diff CSV vs JSON by itemCode+name
if (normalizedItems.length !== jsonItems.length) {
  const csvKeys = new Set(normalizedItems.map((i) => `${i.itemCode}::${i.name}`));
  const jsonKeys = new Set(jsonItems.map((i) => `${i.itemCode}::${i.name}`));
  const onlyCsv = normalizedItems.filter((i) => !jsonKeys.has(`${i.itemCode}::${i.name}`));
  const onlyJson = jsonItems.filter((i) => !csvKeys.has(`${i.itemCode}::${i.name}`));
  console.log("\n## ROWS ONLY IN CSV NORMALIZER:", onlyCsv.length);
  if (onlyCsv.length) console.table(onlyCsv.slice(0, 20).map((i) => ({ code: i.itemCode, name: i.name })));
  console.log("\n## ROWS ONLY IN JSON MODEL:", onlyJson.length);
  if (onlyJson.length) console.table(onlyJson.slice(0, 20).map((i) => ({ code: i.itemCode, name: i.name })));
}

console.log("\n## UI NOTE\n");
console.log(
  "TmcPresentation uses today = new Date() at runtime, NOT report date from CSV.",
  "Diagnostic KPI above uses report date",
  today.toISOString().slice(0, 10),
  "from CSV.",
);
console.log("Runtime today (Jul 3 2026) may shift overdue/remaining KPI vs May report.");

console.log("\n[done]");
