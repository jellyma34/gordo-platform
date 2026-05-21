"use client";

import { useMemo } from "react";

import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import { PROJECT_VALUE_KPI_THEME } from "@/lib/entityKpiTheme";
import type { ProjectValuePlanTypeKpiBreakdown } from "@/lib/projectValuePlanTypeKpi";
import { projectValuePlanTypeSliceToCardsData } from "@/lib/projectValuePlanTypeKpi";
import { formatProjectValueRub } from "@/lib/projectValuePeriodKpi";

type Props = {
  breakdown: ProjectValuePlanTypeKpiBreakdown;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
};

export function ProjectValueRoomTypeKpiGrid({ breakdown, presDark, presentation, mplPremium }: Props) {
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
          const cardsData = projectValuePlanTypeSliceToCardsData(slice, breakdown.hasCsvPlan);
          const volumeRub = slice.charter > 0 ? slice.charter : slice.projectCost;
          const projectVolumeCompactCurrency =
            breakdown.hasCsvPlan && volumeRub > 0
              ? { rub: volumeRub, caption: "Стоимость проекта" as const }
              : null;

          return (
            <div key={slice.key} className="flex min-w-0 w-full max-w-full flex-col gap-4">
              <EntityPlanPeriodKpiSection
                embedded
                cardsLayout="room-type"
                entityLabel={slice.label}
                theme={PROJECT_VALUE_KPI_THEME}
                cardsData={cardsData}
                presDark={presDark}
                presentation={presentation}
                mplPremium={mplPremium}
                formatMetric={formatProjectValueRub}
                projectVolumeCompactCurrency={projectVolumeCompactCurrency}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
