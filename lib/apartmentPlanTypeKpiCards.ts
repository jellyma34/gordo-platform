import {
  apartmentKpiExecutionPercent,
  apartmentKpiVolumeCompletionPercent,
  apartmentProjectVolumeUnit,
  type ApartmentPlanPeriodKpiInputs,
  type ApartmentPlanPeriodKpiUiData,
} from "@/lib/apartmentsPlanPeriodKpi";
import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";

/** Сводные KPI «Квартиры» (корневой сегмент отчётного периода). */
export function apartmentPlanPeriodKpiToCardsData(data: ApartmentPlanPeriodKpiUiData): EntityPlanPeriodKpiCardsData {
  const hasPlan = data.hasCsvPlan;
  const planMonth = hasPlan ? data.planMonth : null;
  const planCumulative = hasPlan ? data.planCumulative : null;
  const totalProjectPlan = hasPlan && data.totalVolume > 0 ? data.totalVolume : null;
  return {
    hasCsvPlan: hasPlan,
    factMonth: data.factMonth,
    factCumulative: data.factCumulative,
    planMonth,
    planCumulative,
    totalProjectPlan,
    pctMonth: apartmentKpiExecutionPercent(data.factMonth, planMonth),
    pctCum: apartmentKpiExecutionPercent(data.factCumulative, planCumulative),
    pctVolume: apartmentKpiVolumeCompletionPercent({
      factCumulative: data.factCumulative,
      totalVolume: hasPlan ? data.totalVolume : 0,
      hasCsvPlan: hasPlan,
    }),
  };
}

export function apartmentPlanPeriodProjectVolumeUnits(
  data: ApartmentPlanPeriodKpiUiData,
): { count: number; unit: string } | null {
  if (!data.hasCsvPlan) return null;
  const total = data.totalVolume;
  if (!Number.isFinite(total) || total <= 0) return null;
  const count = Math.round(total);
  return { count, unit: apartmentProjectVolumeUnit(count) };
}

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
