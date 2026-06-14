import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { TotalAreaKpiPlanSlice } from "@/lib/planDataSource/totalArea/totalAreaPlanSlice";
import { totalAreaProjectColumnCaption } from "@/lib/planDataSource/totalArea/legacyTotalAreaWideTableCsv";
import type { TotalAreaProjectColumnKind } from "@/lib/planDataSource/totalArea/types";
import { formatCompactNumber, numFmt } from "@/lib/salesPlanChartFormat";
import type { ApartmentKpiHue } from "@/lib/apartmentsPlanPeriodKpi";

export type TotalAreaPeriodKpiUiData =
  | ({
      hasCsvPlan: true;
    } & TotalAreaKpiPlanSlice)
  | {
      hasCsvPlan: false;
      factMonth: number;
      factCumulative: number;
    };

/** Компактные подписи mini chart: «12,5 тыс м²». */
export function formatTotalAreaCompact(n: number | null | undefined): string {
  const core = formatCompactNumber(n);
  if (core === "—") return "—";
  return `${core} м²`;
}

/** Полное значение KPI: «12 540 м²». */
export function formatTotalAreaKpiFull(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${numFmt.format(Math.round(n))} м²`;
}

export function totalAreaExecutionPercent(
  numerator: number,
  planDenominator: number | null | undefined,
): number | null {
  if (planDenominator == null || !Number.isFinite(planDenominator) || planDenominator <= 0) return null;
  if (!Number.isFinite(numerator)) return null;
  return (numerator / planDenominator) * 100;
}

export function totalAreaVolumePercent(
  factCumulative: number,
  totalProject: number | null | undefined,
  hasCsvPlan: boolean,
): number | null {
  if (!hasCsvPlan) return null;
  return totalAreaExecutionPercent(factCumulative, totalProject);
}

export function totalAreaKpiHue(pct: number | null): ApartmentKpiHue {
  if (pct == null) return "yellow";
  if (pct >= 100) return "green";
  if (pct >= 85) return "yellow";
  return "red";
}

export function mergeTotalAreaEntityKpiData(slice: TotalAreaKpiPlanSlice | null): TotalAreaPeriodKpiUiData {
  if (slice) {
    return {
      hasCsvPlan: true,
      planMonth: slice.planMonth,
      planCumulative: slice.planCumulative,
      planProject: slice.planProject,
      factMonth: slice.factMonth,
      factCumulative: slice.factCumulative,
    };
  }
  return { hasCsvPlan: false, factMonth: 0, factCumulative: 0 };
}

export function totalAreaSliceToCardsData(kpiData: TotalAreaPeriodKpiUiData): EntityPlanPeriodKpiCardsData {
  const hasPlan = kpiData.hasCsvPlan;
  const planMonth = hasPlan ? kpiData.planMonth : null;
  const planCum = hasPlan ? kpiData.planCumulative : null;
  const totalProject = hasPlan ? kpiData.planProject : null;
  const factMonth = kpiData.factMonth;
  const factCumulative = kpiData.factCumulative;
  return {
    hasCsvPlan: hasPlan,
    factMonth,
    factCumulative,
    planMonth,
    planCumulative: planCum,
    totalProjectPlan: totalProject,
    pctMonth: totalAreaExecutionPercent(factMonth, planMonth),
    pctCum: totalAreaExecutionPercent(factCumulative, planCum),
    pctVolume: totalAreaVolumePercent(factCumulative, totalProject, hasPlan),
  };
}

export function totalAreaProjectVolumeRail(
  kpiData: TotalAreaPeriodKpiUiData,
  projectColumnKind: TotalAreaProjectColumnKind = "plan_project",
): { rub: number; caption: string } | null {
  if (!kpiData.hasCsvPlan) return null;
  const area = kpiData.planProject;
  if (!Number.isFinite(area) || area <= 0) return null;
  return { rub: area, caption: totalAreaProjectColumnCaption(projectColumnKind) };
}

export function totalAreaPeriodKpiHasData(data: TotalAreaPeriodKpiUiData | null | undefined): boolean {
  if (!data) return false;
  if (data.hasCsvPlan) {
    return (
      data.planCumulative > 0 ||
      data.planMonth > 0 ||
      data.planProject > 0 ||
      data.factCumulative > 0 ||
      data.factMonth > 0
    );
  }
  return data.factCumulative > 0 || data.factMonth > 0;
}
