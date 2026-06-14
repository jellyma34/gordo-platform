/** Сегменты accordion блока «Выполнение плана отчётного периода». */
export type ReportingPeriodPlanSegmentKey =
  | "project"
  | "apartments"
  | "parking"
  | "storage"
  | "commercial";

export const REPORTING_PERIOD_PLAN_SEGMENT_ORDER: readonly ReportingPeriodPlanSegmentKey[] = [
  "project",
  "apartments",
  "parking",
  "storage",
  "commercial",
] as const;

export const REPORTING_PERIOD_PLAN_SEGMENT_LABEL_RU: Record<ReportingPeriodPlanSegmentKey, string> = {
  project: "Проект",
  apartments: "Квартиры",
  parking: "Машино-места",
  storage: "Кладовые",
  commercial: "Коммерция",
};
