"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

import { exportConstructionSectionPdf } from "@/lib/pdf/exportSectionPdf";
import type { ConstructionSectionType } from "@/lib/pdf/constructionPdfConstants";

export interface ReportPdfButtonProps {
  section: ConstructionSectionType;
  /** Фон секции: светлый (редактирование) или тёмный (презентация). */
  surface?: "light" | "dark";
}

export function ReportPdfButton({ section, surface = "light" }: ReportPdfButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dividerClass =
    surface === "dark" ? "border-slate-600/45" : "border-slate-200";

  const handleClick = async () => {
    if (exporting) return;
    setError(null);
    setExporting(true);
    try {
      await exportConstructionSectionPdf(section);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось сформировать PDF-отчёт";
      setError(message);
      console.error("[PDF] Export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className={`relative mt-6 border-t pt-6 ${dividerClass}`}
      data-pdf-exclude
      data-report-pdf-section={section}
    >
      <div className="flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={() => void handleClick()}
          disabled={exporting}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:bg-slate-50 active:border-slate-400 active:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
          title="Скачать PDF-отчет"
          aria-busy={exporting}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" aria-hidden />
          ) : (
            <FileDown className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
          )}
          <span>{exporting ? "Формирование PDF..." : "Скачать PDF-отчёт"}</span>
        </button>
        {error ? (
          <p className="max-w-[22rem] text-right text-[11px] font-medium text-rose-500" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
