import type { SalesPlanMetricKind, SalesPlanScenarioId, SalesPlanWorkGrid } from "@/lib/salesPlanWorkModel";

export const SALES_PLAN_EXPLAIN_SESSION_KEY = "gordo-sales-plan-explain-snapshot-v1";

export type SalesPlanExplainSessionPayload = {
  v: 1;
  scenario: SalesPlanScenarioId;
  /** Черновик на момент нажатия (в т.ч. несохранённые правки). */
  grid: SalesPlanWorkGrid;
  metricTab: SalesPlanMetricKind;
  savedAt: string;
};

/** Чтение снимка для explain из браузерного хранилища сессии (только клиент). */
export function readSalesPlanExplainSessionRaw(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(SALES_PLAN_EXPLAIN_SESSION_KEY);
}

export function parseSalesPlanExplainSession(raw: string | null): SalesPlanExplainSessionPayload | null {
  if (!raw) return null;
  try {
    const x = JSON.parse(raw) as unknown;
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (o.v !== 1 || typeof o.scenario !== "string" || typeof o.grid !== "object" || o.grid === null) return null;
    if (!["base", "updated", "forecast"].includes(o.scenario as string)) return null;
    if (!["units", "revenue", "avgPrice"].includes(o.metricTab as string)) return null;
    return o as SalesPlanExplainSessionPayload;
  } catch {
    return null;
  }
}
