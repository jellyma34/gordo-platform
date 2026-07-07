/**
 * Диагностика: 149 строк → 0 loaded в UI.
 * npx tsx scripts/tender-import-149-diagnostic.ts
 */
import { File } from "node:buffer";
import { readFileSync } from "node:fs";
import iconv from "iconv-lite";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { diffTendersImportScoped } from "../lib/tenderImportDiff";
import {
  importTenderCsvFile,
  normalizeTenderCsvRowsWithAudit,
  parseTenderCsvText,
} from "../lib/tenderCsvImportUi";

function trace(label: string, text: string) {
  const parsed = parseTenderCsvText(text);
  const norm = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
    layout: parsed.layout,
    dataStartFileRow: parsed.dataStartFileRow,
  });
  console.log(`\n=== ${label} ===`);
  console.log("parseTenderCsvText:", {
    rowsOut: parsed.rows.length,
    layout: parsed.layout,
    headers: parsed.headers.slice(0, 5),
  });
  console.log("normalizeTenderCsvRowsWithAudit:", {
    rowsIn: parsed.rows.length,
    validRows: norm.audit.loaded,
    invalidRows: norm.audit.skipped,
    colMapError: norm.audit.columnMapDiagnostics?.error ?? null,
    firstValid: norm.tenders[0]?.code ?? null,
    firstInvalid: norm.audit.skippedRows[0] ?? null,
  });
  const diff = diffTendersImportScoped([], norm.tenders, norm.audit.parsedRows);
  console.log("diffTendersImportScoped → registry:", {
    resultCount: diff.result.length,
    stats: diff.stats,
  });
}

async function traceFile(label: string, bytes: Uint8Array) {
  const file = new File([bytes], "test.csv", { type: "text/csv" });
  const r = await importTenderCsvFile(file);
  console.log(`\n=== ${label} (importTenderCsvFile) ===`);
  console.log({
    parsedRows: r.audit.parsedRows,
    loaded: r.audit.loaded,
    skipped: r.audit.skipped,
    layout: r.audit.layout,
    colMapError: r.audit.columnMapDiagnostics?.error ?? null,
    firstSkip: r.audit.skippedRows[0] ?? null,
    firstTender: r.tenders[0]?.code ?? null,
  });
}

async function main() {
  const utf8Path = "data/tender-gpr-articles-149.csv";
  const utf8Text = readFileSync(utf8Path, "utf8");
  trace("UTF-8 file (misread path: raw utf8)", utf8Text);

  const cp1251Bytes = iconv.encode(utf8Text, "win1251");
  const utf8Mis = new TextDecoder("utf-8", { fatal: false }).decode(cp1251Bytes).replace(/^\uFEFF/, "");
  trace("CP1251 bytes misread as UTF-8 (OLD BUG)", utf8Mis);

  const smart = decodeCsvBytesWithBestEncoding(cp1251Bytes);
  trace("CP1251 via decodeCsvBytesWithBestEncoding", smart);

  await traceFile("CP1251 File via importTenderCsvFile", cp1251Bytes);

  const legacy = readFileSync("data/tender-procurement-sample.csv");
  const legacySmart = decodeCsvBytesWithBestEncoding(new Uint8Array(legacy));
  trace("tender-procurement-sample.csv", legacySmart);
}

void main();