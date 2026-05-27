"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";

import { BlockMonthSelector } from "@/components/marketing/BlockMonthSelector";
import { AnalyticsKpiCard } from "@/components/marketing/analytics/AnalyticsKpiCard";
import {
  AnalyticsSegmentLayout,
  type AnalyticsObjectTab,
  type AnalyticsRoomTab,
} from "@/components/marketing/analytics/AnalyticsSegmentLayout";
import { DDU_REVENUE_KPI_THEME } from "@/lib/entityKpiTheme";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import { buildSalesPlanTotalAreaApartmentByRoomType } from "@/lib/totalArea/buildSalesPlanTotalAreaApartmentByRoomType";
import { buildSalesPlanTotalAreaByObjectType } from "@/lib/totalArea/buildSalesPlanTotalAreaByObjectType";
import { resolveTotalAreaActiveSlice } from "@/lib/totalArea/resolveTotalAreaActiveSlice";
import { formatTotalAreaCompact } from "@/lib/totalAreaPeriodKpi";
import {
  useTotalAreaBlock,
  type TotalAreaBlockState,
  type UseTotalAreaBlockArgs,
} from "@/lib/totalArea/useTotalAreaBlock";
import {
  APARTMENT_ROOM_TYPE_TAB_ORDER,
  apartmentRoomTypeConfig,
  type ApartmentRoomTypeFilterKey,
} from "@/lib/roomTypeNormalized";
import { SALES_PLAN_OBJECT_TYPE_TAB_ORDER, type SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";
import type { MarketingPdfRenderProps } from "@/utils/pdf/marketingPdfRenderProps";

type Props = UseTotalAreaBlockArgs &
  MarketingPdfRenderProps & {
  presentation: boolean;
  presDark: boolean;
  mplPremium?: boolean;
  showCsvUpload?: boolean;
  className?: string;
  block?: TotalAreaBlockState;
};

const SECTION_TITLE = "Общая площадь, кв.м";

export function TotalAreaAnalyticsSection({
  presentation,
  presDark,
  mplPremium = false,
  showCsvUpload = false,
  className = "",
  block: externalBlock,
  pdfRender = false,
  forcedObjectType,
  forcedRoomType,
  hideInteractiveControls = false,
}: Props) {
  const internalBlock = useTotalAreaBlock(
    externalBlock
      ? { doc: externalBlock.doc, hydrated: externalBlock.hydrated, loading: externalBlock.busy, error: externalBlock.error }
      : {},
  );
  const block = externalBlock ?? internalBlock;

  const monthOptions = useMemo(() => {
    const rows = block.doc?.rows ?? [];
    const out = new Set<string>();
    for (const r of rows) {
      const mk = normalizeMonthKey((r as { monthKey?: string | null }).monthKey ?? null);
      if (mk) out.add(mk);
    }
    return [...out].sort();
  }, [block.doc?.rows]);

  const [blockMonthKey, setBlockMonthKey] = useState<string>(() => {
    if (monthOptions.length) return monthOptions[monthOptions.length - 1]!;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    if (!monthOptions.length) return;
    if (!monthOptions.includes(blockMonthKey)) {
      setBlockMonthKey(monthOptions[monthOptions.length - 1]!);
    }
  }, [blockMonthKey, monthOptions]);

  const filteredDoc = useMemo(() => {
    if (!block.doc?.rows?.length) return block.doc;
    if (!monthOptions.length) return block.doc;
    const mk = normalizeMonthKey(blockMonthKey) ?? blockMonthKey;
    const filteredRows = block.doc.rows.filter((r) => normalizeMonthKey((r as { monthKey?: string | null }).monthKey ?? null) === mk);
    return { ...block.doc, rows: filteredRows };
  }, [block.doc, blockMonthKey, monthOptions.length]);

  const salesPlanByObjectType = useMemo(() => buildSalesPlanTotalAreaByObjectType({ doc: filteredDoc ?? null }), [filteredDoc]);
  const apartmentByRoomType = useMemo(
    () => buildSalesPlanTotalAreaApartmentByRoomType({ doc: filteredDoc ?? null }).byRoomType,
    [filteredDoc],
  );

  const [activeObjectType, setActiveObjectType] = useState<SalesPlanObjectTypeKey>(forcedObjectType ?? "all");
  const [activeRoomType, setActiveRoomType] = useState<ApartmentRoomTypeFilterKey>(forcedRoomType ?? "all");
  const resolvedObjectType = forcedObjectType ?? activeObjectType;
  const resolvedRoomType = forcedRoomType ?? activeRoomType;

  const {
    busy,
    error,
    showSkeleton,
    showEmpty,
    updatedLabel,
    uploadCsv,
    clearCsv,
    salesPlanByObjectType: _ignoredSalesPlanByObjectType,
    apartmentByRoomType: _ignoredApartmentByRoomType,
  } = block;

  const activeSlice = useMemo(
    () =>
      resolveTotalAreaActiveSlice({
        salesPlanByObjectType,
        apartmentByRoomType,
        filter: {
          objectType: resolvedObjectType,
          roomType: resolvedObjectType === "apartments" ? resolvedRoomType : null,
        },
      }),
    [resolvedObjectType, resolvedRoomType, apartmentByRoomType, salesPlanByObjectType],
  );

  useEffect(() => {
    if (pdfRender && forcedObjectType) return;
    if (resolvedObjectType !== "apartments") setActiveRoomType("all");
  }, [resolvedObjectType, pdfRender, forcedObjectType]);

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
    label: roomKey === "all" ? "Все квартиры" : (apartmentRoomTypeConfig(roomKey)?.shortTabLabel ?? roomKey),
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
    formatMetric: formatTotalAreaCompact,
    metricIncludesCurrency: false,
    compactBarLabels: true,
    projectPlanFullNumber: true,
    projectVolumeValueUnitSuffix: "м²",
    projectVolumeCompactCurrency: activeSlice.projectVolumeCompactCurrency,
    sectionTitle: SECTION_TITLE,
  };

  const panelKey = `${resolvedObjectType}-${resolvedObjectType === "apartments" ? resolvedRoomType : "—"}`;

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
      className={`total-area-analytics w-full min-w-0 max-w-none ${className}`.trim()}
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
        headerControls={
          hideInteractiveControls || !monthOptions.length ? null : (
            <BlockMonthSelector
              value={blockMonthKey}
              options={monthOptions}
              onChange={setBlockMonthKey}
              presDark={presDark}
              presentation={presentation}
              mplPremium={presentation && mplPremium}
            />
          )
        }
        showRoomTypeFilter
        objectTabs={objectTabs}
        activeObjectType={resolvedObjectType}
        onObjectTypeChange={setActiveObjectType}
        roomTabs={roomTabs}
        activeRoomType={resolvedRoomType}
        onRoomTypeChange={setActiveRoomType}
        error={err}
        headerExtra={hideInteractiveControls ? null : headerExtra}
        panelKey={panelKey}
        pdfRender={pdfRender}
        forcedObjectType={forcedObjectType}
        forcedRoomType={forcedRoomType}
        hideInteractiveControls={hideInteractiveControls}
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
            emptyMessage="Загрузите CSV общей площади или дождитесь данных"
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
