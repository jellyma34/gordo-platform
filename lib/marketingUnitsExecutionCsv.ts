import {
  normalizeSegmentName,
  normalizeUnitCell,
  parseSalesUnitsExecutionCsv,
  type ParseSalesUnitsExecutionCsvResult,
  type UnitsExecutionSegmentRow,
  type UnitsExecutionTotals,
} from "@/lib/parseSalesUnitsExecutionCsv";

export { normalizeSegmentName, normalizeUnitCell, parseSalesUnitsExecutionCsv };
export type { ParseSalesUnitsExecutionCsvResult, UnitsExecutionSegmentRow, UnitsExecutionTotals };

/** Префикс ключа; полный ключ — {@link marketingUnitsExecutionCsvLocalStorageKey}. */
export const MARKETING_UNITS_EXECUTION_CSV_STORAGE_KEY = "marketingUnitsExecutionCsv";

export function marketingUnitsExecutionCsvLocalStorageKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_UNITS_EXECUTION_CSV_STORAGE_KEY}:v1:${safe}`;
}

export type MarketingUnitsExecutionStoredV1 = {
  v: 1;
  updatedAt: string;
  fileName: string;
  reportDateYmd: string;
  segments: UnitsExecutionSegmentRow[];
  totals: UnitsExecutionTotals;
  warnings: string[];
};

export type UnitsExecutionChartsPayload = {
  reportDateYmd: string;
  segments: UnitsExecutionSegmentRow[];
  totals: UnitsExecutionTotals;
};

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
  return {
    v: 1,
    updatedAt: o.updatedAt,
    fileName: o.fileName,
    reportDateYmd: o.reportDateYmd,
    segments,
    totals,
    warnings,
  };
}

export function readMarketingUnitsExecutionCsvFromLocalStorage(projectId: string): MarketingUnitsExecutionStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(marketingUnitsExecutionCsvLocalStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parseStoredMarketingUnitsExecutionCsv(parsed);
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
