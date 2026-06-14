import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import { apartmentPlanFactsFromDealsForKpi } from "@/lib/apartmentPlanFactsFromDeals";
import { dduRevenueCommercialFactsFromDealsForKpi } from "@/lib/dduRevenueFactsFromDeals";
import { parkingPlanFactsFromDealsForKpi } from "@/lib/parkingPlanFactsFromDeals";
import { storagePlanFactsFromDealsForKpi } from "@/lib/storagePlanFactsFromDeals";

export type ProjectPlanKpiDealFacts = {
  factMonth: number;
  factCumulative: number;
};

/**
 * Факт KPI «Проект» из JSON: сумма фактов по сегментам сделок (не план CSV).
 * Квартиры — с дедупликацией; остальные сегменты — по правилам своих KPI.
 */
export function projectPlanFactsFromDealsForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): ProjectPlanKpiDealFacts {
  const apartments = apartmentPlanFactsFromDealsForKpi(rows, opts);
  const parking = parkingPlanFactsFromDealsForKpi(rows, opts);
  const storage = storagePlanFactsFromDealsForKpi(rows, opts);
  const commercial = dduRevenueCommercialFactsFromDealsForKpi(rows, opts);

  return {
    factMonth:
      apartments.factMonth + parking.factMonth + storage.factMonth + commercial.factMonth,
    factCumulative:
      apartments.factCumulative +
      parking.factCumulative +
      storage.factCumulative +
      commercial.factCumulative,
  };
}
