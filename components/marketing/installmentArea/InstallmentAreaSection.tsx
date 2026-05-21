"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";

import { EntityPerformanceChart } from "@/components/marketing/EntityPerformanceChart";
import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { useMarketingDealsFeedOptional } from "@/components/marketing/marketingDealsFeedContext";
import { filterByObject } from "@/lib/marketingMockData";
import { installmentAreaFactsFromDealsForKpi } from "@/lib/installmentAreaFactsFromDeals";
import { buildPerformanceChartRows, performanceChartHasData } from "@/lib/entityPerformanceChart";
import { INSTALLMENT_AREA_KPI_THEME } from "@/lib/entityKpiTheme";
import {
  formatInstallmentAreaSqm,
  installmentAreaExecutionPercent,
  installmentAreaPeriodKpiHasData,
  installmentAreaVolumePercent,
  type InstallmentAreaPeriodKpiUiData,
} from "@/lib/installmentAreaPeriodKpi";
import {
  clearMarketingInstallmentAreaCsvLocalStorage,
  readMarketingInstallmentAreaCsvFromLocalStorage,
  writeMarketingInstallmentAreaCsvToLocalStorage,
  type MarketingInstallmentAreaCsvStoredV1,
} from "@/lib/marketingInstallmentAreaCsv";
import { marketingPaymentPlanProjectIdFromEnv } from "@/lib/marketingPaymentPlanStore";
import { selectInstallmentAreaPlanSliceForKpi } from "@/lib/planDataSource/installmentArea/installmentAreaPlanSlice";
import {
  INSTALLMENT_AREA_CSV_MAX_BYTES,
  parseInstallmentAreaCsvAsync,
} from "@/lib/planDataSource/installmentArea/parseInstallmentAreaCsv";
import type { InstallmentAreaCsvParseDiagnostics } from "@/lib/planDataSource/installmentArea/types";

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

export function InstallmentAreaSection({
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

  const dealAreaFacts = useMemo(() => {
    if (dealsFeed?.loading && dealRowsForFact.length === 0) return null;
    if (!dealRowsForFact.length) return null;
    const gran = period === "quarter" ? "quarter" : "month";
    return installmentAreaFactsFromDealsForKpi(dealRowsForFact, {
      period: gran,
      currentPeriodKey,
    });
  }, [currentPeriodKey, dealRowsForFact, dealsFeed?.loading, period]);
  const [doc, setDoc] = useState<MarketingInstallmentAreaCsvStoredV1 | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedDiagnostics, setFailedDiagnostics] = useState<InstallmentAreaCsvParseDiagnostics | null>(null);

  useEffect(() => {
    setDoc(readMarketingInstallmentAreaCsvFromLocalStorage(projectId));
    setHydrated(true);
  }, [projectId]);

  const uploadCsv = useCallback(
    async (file: File) => {
      if (file.size > INSTALLMENT_AREA_CSV_MAX_BYTES) {
        throw new Error("Размер файла не должен превышать 10 МБ.");
      }
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Допустимы только файлы .csv");
      }
      setLoading(true);
      setError(null);
      setFailedDiagnostics(null);
      try {
        const { readMarketingCsvFileDecoded } = await import("@/src/shared/lib/csv/parseInvestorsCsv");
        const { text } = await readMarketingCsvFileDecoded(file);
        const parsed = await parseInstallmentAreaCsvAsync(text, {
          dashboardPeriodKey: defaultDashboardPeriodKey(),
          period,
          reportAsOfYmd,
          fileName: file.name,
        });
        if (!parsed.ok) {
          setError(parsed.error);
          setFailedDiagnostics(parsed.diagnostics);
          return;
        }
        const stored: MarketingInstallmentAreaCsvStoredV1 = {
          v: 1,
          updatedAt: new Date().toISOString(),
          fileName: file.name,
          rows: parsed.rows,
          warnings: parsed.warnings,
          diagnostics: parsed.diagnostics,
          apartmentsSummary: parsed.apartmentsSummary,
        };
        writeMarketingInstallmentAreaCsvToLocalStorage(projectId, stored);
        setDoc(stored);
      } finally {
        setLoading(false);
      }
    },
    [period, projectId, reportAsOfYmd],
  );

  const clearCsv = useCallback(async () => {
    clearMarketingInstallmentAreaCsvLocalStorage(projectId);
    setDoc(null);
    setError(null);
    setFailedDiagnostics(null);
  }, [projectId]);

  const kpiData: InstallmentAreaPeriodKpiUiData = useMemo(() => {
    const slice = doc?.rows?.length
      ? selectInstallmentAreaPlanSliceForKpi(doc.rows, doc.apartmentsSummary ?? null)
      : null;
    if (slice) {
      return { hasCsvPlan: true, ...slice };
    }
    if (dealAreaFacts && (dealAreaFacts.factMonthArea > 0 || dealAreaFacts.factCumulativeArea > 0)) {
      return {
        hasCsvPlan: false,
        factMonthArea: dealAreaFacts.factMonthArea,
        factCumulativeArea: dealAreaFacts.factCumulativeArea,
      };
    }
    return { hasCsvPlan: false, factMonthArea: 0, factCumulativeArea: 0 };
  }, [dealAreaFacts, doc]);

  const cardsData = useMemo(() => {
    const hasPlan = kpiData.hasCsvPlan;
    const planMonth = hasPlan ? kpiData.planMonthArea : null;
    const planCum = hasPlan ? kpiData.planCumulativeArea : null;
    const totalProject = hasPlan ? kpiData.projectArea : null;
    return {
      hasCsvPlan: hasPlan,
      factMonth: kpiData.hasCsvPlan ? kpiData.factMonthArea : kpiData.factMonthArea,
      factCumulative: kpiData.hasCsvPlan ? kpiData.factCumulativeArea : kpiData.factCumulativeArea,
      planMonth,
      planCumulative: planCum,
      totalProjectPlan: totalProject,
      pctMonth: installmentAreaExecutionPercent(
        kpiData.hasCsvPlan ? kpiData.factMonthArea : 0,
        planMonth,
      ),
      pctCum: installmentAreaExecutionPercent(
        kpiData.hasCsvPlan ? kpiData.factCumulativeArea : 0,
        planCum,
      ),
      pctVolume: installmentAreaVolumePercent(
        kpiData.hasCsvPlan ? kpiData.factCumulativeArea : 0,
        totalProject,
        hasPlan,
      ),
    };
  }, [kpiData]);

  const chartRows = useMemo(() => {
    if (!doc?.rows?.length) return [];
    return buildPerformanceChartRows(
      doc.rows.map((r) => ({
        key: r.segmentNorm,
        label: r.segmentNorm,
        shortLabel: r.segmentNorm.length > 12 ? `${r.segmentNorm.slice(0, 10)}…` : r.segmentNorm,
        planCumulative: r.planCumulativeArea,
        factCumulative: r.factCumulativeArea,
      })),
    );
  }, [doc?.rows]);

  const projectVolumeRail = useMemo(() => {
    if (!kpiData.hasCsvPlan) return null;
    const area = kpiData.projectArea;
    if (!Number.isFinite(area) || area <= 0) return null;
    return { value: area, unit: "кв.м", caption: "Площадь проекта" as const };
  }, [kpiData]);

  const hasAnyData = installmentAreaPeriodKpiHasData(kpiData) || performanceChartHasData(chartRows);
  const diagnostics = doc?.diagnostics ?? failedDiagnostics;
  const showDebug = isEditMode && !presentation;

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const busy = loading;
  const hasCsv = Boolean(doc?.rows?.length);
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
      className={`relative mt-6 min-w-0 border-t pt-6 ${presDark ? "border-white/10" : "border-slate-200/50"} ${
        dragOver && isEditMode ? (presDark ? "ring-2 ring-teal-500/40" : "ring-2 ring-teal-400/50") : ""
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
              CSV площади (legacy wide-table). Месяц строк привязывается к периоду дашборда / дате отчёта.
            </p>
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
        <p className={`mb-3 rounded-lg border px-3 py-2 text-sm ${presDark ? "border-rose-500/30 bg-rose-950/30 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {err}
        </p>
      ) : null}

      {!hydrated || (busy && isEditMode) ? (
        <EntityPlanPeriodKpiSection
          entityLabel="Квартиры"
          theme={INSTALLMENT_AREA_KPI_THEME}
          cardsData={cardsData}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          sectionTitle="Общая площадь, кв.м"
          formatMetric={formatInstallmentAreaSqm}
          projectVolume={projectVolumeRail}
          skeleton
        />
      ) : !hasAnyData ? (
        <EntityPlanPeriodKpiSection
          entityLabel="Квартиры"
          theme={INSTALLMENT_AREA_KPI_THEME}
          cardsData={cardsData}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          sectionTitle="Общая площадь, кв.м"
          formatMetric={formatInstallmentAreaSqm}
          projectVolume={projectVolumeRail}
          showEmpty
          emptyMessage="Подгрузите CSV площади или дождитесь данных системы"
        />
      ) : (
        <EntityPlanPeriodKpiSection
          entityLabel="Квартиры"
          theme={INSTALLMENT_AREA_KPI_THEME}
          cardsData={cardsData}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          sectionTitle="Общая площадь, кв.м"
          formatMetric={formatInstallmentAreaSqm}
          projectVolume={projectVolumeRail}
        >
          {performanceChartHasData(chartRows) ? (
            <div className={`mt-6 min-w-0 rounded-2xl border p-4 ${presDark ? "border-white/10 bg-slate-900/40" : "border-slate-200/70 bg-white"}`}>
              <h3 className={`mb-3 text-sm font-semibold ${presDark ? "text-slate-100" : "text-slate-900"}`}>
                Накопительно по сегментам (кв.м)
              </h3>
              <EntityPerformanceChart
                rows={chartRows}
                hasCsvPlan={cardsData.hasCsvPlan}
                presDark={presDark}
                presentation={presentation}
                unitSuffix="кв.м"
              />
            </div>
          ) : null}
        </EntityPlanPeriodKpiSection>
      )}

      {showDebug && diagnostics ? (
        <details className={`mt-4 rounded-lg border px-3 py-2 text-xs ${presDark ? "border-slate-600 bg-slate-900/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
          <summary className="cursor-pointer font-semibold">Диагностика CSV площади</summary>
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
          Plan source: {hasCsv ? "CSV AREA" : "NOT LOADED"} · Imported roots: {doc?.rows?.length ?? 0}
        </p>
      ) : null}
    </div>
  );
}
