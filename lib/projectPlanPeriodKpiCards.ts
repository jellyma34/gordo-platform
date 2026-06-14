import { apartmentKpiExecutionPercent } from "@/lib/apartmentsPlanPeriodKpi";
import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import {
  projectKpiVolumeCompletionPercent,
  type ProjectPlanPeriodKpiUiData,
} from "@/lib/projectPlanPeriodKpi";

export function projectPlanPeriodKpiToCardsData(data: ProjectPlanPeriodKpiUiData): EntityPlanPeriodKpiCardsData {
  const hasPlan = data.hasCsvPlan;
  const planMonth = hasPlan ? data.planMonth : null;
  const planCumulative = hasPlan ? data.planCumulative : null;
  const totalProjectPlan = hasPlan && data.totalProjectPlan > 0 ? data.totalProjectPlan : null;

  return {
    hasCsvPlan: hasPlan,
    factMonth: data.factMonth,
    factCumulative: data.factCumulative,
    planMonth,
    planCumulative,
    totalProjectPlan,
    pctMonth: apartmentKpiExecutionPercent(data.factMonth, planMonth),
    pctCum: apartmentKpiExecutionPercent(data.factCumulative, planCumulative),
    pctVolume: hasPlan ? projectKpiVolumeCompletionPercent(data) : null,
  };
}
