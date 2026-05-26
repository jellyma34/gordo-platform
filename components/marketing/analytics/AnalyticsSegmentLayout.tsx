"use client";

import type { ReactNode } from "react";

import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import {
  analyticsDashboardShellClass,
  analyticsSecondaryRoomPillClass,
  resolveAnalyticsSegmentSurface,
} from "@/components/marketing/analytics/analyticsDashboardShell";
import type { ApartmentRoomTypeFilterKey } from "@/lib/roomTypeNormalized";
import type { SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";

export type AnalyticsObjectTab = {
  key: SalesPlanObjectTypeKey;
  label: string;
  hasData: boolean;
};

export type AnalyticsRoomTab = {
  key: ApartmentRoomTypeFilterKey;
  label: string;
  hasData: boolean;
};

type Props = {
  title: string;
  presDark: boolean;
  presentation: boolean;
  mplPremium?: boolean;
  headerControls?: ReactNode;
  objectTabs: readonly AnalyticsObjectTab[];
  activeObjectType: SalesPlanObjectTypeKey;
  onObjectTypeChange: (key: SalesPlanObjectTypeKey) => void;
  roomTabs?: readonly AnalyticsRoomTab[] | null;
  activeRoomType?: ApartmentRoomTypeFilterKey;
  onRoomTypeChange?: (key: ApartmentRoomTypeFilterKey) => void;
  error?: string | null;
  headerExtra?: ReactNode;
  panelKey?: string;
  children: ReactNode;
  className?: string;
  /** Второй уровень: комнатность квартир (ДДУ — да, стоимость проекта — нет). */
  showRoomTypeFilter?: boolean;
};

export function AnalyticsSegmentLayout({
  title,
  presDark,
  presentation,
  mplPremium = false,
  headerControls,
  objectTabs,
  activeObjectType,
  onObjectTypeChange,
  roomTabs = null,
  activeRoomType = "all",
  onRoomTypeChange,
  error = null,
  headerExtra,
  panelKey,
  children,
  className = "",
  showRoomTypeFilter = false,
}: Props) {
  const shellCls = analyticsDashboardShellClass(presDark, presentation, mplPremium);
  const segmentSurface = resolveAnalyticsSegmentSurface(presDark, presentation, mplPremium);
  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-950";
  const pillsWrapCls = presDark
    ? "flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    : "flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return (
    <div className={`w-full min-w-0 max-w-none ${className}`.trim()}>
      <div className={`relative min-w-0 overflow-hidden px-4 pt-4 pb-3 sm:px-5 sm:pt-5 sm:pb-3.5 md:px-6 md:pt-5 md:pb-4 ${shellCls}`}>
        <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-3">
          <h2 className={`min-w-0 text-sm font-bold leading-snug tracking-tight sm:text-[15px] ${titleCls}`}>{title}</h2>
          {headerControls ? <div className="flex shrink-0 items-end gap-3">{headerControls}</div> : null}
        </div>

        <div
          className={`${pillsWrapCls} min-w-0 ${showRoomTypeFilter ? "mb-3" : "mb-2"}`}
          role="tablist"
          aria-label="Тип объекта"
        >
          {objectTabs.map((tab) => {
            const active = activeObjectType === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`transition-all duration-200 ease-out ${segmentedControlTabClass(active, segmentSurface)} ${
                  !tab.hasData && !active ? "opacity-55" : ""
                }`}
                onClick={() => onObjectTypeChange(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {showRoomTypeFilter && roomTabs?.length && activeObjectType === "apartments" ? (
          <div
            className={`${pillsWrapCls} mb-3 min-w-0 pl-0.5`}
            role="tablist"
            aria-label="Комнатность квартир"
          >
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
                  onClick={() => onRoomTypeChange?.(tab.key)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {headerExtra}

        {error ? (
          <p
            className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
              presDark ? "border-rose-500/30 bg-rose-950/30 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {error}
          </p>
        ) : null}

        <div
          key={panelKey}
          className="min-w-0 transition-opacity duration-200 ease-out motion-reduce:transition-none"
          role="tabpanel"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
