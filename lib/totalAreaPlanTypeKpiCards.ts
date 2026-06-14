import type { TotalAreaPlanTypeKpiSlice } from "@/lib/totalAreaPlanTypeKpi";
import { totalAreaExecutionPercent, totalAreaVolumePercent } from "@/lib/totalAreaPeriodKpi";
import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";

export function totalAreaPlanTypeSliceToCardsData(
  slice: TotalAreaPlanTypeKpiSlice,
  hasCsvPlan: boolean,
): EntityPlanPeriodKpiCardsData {
  const planMonth = hasCsvPlan ? slice.planMonth : null;
  const planCumulative = hasCsvPlan ? slice.planCumulative : null;
  const totalProject = hasCsvPlan ? slice.planProject : null;
  return {
    hasCsvPlan,
    factMonth: slice.factMonth,
    factCumulative: slice.factCumulative,
    planMonth,
    planCumulative,
    totalProjectPlan: totalProject,
    pctMonth: totalAreaExecutionPercent(slice.factMonth, planMonth),
    pctCum: totalAreaExecutionPercent(slice.factCumulative, planCumulative),
    pctVolume: totalAreaVolumePercent(slice.factCumulative, slice.planProject, hasCsvPlan),
  };
}
