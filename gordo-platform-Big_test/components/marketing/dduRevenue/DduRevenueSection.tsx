"use client";

import { useCallback, useState, type DragEvent } from "react";

import { DduSalesChart } from "@/components/marketing/dduRevenue/DduSalesChart";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { useDduRevenueSalesBlock } from "@/lib/dduRevenue/useDduRevenueSalesBlock";
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
  objectId = "all",
  currentPeriodKey = defaultDashboardPeriodKey(),
}: Props) {
  const salesBlock = useDduRevenueSalesBlock({ period, objectId, currentPeriodKey });
  const { doc, busy, failedDiagnostics, uploadCsv } = salesBlock;

  const hasCsv = Boolean(doc?.rows?.length);

  const diagnostics = doc?.diagnostics ?? failedDiagnostics;
  const showDebug = isEditMode && !presentation;
  const mutedCls = presDark ? "text-slate-400" : "text-slate-500";
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      try {
        await uploadCsv(file);
      } catch {
        /* ошибка отображается в DduSalesChart */
      }
    },
    [uploadCsv],
  );

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
      <DduSalesChart
        block={salesBlock}
        doc={doc}
        hydrated={salesBlock.hydrated}
        loading={busy}
        error={salesBlock.error}
        presentation={presentation}
        presDark={presDark}
        mplPremium={mplPremium}
        period={period}
        objectId={objectId}
        currentPeriodKey={currentPeriodKey}
        showCsvUpload={isEditMode}
        sectionSpacing="none"
      />

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
