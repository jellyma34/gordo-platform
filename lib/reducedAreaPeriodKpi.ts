import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { ReducedAreaKpiPlanSlice } from "@/lib/planDataSource/reducedArea/reducedAreaPlanSlice";
import { reducedAreaProjectColumnCaption } from "@/lib/planDataSource/reducedArea/legacyReducedAreaWideTableCsv";
import type { ReducedAreaProjectColumnKind } from "@/lib/planDataSource/reducedArea/types";
import { formatCompactNumber, numFmt } from "@/lib/salesPlanChartFormat";
import type { ApartmentKpiHue } from "@/lib/apartmentsPlanPeriodKpi";

export type ReducedAreaPeriodKpiUiData =
  | ({
      hasCsvPlan: true;
    } & ReducedAreaKpiPlanSlice)
  | {
      hasCsvPlan: false;
      factMonth: number;
      factCumulative: number;
    };

/** Компактные подписи mini chart: «12,5 тыс м²». */
export function formatReducedAreaCompact(n: number | null | undefined): string {
  const core = formatCompactNumber(n);
  if (core === "—") return "—";
  return `${core} м²`;
}

/** Полное значение KPI: «12 540 м²». */
export function formatReducedAreaKpiFull(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${numFmt.format(Math.round(n))} м²`;
}

export function reducedAreaExecutionPercent(
  numerator: number,
  planDenominator: number | null | undefined,
): number | null {
  if (planDenominator == null || !Number.isFinite(planDenominator) || planDenominator <= 0) return null;
  if (!Number.isFinite(numerator)) return null;
  return (numerator / planDenominator) * 100;
}

export function reducedAreaVolumePercent(
  factCumulative: number,
  totalProject: number | null | undefined,
  hasCsvPlan: boolean,
): number | null {
  if (!hasCsvPlan) return null;
  return reducedAreaExecutionPercent(factCumulative, totalProject);
}

export function reducedAreaKpiHue(pct: number | null): ApartmentKpiHue {
  if (pct == null) return "yellow";
  if (pct >= 100) return "green";
  if (pct >= 85) return "yellow";
  return "red";
}

export function mergeReducedAreaEntityKpiData(slice: ReducedAreaKpiPlanSlice | null): ReducedAreaPeriodKpiUiData {
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

export function reducedAreaSliceToCardsData(kpiData: ReducedAreaPeriodKpiUiData): EntityPlanPeriodKpiCardsData {
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
    pctMonth: reducedAreaExecutionPercent(factMonth, planMonth),
    pctCum: reducedAreaExecutionPercent(factCumulative, planCum),
    pctVolume: reducedAreaVolumePercent(factCumulative, totalProject, hasPlan),
  };
}

export function reducedAreaProjectVolumeRail(
  kpiData: ReducedAreaPeriodKpiUiData,
  projectColumnKind: ReducedAreaProjectColumnKind = "plan_project",
): { rub: number; caption: string } | null {
  if (!kpiData.hasCsvPlan) return null;
  const area = kpiData.planProject;
  if (!Number.isFinite(area) || area <= 0) return null;
  return { rub: area, caption: reducedAreaProjectColumnCaption(projectColumnKind) };
}

export function reducedAreaPeriodKpiHasData(data: ReducedAreaPeriodKpiUiData | null | undefined): boolean {
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
