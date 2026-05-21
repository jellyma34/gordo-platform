import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { InstallmentAreaDealFacts } from "@/lib/installmentAreaFactsFromDeals";
import type { InstallmentAreaKpiPlanSlice } from "@/lib/planDataSource/installmentArea/installmentAreaPlanSlice";
import { dec1Fmt } from "@/lib/salesPlanChartFormat";

export type InstallmentAreaPeriodKpiUiData =
  | ({
      hasCsvPlan: true;
    } & InstallmentAreaKpiPlanSlice)
  | {
      hasCsvPlan: false;
      factMonthArea: number;
      factCumulativeArea: number;
    };

export function formatInstallmentAreaSqmValue(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return dec1Fmt.format(n);
}

export function formatInstallmentAreaSqmParts(
  n: number | null | undefined,
): { value: string; unit: string } | { value: "—" } {
  const value = formatInstallmentAreaSqmValue(n);
  if (value === "—") return { value: "—" };
  return { value, unit: "кв.м" };
}

export function formatInstallmentAreaSqm(n: number | null | undefined): string {
  const parts = formatInstallmentAreaSqmParts(n);
  if (parts.value === "—") return "—";
  return `${parts.value} ${parts.unit}`;
}

export function installmentAreaExecutionPercent(
  numerator: number,
  planDenominator: number | null | undefined,
): number | null {
  if (planDenominator == null || !Number.isFinite(planDenominator) || planDenominator <= 0) return null;
  if (!Number.isFinite(numerator)) return null;
  return (numerator / planDenominator) * 100;
}

export function installmentAreaVolumePercent(
  factCumulativeArea: number,
  totalProjectArea: number | null | undefined,
  hasCsvPlan: boolean,
): number | null {
  if (!hasCsvPlan) return null;
  return installmentAreaExecutionPercent(factCumulativeArea, totalProjectArea);
}

export type ApartmentKpiHue = "green" | "yellow" | "red";

export function installmentAreaKpiHue(pct: number | null): ApartmentKpiHue {
  if (pct == null) return "yellow";
  if (pct >= 100) return "green";
  if (pct >= 85) return "yellow";
  return "red";
}

export function installmentAreaProgressWidthPercent(pct: number | null): number {
  if (pct == null) return 0;
  return Math.min(100, Math.max(0, pct));
}

export function mergeInstallmentAreaEntityKpiData(
  slice: InstallmentAreaKpiPlanSlice | null,
  dealFacts: InstallmentAreaDealFacts | null,
): InstallmentAreaPeriodKpiUiData {
  if (slice) {
    return {
      hasCsvPlan: true,
      planMonthArea: slice.planMonthArea,
      planCumulativeArea: slice.planCumulativeArea,
      projectArea: slice.projectArea,
      factMonthArea:
        dealFacts && dealFacts.factMonthArea > 0 ? dealFacts.factMonthArea : slice.factMonthArea,
      factCumulativeArea:
        dealFacts && dealFacts.factCumulativeArea > 0
          ? dealFacts.factCumulativeArea
          : slice.factCumulativeArea,
    };
  }
  if (dealFacts && (dealFacts.factMonthArea > 0 || dealFacts.factCumulativeArea > 0)) {
    return { hasCsvPlan: false, ...dealFacts };
  }
  return { hasCsvPlan: false, factMonthArea: 0, factCumulativeArea: 0 };
}

export function installmentAreaSliceToCardsData(kpiData: InstallmentAreaPeriodKpiUiData): EntityPlanPeriodKpiCardsData {
  const hasPlan = kpiData.hasCsvPlan;
  const planMonth = hasPlan ? kpiData.planMonthArea : null;
  const planCum = hasPlan ? kpiData.planCumulativeArea : null;
  const totalProject = hasPlan ? kpiData.projectArea : null;
  const factMonth = kpiData.hasCsvPlan ? kpiData.factMonthArea : kpiData.factMonthArea;
  const factCumulative = kpiData.hasCsvPlan ? kpiData.factCumulativeArea : kpiData.factCumulativeArea;
  return {
    hasCsvPlan: hasPlan,
    factMonth,
    factCumulative,
    planMonth,
    planCumulative: planCum,
    totalProjectPlan: totalProject,
    pctMonth: installmentAreaExecutionPercent(factMonth, planMonth),
    pctCum: installmentAreaExecutionPercent(factCumulative, planCum),
    pctVolume: installmentAreaVolumePercent(factCumulative, totalProject, hasPlan),
  };
}

export function installmentAreaProjectVolumeRail(
  kpiData: InstallmentAreaPeriodKpiUiData,
): { value: number; unit: string; caption: "Площадь проекта" } | null {
  if (!kpiData.hasCsvPlan) return null;
  const area = kpiData.projectArea;
  if (!Number.isFinite(area) || area <= 0) return null;
  return { value: area, unit: "кв.м", caption: "Площадь проекта" };
}

export function installmentAreaPeriodKpiHasData(data: InstallmentAreaPeriodKpiUiData | null | undefined): boolean {
  if (!data) return false;
  if (data.hasCsvPlan) {
    return data.planCumulativeArea > 0 || data.planMonthArea > 0 || data.projectArea > 0;
  }
  return data.factCumulativeArea > 0 || data.factMonthArea > 0;
}
