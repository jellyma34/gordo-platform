import type {
  SalesPlanMetricKind,
  SalesPlanScenarioId,
  SalesPlanTerminationId,
  SalesPlanWorkGrid,
} from "@/lib/salesPlanWorkModel";
import { normalizeWorkGridFromStorage } from "@/lib/salesPlanWorkModel";

export const SALES_PLAN_EXPLAIN_SESSION_KEY = "gordo-sales-plan-explain-snapshot-v1";

export type SalesPlanExplainSessionPayload = {
  /** v1 — старый снимок; v2 — с termination и сеткой v3 */
  v: 1 | 2;
  scenario: SalesPlanScenarioId;
  termination?: SalesPlanTerminationId;
  /** Черновик на момент нажатия (в т.ч. несохранённые правки). */
  grid: SalesPlanWorkGrid;
  metricTab: SalesPlanMetricKind;
  savedAt: string;
};

const SCENARIOS: SalesPlanScenarioId[] = ["base", "updated", "forecast"];
const TERMINATIONS: SalesPlanTerminationId[] = ["with_terminations", "without_terminations"];
const METRICS: SalesPlanMetricKind[] = [
  "quantity",
  "area_total",
  "area_weighted",
  "revenue_ddu",
  "cashflow_escrow",
];

function normalizeMetricTab(m: string): SalesPlanMetricKind {
  if (m === "units") return "quantity";
  if (m === "revenue") return "revenue_ddu";
  if (m === "avgPrice") return "quantity";
  if (METRICS.includes(m as SalesPlanMetricKind)) return m as SalesPlanMetricKind;
  return "quantity";
}

function normalizeTermination(t: unknown): SalesPlanTerminationId {
  if (t === "without_terminations" || t === "with_terminations") return t;
  return "with_terminations";
}

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
    if (o.v !== 1 && o.v !== 2) return null;
    if (typeof o.scenario !== "string" || typeof o.grid !== "object" || o.grid === null) return null;
    if (!SCENARIOS.includes(o.scenario as SalesPlanScenarioId)) return null;

    const grid = normalizeWorkGridFromStorage(o.grid);
    if (!grid) return null;

    const metricTab = normalizeMetricTab(String(o.metricTab ?? "quantity"));
    const termination = normalizeTermination(o.termination);

    return {
      v: o.v === 2 ? 2 : 1,
      scenario: o.scenario as SalesPlanScenarioId,
      termination,
      grid,
      metricTab,
      savedAt: typeof o.savedAt === "string" ? o.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
