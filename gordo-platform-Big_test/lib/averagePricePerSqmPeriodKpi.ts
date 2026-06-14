import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { AveragePriceKpiPlanSlice } from "@/lib/planDataSource/averagePricePerSqm/averagePricePlanSlice";
import { averagePriceProjectColumnCaption } from "@/lib/planDataSource/averagePricePerSqm/legacyAveragePriceWideTableCsv";
import type { AveragePriceProjectColumnKind } from "@/lib/planDataSource/averagePricePerSqm/types";
import { formatCompactNumber, numFmt } from "@/lib/salesPlanChartFormat";
import type { ApartmentKpiHue } from "@/lib/apartmentsPlanPeriodKpi";

export type AveragePricePeriodKpiUiData =
  | ({
      hasCsvPlan: true;
    } & AveragePriceKpiPlanSlice)
  | {
      hasCsvPlan: false;
      factMonth: number;
      factCumulative: number;
    };

/** Компактные подписи mini chart: «230 тыс». */
export function formatAveragePricePerSqmCompact(n: number | null | undefined): string {
  return formatCompactNumber(n);
}

/** Полное значение KPI: «230 824 руб./м²». */
export function formatAveragePricePerSqmKpiFull(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${numFmt.format(Math.round(n))} руб./м²`;
}

export function averagePriceExecutionPercent(
  numerator: number,
  planDenominator: number | null | undefined,
): number | null {
  if (planDenominator == null || !Number.isFinite(planDenominator) || planDenominator <= 0) return null;
  if (!Number.isFinite(numerator)) return null;
  return (numerator / planDenominator) * 100;
}

export function averagePriceVolumePercent(
  factCumulative: number,
  totalProject: number | null | undefined,
  hasCsvPlan: boolean,
): number | null {
  if (!hasCsvPlan) return null;
  return averagePriceExecutionPercent(factCumulative, totalProject);
}

export function averagePriceKpiHue(pct: number | null): ApartmentKpiHue {
  if (pct == null) return "yellow";
  if (pct >= 100) return "green";
  if (pct >= 85) return "yellow";
  return "red";
}

export function mergeAveragePriceEntityKpiData(
  slice: AveragePriceKpiPlanSlice | null,
): AveragePricePeriodKpiUiData {
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

export function averagePriceSliceToCardsData(kpiData: AveragePricePeriodKpiUiData): EntityPlanPeriodKpiCardsData {
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
    pctMonth: averagePriceExecutionPercent(factMonth, planMonth),
    pctCum: averagePriceExecutionPercent(factCumulative, planCum),
    pctVolume: averagePriceVolumePercent(factCumulative, totalProject, hasPlan),
  };
}

export function averagePriceProjectVolumeRail(
  kpiData: AveragePricePeriodKpiUiData,
  projectColumnKind: AveragePriceProjectColumnKind = "plan_project",
): { rub: number; caption: string } | null {
  if (!kpiData.hasCsvPlan) return null;
  const rub = kpiData.planProject;
  if (!Number.isFinite(rub) || rub <= 0) return null;
  return { rub, caption: averagePriceProjectColumnCaption(projectColumnKind) };
}

export function averagePricePeriodKpiHasData(data: AveragePricePeriodKpiUiData | null | undefined): boolean {
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
