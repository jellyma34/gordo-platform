"use client";

import { useMemo } from "react";

import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import { apartmentPlanTypeSliceToCardsData } from "@/lib/apartmentPlanTypeKpiCards";
import type { ApartmentPlanTypeKpiBreakdown } from "@/lib/apartmentPlanTypeKpi";
import { apartmentProjectVolumeUnit } from "@/lib/apartmentsPlanPeriodKpi";
import { APARTMENT_KPI_THEME } from "@/lib/entityKpiTheme";

type Props = {
  breakdown: ApartmentPlanTypeKpiBreakdown;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
};

/**
 * «По типам квартир» — continuation внутри premium shell (как DduRevenueRoomTypeKpiGrid).
 */
export function ApartmentRoomTypeKpiGrid({ breakdown, presDark, presentation, mplPremium }: Props) {
  const segments = useMemo(() => breakdown.items, [breakdown.items]);

  if (!segments.length) return null;

  const borderColor = presDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.06)";

  return (
    <div
      className={`min-w-0 border-t ${presentation ? "mt-3 pt-3 md:mt-4 md:pt-4" : "mt-4 pt-4 md:mt-5 md:pt-5"}`}
      style={{ borderColor }}
    >
      <p
        className={`mb-3 text-xs font-medium leading-snug ${
          presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-[#64748B]"
        }`}
      >
        По типам квартир
      </p>

      <div className={`flex flex-col ${presentation ? "gap-4" : "gap-6"}`}>
        {segments.map((slice) => {
          const cardsData = apartmentPlanTypeSliceToCardsData(slice, breakdown.hasCsvPlan);
          const projectVolumeUnits =
            breakdown.hasCsvPlan && slice.totalVolume > 0
              ? {
                  count: Math.round(slice.totalVolume),
                  unit: apartmentProjectVolumeUnit(slice.totalVolume),
                }
              : null;

          return (
            <div key={slice.key} className="min-w-0 w-full max-w-full">
              <EntityPlanPeriodKpiSection
                embedded
                cardsLayout="ddu-revenue-premium"
                cardsDensity="ddu-revenue-premium"
                entityLabel={slice.label}
                illustrationSegment="apartment"
                theme={APARTMENT_KPI_THEME}
                cardsData={cardsData}
                presDark={presDark}
                presentation={presentation}
                mplPremium={mplPremium}
                projectVolumeUnits={projectVolumeUnits}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
