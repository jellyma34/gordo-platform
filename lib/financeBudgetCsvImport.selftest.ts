import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  detectFinanceBudgetHeaderRowIndex,
  importFinanceBudgetCsvFromRawRows,
  isTechnicalFinanceBudgetCode,
  isValidFinanceBudgetArticleCode,
} from "@/lib/financeBudgetCsvImport";
import { importFinanceBudgetExecutionCsvFromRawRows } from "@/lib/financeBudgetExecutionCsvImport";
import { detectFinanceCsvFormat, importFinanceCsv } from "@/lib/financeCsvImport";
import { parseFinanceCsvTextToRawRows } from "@/lib/financeCsvFormat";

async function parseCsvFile(relativePath: string) {
  const fullPath = path.join(process.cwd(), relativePath);
  const text = fs.readFileSync(fullPath, "utf8");
  const file = new File([text], path.basename(fullPath), { type: "text/csv" });
  return importFinanceCsv(file);
}

function testHeaderDetection() {
  const rawRows = [
    ["Бюджет проекта", "Версия 2026"],
    ["", "", ""],
    ["Код", "Статьи бюджета", "Версия на", "2025-07"],
    ["1.", "Поступления", "100", "0"],
  ];
  assert.equal(detectFinanceBudgetHeaderRowIndex(rawRows), 2);
  assert.equal(detectFinanceCsvFormat(rawRows), "budget");
}

function testExecutionFormatDetection() {
  const rawRows = [
    ["Исполнение бюджета"],
    ["отчетная дата", "15.01.2026"],
    ["Объекты продажи"],
    ["План", "100", "80"],
  ];
  assert.equal(detectFinanceCsvFormat(rawRows), "budget_execution");
}

function testUnknownFormatDetection() {
  const rawRows = [
    ["Произвольный отчет"],
    ["Колонка A", "Колонка B"],
    ["1", "2"],
  ];
  assert.equal(detectFinanceCsvFormat(rawRows), "unknown");
}

function testCodeValidation() {
  assert.equal(isTechnicalFinanceBudgetCode("вне банка"), true);
  assert.equal(isTechnicalFinanceBudgetCode("разные"), true);
  assert.equal(isValidFinanceBudgetArticleCode("1."), true);
  assert.equal(isValidFinanceBudgetArticleCode("1.01.01."), true);
  assert.equal(isValidFinanceBudgetArticleCode("2.02."), true);
  assert.equal(isValidFinanceBudgetArticleCode("вне банка"), false);
  assert.equal(isValidFinanceBudgetArticleCode("разные"), false);
}

async function testSampleImport() {
  const result = await parseCsvFile("data/finance-budget-sample.csv");
  assert.equal(result.format, "budget");
  if (result.format !== "budget") return;

  const { lines, audit } = result;
  assert.equal(audit.headerRowIndex, 2);
  assert.ok(lines.length >= 6);
  assert.equal(lines[0]?.code, "1.");
  assert.equal(lines[1]?.code, "1.01.");
  assert.equal(lines[2]?.code, "1.01.01.");
  assert.equal(lines[3]?.code, "2.");
  assert.ok(!lines.some((line) => isTechnicalFinanceBudgetCode(line.code)));
}

async function testExecutionSampleImport() {
  const result = await parseCsvFile("data/finance-budget-execution-sample.csv");
  assert.equal(result.format, "budget_execution");
  if (result.format !== "budget_execution") return;

  assert.equal(result.snapshot.kpi.revenue, 1_530_105_630);
  assert.equal(result.audit.foundMetrics, 8);
}

function testBudgetParserRejectsExecutionFormat() {
  const text = fs.readFileSync(
    path.join(process.cwd(), "data/finance-budget-execution-sample.csv"),
    "utf8",
  );
  const rawRows = parseFinanceCsvTextToRawRows(text);
  const budgetResult = importFinanceBudgetCsvFromRawRows(rawRows, "execution.csv");
  assert.equal(budgetResult.lines.length, 0);
  assert.ok(
    budgetResult.audit.skippedRows[0]?.reason.includes("Код") ||
      budgetResult.audit.skippedRows[0]?.reason.includes("Статьи бюджета"),
  );
}

function testExecutionParserAcceptsExecutionFormat() {
  const text = fs.readFileSync(
    path.join(process.cwd(), "data/finance-budget-execution-sample.csv"),
    "utf8",
  );
  const rawRows = parseFinanceCsvTextToRawRows(text);
  const { audit, snapshot } = importFinanceBudgetExecutionCsvFromRawRows(rawRows, "execution.csv");
  assert.equal(audit.foundMetrics, 8);
  assert.equal(snapshot.kpi.expenses, 1_180_000_000);
  assert.equal(snapshot.kpi.expenseBankPercent, 77.12);
}

async function main() {
  testHeaderDetection();
  testExecutionFormatDetection();
  testUnknownFormatDetection();
  testCodeValidation();
  testBudgetParserRejectsExecutionFormat();
  testExecutionParserAcceptsExecutionFormat();
  await testSampleImport();
  await testExecutionSampleImport();
  console.log("[finance-csv] selftest OK");
}

void main();
