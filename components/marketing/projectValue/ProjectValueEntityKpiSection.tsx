"use client";

import { useMemo } from "react";

import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import { PROJECT_VALUE_KPI_THEME } from "@/lib/entityKpiTheme";
import {
  formatProjectValueRub,
  projectValuePeriodKpiHasData,
  projectValueProjectVolumeRail,
  projectValueSliceToCardsData,
  type ProjectValuePeriodKpiUiData,
} from "@/lib/projectValuePeriodKpi";

type Props = {
  entityLabel: string;
  kpiData: ProjectValuePeriodKpiUiData;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
  showEmpty?: boolean;
  emptyMessage?: string;
};

/** Парковки / кладовые / коммерция — тот же KPI-набор, что у свода «Квартиры». */
export function ProjectValueEntityKpiSection({
  entityLabel,
  kpiData,
  presDark,
  presentation,
  mplPremium,
  skeleton = false,
  showEmpty = false,
  emptyMessage = "Нет данных",
}: Props) {
  const cardsData = useMemo(() => projectValueSliceToCardsData(kpiData), [kpiData]);
  const projectVolumeCompactCurrency = useMemo(() => projectValueProjectVolumeRail(kpiData), [kpiData]);
  const hasKpi = projectValuePeriodKpiHasData(kpiData);

  if (!hasKpi && !skeleton && !showEmpty) return null;

  return (
    <div
      className="mt-6 min-w-0 border-t pt-6 md:mt-7 md:pt-7"
      style={{ borderColor: presDark ? "rgba(255,255,255,0.1)" : "rgba(226,232,240,0.55)" }}
    >
      <EntityPlanPeriodKpiSection
        embedded
        entityLabel={entityLabel}
        theme={PROJECT_VALUE_KPI_THEME}
        cardsData={cardsData}
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        formatMetric={formatProjectValueRub}
        projectVolumeCompactCurrency={projectVolumeCompactCurrency}
        cardsDensity="project-value-entity"
        skeleton={skeleton}
        showEmpty={showEmpty && !hasKpi}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
