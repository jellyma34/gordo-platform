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
 * «ПО ТИПАМ КВАРТИР» — по одному полноценному KPI-блоку на комнатность (как свод «Квартиры»).
 */
export function ApartmentRoomTypeKpiGrid({ breakdown, presDark, presentation, mplPremium }: Props) {
  const segments = useMemo(() => breakdown.items, [breakdown.items]);

  if (!segments.length) return null;

  return (
    <div
      className="mt-6 min-w-0 border-t pt-5 md:mt-7 md:pt-6"
      style={{ borderColor: presDark ? "rgba(255,255,255,0.1)" : "rgba(226,232,240,0.55)" }}
    >
      <p
        className={`mb-5 text-[13px] font-semibold uppercase tracking-[0.06em] ${
          presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-500"
        }`}
      >
        По типам квартир
      </p>

      <div className="grid w-full min-w-0 max-w-full items-start gap-8 [grid-template-columns:repeat(auto-fit,minmax(min(720px,100%),1fr))]">
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
            <div key={slice.key} className="flex min-w-0 w-full max-w-full flex-col gap-4">
              <EntityPlanPeriodKpiSection
                embedded
                cardsLayout="room-type"
                entityLabel={slice.label}
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
