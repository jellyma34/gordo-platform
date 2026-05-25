"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";

import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import { segmentedControlTabClass, type SegmentedControlSurface } from "@/components/marketing/marketingSegmentedControlClasses";
import { DDU_REVENUE_KPI_THEME } from "@/lib/entityKpiTheme";
import { resolveDduRevenueActiveSlice } from "@/lib/dduRevenue/resolveDduRevenueActiveSlice";
import {
  useDduRevenueSalesBlock,
  type DduRevenueSalesBlockState,
  type UseDduRevenueSalesBlockArgs,
} from "@/lib/dduRevenue/useDduRevenueSalesBlock";
import { formatDduRevenueRubWithoutCurrency } from "@/lib/dduRevenuePeriodKpi";
import type { MarketingDduRevenueCsvStoredV1 } from "@/lib/marketingDduRevenueCsv";
import {
  APARTMENT_ROOM_TYPE_TAB_ORDER,
  apartmentRoomTypeConfig,
  type ApartmentRoomTypeFilterKey,
} from "@/lib/roomTypeNormalized";
import {
  SALES_PLAN_OBJECT_TYPE_TAB_ORDER,
  type SalesPlanObjectTypeKey,
} from "@/lib/salesPlanByObjectType";

export type DduSalesChartSectionSpacing = "sales-plan" | "inline" | "none";

type Props = UseDduRevenueSalesBlockArgs & {
  presentation: boolean;
  presDark: boolean;
  mplPremium?: boolean;
  showCsvUpload?: boolean;
  sectionSpacing?: DduSalesChartSectionSpacing;
  className?: string;
  block?: DduRevenueSalesBlockState;
  doc?: MarketingDduRevenueCsvStoredV1 | null;
  hydrated?: boolean;
  loading?: boolean;
  error?: string | null;
};

function dduSalesChartShellClass(presDark: boolean, presentation: boolean, mplPremium: boolean): string {
  if (presDark) {
    return "rounded-[22px] border border-white/10 bg-slate-900/45 shadow-[0_8px_32px_rgba(0,0,0,0.22)] ring-1 ring-indigo-500/10";
  }
  if (mplPremium && presentation) {
    return "rounded-[22px] border border-black/[0.04] bg-gradient-to-br from-white/95 via-white to-indigo-50/35 shadow-[0_12px_32px_rgba(99,102,241,0.08)] ring-1 ring-indigo-100/70";
  }
  return "rounded-[22px] border border-slate-200/70 bg-gradient-to-br from-white via-white to-indigo-50/25 shadow-[0_8px_28px_rgba(15,23,42,0.05)] ring-1 ring-indigo-100/50";
}

function resolveSegmentSurface(presDark: boolean, presentation: boolean, mplPremium: boolean): SegmentedControlSurface {
  if (presDark) return "dark";
  if (mplPremium && presentation) return "premium";
  return "light";
}

/** Компактный второй уровень (комнатность). */
function secondaryRoomPillClass(active: boolean, surface: SegmentedControlSurface): string {
  const base =
    "shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ease-out";
  if (surface === "premium") {
    return active
      ? `${base} bg-indigo-500/12 text-indigo-700 ring-1 ring-indigo-200/80`
      : `${base} bg-white/50 text-slate-500 ring-1 ring-slate-200/60 hover:bg-white/80`;
  }
  if (surface === "dark") {
    return active
      ? `${base} bg-indigo-500/25 text-indigo-100 ring-1 ring-indigo-400/35`
      : `${base} text-slate-400 ring-1 ring-white/10 hover:bg-white/[0.06]`;
  }
  return active
    ? `${base} bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200/90`
    : `${base} text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-50`;
}

export function DduSalesChart({
  presentation,
  presDark,
  mplPremium = false,
  showCsvUpload = false,
  sectionSpacing = "inline",
  className = "",
  block: externalBlock,
  period = "month",
  objectId = "all",
  currentPeriodKey,
  doc,
  hydrated,
  loading,
  error: externalError,
}: Props) {
  const internalBlock = useDduRevenueSalesBlock(
    externalBlock
      ? {
          period,
          objectId,
          currentPeriodKey,
          doc: externalBlock.doc,
          hydrated: externalBlock.hydrated,
          loading: externalBlock.busy,
          error: externalBlock.error,
        }
      : {
          period,
          objectId,
          currentPeriodKey,
          doc,
          hydrated,
          loading,
          error: externalError,
        },
  );
  const block = externalBlock ?? internalBlock;

  const [activeObjectType, setActiveObjectType] = useState<SalesPlanObjectTypeKey>("all");
  const [activeRoomType, setActiveRoomType] = useState<ApartmentRoomTypeFilterKey>("all");

  const {
    busy,
    error,
    showSkeleton,
    showEmpty,
    updatedLabel,
    uploadCsv,
    clearCsv,
    salesPlanByObjectType,
    apartmentByRoomType,
  } = block;

  const activeSlice = useMemo(
    () =>
      resolveDduRevenueActiveSlice({
        salesPlanByObjectType,
        apartmentByRoomType,
        filter: {
          objectType: activeObjectType,
          roomType: activeObjectType === "apartments" ? activeRoomType : null,
        },
      }),
    [activeObjectType, activeRoomType, apartmentByRoomType, salesPlanByObjectType],
  );

  useEffect(() => {
    if (activeObjectType !== "apartments") setActiveRoomType("all");
  }, [activeObjectType]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const err = localErr || error;
  const hasCsv = Boolean(block.doc?.rows?.length);
  const segmentSurface = resolveSegmentSurface(presDark, presentation, mplPremium);
  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-950";

  const processFile = useCallback(
    async (file: File) => {
      setLocalErr(null);
      try {
        await uploadCsv(file);
      } catch (e) {
        setLocalErr(e instanceof Error ? e.message : "Не удалось загрузить файл");
      }
    },
    [uploadCsv],
  );

  const spacingCls =
    sectionSpacing === "sales-plan" ? "mt-6 mb-6" : sectionSpacing === "inline" ? "" : "";
  const shellCls = dduSalesChartShellClass(presDark, presentation, mplPremium);
  const mutedCls = presDark ? "text-slate-400" : "text-slate-500";
  const uploadBtnCls = presDark
    ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-500/50 bg-slate-800/50 px-3 py-1.5 text-xs font-semibold text-slate-200 shadow-sm hover:border-slate-400/60 disabled:opacity-40"
    : "inline-flex items-center gap-1.5 rounded-lg border border-slate-300/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-400 disabled:opacity-40";

  const tabEmpty = !showSkeleton && !activeSlice.hasData;
  const pillsWrapCls = presDark
    ? "flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    : "flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  const kpiSectionProps = {
    entityLabel: activeSlice.definition.label,
    illustrationSegment: activeSlice.definition.illustrationSegment,
    theme: DDU_REVENUE_KPI_THEME,
    cardsData: activeSlice.cardsData,
    presDark,
    presentation,
    mplPremium,
    sectionTitle: "Продажи по заключенным ДДУ, руб.",
    formatMetric: formatDduRevenueRubWithoutCurrency,
    metricIncludesCurrency: false,
    projectPlanFullNumber: true,
    projectVolumeCompactCurrency: activeSlice.projectVolumeCompactCurrency,
    embedded: true,
    cardsLayout: "ddu-revenue-premium" as const,
  };

  const panelKey = `${activeObjectType}-${activeObjectType === "apartments" ? activeRoomType : "—"}`;

  return (
    <div
      className={`ddu-sales-chart w-full min-w-0 max-w-none ${spacingCls} ${className}`.trim()}
      onDragOver={
        showCsvUpload
          ? (e: DragEvent) => {
              e.preventDefault();
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={showCsvUpload ? () => setDragOver(false) : undefined}
      onDrop={
        showCsvUpload
          ? (e: DragEvent) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void processFile(file);
            }
          : undefined
      }
    >
      <div
        className={`relative min-w-0 overflow-hidden px-4 pt-4 pb-3 sm:px-5 sm:pt-5 sm:pb-3.5 md:px-6 md:pt-5 md:pb-4 ${shellCls} ${
          dragOver && showCsvUpload ? (presDark ? "ring-2 ring-emerald-500/40" : "ring-2 ring-emerald-400/50") : ""
        }`}
      >
        <h2 className={`mb-3 text-sm font-bold leading-snug tracking-tight sm:text-[15px] ${titleCls}`}>
          Продажи по заключенным ДДУ, руб.
        </h2>

        <div className={`${pillsWrapCls} mb-3 min-w-0`} role="tablist" aria-label="Тип объекта">
          {SALES_PLAN_OBJECT_TYPE_TAB_ORDER.map((key) => {
            const def = salesPlanByObjectType[key].definition;
            const active = activeObjectType === key;
            const hasTabData = salesPlanByObjectType[key].hasData;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`transition-all duration-200 ease-out ${segmentedControlTabClass(active, segmentSurface)} ${
                  !hasTabData && !active ? "opacity-55" : ""
                }`}
                onClick={() => setActiveObjectType(key)}
              >
                {def.label}
              </button>
            );
          })}
        </div>

        {activeObjectType === "apartments" ? (
          <div
            className={`${pillsWrapCls} mb-3 min-w-0 pl-0.5`}
            role="tablist"
            aria-label="Комнатность квартир"
          >
            {APARTMENT_ROOM_TYPE_TAB_ORDER.map((roomKey) => {
              const active = activeRoomType === roomKey;
              const label =
                roomKey === "all"
                  ? "Все квартиры"
                  : (apartmentRoomTypeConfig(roomKey)?.shortTabLabel ?? roomKey);
              const hasTabData = apartmentByRoomType[roomKey]?.hasData ?? false;
              return (
                <button
                  key={roomKey}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`${secondaryRoomPillClass(active, segmentSurface)} ${
                    !hasTabData && !active ? "opacity-50" : ""
                  }`}
                  onClick={() => setActiveRoomType(roomKey)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}

        {showCsvUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void processFile(file);
              }}
            />
            <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <p className={`text-[11px] ${mutedCls}`}>
                CSV выручки по заключённым ДДУ. Период дашборда: {period === "quarter" ? "квартал" : "месяц"}.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className={uploadBtnCls}
                  onClick={() => inputRef.current?.click()}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {busy ? "Загрузка…" : hasCsv ? "CSV загружен" : "Подгрузить CSV"}
                </button>
                {hasCsv ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-500 disabled:opacity-40"
                    onClick={() => void clearCsv()}
                  >
                    Сбросить
                  </button>
                ) : null}
              </div>
            </div>
            {hasCsv && updatedLabel ? <p className={`mb-3 text-[11px] ${mutedCls}`}>{updatedLabel}</p> : null}
          </>
        ) : null}

        {err ? (
          <p
            className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
              presDark ? "border-rose-500/30 bg-rose-950/30 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {err}
          </p>
        ) : null}

        <div
          key={panelKey}
          className="min-w-0 transition-opacity duration-200 ease-out motion-reduce:transition-none"
          role="tabpanel"
        >
          {showSkeleton ? (
            <EntityPlanPeriodKpiSection {...kpiSectionProps} skeleton />
          ) : showEmpty ? (
            <EntityPlanPeriodKpiSection
              {...kpiSectionProps}
              showEmpty
              emptyMessage="Подгрузите CSV выручки ДДУ или дождитесь данных системы"
            />
          ) : tabEmpty ? (
            <EntityPlanPeriodKpiSection
              {...kpiSectionProps}
              showEmpty
              emptyMessage={`Нет данных по сегменту «${activeSlice.definition.label}» в текущем срезе`}
            />
          ) : (
            <EntityPlanPeriodKpiSection {...kpiSectionProps} />
          )}
        </div>
      </div>
    </div>
  );
}
