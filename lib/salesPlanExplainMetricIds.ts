/**
 * Идентификаторы метрик explain «Темп продаж» — связь графика и карточек формул.
 * Используется только на странице explain (не презентация).
 */

export type SalesTempoExplainMetricId =
  | "sumPlanFact"
  /** Σ fact / Σ plan (кумулятив и точечное отношение темпов на линии) */
  | "ratio"
  | "planPerMonth"
  | "actualPerMonth"
  /** Индикатор % к норме под линией темпа */
  | "tempoNorm"
  | "monthlyCompare"
  | "monthlyRatio"
  | "barRead";

/** Recharts dataKey линии темпа → metricId */
export const TEMPO_LINE_DATAKEY_TO_METRIC: Record<string, SalesTempoExplainMetricId> = {
  plannedRate: "planPerMonth",
  actualRate: "actualPerMonth",
};
