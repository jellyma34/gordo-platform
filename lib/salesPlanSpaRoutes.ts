import type { SalesPlanScenarioId } from "@/lib/salesPlanWorkModel";

/** Канонические маршруты цикла «рабочий режим → пояснение → презентация». */
export const SALES_PLAN_SPA = {
  work: "/marketing/sales-plan/work",
  explain: "/marketing/sales-plan/explain",
  presentation: "/marketing/sales-plan/presentation",
} as const;

/** Сценарий слайда презентации (план/факторы в SalesPlanPanel). */
export type SalesPlanPresentationScenario = "optimistic" | "realistic" | "pessimistic";

export function parsePresentationScenarioQuery(v: string | null): SalesPlanPresentationScenario {
  if (v === "optimistic" || v === "realistic" || v === "pessimistic") return v;
  return "realistic";
}

/** Грубое сопоставление сценария рабочей таблицы и сценария презентации. */
export function workScenarioToPresentationScenario(w: SalesPlanScenarioId): SalesPlanPresentationScenario {
  if (w === "base") return "realistic";
  if (w === "updated") return "optimistic";
  return "pessimistic";
}
