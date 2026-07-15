import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { importFinanceBudgetExecutionCsvFromRawRows } from "@/lib/financeBudgetExecutionCsvImport";
import {
  getEBIT,
  getEbitMargin,
  getExpenseBankPercent,
  getExpenses,
  getFinanceExecutionKpi,
  getFinanceExecutionPresentation,
  getProfitBeforeTax,
  getProfitMargin,
  getRevenue,
  getTurnover,
} from "@/lib/financeExecutionAnalytics";
import { parseFinanceCsvTextToRawRows } from "@/lib/financeCsvFormat";

function loadExecutionSnapshot() {
  const text = fs.readFileSync(
    path.join(process.cwd(), "data/finance-budget-execution-sample.csv"),
    "utf8",
  );
  const rawRows = parseFinanceCsvTextToRawRows(text);
  return importFinanceBudgetExecutionCsvFromRawRows(rawRows, "finance-budget-execution-sample.csv")
    .snapshot;
}

function testExecutionKpiFromCsv() {
  const input = { snapshot: loadExecutionSnapshot() };

  assert.equal(getRevenue(input), 1_530_105_630);
  assert.equal(getTurnover(input), 980_000_000);
  assert.equal(getExpenses(input), 1_180_000_000);
  assert.equal(getExpenseBankPercent(input), 77.12);
  assert.equal(getEBIT(input), 246_567_310);
  assert.equal(getEbitMargin(input), 16.11);
  assert.equal(getProfitBeforeTax(input), 198_450_000);
  assert.equal(getProfitMargin(input), 12.97);

  const kpi = getFinanceExecutionKpi(input);
  assert.equal(kpi.hasData, true);
  assert.equal(kpi.reportingDate, "15.01.2026");
}

function testExpensesSkipsLeadingZero() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["Затраты", "0", "1180000000"],
  ];
  const { snapshot } = importFinanceBudgetExecutionCsvFromRawRows(rawRows, "expenses-zero.csv");
  assert.equal(snapshot.kpi.expenses, 1_180_000_000);
}

function testBankPercentIgnoresAbsoluteSum() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["% (затраты, оплата банку)", "57817993", "77,12%"],
  ];
  const { snapshot } = importFinanceBudgetExecutionCsvFromRawRows(rawRows, "bank-percent.csv");
  assert.equal(snapshot.kpi.expenseBankPercent, 77.12);
}

function testPartialImportKeepsOtherKpi() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["Итого (доход)", "1000000"],
    ["EBIT", "200000"],
  ];
  const { snapshot, audit } = importFinanceBudgetExecutionCsvFromRawRows(rawRows, "partial.csv");

  assert.equal(snapshot.kpi.revenue, 1_000_000);
  assert.equal(snapshot.kpi.ebit, 200_000);
  assert.equal(snapshot.kpi.expenses, null);
  assert.ok(audit.foundMetrics >= 2);
  assert.ok(audit.missingMetrics.includes("Expenses"));
}

function testVerticalReportLayout() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["Итого (доход)"],
    ["1530105630"],
    ["EBIT"],
    ["246567310"],
  ];
  const { snapshot } = importFinanceBudgetExecutionCsvFromRawRows(rawRows, "vertical.csv");

  assert.equal(snapshot.kpi.revenue, 1_530_105_630);
  assert.equal(snapshot.kpi.ebit, 246_567_310);
}

function testExecutionChartsFromCsv() {
  const input = { snapshot: loadExecutionSnapshot() };
  const presentation = getFinanceExecutionPresentation(input);

  assert.equal(presentation.salesChart?.segments.length, 4);
  assert.equal(presentation.salesChart?.factTotalRub, 980_000_000);
  assert.equal(presentation.revenuePlanExecution.factRub, 980_000_000);
  assert.equal(presentation.revenuePlanExecution.planRub, 1_530_105_630);
  assert.equal(presentation.revenuePlanExecution.completionPct, 64);

  assert.equal(presentation.expenseChart?.segments.length, 4);
  assert.equal(presentation.expenseChart?.contractedTotalRub, 900_000_000);
  assert.equal(presentation.expenseChart?.projectTotalCostRub, 2_500_000_000);
  assert.equal(presentation.expenseBudgetUtilization.contractedRub, 900_000_000);
  assert.equal(presentation.expenseBudgetUtilization.projectTotalRub, 2_500_000_000);
  assert.equal(presentation.expenseBudgetUtilization.utilizationPct, 36);

  assert.equal(presentation.salesDonutSegments.length, 4);
  assert.equal(presentation.expenseDonutSegments.length, 4);
}

function testLoadPersistedSnapshotPreservesCharts() {
  const snapshot = loadExecutionSnapshot();
  assert.ok(snapshot.salesChart?.segments.length);
  assert.ok(snapshot.expenseChart?.segments.length);

  const reloaded = getFinanceExecutionPresentation({ snapshot });
  assert.equal(reloaded.salesDonutSegments.length, snapshot.salesChart?.segments.length);
  assert.equal(reloaded.expenseDonutSegments.length, snapshot.expenseChart?.segments.length);
}

function testObjectsProdazhiSalesSection() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["Итого (доход)", "1530105630"],
    ["Объекты продажи"],
    ["", "План", "Факт на текущую дату"],
    ["Квартиры", "920000000", "820000000"],
    ["Парковки", "75000000", "65000000"],
    ["Кладовые", "52000000", "48000000"],
    ["Административные помещения", "58000000", "47000000"],
  ];
  const { snapshot } = importFinanceBudgetExecutionCsvFromRawRows(rawRows, "objects-prodazhi.csv");
  assert.equal(snapshot.salesChart?.segments.length, 4);
  assert.equal(snapshot.salesChart?.factTotalRub, 980_000_000);
}

function main() {
  testExecutionKpiFromCsv();
  testExecutionChartsFromCsv();
  testLoadPersistedSnapshotPreservesCharts();
  testObjectsProdazhiSalesSection();
  testExpensesSkipsLeadingZero();
  testBankPercentIgnoresAbsoluteSum();
  testPartialImportKeepsOtherKpi();
  testVerticalReportLayout();
  console.log("[finance-execution-analytics] selftest OK");
}

main();
