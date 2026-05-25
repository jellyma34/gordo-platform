"use client";

import { useMemo } from "react";

import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import { projectPlanPeriodKpiToCardsData } from "@/lib/projectPlanPeriodKpiCards";
import { APARTMENT_KPI_THEME } from "@/lib/entityKpiTheme";
import {
  projectPlanPeriodKpiHasAnyData,
  projectProjectVolumeFromKpiData,
  projectPlanVolumeUnit,
  type ProjectPlanPeriodKpiUiData,
} from "@/lib/projectPlanPeriodKpi";

type Props = {
  data: ProjectPlanPeriodKpiUiData;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
};

/** KPI «Проект» — строка ИТОГО из CSV, без вкладок комнатности. */
export function ReportingPeriodProjectSegment({
  data,
  presDark,
  presentation,
  mplPremium,
  skeleton = false,
}: Props) {
  const cardsData = useMemo(() => projectPlanPeriodKpiToCardsData(data), [data]);

  const projectVolumeUnits = useMemo(() => {
    const count = projectProjectVolumeFromKpiData(data);
    if (count == null) return null;
    return {
      count,
      unit: projectPlanVolumeUnit(count),
      caption: "Общий план проекта",
      subtitle: "Итого по проекту",
      illustrationSegment: "apartment" as const,
    };
  }, [data]);

  const showEmpty = !projectPlanPeriodKpiHasAnyData(data) && !skeleton;

  return (
    <EntityPlanPeriodKpiSection
      entityLabel=""
      illustrationSegment="apartment"
      theme={APARTMENT_KPI_THEME}
      cardsData={cardsData}
      presDark={presDark}
      presentation={presentation}
      mplPremium={mplPremium}
      embedded
      leadingSection
      cardsLayout="ddu-revenue-premium"
      cardsDensity="ddu-revenue-premium"
      projectVolumeUnits={projectVolumeUnits}
      skeleton={skeleton}
      showEmpty={showEmpty}
      emptyMessage="Нет данных по проекту (загрузите CSV со строкой «ИТОГО»)"
    />
  );
}
