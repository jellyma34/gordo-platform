"use client";

import { useMemo } from "react";

import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import { DDU_REVENUE_KPI_THEME } from "@/lib/entityKpiTheme";
import type { DduRevenuePlanTypeKpiBreakdown } from "@/lib/dduRevenuePlanTypeKpi";
import { dduRevenuePlanTypeSliceToCardsData } from "@/lib/dduRevenuePlanTypeKpiCards";
import { formatDduRevenueRub } from "@/lib/dduRevenuePeriodKpi";

type Props = {
  breakdown: DduRevenuePlanTypeKpiBreakdown;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
};

export function DduRevenueRoomTypeKpiGrid({ breakdown, presDark, presentation, mplPremium }: Props) {
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
          const cardsData = dduRevenuePlanTypeSliceToCardsData(slice, breakdown.hasCsvPlan);
          const projectVolumeCompactCurrency =
            breakdown.hasCsvPlan && slice.planProject > 0
              ? { rub: slice.planProject, caption: "План проекта" as const }
              : null;

          return (
            <div key={slice.key} className="min-w-0 w-full max-w-full">
              <EntityPlanPeriodKpiSection
                embedded
                cardsLayout="ddu-revenue-premium"
                entityLabel={slice.label}
                illustrationSegment="apartment"
                theme={DDU_REVENUE_KPI_THEME}
                cardsData={cardsData}
                presDark={presDark}
                presentation={presentation}
                mplPremium={mplPremium}
                formatMetric={formatDduRevenueRub}
                projectVolumeCompactCurrency={projectVolumeCompactCurrency}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
