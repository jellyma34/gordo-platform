"use client";

import { useMemo, type ReactNode } from "react";

import {
  EntityPlanPeriodKpiCardsGrid,
  type EntityPlanPeriodKpiCardsData,
} from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { EntityKpiTheme } from "@/lib/entityKpiTheme";
import { apartmentKpiExecutionPercent } from "@/lib/apartmentsPlanPeriodKpi";

type Props = {
  entityLabel: string;
  theme: EntityKpiTheme;
  cardsData: EntityPlanPeriodKpiCardsData;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
  showEmpty?: boolean;
  emptyMessage?: string;
  children?: ReactNode;
};

export function EntityPlanPeriodKpiSection({
  entityLabel,
  theme,
  cardsData,
  presDark,
  presentation,
  mplPremium,
  skeleton = false,
  showEmpty = false,
  emptyMessage = "Нет данных",
  children,
}: Props) {
  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-950";
  const sectionLabelCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-gray-900";
  const borderColor = presDark ? "rgba(255,255,255,0.1)" : "rgba(226,232,240,0.55)";

  const gridData: EntityPlanPeriodKpiCardsData = useMemo(
    () => ({
      ...cardsData,
      pctVolume:
        cardsData.pctVolume ??
        apartmentKpiExecutionPercent(cardsData.factCumulative, cardsData.totalProjectPlan),
    }),
    [cardsData],
  );

  if (showEmpty) {
    return (
      <div className="mt-6 min-w-0 border-t pt-5 md:mt-7 md:pt-6" style={{ borderColor }}>
        <h2 className={`text-base font-semibold leading-snug tracking-tight sm:text-lg ${titleCls}`}>
          Выполнение плана отчетного периода
        </h2>
        <p className={`mt-2 text-xl font-bold leading-tight tracking-tight sm:text-2xl ${sectionLabelCls}`}>{entityLabel}</p>
        <p className={`mt-6 py-10 text-center text-sm ${presDark ? "text-slate-400" : "text-slate-500"}`}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 min-w-0 border-t pt-5 md:mt-7 md:pt-6" style={{ borderColor }}>
      <div className="mb-5 min-w-0 md:mb-6">
        <h2 className={`text-base font-semibold leading-snug tracking-tight sm:text-lg ${titleCls}`}>
          Выполнение плана отчетного периода
        </h2>
        <p className={`mt-2 text-xl font-bold leading-tight tracking-tight sm:text-2xl ${sectionLabelCls}`}>{entityLabel}</p>
      </div>

      <EntityPlanPeriodKpiCardsGrid
        theme={theme}
        data={gridData}
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        skeleton={skeleton}
      />

      {children}
    </div>
  );
}
