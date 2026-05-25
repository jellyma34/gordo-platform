"use client";

import { ApartmentPlanPeriodKpiBlock } from "@/components/marketing/ApartmentPlanPeriodKpiBlock";
import { ANALYTICS_SECTION_SPACING_CLASS } from "@/components/marketing/analytics/analyticsDashboardShell";
import type { ApartmentPlanPeriodKpiUiData } from "@/lib/apartmentsPlanPeriodKpi";
import type { ParkingPlanAnalyticsBreakdown } from "@/lib/parkingPlanAnalytics";
import type { ParkingPlanPeriodKpiUiData } from "@/lib/parkingPlanPeriodKpi";
import type { StoragePlanAnalyticsBreakdown } from "@/lib/storagePlanAnalytics";
import type { StoragePlanPeriodKpiUiData } from "@/lib/storagePlanPeriodKpi";
import type { ProjectPlanPeriodKpiUiData } from "@/lib/projectPlanPeriodKpi";
import type { ApartmentPlanCsvParseDiagnostics } from "@/lib/planDataSource/types";

export type ReportingPeriodPlanExecutionSectionProps = {
  data: ApartmentPlanPeriodKpiUiData;
  presentation: boolean;
  presDark: boolean;
  mplPremium: boolean;
  isEditMode?: boolean;
  csvHydrated?: boolean;
  csvLoading?: boolean;
  csvError?: string | null;
  csvMeta?: { fileName: string; updatedAt: string; uploadedBy?: string } | null;
  hasCsv?: boolean;
  onCsvUpload?: (file: File) => Promise<void>;
  onCsvClear?: () => Promise<void>;
  csvDiagnostics?: ApartmentPlanCsvParseDiagnostics | null;
  parkingPlanPeriodKpi?: ParkingPlanPeriodKpiUiData | null;
  parkingPlanAnalyticsBreakdown?: ParkingPlanAnalyticsBreakdown | null;
  storagePlanPeriodKpi?: StoragePlanPeriodKpiUiData | null;
  storagePlanAnalyticsBreakdown?: StoragePlanAnalyticsBreakdown | null;
  projectPlanPeriodKpi?: ProjectPlanPeriodKpiUiData | null;
  className?: string;
};

/**
 * «Выполнение плана отчетного периода» — premium shell и KPI как у блока ДДУ.
 * Расчёты и CSV — в {@link ApartmentPlanPeriodKpiBlock}.
 */
export function ReportingPeriodPlanExecutionSection({
  className = "",
  ...kpiProps
}: ReportingPeriodPlanExecutionSectionProps) {
  if (!kpiProps.data || typeof kpiProps.data !== "object") {
    return null;
  }

  return (
    <div
      className={`reporting-period-plan-execution w-full min-w-0 max-w-none ${ANALYTICS_SECTION_SPACING_CLASS} ${className}`.trim()}
      data-analytics-section="reporting-period-plan-execution"
      id="marketing-reporting-period-plan-execution"
    >
      <ApartmentPlanPeriodKpiBlock {...kpiProps} />
    </div>
  );
}
