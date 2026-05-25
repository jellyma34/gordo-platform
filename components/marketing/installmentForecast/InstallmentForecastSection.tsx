"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";

import { InstallmentForecastChart } from "@/components/marketing/installmentForecast/InstallmentForecastChart";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { buildInstallmentForecastChartData } from "@/lib/buildInstallmentForecastChartData";
import { formatMarketingImportUpdatedLabel } from "@/lib/marketingImportUpdatedLabel";
import {
  clearMarketingInstallmentForecastCsvLocalStorage,
  marketingInstallmentForecastCsvDocIsValid,
  readMarketingInstallmentForecastCsvFromLocalStorage,
  type MarketingInstallmentForecastCsvStoredV1,
} from "@/lib/marketingInstallmentForecastCsv";
import { marketingPaymentPlanProjectIdFromEnv } from "@/lib/marketingPaymentPlanStore";
import { marketingAnalyticsMajorSectionClass } from "@/lib/marketingAnalyticsSectionShell";
import { MPL_PREMIUM_CHART_SHELL } from "@/lib/marketingPremiumUi";
import { INSTALLMENT_FORECAST_CSV_MAX_BYTES } from "@/lib/parseInstallmentForecastCsv";
import type { InstallmentForecastCsvParseDiagnostics } from "@/lib/planDataSource/installmentForecast/types";
import { useMarketingImportDoc } from "@/lib/useMarketingImportDoc";

type Props = {
  presentation: boolean;
  presDark: boolean;
  mplPremium?: boolean;
  isEditMode?: boolean;
  period?: MarketingPeriodGranularity;
};

export function InstallmentForecastSection({
  presentation,
  presDark,
  mplPremium = false,
  isEditMode = false,
}: Props) {
  const projectId = useMemo(() => marketingPaymentPlanProjectIdFromEnv(), []);

  const {
    doc,
    hydrated,
    loading,
    error,
    setError,
    uploadFile,
    clearImport,
  } = useMarketingImportDoc<MarketingInstallmentForecastCsvStoredV1>({
    projectId,
    datasetKey: "installmentForecast",
    importKind: "installment_forecast",
    validate: marketingInstallmentForecastCsvDocIsValid,
    readLocalForMigration: readMarketingInstallmentForecastCsvFromLocalStorage,
    clearLocal: clearMarketingInstallmentForecastCsvLocalStorage,
  });

  const [failedDiagnostics, setFailedDiagnostics] = useState<InstallmentForecastCsvParseDiagnostics | null>(null);

  const { chartPoints } = useMemo(
    () => buildInstallmentForecastChartData(doc?.rows ?? []),
    [doc?.rows],
  );

  const hasCsv = Boolean(doc?.rows?.length);
  const hasFutureData = chartPoints.length > 0;

  const updatedLabel = formatMarketingImportUpdatedLabel(doc?.updatedAt, doc?.uploadedBy);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const busy = loading;
  const err = localErr || error;

  const uploadCsv = useCallback(
    async (file: File) => {
      if (file.size > INSTALLMENT_FORECAST_CSV_MAX_BYTES) {
        throw new Error("Размер файла не должен превышать 10 МБ.");
      }
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Допустимы только файлы .csv");
      }
      setFailedDiagnostics(null);
      const result = await uploadFile(file);
      if (!result.ok) {
        const diag = result.diagnostics as InstallmentForecastCsvParseDiagnostics | undefined;
        if (diag) setFailedDiagnostics(diag);
        return;
      }
    },
    [uploadFile],
  );

  const clearCsv = useCallback(async () => {
    setFailedDiagnostics(null);
    await clearImport();
  }, [clearImport]);

  const processFile = useCallback(
    async (file: File) => {
      setLocalErr(null);
      setError(null);
      try {
        await uploadCsv(file);
      } catch (e) {
        setLocalErr(e instanceof Error ? e.message : "Не удалось загрузить файл");
      }
    },
    [setError, uploadCsv],
  );

  const shellPad = presentation ? "p-5 sm:p-6" : "p-4 sm:p-5";
  const shellClass =
    presDark
      ? `overflow-visible rounded-2xl border border-slate-700/55 bg-[#1e293b] shadow-[0_8px_28px_rgba(0,0,0,0.2)] ${shellPad}`
      : presentation && mplPremium
        ? `overflow-visible ${shellPad} ${MPL_PREMIUM_CHART_SHELL}`
        : presentation
          ? `overflow-visible rounded-2xl border border-mpl-border bg-mpl-chart shadow-[0_4px_22px_rgba(15,23,42,0.05)] ${shellPad}`
          : `overflow-visible rounded-2xl border border-slate-200/70 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.04)] ${shellPad}`;

  const titleCls = presDark ? "text-slate-100" : "text-slate-900";
  const subCls = presDark ? "text-slate-400" : "text-slate-600";
  const uploadBtnCls = presDark
    ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-500/50 bg-slate-800/50 px-3 py-1.5 text-xs font-semibold text-slate-200 shadow-sm hover:border-slate-400/60 disabled:opacity-40"
    : "inline-flex items-center gap-1.5 rounded-lg border border-slate-300/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-400 disabled:opacity-40";

  return (
    <div
      className={`${marketingAnalyticsMajorSectionClass(presDark)} ${
        dragOver && isEditMode ? (presDark ? "ring-2 ring-amber-500/40" : "ring-2 ring-amber-400/50") : ""
      }`}
    >
    <section
      className={`relative min-w-0 ${shellClass}`}
      aria-labelledby="installment-forecast-heading"
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

      <div className="mb-3 flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 id="installment-forecast-heading" className={`text-sm font-semibold tracking-tight ${titleCls}`}>
            Прогноз поступлений по заключенным договорам (рассрочки)
          </h3>
          {isEditMode ? (
            <p className={`mt-1 text-[11px] ${subCls}`}>
              CSV из раздела «Рассрочка ДДУ» (график платежей или long-формат). В прогнозе только месяцы с мая 2026.
            </p>
          ) : null}
          {isEditMode && hasCsv && updatedLabel ? (
            <p className={`mt-1 text-[11px] ${subCls}`}>{updatedLabel}</p>
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

      {!hydrated || busy ? (
        <div className={`flex items-center gap-2 py-10 text-sm ${subCls}`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      ) : !hasFutureData ? (
        <p className={`py-10 text-center text-sm ${subCls}`}>
          {hasCsv ? "Нет будущих поступлений по рассрочкам" : "Подгрузите CSV графика рассрочки ДДУ"}
        </p>
      ) : (
        <InstallmentForecastChart
          data={chartPoints}
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
        />
      )}
    </section>
    </div>
  );
}
