import {
  apartmentKpiExecutionPercent,
  apartmentKpiVolumeCompletionPercent,
  type ApartmentPlanPeriodKpiInputs,
} from "@/lib/apartmentsPlanPeriodKpi";
import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";

/** Данные для трёх KPI-карточек по сегменту комнатности (не root / не ИТОГО). */
export function apartmentPlanTypeSliceToCardsData(
  slice: ApartmentPlanPeriodKpiInputs,
  hasCsvPlan: boolean,
): EntityPlanPeriodKpiCardsData {
  const planMonth = hasCsvPlan ? slice.planMonth : null;
  const planCumulative = hasCsvPlan ? slice.planCumulative : null;
  const totalProjectPlan = hasCsvPlan && slice.totalVolume > 0 ? slice.totalVolume : null;

  return {
    hasCsvPlan,
    factMonth: slice.factMonth,
    factCumulative: slice.factCumulative,
    planMonth,
    planCumulative,
    totalProjectPlan,
    pctMonth: apartmentKpiExecutionPercent(slice.factMonth, planMonth),
    pctCum: apartmentKpiExecutionPercent(slice.factCumulative, planCumulative),
    pctVolume: apartmentKpiVolumeCompletionPercent({
      factCumulative: slice.factCumulative,
      totalVolume: slice.totalVolume,
      hasCsvPlan,
    }),
  };
}
