import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { ProjectValueDealFacts } from "@/lib/projectValueFactsFromDeals";
import type { ProjectValueKpiPlanSlice } from "@/lib/planDataSource/projectValue/projectValuePlanSlice";
import type { ProjectValueCsvFormat } from "@/lib/planDataSource/projectValue/types";
import { formatNumberWithoutCurrency, numFmt } from "@/lib/salesPlanChartFormat";

export type ProjectValuePeriodKpiUiData =
  | ({
      hasCsvPlan: true;
      csvFormat: ProjectValueCsvFormat;
    } & ProjectValueKpiPlanSlice)
  | {
      hasCsvPlan: false;
      csvFormat?: ProjectValueCsvFormat;
      factMonth: number;
      factCumulative: number;
    };

export function formatProjectValueRub(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${numFmt.format(Math.round(n))} ₽`;
}

export function formatProjectValueRubParts(
  n: number | null | undefined,
): { value: string; unit: "₽" } | { value: "—" } {
  if (n == null || !Number.isFinite(n)) return { value: "—" };
  return { value: numFmt.format(Math.round(n)), unit: "₽" };
}

/** KPI блока «Общая стоимость проекта» на плане продаж (без ₽). */
export function formatProjectValueWithoutCurrency(n: number | null | undefined): string {
  return formatNumberWithoutCurrency(n);
}

export function formatProjectValueWithoutCurrencyParts(
  n: number | null | undefined,
): { value: string } | { value: "—" } {
  if (n == null || !Number.isFinite(n)) return { value: "—" };
  return { value: formatNumberWithoutCurrency(n) };
}

export function projectValueMarkupPercent(charter: number, reportMarkup: number): number | null {
  if (!Number.isFinite(charter) || charter <= 0) return null;
  if (!Number.isFinite(reportMarkup)) return null;
  return (reportMarkup / charter) * 100;
}

export function mergeProjectValueEntityKpiData(
  slice: ProjectValueKpiPlanSlice | null,
  dealFacts: ProjectValueDealFacts | null,
): ProjectValuePeriodKpiUiData {
  if (slice) {
    if (slice.csvFormat === "project_value") {
      return { hasCsvPlan: true, csvFormat: "project_value", ...slice };
    }
    const useDealsMonth = dealFacts && dealFacts.factMonth > 0;
    const useDealsCum = dealFacts && dealFacts.factCumulative > 0;
    return {
      hasCsvPlan: true,
      csvFormat: slice.csvFormat,
      ...slice,
      factMonth: useDealsMonth ? dealFacts!.factMonth : slice.factMonth,
      factCumulative: useDealsCum ? dealFacts!.factCumulative : slice.factCumulative,
      currentPlan: useDealsMonth ? dealFacts!.factMonth : slice.currentPlan,
    };
  }
  if (dealFacts && (dealFacts.factMonth > 0 || dealFacts.factCumulative > 0)) {
    return { hasCsvPlan: false, csvFormat: "legacy", ...dealFacts };
  }
  return { hasCsvPlan: false, csvFormat: "legacy", factMonth: 0, factCumulative: 0 };
}

export function projectValueSliceToCardsData(kpiData: ProjectValuePeriodKpiUiData): EntityPlanPeriodKpiCardsData {
  if (!kpiData.hasCsvPlan) {
    return {
      hasCsvPlan: false,
      factMonth: kpiData.factMonth,
      factCumulative: kpiData.factCumulative,
      planMonth: null,
      planCumulative: null,
      totalProjectPlan: null,
      pctMonth: null,
      pctCum: null,
      pctVolume: null,
    };
  }

  if (kpiData.csvFormat === "project_value") {
    const charter = kpiData.charter;
    const currentPlan = kpiData.currentPlan;
    const priceIncrease = kpiData.priceIncrease;
    const reportMarkup = kpiData.reportMarkup;
    return {
      hasCsvPlan: true,
      planMonth: charter > 0 ? charter : null,
      factMonth: currentPlan,
      planCumulative: null,
      factCumulative: priceIncrease,
      totalProjectPlan: charter > 0 ? charter : null,
      pctMonth: null,
      pctCum: null,
      pctVolume: projectValueMarkupPercent(charter, reportMarkup),
      monthCardPlanLabel: "Устав",
      monthCardFactLabel: "Текущ. план продаж",
      hideMonthExecutionPct: true,
      middleCardMode: "single-value",
      middleCardTitle: "Увеличение стоимости объекта",
      volumeCardTitle: "Наценка",
      volumeRingCaption: "НАЦЕНКА",
    };
  }

  const planMonth = kpiData.planMonth;
  const planCum = kpiData.planCumulative;
  const totalProject = kpiData.projectCost;
  const factMonth = kpiData.factMonth;
  const factCumulative = kpiData.factCumulative;
  return {
    hasCsvPlan: true,
    factMonth,
    factCumulative,
    planMonth,
    planCumulative: planCum,
    totalProjectPlan: totalProject,
    pctMonth: planMonth > 0 && planMonth != null ? (factMonth / planMonth) * 100 : null,
    pctCum: planCum != null && planCum > 0 ? (factCumulative / planCum) * 100 : null,
    pctVolume:
      totalProject > 0 ? (factCumulative / totalProject) * 100 : null,
  };
}

export function projectValueProjectVolumeRail(
  kpiData: ProjectValuePeriodKpiUiData,
): { rub: number; caption: "Стоимость проекта" } | null {
  if (!kpiData.hasCsvPlan) return null;
  const rub = kpiData.csvFormat === "project_value" ? kpiData.charter : kpiData.projectCost;
  if (!Number.isFinite(rub) || rub <= 0) return null;
  return { rub, caption: "Стоимость проекта" };
}

export function projectValuePeriodKpiHasData(data: ProjectValuePeriodKpiUiData | null | undefined): boolean {
  if (!data) return false;
  if (data.hasCsvPlan) {
    if (data.csvFormat === "project_value") {
      return (
        data.charter > 0 ||
        data.currentPlan > 0 ||
        data.priceIncrease !== 0 ||
        data.reportMarkup > 0
      );
    }
    return data.planCumulative > 0 || data.planMonth > 0 || data.projectCost > 0;
  }
  return data.factCumulative > 0 || data.factMonth > 0;
}
