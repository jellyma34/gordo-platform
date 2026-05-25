"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";

import {
  AnalyticsSegmentLayout,
  type AnalyticsObjectTab,
  type AnalyticsRoomTab,
} from "@/components/marketing/analytics/AnalyticsSegmentLayout";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
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
import { SALES_PLAN_OBJECT_TYPE_TAB_ORDER, type SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";

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
  /** Второй уровень: комнатность квартир (по умолчанию включён). */
  showRoomTypeFilter?: boolean;
};

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
  showRoomTypeFilter = true,
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
          roomType:
            showRoomTypeFilter && activeObjectType === "apartments" ? activeRoomType : null,
        },
      }),
    [activeObjectType, activeRoomType, apartmentByRoomType, salesPlanByObjectType, showRoomTypeFilter],
  );

  useEffect(() => {
    if (!showRoomTypeFilter || activeObjectType !== "apartments") setActiveRoomType("all");
  }, [activeObjectType, showRoomTypeFilter]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const err = localErr || error;
  const hasCsv = Boolean(block.doc?.rows?.length);
  const mutedCls = presDark ? "text-slate-400" : "text-slate-500";
  const uploadBtnCls = presDark
    ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-500/50 bg-slate-800/50 px-3 py-1.5 text-xs font-semibold text-slate-200 shadow-sm hover:border-slate-400/60 disabled:opacity-40"
    : "inline-flex items-center gap-1.5 rounded-lg border border-slate-300/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-400 disabled:opacity-40";

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
  const tabEmpty = !showSkeleton && !activeSlice.hasData;

  const objectTabs: AnalyticsObjectTab[] = useMemo(
    () =>
      SALES_PLAN_OBJECT_TYPE_TAB_ORDER.map((key) => ({
        key,
        label: salesPlanByObjectType[key].definition.label,
        hasData: salesPlanByObjectType[key].hasData,
      })),
    [salesPlanByObjectType],
  );

  const roomTabs: AnalyticsRoomTab[] | null = showRoomTypeFilter
    ? APARTMENT_ROOM_TYPE_TAB_ORDER.map((roomKey) => ({
        key: roomKey,
        label:
          roomKey === "all"
            ? "Все квартиры"
            : (apartmentRoomTypeConfig(roomKey)?.shortTabLabel ?? roomKey),
        hasData: apartmentByRoomType[roomKey]?.hasData ?? false,
      }))
    : null;

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

  const panelKey = showRoomTypeFilter
    ? `${activeObjectType}-${activeObjectType === "apartments" ? activeRoomType : "—"}`
    : activeObjectType;

  const headerExtra = showCsvUpload ? (
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
      <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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
  ) : null;

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
      <AnalyticsSegmentLayout
        title="Продажи по заключенным ДДУ, руб."
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        showRoomTypeFilter={showRoomTypeFilter}
        objectTabs={objectTabs}
        activeObjectType={activeObjectType}
        onObjectTypeChange={setActiveObjectType}
        roomTabs={roomTabs}
        activeRoomType={activeRoomType}
        onRoomTypeChange={setActiveRoomType}
        error={err}
        headerExtra={headerExtra}
        panelKey={panelKey}
        className={
          dragOver && showCsvUpload
            ? presDark
              ? "ring-2 ring-emerald-500/40 rounded-[22px]"
              : "ring-2 ring-emerald-400/50 rounded-[22px]"
            : ""
        }
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
      </AnalyticsSegmentLayout>
    </div>
  );
}
