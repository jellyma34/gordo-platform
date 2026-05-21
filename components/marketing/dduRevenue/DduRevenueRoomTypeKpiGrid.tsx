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
          const cardsData = dduRevenuePlanTypeSliceToCardsData(slice, breakdown.hasCsvPlan);
          const projectVolumeCompactCurrency =
            breakdown.hasCsvPlan && slice.planProject > 0
              ? { rub: slice.planProject, caption: "План проекта" as const }
              : null;

          return (
            <div key={slice.key} className="flex min-w-0 w-full max-w-full flex-col gap-4">
              <EntityPlanPeriodKpiSection
                embedded
                cardsLayout="room-type"
                entityLabel={slice.label}
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
