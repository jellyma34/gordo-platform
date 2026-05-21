import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { InstallmentAreaPlanTypeKpiSlice } from "@/lib/installmentAreaPlanTypeKpi";
import {
  installmentAreaExecutionPercent,
  installmentAreaVolumePercent,
} from "@/lib/installmentAreaPeriodKpi";

/** Данные для трёх KPI-карточек по комнатности (площадь, кв.м). */
export function installmentAreaPlanTypeSliceToCardsData(
  slice: InstallmentAreaPlanTypeKpiSlice,
  hasCsvPlan: boolean,
): EntityPlanPeriodKpiCardsData {
  const planMonth = hasCsvPlan ? slice.planMonthArea : null;
  const planCumulative = hasCsvPlan ? slice.planCumulativeArea : null;
  const totalProjectPlan = hasCsvPlan && slice.projectArea > 0 ? slice.projectArea : null;

  return {
    hasCsvPlan,
    factMonth: slice.factMonthArea,
    factCumulative: slice.factCumulativeArea,
    planMonth,
    planCumulative,
    totalProjectPlan,
    pctMonth: installmentAreaExecutionPercent(slice.factMonthArea, planMonth),
    pctCum: installmentAreaExecutionPercent(slice.factCumulativeArea, planCumulative),
    pctVolume: installmentAreaVolumePercent(slice.factCumulativeArea, slice.projectArea, hasCsvPlan),
  };
}
