import type { AveragePricePlanTypeKpiSlice } from "@/lib/averagePricePerSqmPlanTypeKpi";
import {
  averagePriceExecutionPercent,
  averagePriceVolumePercent,
} from "@/lib/averagePricePerSqmPeriodKpi";
import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";

export function averagePricePlanTypeSliceToCardsData(
  slice: AveragePricePlanTypeKpiSlice,
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
    pctMonth: averagePriceExecutionPercent(slice.factMonth, planMonth),
    pctCum: averagePriceExecutionPercent(slice.factCumulative, planCumulative),
    pctVolume: averagePriceVolumePercent(slice.factCumulative, slice.planProject, hasCsvPlan),
  };
}
