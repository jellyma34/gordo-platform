"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";

import { AnalyticsKpiCard } from "@/components/marketing/analytics/AnalyticsKpiCard";
import {
  AnalyticsSegmentLayout,
  type AnalyticsObjectTab,
  type AnalyticsRoomTab,
} from "@/components/marketing/analytics/AnalyticsSegmentLayout";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { DDU_REVENUE_KPI_THEME } from "@/lib/entityKpiTheme";
import { resolveAveragePriceActiveSlice } from "@/lib/averagePricePerSqm/resolveAveragePriceActiveSlice";
import { formatAveragePricePerSqmCompact } from "@/lib/averagePricePerSqmPeriodKpi";
import {
  useAveragePricePerSqmBlock,
  type AveragePricePerSqmBlockState,
  type UseAveragePricePerSqmBlockArgs,
} from "@/lib/averagePricePerSqm/useAveragePricePerSqmBlock";
import {
  APARTMENT_ROOM_TYPE_TAB_ORDER,
  apartmentRoomTypeConfig,
  type ApartmentRoomTypeFilterKey,
} from "@/lib/roomTypeNormalized";
import { SALES_PLAN_OBJECT_TYPE_TAB_ORDER, type SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";

type Props = UseAveragePricePerSqmBlockArgs & {
  presentation: boolean;
  presDark: boolean;
  mplPremium?: boolean;
  showCsvUpload?: boolean;
  className?: string;
  block?: AveragePricePerSqmBlockState;
};

const SECTION_TITLE = "Средняя стоимость объекта по общей площади, руб./кв.м";

export function AveragePriceAnalyticsSection({
  presentation,
  presDark,
  mplPremium = false,
  showCsvUpload = false,
  className = "",
  block: externalBlock,
}: Props) {
  const internalBlock = useAveragePricePerSqmBlock(externalBlock ? { doc: externalBlock.doc, hydrated: externalBlock.hydrated, loading: externalBlock.busy, error: externalBlock.error } : {});
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
      resolveAveragePriceActiveSlice({
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

  const roomTabs: AnalyticsRoomTab[] = APARTMENT_ROOM_TYPE_TAB_ORDER.map((roomKey) => ({
    key: roomKey,
    label:
      roomKey === "all" ? "Все квартиры" : (apartmentRoomTypeConfig(roomKey)?.shortTabLabel ?? roomKey),
    hasData: apartmentByRoomType[roomKey]?.hasData ?? false,
  }));

  const kpiSectionProps = {
    entityLabel: activeSlice.definition.label,
    illustrationSegment: activeSlice.definition.illustrationSegment,
    theme: DDU_REVENUE_KPI_THEME,
    cardsData: activeSlice.cardsData,
    presDark,
    presentation,
    mplPremium,
    embedded: true,
    formatMetric: formatAveragePricePerSqmCompact,
    metricIncludesCurrency: false,
    compactBarLabels: true,
    projectPlanFullNumber: true,
    projectVolumeValueUnitSuffix: "руб./м²",
    projectVolumeCompactCurrency: activeSlice.projectVolumeCompactCurrency,
    sectionTitle: SECTION_TITLE,
  };

  const panelKey = `${activeObjectType}-${activeObjectType === "apartments" ? activeRoomType : "—"}`;

  const headerExtra = showCsvUpload ? (
    <div className="mb-3 flex min-w-0 flex-wrap items-center justify-end gap-2">
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
      <button
        type="button"
        disabled={busy}
        className={uploadBtnCls}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        Загрузить CSV
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
      {hasCsv && updatedLabel ? <span className={`text-[11px] ${mutedCls}`}>{updatedLabel}</span> : null}
    </div>
  ) : null;

  return (
    <div
      className={`average-price-analytics w-full min-w-0 max-w-none ${className}`.trim()}
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
        title={SECTION_TITLE}
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        showRoomTypeFilter
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
          <AnalyticsKpiCard {...kpiSectionProps} skeleton />
        ) : showEmpty ? (
          <AnalyticsKpiCard
            {...kpiSectionProps}
            showEmpty
            emptyMessage="Загрузите CSV средней стоимости ₽/м² или дождитесь данных"
          />
        ) : tabEmpty ? (
          <AnalyticsKpiCard
            {...kpiSectionProps}
            showEmpty
            emptyMessage={`Нет данных по сегменту «${activeSlice.definition.label}» в текущем срезе`}
          />
        ) : (
          <AnalyticsKpiCard {...kpiSectionProps} />
        )}
      </AnalyticsSegmentLayout>
    </div>
  );
}
