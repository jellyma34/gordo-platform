"use client";

import { useMemo, type ReactNode } from "react";

import {
  EntityPlanPeriodKpiCardsGrid,
  type EntityKpiCardsDensity,
  type EntityPlanPeriodKpiCardsData,
} from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";
import { EntityProjectVolumeMeta } from "@/components/marketing/entityPlanPeriodKpi/EntityProjectVolumeMeta";
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
  /** Заголовок секции (по умолчанию — план продаж). */
  sectionTitle?: string;
  /** Формат чисел в карточках (напр. кв.м). */
  formatMetric?: (n: number) => string;
  /** Левый rail «Площадь проекта» (десятичное значение, кв.м). */
  projectVolume?: { value: number; unit: string; caption: string } | null;
  /** Левый rail «План проекта» (компактные рубли). */
  projectVolumeCompactCurrency?: { rub: number; caption: string } | null;
  /** Левый rail «N квартир» (целое из «План проекта» сегмента). */
  projectVolumeUnits?: { count: number; unit: string } | null;
  /** Вложенный блок (комнатность в сетке 2×2 / 4 колонки). */
  embedded?: boolean;
  /** Первая секция блока: без border-top и лишнего margin сверху. */
  leadingSection?: boolean;
  /** `room-type` — как `full`: rail объёма + 3 KPI в ряд (блок комнатности). */
  /** `ddu-revenue-premium` — сетка 280px + 3 KPI (блок продаж ДДУ). */
  cardsLayout?: "full" | "stacked" | "room-type" | "ddu-revenue-premium";
  /** Компактная типографика KPI площади (парковки / кладовые). */
  cardsDensity?: EntityKpiCardsDensity;
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
  sectionTitle = "Выполнение плана отчетного периода",
  formatMetric,
  projectVolume,
  projectVolumeCompactCurrency,
  projectVolumeUnits,
  embedded = false,
  leadingSection = false,
  cardsLayout = "full",
  cardsDensity = "default",
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

  const shellCls = embedded || leadingSection
    ? "min-w-0 w-full max-w-full"
    : "mt-6 min-w-0 border-t pt-5 md:mt-7 md:pt-6";
  const shellStyle = embedded || leadingSection ? undefined : { borderColor };
  const premiumLayout = cardsLayout === "ddu-revenue-premium";
  const entityTitleCls = embedded
    ? `text-base font-bold leading-snug tracking-tight sm:text-lg ${sectionLabelCls}`
    : premiumLayout
      ? presentation
        ? `mt-0.5 text-base font-bold leading-tight tracking-tight ${sectionLabelCls}`
        : `mt-1 text-lg font-bold leading-tight tracking-tight sm:text-xl ${sectionLabelCls}`
      : `mt-2 text-xl font-bold leading-tight tracking-tight sm:text-2xl ${sectionLabelCls}`;
  const headerMb = premiumLayout
    ? presentation
      ? "mb-2"
      : "mb-3"
    : embedded
      ? "mb-4"
      : "mb-5 min-w-0 md:mb-6";
  const railLayoutCls =
    cardsLayout === "stacked"
      ? "flex min-w-0 flex-col gap-4"
      : premiumLayout
        ? "min-w-0"
        : "flex min-w-0 flex-col gap-4 md:flex-row md:items-stretch md:gap-5";

  if (showEmpty) {
    return (
      <div className={shellCls} style={shellStyle}>
        {!embedded ? (
          <h2 className={`text-base font-semibold leading-snug tracking-tight sm:text-lg ${titleCls}`}>{sectionTitle}</h2>
        ) : null}
        {premiumLayout && presentation && leadingSection ? null : (
          <p className={entityTitleCls}>{entityLabel}</p>
        )}
        <p className={`mt-6 py-10 text-center text-sm ${presDark ? "text-slate-400" : "text-slate-500"}`}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={shellCls} style={shellStyle}>
      <div className={`${headerMb} min-w-0`}>
        {!embedded ? (
          <h2
            className={`font-bold leading-snug tracking-tight ${titleCls} ${
              premiumLayout
                ? presentation
                  ? "text-[13px] sm:text-sm"
                  : "text-sm sm:text-[15px]"
                : "text-base sm:text-lg"
            }`}
          >
            {sectionTitle}
          </h2>
        ) : null}
        {premiumLayout && presentation && leadingSection ? null : (
          <p className={entityTitleCls}>{entityLabel}</p>
        )}
      </div>

      <div className={railLayoutCls}>
        {premiumLayout ? null : projectVolumeUnits ? (
          <EntityProjectVolumeMeta
            count={projectVolumeUnits.count}
            unit={projectVolumeUnits.unit}
            presDark={presDark}
            presentation={presentation}
          />
        ) : null}
        {premiumLayout ? null : projectVolumeCompactCurrency ? (
          <EntityProjectVolumeMeta
            mode="compact-currency"
            rub={projectVolumeCompactCurrency.rub}
            caption={projectVolumeCompactCurrency.caption}
            fullCurrency={
              projectVolumeCompactCurrency.caption === "План проекта" ||
              projectVolumeCompactCurrency.caption === "Стоимость проекта"
            }
            railMinWidthPx={
              projectVolumeCompactCurrency.caption === "План проекта" ||
              projectVolumeCompactCurrency.caption === "Стоимость проекта"
                ? 88
                : 120
            }
            presDark={presDark}
            presentation={presentation}
          />
        ) : null}
        {premiumLayout ? null : projectVolume ? (
          <EntityProjectVolumeMeta
            mode="decimal"
            value={projectVolume.value}
            unit={projectVolume.unit}
            caption={projectVolume.caption}
            fractionDigits={2}
            railMinWidthPx={120}
            presDark={presDark}
            presentation={presentation}
          />
        ) : null}
        <EntityPlanPeriodKpiCardsGrid
          theme={theme}
          data={gridData}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          skeleton={skeleton}
          formatMetric={formatMetric}
          layout={cardsLayout}
          cardsDensity={premiumLayout ? "ddu-revenue-premium" : cardsDensity}
          planVolume={premiumLayout ? projectVolumeCompactCurrency : undefined}
        />
      </div>

      {children}
    </div>
  );
}
