"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";

import { DduRevenueEntityKpiSection } from "@/components/marketing/dduRevenue/DduRevenueEntityKpiSection";
import { DduRevenueRoomTypeKpiGrid } from "@/components/marketing/dduRevenue/DduRevenueRoomTypeKpiGrid";
import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { useMarketingDealsFeedOptional } from "@/components/marketing/marketingDealsFeedContext";
import {
  buildDduRevenueParkingAnalytics,
  buildDduRevenueStorageAnalytics,
  dduRevenueEntityAnalyticsHasData,
} from "@/lib/dduRevenueEntityAnalytics";
import {
  dduRevenueFactsFromDealsForKpi,
  dduRevenueParkingFactsFromDealsForKpi,
  dduRevenueStorageFactsFromDealsForKpi,
} from "@/lib/dduRevenueFactsFromDeals";
import {
  buildDduRevenuePlanTypeKpiBreakdown,
  dduRevenuePlanTypeBreakdownHasData,
} from "@/lib/dduRevenuePlanTypeKpi";
import {
  dduRevenuePeriodKpiHasData,
  dduRevenueProjectVolumeRail,
  dduRevenueSliceToCardsData,
  formatDduRevenueRub,
  mergeDduRevenueEntityKpiData,
  type DduRevenuePeriodKpiUiData,
} from "@/lib/dduRevenuePeriodKpi";
import { DDU_REVENUE_KPI_THEME } from "@/lib/entityKpiTheme";
import { filterByObject } from "@/lib/marketingMockData";
import {
  clearMarketingDduRevenueCsvLocalStorage,
  marketingDduRevenueCsvDocIsValid,
  readMarketingDduRevenueCsvFromLocalStorage,
  type MarketingDduRevenueCsvStoredV1,
} from "@/lib/marketingDduRevenueCsv";
import { formatMarketingImportUpdatedLabel } from "@/lib/marketingImportUpdatedLabel";
import { useMarketingImportDoc } from "@/lib/useMarketingImportDoc";
import { marketingPaymentPlanProjectIdFromEnv } from "@/lib/marketingPaymentPlanStore";
import {
  selectDduRevenueParkingPlanSliceForKpi,
  selectDduRevenuePlanSliceForKpi,
  selectDduRevenueStoragePlanSliceForKpi,
} from "@/lib/planDataSource/dduRevenue/dduRevenuePlanSlice";
import {
  DDU_REVENUE_CSV_MAX_BYTES,
} from "@/lib/planDataSource/dduRevenue/parseDduRevenueCsv";
import type { DduRevenueCsvParseDiagnostics } from "@/lib/planDataSource/dduRevenue/types";

type Props = {
  presentation: boolean;
  presDark: boolean;
  mplPremium?: boolean;
  isEditMode?: boolean;
  period?: MarketingPeriodGranularity;
  reportAsOfYmd?: string;
  objectId?: string;
  currentPeriodKey?: string;
};

function defaultReportAsOfYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultDashboardPeriodKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function DduRevenueSection({
  presentation,
  presDark,
  mplPremium = false,
  isEditMode = false,
  period = "month",
  reportAsOfYmd = defaultReportAsOfYmd(),
  objectId = "all",
  currentPeriodKey = defaultDashboardPeriodKey(),
}: Props) {
  const dealsFeed = useMarketingDealsFeedOptional();
  const projectId = useMemo(() => marketingPaymentPlanProjectIdFromEnv(), []);

  const dealRowsForFact = useMemo(() => {
    const rows = dealsFeed?.rows ?? [];
    if (!rows.length) return [];
    return filterByObject(rows, objectId);
  }, [dealsFeed?.rows, objectId]);

  const periodGran = period === "quarter" ? "quarter" : "month";
  const dealRevenueFacts = useMemo(() => {
    if (dealsFeed?.loading && dealRowsForFact.length === 0) return null;
    if (!dealRowsForFact.length) return null;
    return dduRevenueFactsFromDealsForKpi(dealRowsForFact, {
      period: periodGran,
      currentPeriodKey,
    });
  }, [currentPeriodKey, dealRowsForFact, dealsFeed?.loading, periodGran]);

  const dealParkingRevenueFacts = useMemo(() => {
    if (dealsFeed?.loading && dealRowsForFact.length === 0) return null;
    if (!dealRowsForFact.length) return null;
    return dduRevenueParkingFactsFromDealsForKpi(dealRowsForFact, {
      period: periodGran,
      currentPeriodKey,
    });
  }, [currentPeriodKey, dealRowsForFact, dealsFeed?.loading, periodGran]);

  const dealStorageRevenueFacts = useMemo(() => {
    if (dealsFeed?.loading && dealRowsForFact.length === 0) return null;
    if (!dealRowsForFact.length) return null;
    return dduRevenueStorageFactsFromDealsForKpi(dealRowsForFact, {
      period: periodGran,
      currentPeriodKey,
    });
  }, [currentPeriodKey, dealRowsForFact, dealsFeed?.loading, periodGran]);

  const {
    doc,
    hydrated,
    loading,
    error,
    setError,
    uploadFile,
    clearImport,
  } = useMarketingImportDoc<MarketingDduRevenueCsvStoredV1>({
    projectId,
    datasetKey: "dduRevenue",
    importKind: "ddu_revenue",
    validate: marketingDduRevenueCsvDocIsValid,
    readLocalForMigration: readMarketingDduRevenueCsvFromLocalStorage,
    clearLocal: clearMarketingDduRevenueCsvLocalStorage,
  });
  const [failedDiagnostics, setFailedDiagnostics] = useState<DduRevenueCsvParseDiagnostics | null>(null);

  const updatedLabel = formatMarketingImportUpdatedLabel(doc?.updatedAt, doc?.uploadedBy);

  const uploadCsv = useCallback(
    async (file: File) => {
      if (file.size > DDU_REVENUE_CSV_MAX_BYTES) {
        throw new Error("Размер файла не должен превышать 10 МБ.");
      }
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Допустимы только файлы .csv");
      }
      setFailedDiagnostics(null);
      const result = await uploadFile(file);
      if (!result.ok) {
        const diag = result.diagnostics as DduRevenueCsvParseDiagnostics | undefined;
        if (diag) setFailedDiagnostics(diag);
      }
    },
    [uploadFile],
  );

  const clearCsv = useCallback(async () => {
    setFailedDiagnostics(null);
    await clearImport();
  }, [clearImport]);

  const kpiData: DduRevenuePeriodKpiUiData = useMemo(() => {
    const slice = doc?.rows?.length
      ? selectDduRevenuePlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null)
      : null;
    return mergeDduRevenueEntityKpiData(slice, dealRevenueFacts);
  }, [dealRevenueFacts, doc]);

  const parkingKpiData: DduRevenuePeriodKpiUiData = useMemo(() => {
    const slice = doc?.rows?.length
      ? selectDduRevenueParkingPlanSliceForKpi(doc.rows, doc.parkingSummary ?? null)
      : null;
    return mergeDduRevenueEntityKpiData(slice, dealParkingRevenueFacts);
  }, [dealParkingRevenueFacts, doc]);

  const storageKpiData: DduRevenuePeriodKpiUiData = useMemo(() => {
    const slice = doc?.rows?.length
      ? selectDduRevenueStoragePlanSliceForKpi(doc.rows, doc.storageSummary ?? null)
      : null;
    return mergeDduRevenueEntityKpiData(slice, dealStorageRevenueFacts);
  }, [dealStorageRevenueFacts, doc]);

  const cardsData = useMemo(() => dduRevenueSliceToCardsData(kpiData), [kpiData]);

  const projectVolumeCompactCurrency = useMemo(() => dduRevenueProjectVolumeRail(kpiData), [kpiData]);

  const hasCsv = Boolean(doc?.rows?.length);

  const parkingAnalytics = useMemo(
    () =>
      buildDduRevenueParkingAnalytics({
        rows: doc?.rows,
        hasCsvPlan: hasCsv,
        period: periodGran,
        currentPeriodKey,
        dealRows: dealRowsForFact,
      }),
    [currentPeriodKey, dealRowsForFact, doc?.rows, hasCsv, periodGran],
  );

  const storageAnalytics = useMemo(
    () =>
      buildDduRevenueStorageAnalytics({
        rows: doc?.rows,
        hasCsvPlan: hasCsv,
        period: periodGran,
        currentPeriodKey,
        dealRows: dealRowsForFact,
      }),
    [currentPeriodKey, dealRowsForFact, doc?.rows, hasCsv, periodGran],
  );

  const showParkingSection =
    dduRevenuePeriodKpiHasData(parkingKpiData) || dduRevenueEntityAnalyticsHasData(parkingAnalytics);
  const showStorageSection =
    dduRevenuePeriodKpiHasData(storageKpiData) || dduRevenueEntityAnalyticsHasData(storageAnalytics);

  const typeBreakdown = useMemo(
    () =>
      buildDduRevenuePlanTypeKpiBreakdown({
        rows: doc?.rows,
        hasCsvPlan: hasCsv,
        period: periodGran,
        currentPeriodKey,
        dealRows: dealRowsForFact,
      }),
    [currentPeriodKey, dealRowsForFact, doc?.rows, hasCsv, period],
  );

  const showTypeBreakdown = dduRevenuePlanTypeBreakdownHasData(typeBreakdown);

  const hasAnyData = dduRevenuePeriodKpiHasData(kpiData);
  const diagnostics = doc?.diagnostics ?? failedDiagnostics;
  const showDebug = isEditMode && !presentation;

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const busy = loading;
  const err = localErr || error;

  const typeBreakdownSection =
    showTypeBreakdown && !busy ? (
      <DduRevenueRoomTypeKpiGrid
        breakdown={typeBreakdown}
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
      />
    ) : null;

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

  const uploadBtnCls = presDark
    ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-500/50 bg-slate-800/50 px-3 py-1.5 text-xs font-semibold text-slate-200 shadow-sm hover:border-slate-400/60 disabled:opacity-40"
    : "inline-flex items-center gap-1.5 rounded-lg border border-slate-300/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-400 disabled:opacity-40";

  const mutedCls = presDark ? "text-slate-400" : "text-slate-500";

  return (
    <div
      className={`relative mx-auto min-w-0 w-full ${
        presentation ? "max-w-[1450px] px-8" : "max-w-[1500px]"
      } ${dragOver && isEditMode ? (presDark ? "ring-2 ring-emerald-500/40" : "ring-2 ring-emerald-400/50") : ""}`}
      onDragOver={
        isEditMode
          ? (e: DragEvent) => {
              e.preventDefault();
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={isEditMode ? () => setDragOver(false) : undefined}
      onDrop={
        isEditMode
          ? (e: DragEvent) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void processFile(file);
            }
          : undefined
      }
    >
      {isEditMode ? (
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
      ) : null}

      <div className="mb-4 flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          {isEditMode ? (
            <p className={`text-[11px] ${mutedCls}`}>
              CSV выручки по заключённым ДДУ (legacy wide-table). Месяц строк привязывается к периоду дашборда / дате
              отчёта.
            </p>
          ) : null}
          {isEditMode && hasCsv && updatedLabel ? (
            <p className={`mt-1 text-[11px] ${mutedCls}`}>{updatedLabel}</p>
          ) : null}
        </div>
        {isEditMode ? (
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
        ) : null}
      </div>

      {err ? (
        <p
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${presDark ? "border-rose-500/30 bg-rose-950/30 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-800"}`}
        >
          {err}
        </p>
      ) : null}

      {!hydrated || (busy && isEditMode) ? (
        <EntityPlanPeriodKpiSection
          entityLabel="Квартиры"
          illustrationSegment="apartment"
          theme={DDU_REVENUE_KPI_THEME}
          cardsData={cardsData}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          sectionTitle="Продажи по заключенным ДДУ, руб."
          formatMetric={formatDduRevenueRub}
          projectVolumeCompactCurrency={projectVolumeCompactCurrency}
          leadingSection
          cardsLayout="ddu-revenue-premium"
          skeleton
        />
      ) : !hasAnyData ? (
        <EntityPlanPeriodKpiSection
          entityLabel="Квартиры"
          illustrationSegment="apartment"
          theme={DDU_REVENUE_KPI_THEME}
          cardsData={cardsData}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          sectionTitle="Продажи по заключенным ДДУ, руб."
          formatMetric={formatDduRevenueRub}
          projectVolumeCompactCurrency={projectVolumeCompactCurrency}
          leadingSection
          cardsLayout="ddu-revenue-premium"
          showEmpty
          emptyMessage="Подгрузите CSV выручки ДДУ или дождитесь данных системы"
        />
      ) : (
        <EntityPlanPeriodKpiSection
          entityLabel="Квартиры"
          illustrationSegment="apartment"
          theme={DDU_REVENUE_KPI_THEME}
          cardsData={cardsData}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          sectionTitle="Продажи по заключенным ДДУ, руб."
          formatMetric={formatDduRevenueRub}
          projectVolumeCompactCurrency={projectVolumeCompactCurrency}
          leadingSection
          cardsLayout="ddu-revenue-premium"
        />
      )}

      {typeBreakdownSection}

      {showParkingSection && !busy ? (
        <DduRevenueEntityKpiSection
          entityLabel="Машино-места"
          illustrationSegment="parking"
          theme={DDU_REVENUE_KPI_THEME}
          kpiData={parkingKpiData}
          analyticsBreakdown={parkingAnalytics}
          analyticsTitle="Аналитика выполнения плана по машино-местам"
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          emptyMessage="Нет данных по машино-местам"
        />
      ) : null}

      {showStorageSection && !busy ? (
        <DduRevenueEntityKpiSection
          entityLabel="Кладовые"
          illustrationSegment="storage"
          theme={DDU_REVENUE_KPI_THEME}
          kpiData={storageKpiData}
          analyticsBreakdown={storageAnalytics}
          analyticsTitle="Аналитика выполнения плана по кладовым"
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          emptyMessage="Нет данных по кладовым"
        />
      ) : null}

      {showDebug && diagnostics ? (
        <details
          className={`mt-4 rounded-lg border px-3 py-2 text-xs ${presDark ? "border-slate-600 bg-slate-900/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}
        >
          <summary className="cursor-pointer font-semibold">Диагностика CSV выручки ДДУ</summary>
          <div className="mt-2 space-y-1 font-mono">
            <div>Тип: {diagnostics.csvType}</div>
            <div>Разделитель: {diagnostics.delimiter ?? "—"}</div>
            <div>Root rows: {diagnostics.importedRootRows}</div>
            {diagnostics.monthKeyUsed ? <div>Месяц строк: {diagnostics.monthKeyUsed}</div> : null}
            {diagnostics.rawHeaders?.length ? (
              <div className="break-all">Заголовки: {diagnostics.rawHeaders.join(" · ")}</div>
            ) : null}
            {doc?.warnings?.length ? <div className="text-amber-700">{doc.warnings.join("; ")}</div> : null}
          </div>
        </details>
      ) : null}

      {showDebug ? (
        <p className={`mt-2 text-xs ${mutedCls}`}>
          Plan source: {hasCsv ? "CSV DDU REVENUE" : "NOT LOADED"} · Imported roots: {doc?.rows?.length ?? 0}
        </p>
      ) : null}
    </div>
  );
}
