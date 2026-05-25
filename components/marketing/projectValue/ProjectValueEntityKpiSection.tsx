"use client";

import { useMemo } from "react";

import type { DealSegmentKey } from "@/components/marketing/DealsSection";
import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import { PROJECT_VALUE_KPI_THEME } from "@/lib/entityKpiTheme";
import { marketingAnalyticsSegmentBorderColor } from "@/lib/marketingAnalyticsSectionShell";
import {
  formatProjectValueRub,
  projectValuePeriodKpiHasData,
  projectValueProjectVolumeRail,
  projectValueSliceToCardsData,
  type ProjectValuePeriodKpiUiData,
} from "@/lib/projectValuePeriodKpi";

type Props = {
  entityLabel: string;
  illustrationSegment: DealSegmentKey;
  kpiData: ProjectValuePeriodKpiUiData;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
  showEmpty?: boolean;
  emptyMessage?: string;
};

/** Парковки / кладовые / коммерция — тот же premium KPI-набор, что у свода «Квартиры». */
export function ProjectValueEntityKpiSection({
  entityLabel,
  illustrationSegment,
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
      style={{ borderColor: marketingAnalyticsSegmentBorderColor(presDark) }}
    >
      <EntityPlanPeriodKpiSection
        embedded
        entityLabel={entityLabel}
        illustrationSegment={illustrationSegment}
        theme={PROJECT_VALUE_KPI_THEME}
        cardsData={cardsData}
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        formatMetric={formatProjectValueRub}
        projectVolumeCompactCurrency={projectVolumeCompactCurrency}
        cardsLayout="ddu-revenue-premium"
        cardsDensity="ddu-revenue-premium"
        skeleton={skeleton}
        showEmpty={showEmpty && !hasKpi}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
