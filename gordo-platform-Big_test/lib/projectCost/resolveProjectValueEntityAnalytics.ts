import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import type { MarketingProjectValueCsvStoredV1 } from "@/lib/marketingProjectValueCsv";
import {
  buildProjectValueParkingAnalytics,
  buildProjectValueStorageAnalytics,
  buildProjectValueEntityChartRows,
  projectValueEntityAnalyticsHasData,
  type ProjectValueEntityAnalyticsBreakdown,
} from "@/lib/projectValueEntityAnalytics";
import {
  buildProjectValuePlanTypeChartRows,
  buildProjectValuePlanTypeKpiBreakdown,
  projectValuePlanTypeBreakdownHasData,
} from "@/lib/projectValuePlanTypeKpi";
import type { PerformanceChartRow } from "@/lib/entityPerformanceChart";
import { performanceChartHasData } from "@/lib/entityPerformanceChart";
import type { SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";

export type ProjectValueEntityAnalyticsView = {
  title: string;
  rows: readonly PerformanceChartRow[];
  hasCsvPlan: boolean;
  hasData: boolean;
};

export function resolveProjectValueEntityAnalytics(args: {
  objectType: SalesPlanObjectTypeKey;
  doc: MarketingProjectValueCsvStoredV1 | null;
  dealRows: readonly NormalizedDealRow[];
  periodGran: "month" | "quarter";
  currentPeriodKey: string;
}): ProjectValueEntityAnalyticsView | null {
  const hasCsvPlan = Boolean(args.doc?.rows?.length);
  const rows = args.doc?.rows ?? [];

  if (args.objectType === "parking") {
    const breakdown: ProjectValueEntityAnalyticsBreakdown = buildProjectValueParkingAnalytics({
      rows,
      hasCsvPlan,
      period: args.periodGran,
      currentPeriodKey: args.currentPeriodKey,
      dealRows: args.dealRows,
    });
    const chartRows = buildProjectValueEntityChartRows(breakdown);
    return {
      title: "Аналитика выполнения плана по машино-местам",
      rows: chartRows,
      hasCsvPlan,
      hasData: projectValueEntityAnalyticsHasData(breakdown),
    };
  }

  if (args.objectType === "storage") {
    const breakdown = buildProjectValueStorageAnalytics({
      rows,
      hasCsvPlan,
      period: args.periodGran,
      currentPeriodKey: args.currentPeriodKey,
      dealRows: args.dealRows,
    });
    const chartRows = buildProjectValueEntityChartRows(breakdown);
    return {
      title: "Аналитика выполнения плана по кладовым",
      rows: chartRows,
      hasCsvPlan,
      hasData: projectValueEntityAnalyticsHasData(breakdown),
    };
  }

  if (args.objectType === "apartments" || args.objectType === "all") {
    const breakdown = buildProjectValuePlanTypeKpiBreakdown({
      rows,
      hasCsvPlan,
      period: args.periodGran,
      currentPeriodKey: args.currentPeriodKey,
      dealRows: args.dealRows,
    });
    const chartRows = buildProjectValuePlanTypeChartRows(breakdown);
    return {
      title: "Аналитика выполнения плана по комнатности",
      rows: chartRows,
      hasCsvPlan,
      hasData: projectValuePlanTypeBreakdownHasData(breakdown) && performanceChartHasData(chartRows),
    };
  }

  return null;
}
