"use client";

import {
  EntityPlanPeriodKpiCardsGrid,
  type EntityPlanPeriodKpiCardsData,
} from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import type { EntityKpiTheme } from "@/lib/entityKpiTheme";
import { formatInstallmentAreaSqm } from "@/lib/installmentAreaPeriodKpi";

type Props = {
  theme: EntityKpiTheme;
  data: EntityPlanPeriodKpiCardsData;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
};

/** Три KPI-карточки площади (кв.м) — обёртка над общей сеткой. */
export function InstallmentAreaKpiCard({ theme, data, presDark, presentation, mplPremium, skeleton }: Props) {
  return (
    <EntityPlanPeriodKpiCardsGrid
      theme={theme}
      data={data}
      presDark={presDark}
      presentation={presentation}
      mplPremium={mplPremium}
      skeleton={skeleton}
      formatMetric={formatInstallmentAreaSqm}
    />
  );
}
