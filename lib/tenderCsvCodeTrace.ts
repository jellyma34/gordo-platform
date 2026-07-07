/** Временная диагностика: трассировка code только для первой строки данных. */
let traceFirstRowEnabled = false;
let traceExtractRowIndex: number | null = null;

export function enableTenderCsvFirstRowCodeTrace(): void {
  traceFirstRowEnabled = true;
  traceExtractRowIndex = null;
}

export function disableTenderCsvFirstRowCodeTrace(): void {
  traceFirstRowEnabled = false;
  traceExtractRowIndex = null;
}

export function isTenderCsvFirstRowCodeTraceEnabled(): boolean {
  return traceFirstRowEnabled;
}

/** Перед extract* для строки rowIndex (только 0). */
export function setTenderCsvCodeTraceExtractRow(rowIndex: number): void {
  if (!traceFirstRowEnabled || rowIndex !== 0) {
    traceExtractRowIndex = null;
    return;
  }
  traceExtractRowIndex = rowIndex;
}

export function clearTenderCsvCodeTraceExtractRow(): void {
  traceExtractRowIndex = null;
}

export function shouldTraceExtractTenderRowProcurement(): boolean {
  return traceFirstRowEnabled && traceExtractRowIndex === 0;
}

const LOG = "[tender-import][code-trace]";

export function logCodeTraceParseFirstRow(parsedRow: Record<string, unknown> | undefined): void {
  if (!traceFirstRowEnabled) return;
  console.info(`${LOG} 1. after parseTenderCsvText() — parsedRows[0]:`, parsedRow ?? null);
}

export function logCodeTraceColumnMap(args: {
  codeIndex: number;
  csvHeader: string;
  cellAtIndex: string;
  cellByHeaderKey: string;
  firstRowKeys: string[];
}): void {
  if (!traceFirstRowEnabled) return;
  console.info(`${LOG} 2. after ColumnMap — code column:`, args);
}

export function logCodeTraceExtractProcurement(args: {
  rowIndex: number;
  rawCode: string;
  trimmedCode: string;
  codeColumnIndex: number;
  rowAtColumnIndex: string;
  rowByHeaderKey: string;
  resolvedCode: string | null;
}): void {
  if (!shouldTraceExtractTenderRowProcurement()) return;
  console.info(`${LOG} 3. extractTenderRowProcurement():`, args);
}

export function logCodeTraceNormalizeSkip(args: {
  rowIndex: number;
  fileRow: number;
  extractedCode: string | null | undefined;
  codePreview: string;
  invalidReason: string;
}): void {
  if (!traceFirstRowEnabled || args.rowIndex !== 0) return;
  console.info(`${LOG} 4. normalizeTenderCsvRowsWithAudit() — row rejected:`, args);
}

export function logCodeTraceNormalizeSuccess(args: {
  rowIndex: number;
  fileRow: number;
  extractedCode: string;
}): void {
  if (!traceFirstRowEnabled || args.rowIndex !== 0) return;
  console.info(`${LOG} 4. normalizeTenderCsvRowsWithAudit() — row accepted:`, args);
}
