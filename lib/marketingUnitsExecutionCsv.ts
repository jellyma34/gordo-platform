import {
  normalizeSegmentName,
  normalizeUnitCell,
  parseSalesUnitsExecutionCsv,
  type ParseSalesUnitsExecutionCsvResult,
  type UnitsExecutionSegmentRow,
  type UnitsExecutionTotals,
} from "@/lib/parseSalesUnitsExecutionCsv";
import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import {
  buildUnitsExecutionByMonthFromBase,
  buildUnitsExecutionSliceForMonth,
  resolveCumulativeFactForMonth,
} from "@/lib/unitsExecutionCumulative";
import { applyUnitsExecutionValueMode, type UnitsExecutionValueMode } from "@/lib/unitsExecutionValueMode";
import { getCumulativePlanForMonth } from "@/lib/unitsExecutionMonths";
import { UNITS_EXECUTION_BASE_MONTH } from "@/lib/unitsExecutionMonths";

export { normalizeSegmentName, normalizeUnitCell, parseSalesUnitsExecutionCsv };
export type { ParseSalesUnitsExecutionCsvResult, UnitsExecutionSegmentRow, UnitsExecutionTotals };

/** Префикс ключа; полный ключ — {@link marketingUnitsExecutionCsvLocalStorageKey}. */
export const MARKETING_UNITS_EXECUTION_CSV_STORAGE_KEY = "marketingUnitsExecutionCsv";

export function marketingUnitsExecutionCsvLocalStorageKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_UNITS_EXECUTION_CSV_STORAGE_KEY}:v1:${safe}`;
}

export type UnitsExecutionMonthSlice = {
  segments: UnitsExecutionSegmentRow[];
  totals: UnitsExecutionTotals;
};

export type UnitsExecutionByMonth = Partial<Record<string, UnitsExecutionMonthSlice>>;

export type MarketingUnitsExecutionStoredV1 = {
  v: 1;
  updatedAt: string;
  fileName: string;
  /** Кто загрузил файл (серверное хранилище). */
  uploadedBy?: string;
  rawText?: string;
  reportDateYmd: string;
  segments: UnitsExecutionSegmentRow[];
  totals: UnitsExecutionTotals;
  /** Срезы по месяцам YYYY-MM (накопительно). */
  byMonth?: UnitsExecutionByMonth;
  warnings: string[];
};

export type UnitsExecutionChartsPayload = {
  reportDateYmd: string;
  segments: UnitsExecutionSegmentRow[];
  totals: UnitsExecutionTotals;
  byMonth?: UnitsExecutionByMonth;
};

function normalizeByMonth(raw: unknown): UnitsExecutionByMonth | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: UnitsExecutionByMonth = {};
  for (const [key, val] of Object.entries(o)) {
    if (!val || typeof val !== "object") continue;
    const slice = val as Record<string, unknown>;
    if (!Array.isArray(slice.segments)) continue;
    out[key] = {
      segments: slice.segments.map((row: unknown) => normalizeSegmentRow(row)),
      totals: normalizeTotals(slice.totals),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Базовые строки CSV (февраль 2026) → срез по месяцу; режим «Месяц» — plan/fact за отчётный месяц. */
export function resolveUnitsExecutionMonthSlice(
  payload: UnitsExecutionChartsPayload | null | undefined,
  monthKey: string,
  dealsRows?: readonly NormalizedDealRow[],
  valueMode: UnitsExecutionValueMode = "cumulative",
): UnitsExecutionMonthSlice | null {
  if (!payload?.segments?.length) return null;
  const cumulativeSlice = buildUnitsExecutionSliceForMonth(payload.segments, monthKey, {
    dealsRows,
    explicitFactByMonth: payload.byMonth,
  });
  if (!cumulativeSlice) return null;
  if (valueMode === "cumulative") return cumulativeSlice;
  return applyUnitsExecutionValueMode(
    cumulativeSlice,
    monthKey,
    valueMode,
    getCumulativePlanForMonth,
    (mk) =>
      resolveCumulativeFactForMonth(mk, payload.segments, dealsRows, payload.byMonth),
  );
}

export function unitsExecutionChartsHaveAnyMonth(
  payload: UnitsExecutionChartsPayload | null | undefined,
): boolean {
  return (payload?.segments?.length ?? 0) > 0;
}

export function unitsExecutionChartsHaveRows(
  payload: UnitsExecutionChartsPayload | null | undefined,
): boolean {
  return unitsExecutionChartsHaveAnyMonth(payload);
}

export function unitsExecutionDocHasApartments(
  doc: Pick<MarketingUnitsExecutionStoredV1, "segments"> | null | undefined,
): boolean {
  return (doc?.segments ?? []).some((s) => s.key === "apartments");
}

/** Пересобрать segments/totals из CSV-текста (исправляет устаревший JSON после фикса парсера). */
export function reconcileUnitsExecutionDoc(
  doc: MarketingUnitsExecutionStoredV1,
  csvText?: string | null,
): MarketingUnitsExecutionStoredV1 {
  const text = (csvText ?? doc.rawText ?? "").trim();
  if (!text) return doc;
  const parsed = parseSalesUnitsExecutionCsv(text);
  if (!parsed.ok || parsed.segments.length === 0) return doc;
  const byMonth = buildUnitsExecutionByMonthFromBase(parsed.segments);
  const feb = byMonth[UNITS_EXECUTION_BASE_MONTH] ?? { segments: parsed.segments, totals: parsed.totals };
  return {
    ...doc,
    rawText: text,
    reportDateYmd: parsed.reportDateYmd,
    segments: parsed.segments,
    totals: feb.totals,
    byMonth,
    warnings: parsed.warnings,
  };
}

export function unitsExecutionDocToChartsPayload(doc: MarketingUnitsExecutionStoredV1): UnitsExecutionChartsPayload {
  const byMonth =
    doc.segments.length > 0
      ? buildUnitsExecutionByMonthFromBase(doc.segments)
      : (doc.byMonth ?? {});
  const feb = byMonth[UNITS_EXECUTION_BASE_MONTH];
  return {
    reportDateYmd: doc.reportDateYmd,
    segments: doc.segments,
    totals: feb?.totals ?? doc.totals,
    byMonth: Object.keys(byMonth).length > 0 ? byMonth : undefined,
  };
}

export function buildMarketingUnitsExecutionStoredDoc(params: {
  updatedAt: string;
  fileName: string;
  uploadedBy?: string;
  rawText?: string;
  parsed: Extract<ParseSalesUnitsExecutionCsvResult, { ok: true }>;
  existing?: MarketingUnitsExecutionStoredV1 | null;
}): MarketingUnitsExecutionStoredV1 {
  const byMonth = buildUnitsExecutionByMonthFromBase(params.parsed.segments);
  const feb = byMonth[UNITS_EXECUTION_BASE_MONTH] ?? { segments: params.parsed.segments, totals: params.parsed.totals };
  return {
    v: 1,
    updatedAt: params.updatedAt,
    fileName: params.fileName,
    uploadedBy: params.uploadedBy,
    rawText: params.rawText,
    reportDateYmd: params.parsed.reportDateYmd,
    segments: params.parsed.segments,
    totals: feb.totals,
    byMonth,
    warnings: params.parsed.warnings,
  };
}

function normalizeSegmentRow(raw: unknown): UnitsExecutionSegmentRow {
  if (!raw || typeof raw !== "object") {
    return {
      key: "apartments",
      segment: "",
      planProject: 0,
      planCumulative: 0,
      factCumulative: 0,
      deviationCumulative: 0,
      completionPct: 0,
      shareOfVolumePct: 0,
    };
  }
  const o = raw as Record<string, unknown>;
  const key = o.key as UnitsExecutionSegmentRow["key"];
  const safeKey: UnitsExecutionSegmentRow["key"] =
    key === "parking" || key === "storage" || key === "commercial" || key === "apartments" ? key : "apartments";
  return {
    key: safeKey,
    segment: String(o.segment ?? ""),
    planProject: normalizeUnitCell(o.planProject),
    planReportMonth: normalizeUnitCell(o.planReportMonth),
    factReportMonth: normalizeUnitCell(o.factReportMonth),
    planCumulative: normalizeUnitCell(o.planCumulative),
    factCumulative: normalizeUnitCell(o.factCumulative),
    deviationCumulative: normalizeUnitCell(o.deviationCumulative),
    completionPct: normalizeUnitCell(o.completionPct),
    shareOfVolumePct: normalizeUnitCell(o.shareOfVolumePct),
  };
}

function normalizeTotals(raw: unknown): UnitsExecutionTotals {
  if (!raw || typeof raw !== "object") {
    return { planCumulative: 0, factCumulative: 0, deviationCumulative: 0, completionPct: 0 };
  }
  const o = raw as Record<string, unknown>;
  return {
    planCumulative: normalizeUnitCell(o.planCumulative),
    factCumulative: normalizeUnitCell(o.factCumulative),
    deviationCumulative: normalizeUnitCell(o.deviationCumulative),
    completionPct: normalizeUnitCell(o.completionPct),
  };
}

export function parseStoredMarketingUnitsExecutionCsv(raw: unknown): MarketingUnitsExecutionStoredV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.updatedAt !== "string" || typeof o.fileName !== "string") return null;
  if (typeof o.reportDateYmd !== "string") return null;
  if (!Array.isArray(o.segments)) return null;
  const warnings = Array.isArray(o.warnings) ? (o.warnings.filter((w) => typeof w === "string") as string[]) : [];
  const segments = o.segments.map((row: unknown) => normalizeSegmentRow(row));
  const totals = normalizeTotals(o.totals);
  const byMonth = normalizeByMonth(o.byMonth);
  return {
    v: 1,
    updatedAt: o.updatedAt,
    fileName: o.fileName,
    uploadedBy: typeof o.uploadedBy === "string" ? o.uploadedBy : undefined,
    rawText: typeof o.rawText === "string" ? o.rawText : undefined,
    reportDateYmd: o.reportDateYmd,
    segments,
    totals,
    byMonth,
    warnings,
  };
}

export function readMarketingUnitsExecutionCsvFromLocalStorage(projectId: string): MarketingUnitsExecutionStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(marketingUnitsExecutionCsvLocalStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const doc = parseStoredMarketingUnitsExecutionCsv(parsed);
    return doc ? reconcileUnitsExecutionDoc(doc) : null;
  } catch {
    return null;
  }
}

export function writeMarketingUnitsExecutionCsvToLocalStorage(projectId: string, doc: MarketingUnitsExecutionStoredV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(marketingUnitsExecutionCsvLocalStorageKey(projectId), JSON.stringify(doc));
  } catch (e) {
    console.warn("[Units execution CSV] localStorage save failed", e);
  }
}

export function clearMarketingUnitsExecutionCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(marketingUnitsExecutionCsvLocalStorageKey(projectId));
  } catch {
    /* ignore */
  }
}
