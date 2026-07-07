/**
 * Временная диагностика normalizeTenderCsvRowsWithAudit (только console).
 * Не меняет алгоритм нормализации.
 */
import { normalizeGprWorkCodeFromCsvRaw } from "@/lib/gprReportCsv";
import {
  coerceTender,
  getGprStageFromTenderCode,
  normalizeTenderCycleStatus,
  type TenderProcurementStatus,
} from "@/lib/tenderData";

const LOG = "[tender-import][normalize-trace]";

export type NormalizeSkipReason =
  | "empty_row"
  | "missing_code"
  | "missing_name"
  | "invalid_code"
  | "coerce_failed"
  | "column_map_error";

type ColMapLike = Record<string, number>;

export type NormalizeCheckResult = {
  check: string;
  result: boolean;
  actualValue: unknown;
  expectedValue: unknown;
};

export type NormalizeRowTrace = {
  rowIndex: number;
  fileRow: number;
  rawRow: Record<string, unknown>;
  resolvedCode: string | null;
  resolvedName: string | null;
  resolvedStage: string | null;
  invalidReason: NormalizeSkipReason | null;
  accepted: boolean;
  checks: NormalizeCheckResult[];
  firstFailedCheck: string | null;
};

function resolveCodeForTrace(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = normalizeGprWorkCodeFromCsvRaw(trimmed);
  if (normalized) return normalized;
  const digits = trimmed.replace(/[^\d.]/g, "").replace(/\.+$/, "");
  const parts = digits.split(".").filter(Boolean);
  if (parts.length >= 2) return parts.join(".");
  return null;
}

function rowLooksEmptyTrace(row: Record<string, unknown>): boolean {
  return Object.values(row).every((v) => v == null || String(v).trim() === "");
}

function cellByIndexTrace(
  row: Record<string, unknown>,
  headers: string[],
  idx: number,
): string {
  if (idx < 0) return "";
  if (Array.isArray(row)) {
    return idx < row.length ? String(row[idx] ?? "").trim() : "";
  }
  const key = headers[idx];
  if (key !== undefined && Object.prototype.hasOwnProperty.call(row, key)) {
    return String(row[key] ?? "").trim();
  }
  const numKey = String(idx);
  if (Object.prototype.hasOwnProperty.call(row, numKey)) {
    return String(row[numKey] ?? "").trim();
  }
  return "";
}

function getMappedCellTrace(
  row: Record<string, unknown>,
  headers: string[],
  colMap: ColMapLike,
  key: string,
): string {
  const idx = colMap[key];
  if (idx === undefined || idx < 0) return "";
  return cellByIndexTrace(row, headers, idx);
}

function mapStatusTrace(s: string): TenderProcurementStatus | undefined {
  const t = s.toLowerCase();
  if (!t) return undefined;
  if (/план|заплан|^planned$/i.test(t)) return "planned";
  if (/работ|прогресс|progress|в процес|^in_progress$/i.test(t)) return "in_progress";
  if (/заверш|^completed$/i.test(t)) return "completed";
  if (/задерж|^delayed$/i.test(t)) return "delayed";
  return undefined;
}

function skipReasonFromChecks(
  checks: NormalizeCheckResult[],
  codePreview: string,
  namePreview: string,
): NormalizeSkipReason {
  const failed = checks.find((c) => !c.result);
  if (!failed) return "missing_code";
  switch (failed.check) {
    case "columnMapReady":
      return "column_map_error";
    case "validateRowNotEmpty":
      return "empty_row";
    case "validateCodeMapped":
    case "validateCodeCell":
      return "missing_code";
    case "validateCodeResolvable":
      return codePreview.trim() ? "invalid_code" : "missing_code";
    case "validateNameCell":
      return "missing_name";
    case "validateCoerceTender":
      return "coerce_failed";
    default:
      return !codePreview.trim() ? "missing_code" : !namePreview.trim() ? "missing_name" : "invalid_code";
  }
}

/** Зеркало проверок normalize без изменения extract/coerce. */
export function diagnoseNormalizeRow(
  rowIndex: number,
  fileRow: number,
  raw: Record<string, unknown>,
  headers: string[],
  colMap: ColMapLike,
  layout: string,
  columnMapError: string | null,
  extractFn: (
    row: Record<string, unknown>,
    headers: string[],
    colMap: ColMapLike,
  ) => {
    idRaw: string;
    code: string;
    name: string;
    stage: string;
    planStart: string | null;
    factStart: string | undefined;
    planContractDate: string | null;
    factContractDate: string | undefined;
    cost: number | undefined;
    factCost: number | undefined;
    contractor: string | undefined;
    comment: string | undefined;
    statusRaw: string;
    partId: number;
  } | null,
  newIdFallback: (index: number) => string,
  rowCounter: number,
): NormalizeRowTrace {
  const codePreview = getMappedCellTrace(raw, headers, colMap, "code");
  const namePreview = getMappedCellTrace(raw, headers, colMap, "name");
  const resolvedCode = resolveCodeForTrace(codePreview);
  const resolvedName = namePreview.trim() || null;
  const resolvedStage = resolvedCode ? (getGprStageFromTenderCode(resolvedCode) || "2.05").trim() : null;

  const checks: NormalizeCheckResult[] = [
    {
      check: "columnMapReady",
      result: !columnMapError,
      actualValue: columnMapError ?? "ok",
      expectedValue: "нет ошибки ColumnMap",
    },
    {
      check: "validateRowNotEmpty",
      result: !rowLooksEmptyTrace(raw),
      actualValue: rowLooksEmptyTrace(raw) ? "(пустая строка)" : "has cells",
      expectedValue: "хотя бы одна непустая ячейка",
    },
    {
      check: "validateCodeMapped",
      result: colMap.code >= 0,
      actualValue: colMap.code,
      expectedValue: "index >= 0",
    },
    {
      check: "validateCodeCell",
      result: Boolean(codePreview.trim()),
      actualValue: codePreview,
      expectedValue: "непустой code из ColumnMap",
    },
    {
      check: "validateCodeResolvable",
      result: Boolean(resolvedCode),
      actualValue: resolvedCode ?? codePreview,
      expectedValue: "валидный GPR-код (resolveCode)",
    },
    {
      check: "validateNameCell",
      result: Boolean(namePreview.trim()),
      actualValue: namePreview,
      expectedValue: "непустое name из ColumnMap",
    },
  ];

  const extracted = checks.every((c) => c.result) ? extractFn(raw, headers, colMap) : null;
  checks.push({
    check: "validateExtract",
    result: extracted != null,
    actualValue: extracted ? { code: extracted.code, name: extracted.name } : null,
    expectedValue: "extractTenderRow* возвращает объект",
  });

  let coerceOk = false;
  if (extracted) {
    const plain: Record<string, unknown> = {
      id: extracted.idRaw || newIdFallback(rowCounter),
      code: extracted.code,
      name: extracted.name,
      stage: extracted.stage,
      partId: extracted.partId,
      planStart: extracted.planStart,
      factStart: extracted.factStart ?? null,
      planContractDate: extracted.planContractDate,
      factContractDate: extracted.factContractDate ?? null,
      cost: extracted.cost,
      factCost: extracted.factCost,
      contractor: extracted.contractor,
      comment: extracted.comment,
      status: mapStatusTrace(extracted.statusRaw),
      statusLabel: extracted.statusRaw.trim() || undefined,
      cycleStatus: normalizeTenderCycleStatus(extracted.statusRaw),
    };
    coerceOk = coerceTender(plain) != null;
    checks.push({
      check: "validateCoerceTender",
      result: coerceOk,
      actualValue: coerceOk ? "coerceTender ok" : plain,
      expectedValue: "coerceTender возвращает Tender",
    });
  } else {
    checks.push({
      check: "validateCoerceTender",
      result: false,
      actualValue: null,
      expectedValue: "extract должен пройти раньше",
    });
  }

  checks.push({
    check: "validateStage",
    result: Boolean(resolvedStage),
    actualValue: resolvedStage,
    expectedValue: "этап из кода или 2.05",
  });

  const firstFailed = checks.find((c) => !c.result) ?? null;
  const accepted = checks.every((c) => c.result);

  return {
    rowIndex,
    fileRow,
    rawRow: raw,
    resolvedCode,
    resolvedName,
    resolvedStage,
    invalidReason: accepted ? null : skipReasonFromChecks(checks, codePreview, namePreview),
    accepted,
    checks,
    firstFailedCheck: firstFailed?.check ?? null,
  };
}

export function logNormalizeRowTrace(trace: NormalizeRowTrace): void {
  if (typeof console === "undefined") return;
  console.info(`${LOG} --------------------------------`);
  console.info(`${LOG} rowIndex:`, trace.rowIndex, "fileRow:", trace.fileRow);
  console.info(`${LOG} rawRow:`, trace.rawRow);
  console.info(`${LOG} resolvedCode:`, trace.resolvedCode);
  console.info(`${LOG} resolvedName:`, trace.resolvedName);
  console.info(`${LOG} resolvedStage:`, trace.resolvedStage);
  console.info(`${LOG} invalidReason:`, trace.invalidReason);
  console.info(`${LOG} accepted:`, trace.accepted);
  if (trace.firstFailedCheck) {
    const failed = trace.checks.find((c) => c.check === trace.firstFailedCheck);
    console.warn(`${LOG} firstFailedCheck:`, trace.firstFailedCheck, failed);
  }
  console.table(
    trace.checks.map((c) => ({
      check: c.check,
      result: c.result ? "pass" : "FAIL",
      actualValue:
        typeof c.actualValue === "object" ? JSON.stringify(c.actualValue) : String(c.actualValue),
      expectedValue: String(c.expectedValue),
    })),
  );
  console.info(`${LOG} --------------------------------`);
}

export function logNormalizeRejectedSummary(
  rejectedByReason: Record<string, number>,
  meta: {
    layout: string;
    rowsIn: number;
    loaded: number;
    skipped: number;
    columnMapError: string | null;
    headersCount: number;
    codeColumnIndex: number;
  },
): void {
  if (typeof console === "undefined") return;
  console.info(`${LOG} rejectedByReason:`, rejectedByReason);
  console.info(`${LOG} summary:`, meta);
  const top = Object.entries(rejectedByReason).sort((a, b) => b[1] - a[1])[0];
  if (top) {
    console.warn(`${LOG} dominant rejection:`, {
      reason: top[0],
      count: top[1],
      hint:
        top[0] === "missing_code"
          ? "code пуст или colMap.code=-1 — проверьте ColumnMap в браузере"
          : top[0] === "column_map_error"
            ? "ранний выход до цикла строк — missingRequired в ColumnMap"
            : undefined,
    });
  }
}

export function incrementRejectReason(
  map: Record<string, number>,
  reason: string,
): void {
  map[reason] = (map[reason] ?? 0) + 1;
}
