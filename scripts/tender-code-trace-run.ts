/**
 * npx tsx scripts/tender-code-trace-run.ts
 */
import { File } from "node:buffer";
import { readFileSync } from "node:fs";
import iconv from "iconv-lite";

import { importTenderCsvFile } from "../lib/tenderCsvImportUi";

async function run(label: string, bytes: Uint8Array) {
  console.log(`\n========== ${label} ==========`);
  const f = new File([bytes], "t.csv", { type: "text/csv" });
  const r = await importTenderCsvFile(f);
  console.log("result:", {
    layout: r.audit.layout,
    parsed: r.audit.parsedRows,
    loaded: r.audit.loaded,
    skipped: r.audit.skipped,
    firstSkip: r.audit.skippedRows[0]?.reason ?? null,
    colMapError: r.audit.columnMapDiagnostics?.error ?? null,
  });
}

async function main() {
  const utf8 = readFileSync("data/tender-gpr-articles-149.csv");
  await run("UTF-8", new Uint8Array(utf8));
  const mis = iconv.encode(utf8.toString("utf8"), "win1251");
  await run("CP1251 misread as UTF-8", new Uint8Array(mis));

  // Принудительно: байты CP1251 декодированы как UTF-8 (без readCsvFileTextSmart)
  const {
    enableTenderCsvFirstRowCodeTrace,
    logCodeTraceParseFirstRow,
  } = await import("../lib/tenderCsvCodeTrace");
  const { parseTenderCsvText, normalizeTenderCsvRowsWithAudit } = await import("../lib/tenderCsvImport");
  const misText = new TextDecoder("utf-8", { fatal: false }).decode(mis);
  console.log("\n========== CP1251 bytes forced UTF-8 decode (no smart) ==========");
  const parsed = parseTenderCsvText(misText);
  enableTenderCsvFirstRowCodeTrace();
  logCodeTraceParseFirstRow(parsed.rows[0] as Record<string, unknown>);
  const n = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
    layout: parsed.layout,
    dataStartFileRow: parsed.dataStartFileRow,
    traceFirstRowCode: true,
  });
  console.log("result:", {
    layout: parsed.layout,
    parsed: parsed.rows.length,
    loaded: n.audit.loaded,
    skipped: n.audit.skipped,
    firstSkip: n.audit.skippedRows[0] ?? null,
    colMapError: n.audit.columnMapDiagnostics?.error ?? null,
  });
}

void main();
