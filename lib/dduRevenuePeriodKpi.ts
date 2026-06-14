import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { DduRevenueDealFacts } from "@/lib/dduRevenueFactsFromDeals";
import type { DduRevenueKpiPlanSlice } from "@/lib/planDataSource/dduRevenue/dduRevenuePlanSlice";
import {
  formatCompactCurrencyRu,
  formatCompactCurrencyRuParts,
  formatCompactNumberWithoutCurrency,
  formatCompactNumberWithoutCurrencyParts,
} from "@/lib/formatCompactCurrencyRu";

export type DduRevenuePeriodKpiUiData =
  | ({
      hasCsvPlan: true;
    } & DduRevenueKpiPlanSlice)
  | {
      hasCsvPlan: false;
      factMonth: number;
      factCumulative: number;
    };

export function formatDduRevenueRub(n: number | null | undefined): string {
  return formatCompactCurrencyRu(n);
}

export function formatDduRevenueRubParts(
  n: number | null | undefined,
): { value: string; unit: string } | { value: "—" } {
  return formatCompactCurrencyRuParts(n);
}

/** KPI блока «Продажи по заключенным ДДУ» (без символа ₽ в карточках). */
export function formatDduRevenueRubWithoutCurrency(n: number | null | undefined): string {
  return formatCompactNumberWithoutCurrency(n);
}

export function formatDduRevenueRubWithoutCurrencyParts(
  n: number | null | undefined,
): { value: string; unit: string } | { value: "—" } {
  return formatCompactNumberWithoutCurrencyParts(n);
}

export function dduRevenueExecutionPercent(
  numerator: number,
  planDenominator: number | null | undefined,
): number | null {
  if (planDenominator == null || !Number.isFinite(planDenominator) || planDenominator <= 0) return null;
  if (!Number.isFinite(numerator)) return null;
  return (numerator / planDenominator) * 100;
}

export function dduRevenueVolumePercent(
  factCumulative: number,
  totalProject: number | null | undefined,
  hasCsvPlan: boolean,
): number | null {
  if (!hasCsvPlan) return null;
  return dduRevenueExecutionPercent(factCumulative, totalProject);
}

export type ApartmentKpiHue = "green" | "yellow" | "red";

export function dduRevenueKpiHue(pct: number | null): ApartmentKpiHue {
  if (pct == null) return "yellow";
  if (pct >= 100) return "green";
  if (pct >= 85) return "yellow";
  return "red";
}

export function mergeDduRevenueEntityKpiData(
  slice: DduRevenueKpiPlanSlice | null,
  dealFacts: DduRevenueDealFacts | null,
): DduRevenuePeriodKpiUiData {
  if (slice) {
    return {
      hasCsvPlan: true,
      planMonth: slice.planMonth,
      planCumulative: slice.planCumulative,
      planProject: slice.planProject,
      factMonth: dealFacts && dealFacts.factMonth > 0 ? dealFacts.factMonth : slice.factMonth,
      factCumulative:
        dealFacts && dealFacts.factCumulative > 0 ? dealFacts.factCumulative : slice.factCumulative,
    };
  }
  if (dealFacts && (dealFacts.factMonth > 0 || dealFacts.factCumulative > 0)) {
    return { hasCsvPlan: false, ...dealFacts };
  }
  return { hasCsvPlan: false, factMonth: 0, factCumulative: 0 };
}

export function dduRevenueSliceToCardsData(kpiData: DduRevenuePeriodKpiUiData): EntityPlanPeriodKpiCardsData {
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
    pctMonth: dduRevenueExecutionPercent(factMonth, planMonth),
    pctCum: dduRevenueExecutionPercent(factCumulative, planCum),
    pctVolume: dduRevenueVolumePercent(factCumulative, totalProject, hasPlan),
  };
}

export function dduRevenueProjectVolumeRail(
  kpiData: DduRevenuePeriodKpiUiData,
): { rub: number; caption: "План проекта" } | null {
  if (!kpiData.hasCsvPlan) return null;
  const rub = kpiData.planProject;
  if (!Number.isFinite(rub) || rub <= 0) return null;
  return { rub, caption: "План проекта" };
}

export function dduRevenuePeriodKpiHasData(data: DduRevenuePeriodKpiUiData | null | undefined): boolean {
  if (!data) return false;
  if (data.hasCsvPlan) {
    return data.planCumulative > 0 || data.planMonth > 0 || data.planProject > 0;
  }
  return data.factCumulative > 0 || data.factMonth > 0;
}
