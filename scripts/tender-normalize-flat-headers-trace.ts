import { readFileSync } from "node:fs";

import { normalizeTenderCsvRowsWithAudit, parseTenderCsvText } from "../lib/tenderCsvImport";

const text = readFileSync("data/tender-gpr-articles-149.csv", "utf8");
const parsed = parseTenderCsvText(text);
const flatHeaders = [
  "__col_0",
  "ID Код",
  "Этап работ",
  "ГПР",
  "Отставание",
  "Начало тендера",
  "__col_6",
  "__col_7",
  "Дата заключения договора",
  "__col_9",
  "__col_10",
  "Стоимость (руб.)",
  "__col_12",
  "__col_13",
  "Контрагент",
  "Договор",
  "Статус",
  "Комментарий к отклонениям",
];

const norm = normalizeTenderCsvRowsWithAudit(parsed.rows, flatHeaders, {
  layout: "procurement",
  dataStartFileRow: 3,
  traceNormalizeDiagnostics: true,
});

console.log("RESULT", {
  loaded: norm.audit.loaded,
  skipped: norm.audit.skipped,
  colMapError: norm.audit.columnMapDiagnostics?.error ?? null,
});
