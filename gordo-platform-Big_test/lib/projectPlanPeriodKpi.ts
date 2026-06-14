import {
  apartmentKpiExecutionPercent,
  capPlanFields,
  type ApartmentPlanKpiPlanSlice,
} from "@/lib/apartmentsPlanPeriodKpi";
import type { BiProjectSummarySlice } from "@/lib/planDataSource/apartmentPlanKpiEntity";
import type { ProjectPlanKpiDealFacts } from "@/lib/projectPlanFactsFromDeals";

/** Склонение «объект» для метки объёма проекта (169 объектов). */
export function projectPlanVolumeUnit(count: number): string {
  const abs = Math.max(0, Math.round(count));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return "объект";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "объекта";
  return "объектов";
}

export type ProjectPlanPeriodKpiInputs = {
  planMonth: number;
  factMonth: number;
  planCumulative: number;
  factCumulative: number;
  totalVolume: number;
  totalProjectPlan: number;
  csvPlanProjectVolume?: number | null;
};

export type ProjectPlanPeriodKpiWithCsv = ProjectPlanPeriodKpiInputs & { hasCsvPlan: true };
export type ProjectPlanPeriodKpiFactsOnly = {
  hasCsvPlan: false;
  factMonth: number;
  factCumulative: number;
};
export type ProjectPlanPeriodKpiUiData = ProjectPlanPeriodKpiWithCsv | ProjectPlanPeriodKpiFactsOnly;

export { apartmentKpiExecutionPercent as projectKpiExecutionPercent };

export function mergeProjectPlanCsvWithFacts(
  plan: ApartmentPlanKpiPlanSlice,
  facts: Pick<ProjectPlanPeriodKpiInputs, "factMonth" | "factCumulative">,
  opts?: { totalProjectPlan?: number | null },
): ProjectPlanPeriodKpiInputs {
  const projectPlan =
    opts?.totalProjectPlan != null && opts.totalProjectPlan > 0
      ? opts.totalProjectPlan
      : plan.totalVolume > 0
        ? plan.totalVolume
        : 0;

  const capForPlans = Math.max(
    projectPlan,
    plan.planMonth > 0 ? plan.planMonth : 0,
    plan.planCumulative > 0 ? plan.planCumulative : 0,
    1,
  );

  const capped = capPlanFields(
    {
      planMonth: plan.planMonth,
      planCumulative: plan.planCumulative,
      factMonth: facts.factMonth,
      factCumulative: facts.factCumulative,
    },
    Math.min(capForPlans, 1_000_000),
  );

  const csvPlanProjectVolume =
    opts?.totalProjectPlan != null && opts.totalProjectPlan > 0
      ? opts.totalProjectPlan
      : plan.totalVolume > 0
        ? plan.totalVolume
        : null;

  return {
    ...capped,
    totalVolume: projectPlan,
    totalProjectPlan: projectPlan,
    csvPlanProjectVolume,
  };
}

export function projectKpiVolumeCompletionPercent(data: ProjectPlanPeriodKpiUiData): number | null {
  if (!data.hasCsvPlan) return null;
  const denom =
    data.totalProjectPlan > 0
      ? data.totalProjectPlan
      : data.totalVolume > 0
        ? data.totalVolume
        : null;
  return apartmentKpiExecutionPercent(data.factCumulative, denom);
}

export function projectProjectVolumeFromKpiData(data: ProjectPlanPeriodKpiUiData): number | null {
  if (!data.hasCsvPlan) return null;
  const vol = data.csvPlanProjectVolume ?? data.totalProjectPlan ?? data.totalVolume ?? 0;
  if (!Number.isFinite(vol) || vol <= 0) return null;
  return Math.round(vol);
}

export function projectPlanPeriodKpiHasAnyData(data: ProjectPlanPeriodKpiUiData | null | undefined): boolean {
  if (!data) return false;
  if (data.factCumulative > 0 || data.factMonth > 0) return true;
  if (data.hasCsvPlan && (data.planCumulative > 0 || data.planMonth > 0)) return true;
  return false;
}

export function buildProjectPlanPeriodKpi(args: {
  projectSummary: BiProjectSummarySlice | null | undefined;
  hasCsvPlan: boolean;
  dealFacts: ProjectPlanKpiDealFacts;
}): ProjectPlanPeriodKpiUiData {
  const { projectSummary, hasCsvPlan, dealFacts } = args;

  if (!hasCsvPlan || !projectSummary) {
    return {
      hasCsvPlan: false,
      factMonth: dealFacts.factMonth,
      factCumulative: dealFacts.factCumulative,
    };
  }

  const planSlice: ApartmentPlanKpiPlanSlice = {
    planMonth: projectSummary.planMonth,
    planCumulative: projectSummary.planCumulative,
    totalVolume: projectSummary.planProject,
    cumulativeMode: "bi_report_ready_column",
  };

  return {
    hasCsvPlan: true,
    ...mergeProjectPlanCsvWithFacts(planSlice, dealFacts, {
      totalProjectPlan: projectSummary.planProject > 0 ? projectSummary.planProject : null,
    }),
  };
}
