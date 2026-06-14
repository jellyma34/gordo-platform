"use client";

/**
 * Кольцевой KPI «% выполнения» встроен в {@link AnalyticsKpiCard}
 * (третья карточка premium-сетки через `EntityPlanPeriodKpiCardsGrid`).
 *
 * Отдельный export для единой архитектуры analytics-блоков; не дублирует разметку.
 */
export { AnalyticsKpiCard as AnalyticsDonutCard } from "@/components/marketing/analytics/AnalyticsKpiCard";
