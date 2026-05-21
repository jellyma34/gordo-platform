import {
  apartmentKpiExecutionPercent,
  apartmentKpiExecutionHue,
  apartmentKpiProgressWidthPercent,
  capPlanFields,
  type ApartmentKpiHue,
} from "@/lib/apartmentsPlanPeriodKpi";
import type { ApartmentPlanKpiPlanSlice } from "@/lib/planDataSource/types";
import type { StoragePlanAnalyticsBreakdown } from "@/lib/storagePlanAnalytics";

export const STORAGE_PROJECT_TOTAL_UNITS_DEFAULT = 40;

/** Подпись объёма проекта кладовых (35 кладовых). */
export function storageProjectVolumeUnit(_count: number): string {
  return "кладовых";
}

/** Общий объём проекта из KPI-данных (root «Кладовые» / planProject), без KPI-дефолта. */
export function storageProjectVolumeFromKpiData(data: StoragePlanPeriodKpiUiData): number | null {
  if (!data.hasCsvPlan) return null;
  const vol = data.csvPlanProjectVolume ?? 0;
  if (!Number.isFinite(vol) || vol <= 0) return null;
  return Math.round(vol);
}

export type StoragePlanPeriodKpiInputs = {
  planMonth: number;
  factMonth: number;
  planCumulative: number;
  factCumulative: number;
  totalVolume: number;
  totalProjectPlan: number;
  /** planProject из root «Кладовые» (только отображение, не дефолт KPI). */
  csvPlanProjectVolume?: number | null;
};

export type StoragePlanPeriodKpiWithCsv = StoragePlanPeriodKpiInputs & { hasCsvPlan: true };
export type StoragePlanPeriodKpiFactsOnly = {
  hasCsvPlan: false;
  factMonth: number;
  factCumulative: number;
};
export type StoragePlanPeriodKpiUiData = StoragePlanPeriodKpiWithCsv | StoragePlanPeriodKpiFactsOnly;

export { apartmentKpiExecutionPercent as storageKpiExecutionPercent };
export { apartmentKpiExecutionHue as storageKpiExecutionHue };
export { apartmentKpiProgressWidthPercent as storageKpiProgressWidthPercent };
export type { ApartmentKpiHue as StorageKpiHue };

export function mergeStoragePlanCsvWithFacts(
  plan: ApartmentPlanKpiPlanSlice,
  facts: Pick<StoragePlanPeriodKpiInputs, "factMonth" | "factCumulative">,
  opts?: { totalProjectPlan?: number | null },
): StoragePlanPeriodKpiInputs {
  const projectPlan = (() => {
    const explicit = opts?.totalProjectPlan;
    if (explicit != null && explicit > 0) return explicit;
    return plan.totalVolume > 0 ? plan.totalVolume : STORAGE_PROJECT_TOTAL_UNITS_DEFAULT;
  })();

  const capForPlans = Math.max(
    projectPlan,
    plan.planMonth > 0 ? plan.planMonth : 0,
    plan.planCumulative > 0 ? plan.planCumulative : 0,
    STORAGE_PROJECT_TOTAL_UNITS_DEFAULT,
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

  const csvPlanProjectVolume = (() => {
    const explicit = opts?.totalProjectPlan;
    if (explicit != null && explicit > 0) return explicit;
    return plan.totalVolume > 0 ? plan.totalVolume : null;
  })();

  return {
    ...capped,
    totalVolume: projectPlan,
    totalProjectPlan: projectPlan,
    csvPlanProjectVolume,
  };
}

export function storageKpiVolumeCompletionPercent(data: StoragePlanPeriodKpiUiData): number | null {
  if (!data.hasCsvPlan) return null;
  const denom =
    data.totalProjectPlan > 0
      ? data.totalProjectPlan
      : data.totalVolume > 0
        ? data.totalVolume
        : null;
  return apartmentKpiExecutionPercent(data.factCumulative, denom);
}

export function storagePlanPeriodKpiHasAnyData(
  data: StoragePlanPeriodKpiUiData | null | undefined,
  breakdown: StoragePlanAnalyticsBreakdown | null | undefined,
): boolean {
  if (!data) return false;
  if (data.factCumulative > 0 || data.factMonth > 0) return true;
  if (breakdown?.items?.some((i) => i.factCumulative > 0 || i.planCumulative > 0)) return true;
  if (data.hasCsvPlan && (data.planCumulative > 0 || data.planMonth > 0)) return true;
  return false;
}
