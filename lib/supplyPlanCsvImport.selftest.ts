import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  detectSupplyPlanHeaderRowIndex,
  normalizeSupplyPlanCsvRows,
  parseSupplyPlanCsvText,
} from "./supplyPlanCsvImport";

const samplePath = resolve(__dirname, "../data/supply-plan-gpr-sample.csv");
const text = readFileSync(samplePath, "utf8");
const parsed = parseSupplyPlanCsvText(text);
const { items, audit } = normalizeSupplyPlanCsvRows(parsed.rows, parsed.headers);

const delayedHeaderCsv = [
  "Сводка",
  "",
  "Отчётный период: Май",
  "ID Код;Группа работ;Номенклатура;Ед. изм.;Плановая цена по СМЕТЕ за ед.;Плановая стоимость ВСЕГО по СМЕТЕ;Факт последняя цена за ед. СНАБЖЕНИЕ;Факт стоимость СНАБЖЕНИЕ",
  "2.05.05.1.1;Строительство зданий;Кирпич;шт;100;4700;90;4230",
].join("\n");
const delayedParsed = parseSupplyPlanCsvText(delayedHeaderCsv);
if (delayedParsed.rows.length !== 1) {
  throw new Error(`Expected 1 delayed-header row, got ${delayedParsed.rows.length}`);
}

const headerAtRow5 = [
  "a",
  "b",
  "c",
  "d",
  "ID Код;Группа работ;Дата начала по ГПР;Дата окончания по ГПР;Номенклатура;Объем (план);Объем (заказан);Ед. изм.;Плановая цена по СМЕТЕ за ед.;Плановая стоимость ВСЕГО по СМЕТЕ;Факт последняя цена за ед. СНАБЖЕНИЕ;Факт стоимость СНАБЖЕНИЕ;Отклонение цены за ед.;Отклонение П-Ф",
  "2.05.05.1.1;Строительство зданий и сооружений;01.05.2026;01.06.2026;Кирпич;47;30;шт;36307,2;1706438,4;33997;1019910;-2310,2;-686528,4",
].join("\n");
const rawForDetect = headerAtRow5
  .split(/\r?\n/)
  .map((line) => line.split(";"))
  .filter((row) => row.some((c) => c.trim() !== ""));
if (detectSupplyPlanHeaderRowIndex(rawForDetect) !== 4) {
  throw new Error("Header autodetect failed for row 5");
}

if (parsed.headers.length < 10) {
  throw new Error(`Expected headers, got ${parsed.headers.length}`);
}
if (items.length !== 2) {
  throw new Error(`Expected 2 items, got ${items.length}`);
}
if (items[0]?.name !== "Кирпич керамический полнотелый") {
  throw new Error(`Unexpected first item name: ${items[0]?.name}`);
}
if (items[0]?.volumePlan !== 47 || items[0]?.volumeFact !== 30) {
  throw new Error(`Unexpected volumes: ${items[0]?.volumePlan} / ${items[0]?.volumeFact}`);
}
if (audit.skipped !== 0) {
  throw new Error(`Unexpected skipped: ${audit.skipped}`);
}

console.log("supplyPlanCsvImport.selftest: OK", {
  headers: parsed.headers.length,
  items: items.length,
  first: items[0]?.itemCode,
});
