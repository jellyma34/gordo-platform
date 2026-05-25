"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";

import { ProjectValueEntityKpiSection } from "@/components/marketing/projectValue/ProjectValueEntityKpiSection";
import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { useMarketingDealsFeedOptional } from "@/components/marketing/marketingDealsFeedContext";
import {
  projectValueCommercialFactsFromDealsForKpi,
  projectValueFactsFromDealsForKpi,
  projectValueParkingFactsFromDealsForKpi,
  projectValueStorageFactsFromDealsForKpi,
} from "@/lib/projectValueFactsFromDeals";
import {
  formatProjectValueRub,
  mergeProjectValueEntityKpiData,
  projectValuePeriodKpiHasData,
  projectValueProjectVolumeRail,
  projectValueSliceToCardsData,
  type ProjectValuePeriodKpiUiData,
} from "@/lib/projectValuePeriodKpi";
import { PROJECT_VALUE_KPI_THEME } from "@/lib/entityKpiTheme";
import { filterByObject } from "@/lib/marketingMockData";
import {
  clearMarketingProjectValueCsvLocalStorage,
  marketingProjectValueCsvDocIsValid,
  readMarketingProjectValueCsvFromLocalStorage,
  type MarketingProjectValueCsvStoredV1,
} from "@/lib/marketingProjectValueCsv";
import { formatMarketingImportUpdatedLabel } from "@/lib/marketingImportUpdatedLabel";
import { useMarketingImportDoc } from "@/lib/useMarketingImportDoc";
import { marketingPaymentPlanProjectIdFromEnv } from "@/lib/marketingPaymentPlanStore";
import {
  selectProjectValueCommercialPlanSliceForKpi,
  selectProjectValueParkingPlanSliceForKpi,
  selectProjectValuePlanSliceForKpi,
  selectProjectValueStoragePlanSliceForKpi,
} from "@/lib/planDataSource/projectValue/projectValuePlanSlice";
import { PROJECT_VALUE_CSV_MAX_BYTES } from "@/lib/planDataSource/projectValue/parseProjectValueCsv";
import type { ProjectValueCsvParseDiagnostics } from "@/lib/planDataSource/projectValue/types";

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

export function ProjectValueSection({
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
  const dealValueFacts = useMemo(() => {
    if (dealsFeed?.loading && dealRowsForFact.length === 0) return null;
    if (!dealRowsForFact.length) return null;
    return projectValueFactsFromDealsForKpi(dealRowsForFact, {
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
  } = useMarketingImportDoc<MarketingProjectValueCsvStoredV1>({
    projectId,
    datasetKey: "projectValue",
    importKind: "project_value",
    validate: marketingProjectValueCsvDocIsValid,
    readLocalForMigration: readMarketingProjectValueCsvFromLocalStorage,
    clearLocal: clearMarketingProjectValueCsvLocalStorage,
  });
  const [failedDiagnostics, setFailedDiagnostics] = useState<ProjectValueCsvParseDiagnostics | null>(null);
  const updatedLabel = formatMarketingImportUpdatedLabel(doc?.updatedAt, doc?.uploadedBy);

  const uploadCsv = useCallback(
    async (file: File) => {
      if (file.size > PROJECT_VALUE_CSV_MAX_BYTES) {
        throw new Error("Размер файла не должен превышать 10 МБ.");
      }
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Допустимы только файлы .csv");
      }
      setFailedDiagnostics(null);
      const result = await uploadFile(file);
      if (!result.ok) {
        const diag = result.diagnostics as ProjectValueCsvParseDiagnostics | undefined;
        if (diag) setFailedDiagnostics(diag);
      }
    },
    [uploadFile],
  );

  const clearCsv = useCallback(async () => {
    setFailedDiagnostics(null);
    await clearImport();
  }, [clearImport]);

  const kpiData: ProjectValuePeriodKpiUiData = useMemo(() => {
    const slice = doc?.rows?.length
      ? selectProjectValuePlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null)
      : null;
    return mergeProjectValueEntityKpiData(slice, dealValueFacts);
  }, [dealValueFacts, doc]);

  const cardsData = useMemo(() => projectValueSliceToCardsData(kpiData), [kpiData]);

  const projectVolumeCompactCurrency = useMemo(() => projectValueProjectVolumeRail(kpiData), [kpiData]);

  const hasCsv = Boolean(doc?.rows?.length);

  const dealParkingFacts = useMemo(() => {
    if (dealsFeed?.loading && dealRowsForFact.length === 0) return null;
    if (!dealRowsForFact.length) return null;
    return projectValueParkingFactsFromDealsForKpi(dealRowsForFact, {
      period: periodGran,
      currentPeriodKey,
    });
  }, [currentPeriodKey, dealRowsForFact, dealsFeed?.loading, periodGran]);

  const dealStorageFacts = useMemo(() => {
    if (dealsFeed?.loading && dealRowsForFact.length === 0) return null;
    if (!dealRowsForFact.length) return null;
    return projectValueStorageFactsFromDealsForKpi(dealRowsForFact, {
      period: periodGran,
      currentPeriodKey,
    });
  }, [currentPeriodKey, dealRowsForFact, dealsFeed?.loading, periodGran]);

  const dealCommercialFacts = useMemo(() => {
    if (dealsFeed?.loading && dealRowsForFact.length === 0) return null;
    if (!dealRowsForFact.length) return null;
    return projectValueCommercialFactsFromDealsForKpi(dealRowsForFact, {
      period: periodGran,
      currentPeriodKey,
    });
  }, [currentPeriodKey, dealRowsForFact, dealsFeed?.loading, periodGran]);

  const parkingKpiData: ProjectValuePeriodKpiUiData = useMemo(() => {
    const slice = doc?.rows?.length
      ? selectProjectValueParkingPlanSliceForKpi(doc.rows, doc.parkingSummary ?? null)
      : null;
    return mergeProjectValueEntityKpiData(slice, dealParkingFacts);
  }, [dealParkingFacts, doc]);

  const storageKpiData: ProjectValuePeriodKpiUiData = useMemo(() => {
    const slice = doc?.rows?.length
      ? selectProjectValueStoragePlanSliceForKpi(doc.rows, doc.storageSummary ?? null)
      : null;
    return mergeProjectValueEntityKpiData(slice, dealStorageFacts);
  }, [dealStorageFacts, doc]);

  const commercialKpiData: ProjectValuePeriodKpiUiData = useMemo(() => {
    const slice = doc?.rows?.length
      ? selectProjectValueCommercialPlanSliceForKpi(doc.rows, doc.commercialSummary ?? null)
      : null;
    return mergeProjectValueEntityKpiData(slice, dealCommercialFacts);
  }, [dealCommercialFacts, doc]);

  const hasAnyData = projectValuePeriodKpiHasData(kpiData);
  const diagnostics = doc?.diagnostics ?? failedDiagnostics;
  const showDebug = isEditMode && !presentation;

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const busy = loading;
  const err = localErr || error;

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
      className={`relative min-w-0 w-full ${
        dragOver && isEditMode ? (presDark ? "ring-2 ring-amber-500/40" : "ring-2 ring-amber-400/50") : ""
      }`}
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
              CSV стоимости проекта (Устав / Текущ. план продаж / …; `;`, cp1251). Месяц строк — период дашборда /
              дата отчёта.
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
          theme={PROJECT_VALUE_KPI_THEME}
          cardsData={cardsData}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          sectionTitle="Общая стоимость проекта"
          formatMetric={formatProjectValueRub}
          projectVolumeCompactCurrency={projectVolumeCompactCurrency}
          leadingSection
          cardsLayout="ddu-revenue-premium"
          cardsDensity="ddu-revenue-premium"
          skeleton
        />
      ) : !hasAnyData ? (
        <EntityPlanPeriodKpiSection
          entityLabel="Квартиры"
          illustrationSegment="apartment"
          theme={PROJECT_VALUE_KPI_THEME}
          cardsData={cardsData}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          sectionTitle="Общая стоимость проекта"
          formatMetric={formatProjectValueRub}
          projectVolumeCompactCurrency={projectVolumeCompactCurrency}
          leadingSection
          cardsLayout="ddu-revenue-premium"
          cardsDensity="ddu-revenue-premium"
          showEmpty
          emptyMessage="Подгрузите CSV стоимости проекта или дождитесь данных системы"
        />
      ) : (
        <EntityPlanPeriodKpiSection
          entityLabel="Квартиры"
          illustrationSegment="apartment"
          theme={PROJECT_VALUE_KPI_THEME}
          cardsData={cardsData}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          sectionTitle="Общая стоимость проекта"
          formatMetric={formatProjectValueRub}
          projectVolumeCompactCurrency={projectVolumeCompactCurrency}
          leadingSection
          cardsLayout="ddu-revenue-premium"
          cardsDensity="ddu-revenue-premium"
        />
      )}

      {!busy && hydrated ? (
        <>
          <ProjectValueEntityKpiSection
            entityLabel="Парковки"
            illustrationSegment="parking"
            kpiData={parkingKpiData}
            presDark={presDark}
            presentation={presentation}
            mplPremium={mplPremium}
            showEmpty
            emptyMessage="Нет данных по парковкам"
          />
          <ProjectValueEntityKpiSection
            entityLabel="Кладовые"
            illustrationSegment="storage"
            kpiData={storageKpiData}
            presDark={presDark}
            presentation={presentation}
            mplPremium={mplPremium}
            showEmpty
            emptyMessage="Нет данных по кладовым"
          />
          <ProjectValueEntityKpiSection
            entityLabel="Коммерческие помещения"
            illustrationSegment="commercial"
            kpiData={commercialKpiData}
            presDark={presDark}
            presentation={presentation}
            mplPremium={mplPremium}
            showEmpty
            emptyMessage="Нет данных по коммерческим помещениям"
          />
        </>
      ) : null}

      {showDebug && diagnostics ? (
        <details
          className={`mt-4 rounded-lg border px-3 py-2 text-xs ${presDark ? "border-slate-600 bg-slate-900/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}
        >
          <summary className="cursor-pointer font-semibold">Диагностика CSV стоимости проекта</summary>
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
          Plan source: {hasCsv ? "CSV PROJECT VALUE" : "NOT LOADED"} · Imported roots: {doc?.rows?.length ?? 0}
        </p>
      ) : null}
    </div>
  );
}
