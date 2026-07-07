import { readFileSync } from "node:fs";

import {
  buildTenderColumnMapWithDiagnostics,
  formatTenderColumnMapTable,
  normalizeTenderCsvRowsWithAudit,
  parseTenderCsvText,
} from "../lib/tenderCsvImport";

const text = readFileSync("data/tender-gpr-articles-149.csv", "utf8");
const parsed = parseTenderCsvText(text);
const { diagnostics } = buildTenderColumnMapWithDiagnostics(parsed.headers, parsed.layout);

console.log("ColumnMap (id, code, name):");
console.table(
  formatTenderColumnMapTable(diagnostics).filter((r) =>
    ["id", "code", "name"].includes(r.field),
  ),
);

const norm = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
  layout: parsed.layout,
  dataStartFileRow: parsed.dataStartFileRow,
});

console.log({
  layout: parsed.layout,
  loaded: norm.audit.loaded,
  skipped: norm.audit.skipped,
  missing_code: norm.audit.skippedRows.filter((s) => s.reason === "missing_code").length,
});
