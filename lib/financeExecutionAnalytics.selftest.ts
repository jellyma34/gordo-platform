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
import { parseFinanceExecutionSalesChart } from "@/lib/financeExecutionCsvCharts";

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
  assert.equal(presentation.salesChart?.factTotalRub, 350_152_513);
  assert.equal(presentation.revenuePlanExecution.factRub, 350_152_513);
  assert.equal(presentation.revenuePlanExecution.planRub, 1_530_105_630);
  assert.equal(presentation.revenuePlanExecution.completionPct, 22.9);

  assert.equal(presentation.expenseChart?.segments.length, 8);
  assert.equal(presentation.expenseChart?.contractedTotalRub, 577_888_241);
  assert.equal(presentation.expenseChart?.projectTotalCostRub, 1_341_356_313);
  assert.equal(presentation.expenseBudgetUtilization.contractedRub, 577_888_241);
  assert.equal(presentation.expenseBudgetUtilization.projectTotalRub, 1_341_356_313);
  assert.equal(presentation.expenseBudgetUtilization.utilizationPct, 43.1);

  assert.equal(presentation.salesDonutSegments.length, 4);
  assert.equal(presentation.expenseDonutSegments.length, 8);

  const adminSegment = presentation.salesChart?.segments.find((segment) => segment.id === "admin");
  assert.ok(adminSegment);
  assert.equal(adminSegment.legendLabel, "Адм. помещения");
  assert.equal(adminSegment.valueRub, 67_900_000);
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

function testAdminSalesLabelVariants() {
  const variants = [
    ["Адм. помещения", "58000000", "67900000"],
    ["Административные помещения", "58000000", "67900000"],
    ["Адм.помещения", "58000000", "67900000"],
    ["Административные", "58000000", "67900000"],
    ["Адм помещения", "58000000", "67900000"],
    ["Адм.", "58000000", "67900000"],
    ["Адм", "58000000", "67900000"],
  ];

  for (const [index, row] of variants.entries()) {
    const rawRows = [
      ["Исполнение бюджета"],
      ["Объекты продажи"],
      ["Наименование", "План", "Факт на текущую дату"],
      ["Квартиры", "920000000", "820000000"],
      row,
    ];
    const { snapshot } = importFinanceBudgetExecutionCsvFromRawRows(
      rawRows,
      `admin-variant-${index}.csv`,
    );
    const adminSegment = snapshot.salesChart?.segments.find(
      (segment) => segment.id === "admin",
    );
    assert.ok(adminSegment, `admin segment missing for variant ${index}: ${row[0]}`);
    assert.equal(adminSegment.label, "Административные помещения");
    assert.equal(adminSegment.legendLabel, "Адм. помещения");
    assert.equal(adminSegment.valueRub, 67_900_000);
  }
}

function testUstavFactSalesTableCombinedHeaderRow() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["Итого (доход)", "1530105630"],
    ["Объекты продажи", "Устав", "Факт на тек дату", "Откл.", "%"],
    ["Квартиры", "920000000", "261066059", "", ""],
    ["Парковки", "75000000", "18937554", "", ""],
    ["Кладовые", "52000000", "2248900", "", ""],
    ["Адм.помещения", "58000000", "67858100", "", ""],
    ["Итого (доход)", "1530105630", "350110613", "", "23%"],
  ];
  const { snapshot } = importFinanceBudgetExecutionCsvFromRawRows(
    rawRows,
    "ustav-fact-combined-header.csv",
  );

  assert.equal(snapshot.salesChart?.factTotalRub, 350_110_613);
  assert.equal(snapshot.salesChart?.segments.length, 4);
}

function testUstavFactSalesTableWithParkingQualifierAndCoverageStop() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["Итого (доход)", "1530105630"],
    ["Объекты продажи"],
    ["", "Устав", "Факт на тек дату", "Откл.", "%"],
    ["Квартиры", "920000000", "261066059", "", ""],
    ["Парковки (цена за шт)", "75000000", "18937554", "", ""],
    ["Кладовые", "52000000", "2248900", "", ""],
    ["Адм.помещения", "58000000", "67858100", "", ""],
    ["Итого (доход)", "1530105630", "350110613", "", "23%"],
    ["Средний % покрытия", "", "", "", "23%"],
    ["Общая стоимость проекта (планируем потратить)"],
  ];
  const { snapshot } = importFinanceBudgetExecutionCsvFromRawRows(
    rawRows,
    "ustav-fact-coverage-stop.csv",
  );
  const presentation = getFinanceExecutionPresentation({ snapshot });

  assert.equal(snapshot.salesChart?.segments.length, 4);
  assert.equal(snapshot.salesChart?.factTotalRub, 350_110_613);
  assert.equal(presentation.revenuePlanExecution.factRub, 350_110_613);
  assert.equal(presentation.revenuePlanExecution.completionPct, 22.9);

  const parking = snapshot.salesChart?.segments.find((segment) => segment.id === "parking");
  assert.ok(parking);
  assert.equal(parking.valueRub, 18_937_554);
}

function testUstavFactSalesTableWithoutHeaderRow() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["Итого (доход)", "1530105630"],
    ["Объекты продажи"],
    ["", "Устав", "Факт на тек дату", "Откл.", "%"],
    ["Квартиры", "920000000", "261066059"],
    ["Парковки", "75000000", "18937554"],
    ["Кладовые", "52000000", "2248900"],
    ["Адм.помещения", "58000000", "67858100"],
    ["Итого (доход)", "1530105630", "350110613", "", "23%"],
  ];
  const { snapshot } = importFinanceBudgetExecutionCsvFromRawRows(
    rawRows,
    "ustav-fact-no-header.csv",
  );

  assert.equal(snapshot.salesChart?.factTotalRub, 350_110_613);
  assert.equal(snapshot.salesChart?.segments.length, 4);
}

function testUstavFactSalesTableLayout() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["Итого (доход)", "1530105630"],
    ["Объекты продажи"],
    ["", "Устав", "Факт на тек дату", "Откл.", "%"],
    ["Квартиры", "920000000", "261066059", "", ""],
    ["Парковки", "75000000", "18937554", "", ""],
    ["Кладовые", "52000000", "2248900", "", ""],
    ["Адм.помещения", "58000000", "67858100", "", ""],
    ["Итого (доход)", "1530105630", "350110613", "", "23%"],
  ];
  const { snapshot } = importFinanceBudgetExecutionCsvFromRawRows(rawRows, "ustav-fact-sales.csv");
  const presentation = getFinanceExecutionPresentation({ snapshot });

  assert.equal(snapshot.salesChart?.segments.length, 4);
  assert.equal(snapshot.salesChart?.factTotalRub, 350_110_613);
  assert.equal(presentation.revenuePlanExecution.factRub, 350_110_613);
  assert.equal(presentation.revenuePlanExecution.planRub, 1_530_105_630);
  assert.equal(presentation.revenuePlanExecution.completionPct, 22.9);

  const adminSegment = snapshot.salesChart?.segments.find((segment) => segment.id === "admin");
  assert.ok(adminSegment);
  assert.equal(adminSegment.valueRub, 67_858_100);
  assert.equal(adminSegment.legendLabel, "Адм. помещения");
}

function testPlanFactSalesTableLayout() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["Объекты продажи"],
    ["Наименование", "План", "Факт на тек дату", "Откл.", "%"],
    ["Квартиры", "920000000", "261066059", "", ""],
    ["Парковки", "75000000", "18937554", "", ""],
    ["Кладовые", "52000000", "2248900", "", ""],
    ["Адм.помещения", "58000000", "67858100", "", ""],
    ["Итого (доход)", "1530105630", "350110613", "", "23%"],
  ];
  const chart = parseFinanceExecutionSalesChart(rawRows);

  assert.ok(chart);
  assert.equal(chart?.factTotalRub, 350_110_613);
  assert.equal(chart?.segments.length, 4);
  assert.equal(chart?.segments.find((s) => s.id === "apartments")?.valueRub, 261_066_059);
  assert.equal(chart?.segments.find((s) => s.id === "parking")?.valueRub, 18_937_554);
  assert.equal(chart?.segments.find((s) => s.id === "storage")?.valueRub, 2_248_900);
  assert.equal(chart?.segments.find((s) => s.id === "admin")?.valueRub, 67_858_100);
  assert.equal(chart?.segments.find((s) => s.id === "apartments")?.planRub, 920_000_000);
}

function testCategoryPlanExecutionPercents() {
  const rawRows = [
    ["Объекты продажи"],
    ["Наименование", "План", "Факт на тек дату"],
    ["Квартиры", "1242221080", "261066059"],
    ["Парковки", "181408900", "18937554"],
    ["Кладовые", "24441250", "2248900"],
    ["Адм.помещения", "82034400", "67858100"],
    ["Итого (доход)", "1530105630", "350110613"],
  ];
  const chart = parseFinanceExecutionSalesChart(rawRows);

  assert.ok(chart);
  const apartments = chart?.segments.find((s) => s.id === "apartments");
  const parking = chart?.segments.find((s) => s.id === "parking");
  const storage = chart?.segments.find((s) => s.id === "storage");
  const admin = chart?.segments.find((s) => s.id === "admin");

  assert.equal(apartments?.planRub, 1_242_221_080);
  assert.equal(parking?.planRub, 181_408_900);
  assert.equal(storage?.planRub, 24_441_250);
  assert.equal(admin?.planRub, 82_034_400);

  const pct = (fact: number, plan: number) => Math.round((fact / plan) * 1000) / 10;
  assert.equal(pct(apartments!.valueRub, apartments!.planRub!), 21);
  assert.equal(pct(parking!.valueRub, parking!.planRub!), 10.4);
  assert.equal(pct(storage!.valueRub, storage!.planRub!), 9.2);
  assert.equal(pct(admin!.valueRub, admin!.planRub!), 82.7);
}

function testDynamicSalesCategoryFromCsv() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["Объекты продажи"],
    ["Наименование", "План", "Факт на текущую дату"],
    ["Квартиры", "920000000", "820000000"],
    ["Парковки", "75000000", "65000000"],
    ["Кладовые", "52000000", "48000000"],
    ["Адм. помещения", "58000000", "67900000"],
    ["Коммерция", "12000000", "15000000"],
  ];
  const { snapshot } = importFinanceBudgetExecutionCsvFromRawRows(rawRows, "dynamic-sales.csv");

  assert.equal(snapshot.salesChart?.segments.length, 4);
  assert.equal(snapshot.salesChart?.factTotalRub, 1_000_900_000);

  const labels = snapshot.salesChart?.segments.map(
    (segment) => segment.legendLabel ?? segment.label,
  );
  assert.deepEqual(labels, ["Квартиры", "Парковки", "Кладовые", "Адм. помещения"]);
}

function testProjectCostExpenseTable() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["Общая стоимость проекта (планируем потратить)"],
    ["Наименование", "План", "Законтрактовано", "Освоено"],
    ["Земельный участок", "100", "80", "50"],
    ["Строительство", "200", "120", "90"],
    ["Итого", "300", "200", "140"],
  ];
  const { snapshot } = importFinanceBudgetExecutionCsvFromRawRows(rawRows, "project-cost.csv");
  assert.equal(snapshot.expenseChart?.segments.length, 2);
  assert.equal(snapshot.expenseChart?.contractedTotalRub, 200);
  assert.equal(snapshot.expenseChart?.projectTotalCostRub, 300);
}

function main() {
  testExecutionKpiFromCsv();
  testExecutionChartsFromCsv();
  testLoadPersistedSnapshotPreservesCharts();
  testObjectsProdazhiSalesSection();
  testUstavFactSalesTableLayout();
  testUstavFactSalesTableCombinedHeaderRow();
  testUstavFactSalesTableWithoutHeaderRow();
  testUstavFactSalesTableWithParkingQualifierAndCoverageStop();
  testAdminSalesLabelVariants();
  testPlanFactSalesTableLayout();
  testCategoryPlanExecutionPercents();
  testDynamicSalesCategoryFromCsv();
  testProjectCostExpenseTable();
  testExpensesSkipsLeadingZero();
  testBankPercentIgnoresAbsoluteSum();
  testPartialImportKeepsOtherKpi();
  testVerticalReportLayout();
  console.log("[finance-execution-analytics] selftest OK");
}

main();
