/**
 * Точка входа импорта CSV тендеров для UI.
 * Явная цепочка (как в npm run test:tender-csv), отдельный модуль для актуального webpack-графа.
 */
import { readCsvFileTextSmart } from "@/lib/csvTextEncoding";
import { enableTenderCsvFirstRowCodeTrace, logCodeTraceParseFirstRow } from "@/lib/tenderCsvCodeTrace";
import {
  diagnoseTenderImportFirstRow,
  diagnoseTenderCsvLayoutSelection,
  logTenderCsvLayoutDiagnostics,
  normalizeTenderCsvRowsWithAudit,
  parseTenderCsvText,
  resolveTenderCsvImportParsed,
  type TenderCsvImportAudit,
  type TenderCsvLayoutDiagnostic,
  type TenderCsvNormalizeResult,
  type TenderColumnMapDiagnostics,
  type TenderCsvParsed,
} from "@/lib/tenderCsvImport";
import {
  logPipelineAfterNormalize,
  logPipelineAfterParse,
  logPipelineFirstZeroLoss,
} from "@/lib/tenderUiPipelineDiagnostics";

export type { TenderCsvImportAudit, TenderCsvNormalizeResult, TenderColumnMapDiagnostics, TenderCsvLayoutDiagnostic };

export {
  buildTenderColumnMapWithDiagnostics,
  buildTenderProcurementColumnMap,
  logBuildTenderProcurementColumnMapTrace,
  traceBuildTenderProcurementColumnMap,
  diagnoseTenderCsvLayoutSelection,
  logTenderCsvLayoutDiagnostics,
  normalizeTenderCsvRowsWithAudit,
  parseTenderCsvText,
  resolveTenderCsvImportParsed,
  traceTenderRowCodeReadDiagnostics,
} from "@/lib/tenderCsvImport";

export type TenderUiImportStageTrace = {
  stage: string;
  rowsIn: number;
  rowsOut: number;
  validRows: number;
  invalidRows: number;
  firstValid: { code: string; name: string } | null;
  firstInvalid: { rowIndex: number; reason: string } | null;
};

/** parse → resolve layout → normalize (Parser/Normalizer без изменений). */
function runTenderCsvImportPipeline(text: string): {
  parsed: TenderCsvParsed;
  result: TenderCsvNormalizeResult;
  layoutDiagnostic: TenderCsvLayoutDiagnostic;
} {
  const layoutDiagnostic = diagnoseTenderCsvLayoutSelection(text);
  logTenderCsvLayoutDiagnostics(layoutDiagnostic);

  const initialParsed = parseTenderCsvText(text);
  const parsed = resolveTenderCsvImportParsed(text, initialParsed);

  enableTenderCsvFirstRowCodeTrace();
  logCodeTraceParseFirstRow(parsed.rows[0] as Record<string, unknown> | undefined);

  if (parsed.layout !== initialParsed.layout && typeof console !== "undefined") {
    console.info("[tender-import] Layout corrected:", {
      from: initialParsed.layout,
      to: parsed.layout,
      parsedRows: parsed.rows.length,
    });
  }

  const result = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
    layout: parsed.layout,
    dataStartFileRow: parsed.dataStartFileRow,
    traceFirstRowCode: true,
    traceNormalizeDiagnostics: true,
  });
  result.audit.parseErrors = parsed.parseErrors;

  logPipelineAfterParse(
    { file: "lib/tenderCsvImportUi.ts", fn: "runTenderCsvImportPipeline", line: 69 },
    {
      rowsIn: text.split(/\r?\n/).filter((l) => l.trim()).length,
      rowsOut: parsed.rows.length,
      layout: parsed.layout,
      firstRow: (parsed.rows[0] as Record<string, unknown>) ?? null,
    },
  );

  logPipelineAfterNormalize(
    { file: "lib/tenderCsvImportUi.ts", fn: "runTenderCsvImportPipeline", line: 78 },
    {
      rowsIn: parsed.rows.length,
      loaded: result.audit.loaded,
      invalid: result.audit.skipped,
      firstRow: result.tenders[0] ?? null,
      audit: result.audit,
    },
  );

  if (result.audit.loaded === 0 && parsed.rows.length > 0) {
    logPipelineFirstZeroLoss("normalizeTenderCsvImportPipeline", {
      file: "lib/tenderCsvImportUi.ts",
      fn: "runTenderCsvImportPipeline",
      line: 78,
    }, {
      parsedRows: parsed.rows.length,
      layout: parsed.layout,
      skipped: result.audit.skipped,
      firstSkip: result.audit.skippedRows[0] ?? null,
      colMapError: result.audit.columnMapDiagnostics?.error ?? null,
      reason: "normalize вернул loaded=0 при parsedRows>0 — UI покажет «загружено 0»",
    });
  }

  if (typeof console !== "undefined") {
    console.log("[audit-trace] runTenderCsvImportPipeline → result", {
      layout: parsed.layout,
      parsedRows: parsed.rows.length,
      tendersOut: result.tenders.length,
      auditLoaded: result.audit.loaded,
      auditSkipped: result.audit.skipped,
    });
  }

  return { parsed, result, layoutDiagnostic };
}

/** Диагностика UI-цепочки: read → parse → normalize (без сохранения в реестр). */
export async function traceTenderUiImportPipeline(file: File): Promise<{
  stages: TenderUiImportStageTrace[];
  tenders: import("@/lib/tenderData").Tender[];
  audit: TenderCsvImportAudit;
}> {
  const text = await readCsvFileTextSmart(file);
  const { parsed, result: normalized } = runTenderCsvImportPipeline(text);

  const firstValid = normalized.tenders[0];
  const firstInvalid = normalized.audit.skippedRows[0];

  const stages: TenderUiImportStageTrace[] = [
    {
      stage: "readTenderCsvFileText",
      rowsIn: text.length,
      rowsOut: text.split(/\r?\n/).filter((l) => l.trim()).length,
      validRows: 0,
      invalidRows: 0,
      firstValid: null,
      firstInvalid: null,
    },
    {
      stage: "parseTenderCsvText",
      rowsIn: parsed.parseErrors,
      rowsOut: parsed.rows.length,
      validRows: parsed.rows.length,
      invalidRows: 0,
      firstValid: parsed.rows[0]
        ? {
            code: String(
              (parsed.rows[0] as Record<string, string>)["ID Код"] ??
                (parsed.rows[0] as Record<string, string>)["Наименование работ"] ??
                "",
            ),
            name: String((parsed.rows[0] as Record<string, string>)["Этап работ"] ?? ""),
          }
        : null,
      firstInvalid: null,
    },
    {
      stage: "normalizeTenderCsvRowsWithAudit",
      rowsIn: parsed.rows.length,
      rowsOut: normalized.tenders.length,
      validRows: normalized.audit.loaded,
      invalidRows: normalized.audit.skipped,
      firstValid: firstValid ? { code: firstValid.code, name: firstValid.name } : null,
      firstInvalid: firstInvalid
        ? { rowIndex: firstInvalid.rowIndex, reason: firstInvalid.reason }
        : null,
    },
  ];

  return { stages, tenders: normalized.tenders, audit: normalized.audit };
}

/** Импорт CSV в браузере: read → parseTenderCsvText → resolve layout → normalizeTenderCsvRowsWithAudit. */
export async function importTenderCsvFile(
  file: File,
): Promise<TenderCsvNormalizeResult & { parseErrors: number }> {
  const text = await readCsvFileTextSmart(file);
  const { parsed, result } = runTenderCsvImportPipeline(text);

  if (typeof console !== "undefined" && parsed.rows.length > 0) {
    if (result.tenders.length > 0) {
      const firstTender = result.tenders[0] ?? null;
      console.info(
        "[tender-import] диагностика первой строки данных",
        diagnoseTenderImportFirstRow(parsed, firstTender),
      );
    } else if (result.audit.skipped > 0) {
      console.warn("[tender-import] все строки пропущены", {
        parsedRows: parsed.rows.length,
        layout: parsed.layout,
        skipped: result.audit.skipped,
        firstSkip: result.audit.skippedRows[0],
      });
    }
  }

  if (typeof console !== "undefined") {
    console.log("[audit-trace] importTenderCsvFile → return", {
      tenders: result.tenders.length,
      auditLoaded: result.audit.loaded,
      auditSkipped: result.audit.skipped,
      layout: parsed.layout,
    });
  }

  return { ...result, parseErrors: parsed.parseErrors };
}
