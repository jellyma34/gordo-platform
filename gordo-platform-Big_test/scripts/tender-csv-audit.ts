import fs from "fs";
import {
  parseTenderCsvText,
  normalizeTenderCsvRowsWithAudit,
  buildTenderColumnMap,
  diagnoseTenderImportFirstRow,
} from "../lib/tenderCsvImport";

const path = process.argv[2] ?? "data/tender-import-sample.csv";
const csv = fs.readFileSync(path, "utf8");
const parsed = parseTenderCsvText(csv);
const { audit } = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
  layout: parsed.layout,
  dataStartFileRow: parsed.dataStartFileRow,
});
audit.parseErrors = parsed.parseErrors;

console.log("Файл:", path);
console.log("Схема:", audit.layout, "| данные с строки файла:", parsed.dataStartFileRow);
console.log("Всего строк данных:", audit.parsedRows);
console.log("Загружено:", audit.loaded);
console.log("Пропущено:", audit.skipped);
console.log("Ошибки парсера:", audit.parseErrors);
console.log("Заголовки:", parsed.headers.join(" | "));
console.log(
  "Карта колонок:",
  audit.layout === "procurement" ? "procurement (кол.2=код, кол.3=имя)" : buildTenderColumnMap(parsed.headers),
);
console.log("Без сопоставления:", audit.unmappedHeaders.join(", ") || "—");
if (audit.skippedRows.length) {
  console.log("Пропущенные (до 10):");
  for (const s of audit.skippedRows.slice(0, 10)) {
    console.log(`  стр.${s.rowIndex} [${s.reason}] код="${s.codePreview}" имя="${s.namePreview}"`);
  }
}

const first = parsed.rows[0];
if (first) {
  const { tenders } = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
    layout: parsed.layout,
    dataStartFileRow: parsed.dataStartFileRow,
  });
  console.log("\nДиагностика 1-й строки:", JSON.stringify(diagnoseTenderImportFirstRow(parsed, tenders[0] ?? null), null, 2));
}
