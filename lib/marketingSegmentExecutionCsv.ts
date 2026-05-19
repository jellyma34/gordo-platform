import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";
import {
  buildSegmentExecutionCompletionRows,
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
  rawText?: string;
  planFactRows: SegmentExecutionPlanFactRow[];
  completionRows: SegmentExecutionCompletionRow[];
  /** true — в CSV есть план по каждому сегменту. */
  hasSegmentPlan?: boolean;
  planTotal?: number;
  totalFact?: number;
  warnings: string[];
};

export type SegmentExecutionChartsPayload = {
  planFactRows: SegmentExecutionPlanFactRow[];
  completionRows: SegmentExecutionCompletionRow[];
  hasSegmentPlan?: boolean;
  planTotal?: number;
  totalFact?: number;
};

/** Сумма плана (₽) из plan_fact.csv — fallback, если в CSV сегментов нет «План продаж». */
export function sumPlanTotalFromMonthlyPlanVsFact(
  monthly: readonly PlanVsFactMonthlyRubPoint[] | null | undefined,
): number {
  if (!monthly?.length) return 0;
  let sum = 0;
  for (const p of monthly) {
    const v = p.planRub;
    if (typeof v === "number" && Number.isFinite(v)) sum += v;
  }
  return sum;
}

/** Распределить общий план по долям факта сегментов. */
export function distributeSegmentPlanByFactShare(
  planTotal: number,
  planFactRows: readonly SegmentExecutionPlanFactRow[],
): SegmentExecutionPlanFactRow[] {
  const totalFact = planFactRows.reduce((s, r) => s + Math.max(0, r.fact), 0);
  if (planTotal <= 0 || totalFact <= 0) return planFactRows.map((r) => ({ ...r }));
  return planFactRows.map((r) => ({
    ...r,
    plan: (planTotal * Math.max(0, r.fact)) / totalFact,
  }));
}

/**
 * plan/fact только из CSV segment_execution (без plan_fact, mock, distribute по факту).
 * @deprecated planTotalFallback игнорируется — не подмешивать внешний план.
 */
export function resolveSegmentExecutionPlanFactRows(
  payload: SegmentExecutionChartsPayload | null | undefined,
  _planTotalFallback = 0,
): SegmentExecutionPlanFactRow[] {
  if (!payload) return [];
  const pf = payload.planFactRows ?? [];
  if (pf.some((r) => Math.abs(r.plan) > 1e-9)) return pf;
  const planTotal =
    payload.hasSegmentPlan === true &&
    typeof payload.planTotal === "number" &&
    payload.planTotal > 0
      ? payload.planTotal
      : 0;
  if (planTotal > 0 && pf.some((r) => Math.abs(r.fact) > 1e-9)) {
    return distributeSegmentPlanByFactShare(planTotal, pf);
  }
  return pf;
}

/** План в UI — только если он есть в загруженном CSV сегментов (не из plan_fact / mock). */
export function segmentExecutionHasSegmentPlan(
  payload: SegmentExecutionChartsPayload | null | undefined,
  _planTotalFallback = 0,
): boolean {
  if (!payload) return false;
  if (payload.hasSegmentPlan === true) return true;
  const pf = payload.planFactRows ?? [];
  return pf.some((r) => Math.abs(r.plan) > 1e-9);
}

/** completionRows для графика % — пересчёт из plan/fact (fact/plan×100). */
export function resolveSegmentExecutionCompletionRows(
  payload: SegmentExecutionChartsPayload | null | undefined,
  planFactRows?: readonly SegmentExecutionPlanFactRow[],
  _planTotalFallback = 0,
): SegmentExecutionCompletionRow[] {
  if (!payload && (!planFactRows || planFactRows.length === 0)) return [];
  const pf = planFactRows ?? resolveSegmentExecutionPlanFactRows(payload ?? null);
  if (!pf.length) return [];
  if (pf.some((r) => Math.abs(r.plan) > 1e-9)) return buildSegmentExecutionCompletionRows(pf);
  const stored = payload?.completionRows ?? [];
  if (stored.some((r) => Number.isFinite(r.pct) && r.pct > 0)) return stored;
  return buildSegmentExecutionCompletionRows(pf);
}

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
  const planFactRows = o.planFactRows.map((row: unknown) => normalizePlanFactRow(row));
  const planTotal =
    typeof o.planTotal === "number" && Number.isFinite(o.planTotal) ? Math.max(0, o.planTotal) : undefined;
  const totalFact =
    typeof o.totalFact === "number" && Number.isFinite(o.totalFact) ? Math.max(0, o.totalFact) : undefined;
  let enriched = planFactRows;
  const hasPlanInRows = planFactRows.some((r) => Math.abs(r.plan) > 1e-9);
  if (!hasPlanInRows && planTotal != null && planTotal > 0) {
    enriched = distributeSegmentPlanByFactShare(planTotal, planFactRows);
  }
  const hasPlan = enriched.some((r) => Math.abs(r.plan) > 1e-9);
  let completionRows = (o.completionRows as unknown[]).map((row: unknown) => normalizeCompletionRow(row));
  if (!completionRows.some((r) => Number.isFinite(r.pct) && r.pct > 0) && hasPlan) {
    completionRows = buildSegmentExecutionCompletionRows(enriched);
  }
  return {
    v: 1,
    updatedAt: o.updatedAt,
    fileName: o.fileName,
    uploadedBy: typeof o.uploadedBy === "string" ? o.uploadedBy : undefined,
    planFactRows: enriched,
    completionRows,
    hasSegmentPlan: o.hasSegmentPlan === true || hasPlan,
    planTotal,
    totalFact,
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
