import type { SegmentPlanFactBarRow } from "@/components/marketing/SalesPlanSegmentPlanFactBarChart";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
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
  /** План/факт по сегментам для каждого `YYYY-MM`. */
  monthlyByPeriodKey?: Record<string, SegmentExecutionPlanFactRow[]>;
  /** true — в CSV есть план по каждому сегменту. */
  hasSegmentPlan?: boolean;
  planTotal?: number;
  totalFact?: number;
  warnings: string[];
};

export type SegmentExecutionChartsPayload = {
  planFactRows: SegmentExecutionPlanFactRow[];
  completionRows: SegmentExecutionCompletionRow[];
  monthlyByPeriodKey?: Record<string, SegmentExecutionPlanFactRow[]>;
  hasSegmentPlan?: boolean;
  planTotal?: number;
  totalFact?: number;
};

/** Пересобрать из raw CSV (исправляет устаревший plan=0 и месяцы). */
export function reconcileSegmentExecutionDoc(
  doc: MarketingSegmentExecutionStoredV1,
): MarketingSegmentExecutionStoredV1 {
  const raw = doc.rawText?.trim();
  if (!raw) return doc;
  const needsReconcile = (doc.planFactRows ?? []).length > 0 && (doc.planFactRows ?? []).every((r) => Math.abs(r.plan) < 1e-9);
  if (!needsReconcile) return doc;
  const parsed = parseSegmentExecutionCsv(raw);
  if (!parsed.ok) return doc;
  return {
    ...doc,
    planFactRows: parsed.planFactRows,
    completionRows: parsed.completionRows,
    monthlyByPeriodKey: parsed.monthlyByPeriodKey,
    hasSegmentPlan: parsed.hasSegmentPlan,
    planTotal: parsed.planTotal,
    totalFact: parsed.totalFact,
    warnings: [...(doc.warnings ?? []), ...parsed.warnings],
  };
}

function parseQuarterId(id: string): { year: number; quarter: number } | null {
  const m = /^(\d{4})-([0-3])$/.exec(id);
  if (!m) return null;
  const year = Number(m[1]);
  const quarter = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(quarter)) return null;
  return { year, quarter };
}

function monthKeysInQuarter(year: number, quarter: number): string[] {
  const startMonth = quarter * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(startMonth + i).padStart(2, "0")}`);
}

const SEGMENT_KEYS_ORDER: SegmentExecutionPlanFactRow["key"][] = [
  "apartments",
  "parking",
  "storage",
  "commercial",
];

function sortedMonthlyPeriodKeys(monthly: Record<string, SegmentExecutionPlanFactRow[]>): string[] {
  return Object.keys(monthly)
    .filter((k) => /^\d{4}-\d{2}$/.test(k))
    .sort((a, b) => a.localeCompare(b));
}

/** Суммировать plan/fact по сегментам за несколько месяцев. */
function sumSegmentPlanFactRows(
  rowsList: readonly SegmentExecutionPlanFactRow[][],
): SegmentExecutionPlanFactRow[] {
  const byKey = new Map<
    SegmentExecutionPlanFactRow["key"],
    { segment: string; plan: number; fact: number }
  >();
  for (const rows of rowsList) {
    for (const r of rows) {
      const cur = byKey.get(r.key) ?? { segment: r.segment, plan: 0, fact: 0 };
      cur.plan += Number.isFinite(r.plan) ? r.plan : 0;
      cur.fact += Number.isFinite(r.fact) ? r.fact : 0;
      byKey.set(r.key, cur);
    }
  }
  return SEGMENT_KEYS_ORDER.map((key) => {
    const cell = byKey.get(key);
    return {
      key,
      segment: cell?.segment ?? key,
      plan: cell?.plan ?? 0,
      fact: cell?.fact ?? 0,
    };
  });
}

/** Накопительный план (₽) по сегментам из помесячного CSV. */
function sumSegmentPlanCumulative(
  rowsList: readonly SegmentExecutionPlanFactRow[][],
): SegmentExecutionPlanFactRow[] {
  const summed = sumSegmentPlanFactRows(rowsList);
  return summed.map((r) => ({ ...r, fact: 0 }));
}

function resolveThroughPeriodKey(
  monthly: Record<string, SegmentExecutionPlanFactRow[]>,
  opts: {
    periodMode: "all" | "month" | "quarter";
    monthKey?: string | null;
    quarterId?: string | null;
  },
): string | null {
  const keys = sortedMonthlyPeriodKeys(monthly);
  if (keys.length === 0) return null;

  if (opts.periodMode === "all") {
    return keys[keys.length - 1]!;
  }

  if (opts.periodMode === "month") {
    const canon = opts.monthKey ? normalizeMonthKey(opts.monthKey) ?? opts.monthKey : null;
    if (canon && /^\d{4}-\d{2}$/.test(canon)) {
      if (keys.includes(canon)) return canon;
      const upTo = keys.filter((k) => k <= canon);
      if (upTo.length > 0) return upTo[upTo.length - 1]!;
    }
    return keys[keys.length - 1]!;
  }

  const q = opts.quarterId ? parseQuarterId(opts.quarterId) : null;
  if (q) {
    const qKeys = monthKeysInQuarter(q.year, q.quarter);
    const inQ = qKeys.filter((k) => keys.includes(k));
    if (inQ.length > 0) return inQ[inQ.length - 1]!;
    const lastQMonth = qKeys[qKeys.length - 1]!;
    const upTo = keys.filter((k) => k <= lastQMonth);
    if (upTo.length > 0) return upTo[upTo.length - 1]!;
  }

  return keys[keys.length - 1]!;
}

export type SegmentExecutionChartPeriodOpts = {
  periodMode: "all" | "month" | "quarter";
  monthKey?: string | null;
  quarterId?: string | null;
};

/** plan/fact из CSV segment_execution (суммы — факт; план — только колонки «… план»). */
function planFactRowsToBarRows(rows: readonly SegmentExecutionPlanFactRow[]): SegmentPlanFactBarRow[] {
  return rows.map((r) => ({
    name: r.segment,
    fact: r.fact,
    plan: r.plan,
  }));
}

/**
 * План/факт для bar chart «Выполнение плана продаж по сегментам» из CSV segment_execution.
 * При помесячном CSV: месяц — срез месяца; квартал — сумма месяцев квартала; все — накопительный planFactRows.
 */
export function segmentExecutionPlanFactBarRowsForChartPeriod(
  payload: SegmentExecutionChartsPayload | null | undefined,
  opts: SegmentExecutionChartPeriodOpts,
): SegmentPlanFactBarRow[] | null {
  if (!payload) return null;

  const monthly = payload.monthlyByPeriodKey;
  if (monthly && Object.keys(monthly).length > 0) {
    if (opts.periodMode === "month") {
      const canon = opts.monthKey ? normalizeMonthKey(opts.monthKey) ?? opts.monthKey : null;
      if (canon && /^\d{4}-\d{2}$/.test(canon)) {
        const monthRows = monthly[canon];
        if (monthRows?.length) return planFactRowsToBarRows(monthRows);
      }
    }

    if (opts.periodMode === "quarter" && opts.quarterId) {
      const q = parseQuarterId(opts.quarterId);
      if (q) {
        const qKeys = monthKeysInQuarter(q.year, q.quarter).filter((k) => monthly[k]?.length);
        if (qKeys.length > 0) {
          return planFactRowsToBarRows(sumSegmentPlanFactRows(qKeys.map((k) => monthly[k]!)));
        }
      }
    }

    if (opts.periodMode === "all") {
      const pf = resolveSegmentExecutionPlanFactRows(payload);
      if (pf.length > 0) return planFactRowsToBarRows(pf);
    }

    const through = resolveThroughPeriodKey(monthly, opts);
    if (through) {
      const keys = sortedMonthlyPeriodKeys(monthly).filter((k) => k <= through);
      const chunks = keys.map((k) => monthly[k]!).filter((rows) => rows.length > 0);
      if (chunks.length > 0) return planFactRowsToBarRows(sumSegmentPlanFactRows(chunks));
    }
    return null;
  }

  const pf = resolveSegmentExecutionPlanFactRows(payload);
  if (!pf.length) return null;
  return planFactRowsToBarRows(pf);
}

export function segmentExecutionCumulativePlanForChartPeriod(
  payload: SegmentExecutionChartsPayload | null | undefined,
  opts: SegmentExecutionChartPeriodOpts,
): SegmentExecutionPlanFactRow[] | null {
  const monthly = payload?.monthlyByPeriodKey;
  if (!monthly || Object.keys(monthly).length === 0) return null;

  const through = resolveThroughPeriodKey(monthly, opts);
  if (!through) return null;

  const keys = sortedMonthlyPeriodKeys(monthly).filter((k) => k <= through);
  if (keys.length === 0) return null;

  const chunks = keys.map((k) => monthly[k]!).filter((rows) => rows.length > 0);
  if (chunks.length === 0) return null;

  return sumSegmentPlanCumulative(chunks);
}

/** Накопительный plan + fact из CSV (для карточек «План vs факт» в блоке исполнения). */
export function segmentExecutionCumulativePlanFactFromMonthly(
  monthly: Record<string, SegmentExecutionPlanFactRow[]>,
): SegmentExecutionPlanFactRow[] {
  const keys = sortedMonthlyPeriodKeys(monthly);
  if (keys.length === 0) return [];
  const chunks = keys.map((k) => monthly[k]!);
  return sumSegmentPlanFactRows(chunks);
}

/**
 * @deprecated Используйте {@link segmentExecutionCumulativePlanForChartPeriod}.
 */
export function segmentExecutionPlanFactForChartPeriod(
  payload: SegmentExecutionChartsPayload | null | undefined,
  opts: { monthKey?: string | null; quarterId?: string | null },
): SegmentExecutionPlanFactRow[] | null {
  const periodMode = opts.quarterId ? "quarter" : opts.monthKey ? "month" : "all";
  return segmentExecutionCumulativePlanForChartPeriod(payload, {
    periodMode,
    monthKey: opts.monthKey,
    quarterId: opts.quarterId,
  });
}

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
  planFactRowsOverride?: readonly SegmentExecutionPlanFactRow[],
): boolean {
  if (!payload) return false;
  if (payload.hasSegmentPlan === true) return true;
  const pf = planFactRowsOverride ?? payload.planFactRows ?? [];
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
  const rawDoc: MarketingSegmentExecutionStoredV1 = {
    v: 1,
    updatedAt: o.updatedAt,
    fileName: o.fileName,
    uploadedBy: typeof o.uploadedBy === "string" ? o.uploadedBy : undefined,
    rawText: typeof o.rawText === "string" ? o.rawText : undefined,
    planFactRows,
    completionRows: (o.completionRows as unknown[]).map((row: unknown) => normalizeCompletionRow(row)),
    monthlyByPeriodKey: normalizeMonthlyByPeriodKey(o.monthlyByPeriodKey),
    hasSegmentPlan: o.hasSegmentPlan === true,
    planTotal,
    totalFact,
    warnings,
  };
  const reconciled = reconcileSegmentExecutionDoc(rawDoc);
  let enriched = reconciled.planFactRows;
  const hasPlanInRows = enriched.some((r) => Math.abs(r.plan) > 1e-9);
  if (!hasPlanInRows && planTotal != null && planTotal > 0) {
    enriched = distributeSegmentPlanByFactShare(planTotal, enriched);
  }
  const hasPlan =
    reconciled.hasSegmentPlan === true ||
    enriched.some((r) => Math.abs(r.plan) > 1e-9) ||
    Object.values(reconciled.monthlyByPeriodKey ?? {}).some((rows) =>
      rows.some((r) => Math.abs(r.plan) > 1e-9),
    );
  let completionRows = reconciled.completionRows;
  if (!completionRows.some((r) => Number.isFinite(r.pct) && r.pct > 0) && hasPlan) {
    completionRows = buildSegmentExecutionCompletionRows(enriched);
  }
  return {
    ...reconciled,
    planFactRows: enriched,
    completionRows,
    hasSegmentPlan: hasPlan,
    planTotal,
    totalFact,
  };
}

function normalizeMonthlyByPeriodKey(
  raw: unknown,
): Record<string, SegmentExecutionPlanFactRow[]> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, SegmentExecutionPlanFactRow[]> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const pk = normalizeMonthKey(key) ?? key;
    if (!/^\d{4}-\d{2}$/.test(pk) || !Array.isArray(val)) continue;
    out[pk] = val.map((row) => normalizePlanFactRow(row));
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
