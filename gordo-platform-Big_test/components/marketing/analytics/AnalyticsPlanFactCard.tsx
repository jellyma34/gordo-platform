"use client";

import {
  EntityPerformanceAnalyticsSection,
  type EntityPerformanceAnalyticsSectionProps,
} from "@/components/marketing/EntityPerformanceAnalyticsSection";

/** Горизонтальный grouped bar chart «План vs Факт» (накопительно) + tooltip + легенда. */
export type AnalyticsPlanFactCardProps = EntityPerformanceAnalyticsSectionProps;

export function AnalyticsPlanFactCard(props: AnalyticsPlanFactCardProps) {
  return <EntityPerformanceAnalyticsSection {...props} />;
}
