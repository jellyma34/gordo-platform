"use client";

import {
  EntityPlanPeriodKpiSection,
  type EntityPlanPeriodKpiSectionProps,
} from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";

/**
 * Premium KPI-сетка: план/факт столбики, отклонение, progress runner, donut «% выполнения»,
 * карточка «План проекта» / «Стоимость проекта».
 */
export type AnalyticsKpiCardProps = EntityPlanPeriodKpiSectionProps;

export function AnalyticsKpiCard(props: AnalyticsKpiCardProps) {
  return <EntityPlanPeriodKpiSection {...props} embedded cardsLayout="ddu-revenue-premium" cardsDensity="ddu-revenue-premium" />;
}
