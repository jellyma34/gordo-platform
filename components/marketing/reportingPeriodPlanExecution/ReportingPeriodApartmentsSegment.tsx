"use client";

import { useMemo, useState } from "react";

import { ApartmentRoomTypeAnalyticsSection } from "@/components/marketing/ApartmentRoomTypeAnalyticsSection";
import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import {
  analyticsSecondaryRoomPillClass,
  resolveAnalyticsSegmentSurface,
} from "@/components/marketing/analytics/analyticsDashboardShell";
import {
  apartmentPlanPeriodKpiToCardsData,
  apartmentPlanPeriodProjectVolumeUnits,
  apartmentPlanTypeSliceToCardsData,
} from "@/lib/apartmentPlanTypeKpiCards";
import type { ApartmentPlanTypeKpiBreakdown } from "@/lib/apartmentPlanTypeKpi";
import { roomTypeToPlanTypeKey } from "@/lib/roomTypeNormalized";
import type { ApartmentPlanPeriodKpiUiData } from "@/lib/apartmentsPlanPeriodKpi";
import { apartmentProjectVolumeUnit } from "@/lib/apartmentsPlanPeriodKpi";
import { APARTMENT_KPI_THEME } from "@/lib/entityKpiTheme";
import {
  APARTMENT_ROOM_TYPE_TAB_ORDER,
  apartmentRoomTypeConfig,
  type ApartmentRoomTypeFilterKey,
} from "@/lib/roomTypeNormalized";

type Props = {
  data: ApartmentPlanPeriodKpiUiData;
  typeBreakdown: ApartmentPlanTypeKpiBreakdown | null | undefined;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
};

export function ReportingPeriodApartmentsSegment({
  data,
  typeBreakdown,
  presDark,
  presentation,
  mplPremium,
  skeleton = false,
}: Props) {
  const [activeRoomType, setActiveRoomType] = useState<ApartmentRoomTypeFilterKey>("all");

  const segmentSurface = resolveAnalyticsSegmentSurface(presDark, presentation, mplPremium);
  const pillsWrapCls = presDark
    ? "flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    : "flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  const showRoomTabs = (typeBreakdown?.items.length ?? 0) > 0;

  const roomTabs = useMemo(() => {
    if (!showRoomTabs || !typeBreakdown) return [];
    return APARTMENT_ROOM_TYPE_TAB_ORDER.map((roomKey) => {
      if (roomKey === "all") {
        return { key: roomKey, label: "Все квартиры", hasData: true };
      }
      const planKey = roomTypeToPlanTypeKey(roomKey);
      const slice = planKey ? typeBreakdown.items.find((i) => i.key === planKey) : undefined;
      const hasData =
        (slice?.factCumulative ?? 0) > 0 ||
        (slice?.factMonth ?? 0) > 0 ||
        (typeBreakdown.hasCsvPlan && ((slice?.planCumulative ?? 0) > 0 || (slice?.planMonth ?? 0) > 0));
      return {
        key: roomKey,
        label: apartmentRoomTypeConfig(roomKey)?.shortTabLabel ?? roomKey,
        hasData,
      };
    });
  }, [showRoomTabs, typeBreakdown]);

  const activeSlice = useMemo(() => {
    if (!typeBreakdown || activeRoomType === "all") return null;
    const planKey = roomTypeToPlanTypeKey(activeRoomType);
    if (!planKey) return null;
    return typeBreakdown.items.find((i) => i.key === planKey) ?? null;
  }, [activeRoomType, typeBreakdown]);

  const filteredBreakdown = useMemo((): ApartmentPlanTypeKpiBreakdown | null => {
    if (!typeBreakdown || activeRoomType === "all" || !activeSlice) return null;
    return { hasCsvPlan: typeBreakdown.hasCsvPlan, items: [activeSlice] };
  }, [activeRoomType, activeSlice, typeBreakdown]);

  const cardsData = useMemo(() => {
    if (activeRoomType === "all" || !activeSlice) {
      return apartmentPlanPeriodKpiToCardsData(data);
    }
    return apartmentPlanTypeSliceToCardsData(activeSlice, typeBreakdown?.hasCsvPlan ?? false);
  }, [activeRoomType, activeSlice, data, typeBreakdown?.hasCsvPlan]);

  const projectVolumeUnits = useMemo(() => {
    if (activeRoomType === "all") {
      return apartmentPlanPeriodProjectVolumeUnits(data);
    }
    if (!activeSlice || !typeBreakdown?.hasCsvPlan || activeSlice.totalVolume <= 0) return null;
    const count = Math.round(activeSlice.totalVolume);
    return { count, unit: apartmentProjectVolumeUnit(count) };
  }, [activeRoomType, activeSlice, data, typeBreakdown?.hasCsvPlan]);

  const entityLabel =
    activeRoomType === "all" ? "" : (activeSlice?.label ?? apartmentRoomTypeConfig(activeRoomType)?.label ?? "");

  const panelKey = activeRoomType;

  return (
    <div className="min-w-0">
      {showRoomTabs ? (
        <div className={`${pillsWrapCls} mb-3 min-w-0 pl-0.5`} role="tablist" aria-label="Комнатность квартир">
          {roomTabs.map((tab) => {
            const active = activeRoomType === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`${analyticsSecondaryRoomPillClass(active, segmentSurface)} ${
                  !tab.hasData && !active ? "opacity-50" : ""
                }`}
                onClick={() => setActiveRoomType(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        key={panelKey}
        className="min-w-0 transition-opacity duration-200 ease-out motion-reduce:transition-none"
        role="tabpanel"
      >
        <EntityPlanPeriodKpiSection
          entityLabel={entityLabel}
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
          metricIncludesCurrency={false}
          projectVolumeUnits={projectVolumeUnits}
          skeleton={skeleton}
        />

        {!presentation && filteredBreakdown ? (
          <ApartmentRoomTypeAnalyticsSection
            breakdown={filteredBreakdown}
            presDark={presDark}
            presentation={presentation}
          />
        ) : null}
      </div>
    </div>
  );
}
