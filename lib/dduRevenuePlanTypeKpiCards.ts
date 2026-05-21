import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { DduRevenuePlanTypeKpiSlice } from "@/lib/dduRevenuePlanTypeKpi";
import { dduRevenueExecutionPercent, dduRevenueVolumePercent } from "@/lib/dduRevenuePeriodKpi";

export function dduRevenuePlanTypeSliceToCardsData(
  slice: DduRevenuePlanTypeKpiSlice,
  hasCsvPlan: boolean,
): EntityPlanPeriodKpiCardsData {
  const planMonth = hasCsvPlan ? slice.planMonth : null;
  const planCumulative = hasCsvPlan ? slice.planCumulative : null;
  const totalProjectPlan = hasCsvPlan && slice.planProject > 0 ? slice.planProject : null;

  return {
    hasCsvPlan,
    factMonth: slice.factMonth,
    factCumulative: slice.factCumulative,
    planMonth,
    planCumulative,
    totalProjectPlan,
    pctMonth: dduRevenueExecutionPercent(slice.factMonth, planMonth),
    pctCum: dduRevenueExecutionPercent(slice.factCumulative, planCumulative),
    pctVolume: dduRevenueVolumePercent(slice.factCumulative, slice.planProject, hasCsvPlan),
  };
}
