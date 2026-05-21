"use client";

import { useMemo } from "react";

import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import { INSTALLMENT_AREA_KPI_THEME } from "@/lib/entityKpiTheme";
import { formatInstallmentAreaSqm } from "@/lib/installmentAreaPeriodKpi";
import type { InstallmentAreaPlanTypeKpiBreakdown } from "@/lib/installmentAreaPlanTypeKpi";
import { installmentAreaPlanTypeSliceToCardsData } from "@/lib/installmentAreaPlanTypeKpiCards";

type Props = {
  breakdown: InstallmentAreaPlanTypeKpiBreakdown;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
};

/** «ПО ТИПАМ КВАРТИР» — площадь по комнатности (как в «Выполнение плана отчетного периода»). */
export function InstallmentAreaRoomTypeKpiGrid({ breakdown, presDark, presentation, mplPremium }: Props) {
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
          const cardsData = installmentAreaPlanTypeSliceToCardsData(slice, breakdown.hasCsvPlan);
          const projectVolume =
            breakdown.hasCsvPlan && slice.projectArea > 0
              ? { value: slice.projectArea, unit: "кв.м", caption: "Площадь проекта" as const }
              : null;

          return (
            <div key={slice.key} className="flex min-w-0 w-full max-w-full flex-col gap-4">
              <EntityPlanPeriodKpiSection
                embedded
                cardsLayout="room-type"
                entityLabel={slice.label}
                theme={INSTALLMENT_AREA_KPI_THEME}
                cardsData={cardsData}
                presDark={presDark}
                presentation={presentation}
                mplPremium={mplPremium}
                formatMetric={formatInstallmentAreaSqm}
                projectVolume={projectVolume}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
