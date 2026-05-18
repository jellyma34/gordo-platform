import {
  parseSegmentExecutionCsv,
  type ParseSegmentExecutionCsvResult,
  type SegmentExecutionCompletionRow,
  type SegmentExecutionPlanFactRow,
} from "@/lib/parseSegmentExecutionCsv";

export { parseSegmentExecutionCsv };
export type {
  ParseSegmentExecutionCsvResult,
  SegmentExecutionCompletionRow,
  SegmentExecutionPlanFactRow,
};

export const MARKETING_SEGMENT_EXECUTION_CSV_STORAGE_KEY = "marketingSegmentExecutionCsv";

export function marketingSegmentExecutionCsvLocalStorageKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_SEGMENT_EXECUTION_CSV_STORAGE_KEY}:v1:${safe}`;
}

export type MarketingSegmentExecutionStoredV1 = {
  v: 1;
  updatedAt: string;
  fileName: string;
  uploadedBy?: string;
  planFactRows: SegmentExecutionPlanFactRow[];
  completionRows: SegmentExecutionCompletionRow[];
  warnings: string[];
};

export type SegmentExecutionChartsPayload = {
  planFactRows: SegmentExecutionPlanFactRow[];
  completionRows: SegmentExecutionCompletionRow[];
};

/** Есть ли распознанные строки сегментов (для графиков и сброса stale error). */
export function segmentExecutionChartsHaveRows(
  payload: SegmentExecutionChartsPayload | null | undefined,
): boolean {
  if (!payload) return false;
  return (payload.planFactRows?.length ?? 0) > 0 || (payload.completionRows?.length ?? 0) > 0;
}

/** Есть ли в payload ненулевые plan/fact или % (не только пустые строки сегментов). */
export function segmentExecutionChartsHaveData(
  payload: SegmentExecutionChartsPayload | null | undefined,
): boolean {
  if (!payload) return false;
  const pf = payload.planFactRows ?? [];
  const cr = payload.completionRows ?? [];
  return (
    pf.some((r) => Math.abs(r.plan) > 1e-9 || Math.abs(r.fact) > 1e-9) ||
    cr.some((r) => Number.isFinite(r.pct) && r.pct > 0)
  );
}

function normalizePlanFactRow(raw: unknown): SegmentExecutionPlanFactRow {
  if (!raw || typeof raw !== "object") {
    return { key: "apartments", segment: "Квартиры", plan: 0, fact: 0 };
  }
  const o = raw as Record<string, unknown>;
  const key = o.key as SegmentExecutionPlanFactRow["key"];
  const safeKey: SegmentExecutionPlanFactRow["key"] =
    key === "parking" || key === "storage" || key === "commercial" ? key : "apartments";
  return {
    key: safeKey,
    segment: String(o.segment ?? ""),
    plan: typeof o.plan === "number" && Number.isFinite(o.plan) ? o.plan : 0,
    fact: typeof o.fact === "number" && Number.isFinite(o.fact) ? o.fact : 0,
  };
}

function normalizeCompletionRow(raw: unknown): SegmentExecutionCompletionRow {
  if (!raw || typeof raw !== "object") {
    return { key: "apartments", segment: "Квартиры", pct: 0, completion: 0, label: "0%", fill: "#94a3b8" };
  }
  const o = raw as Record<string, unknown>;
  const key = o.key as SegmentExecutionCompletionRow["key"];
  const safeKey: SegmentExecutionCompletionRow["key"] =
    key === "parking" || key === "storage" || key === "commercial" ? key : "apartments";
  const pct = typeof o.pct === "number" && Number.isFinite(o.pct) ? o.pct : 0;
  const completion = typeof o.completion === "number" && Number.isFinite(o.completion) ? o.completion : 0;
  return {
    key: safeKey,
    segment: String(o.segment ?? ""),
    pct,
    completion,
    label: String(o.label ?? `${pct}%`),
    fill: String(o.fill ?? "#94a3b8"),
  };
}

export function parseStoredMarketingSegmentExecutionCsv(raw: unknown): MarketingSegmentExecutionStoredV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.updatedAt !== "string" || typeof o.fileName !== "string") return null;
  if (!Array.isArray(o.planFactRows) || !Array.isArray(o.completionRows)) return null;
  const warnings = Array.isArray(o.warnings) ? (o.warnings.filter((w) => typeof w === "string") as string[]) : [];
  return {
    v: 1,
    updatedAt: o.updatedAt,
    fileName: o.fileName,
    uploadedBy: typeof o.uploadedBy === "string" ? o.uploadedBy : undefined,
    planFactRows: o.planFactRows.map((row: unknown) => normalizePlanFactRow(row)),
    completionRows: o.completionRows.map((row: unknown) => normalizeCompletionRow(row)),
    warnings,
  };
}

export function readMarketingSegmentExecutionCsvFromLocalStorage(
  projectId: string,
): MarketingSegmentExecutionStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(marketingSegmentExecutionCsvLocalStorageKey(projectId));
    if (!raw) return null;
    return parseStoredMarketingSegmentExecutionCsv(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeMarketingSegmentExecutionCsvToLocalStorage(
  projectId: string,
  doc: MarketingSegmentExecutionStoredV1,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(marketingSegmentExecutionCsvLocalStorageKey(projectId), JSON.stringify(doc));
  } catch (e) {
    console.warn("[Segment execution CSV] localStorage save failed", e);
  }
}

export function clearMarketingSegmentExecutionCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(marketingSegmentExecutionCsvLocalStorageKey(projectId));
  } catch {
    /* ignore */
  }
}
