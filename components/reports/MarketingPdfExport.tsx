"use client";

import { FileDown, Loader2 } from "lucide-react";

import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { useMarketingPdfExport } from "@/hooks/useMarketingPdfExport";

type Props = {
  reportTitle: string;
  period: MarketingPeriodGranularity;
  objectId: string;
};

export function MarketingPdfExport({ reportTitle, period, objectId }: Props) {
  const { exportPdf, exporting, error, clearError } = useMarketingPdfExport({
    reportTitle,
    period,
    objectId,
  });

  return (
    <div className="flex flex-col items-center gap-1" data-pdf-exclude>
      <button
        type="button"
        onClick={() => {
          clearError();
          void exportPdf();
        }}
        disabled={exporting}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
        aria-busy={exporting}
        title="Скачать PDF-отчёт по текущему экрану"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" aria-hidden />
        ) : (
          <FileDown className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
        )}
        <span>{exporting ? "Формирование отчета..." : "Отчет PDF"}</span>
      </button>
      {error ? (
        <p className="max-w-[16rem] text-center text-[11px] font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
