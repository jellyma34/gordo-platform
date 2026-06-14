import {
  apartmentKpiExecutionPercent,
  apartmentKpiExecutionHue,
  apartmentKpiProgressWidthPercent,
  capPlanFields,
  type ApartmentKpiHue,
} from "@/lib/apartmentsPlanPeriodKpi";
import type { ApartmentPlanKpiPlanSlice } from "@/lib/planDataSource/types";
import type { ParkingPlanAnalyticsBreakdown } from "@/lib/parkingPlanAnalytics";

export const PARKING_PROJECT_TOTAL_UNITS_DEFAULT = 50;

/** Подпись объёма проекта машино-мест (52 машино-мест). */
export function parkingProjectVolumeUnit(_count: number): string {
  return "машино-мест";
}

/** Общий объём проекта из KPI-данных (root «Парковки» / planProject), без KPI-дефолта. */
export function parkingProjectVolumeFromKpiData(data: ParkingPlanPeriodKpiUiData): number | null {
  if (!data.hasCsvPlan) return null;
  const vol = data.csvPlanProjectVolume ?? 0;
  if (!Number.isFinite(vol) || vol <= 0) return null;
  return Math.round(vol);
}

export type ParkingPlanPeriodKpiInputs = {
  planMonth: number;
  factMonth: number;
  planCumulative: number;
  factCumulative: number;
  totalVolume: number;
  totalProjectPlan: number;
  /** planProject из root «Парковки» (только отображение, не дефолт KPI). */
  csvPlanProjectVolume?: number | null;
};

export type ParkingPlanPeriodKpiWithCsv = ParkingPlanPeriodKpiInputs & { hasCsvPlan: true };
export type ParkingPlanPeriodKpiFactsOnly = {
  hasCsvPlan: false;
  factMonth: number;
  factCumulative: number;
};
export type ParkingPlanPeriodKpiUiData = ParkingPlanPeriodKpiWithCsv | ParkingPlanPeriodKpiFactsOnly;

export { apartmentKpiExecutionPercent as parkingKpiExecutionPercent };
export { apartmentKpiExecutionHue as parkingKpiExecutionHue };
export { apartmentKpiProgressWidthPercent as parkingKpiProgressWidthPercent };
export type { ApartmentKpiHue as ParkingKpiHue };

export function mergeParkingPlanCsvWithFacts(
  plan: ApartmentPlanKpiPlanSlice,
  facts: Pick<ParkingPlanPeriodKpiInputs, "factMonth" | "factCumulative">,
  opts?: { totalProjectPlan?: number | null },
): ParkingPlanPeriodKpiInputs {
  const projectPlan = (() => {
    const explicit = opts?.totalProjectPlan;
    if (explicit != null && explicit > 0) return explicit;
    return plan.totalVolume > 0 ? plan.totalVolume : PARKING_PROJECT_TOTAL_UNITS_DEFAULT;
  })();

  const capForPlans = Math.max(
    projectPlan,
    plan.planMonth > 0 ? plan.planMonth : 0,
    plan.planCumulative > 0 ? plan.planCumulative : 0,
    PARKING_PROJECT_TOTAL_UNITS_DEFAULT,
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

export function parkingKpiVolumeCompletionPercent(data: ParkingPlanPeriodKpiUiData): number | null {
  if (!data.hasCsvPlan) return null;
  const denom =
    data.totalProjectPlan > 0
      ? data.totalProjectPlan
      : data.totalVolume > 0
        ? data.totalVolume
        : null;
  return apartmentKpiExecutionPercent(data.factCumulative, denom);
}

/** Есть ли хоть какие-то данные для отображения parking KPI. */
export function parkingPlanPeriodKpiHasAnyData(
  data: ParkingPlanPeriodKpiUiData | null | undefined,
  breakdown: ParkingPlanAnalyticsBreakdown | null | undefined,
): boolean {
  if (!data) return false;
  if (data.factCumulative > 0 || data.factMonth > 0) return true;
  if (breakdown?.items?.some((i) => i.factCumulative > 0 || i.planCumulative > 0)) return true;
  if (data.hasCsvPlan && (data.planCumulative > 0 || data.planMonth > 0)) return true;
  return false;
}
