"use client";

import { useEffect, useState } from "react";
import { FileDown } from "lucide-react";

export interface ReportPdfButtonProps {
  section: "gpr" | "tenders" | "tmc";
  /** Фон секции: светлый (редактирование) или тёмный (презентация). */
  surface?: "light" | "dark";
}

const STUB_MESSAGE = "PDF-отчет будет доступен в следующей версии";
const TOAST_MS = 3200;

export function ReportPdfButton({ section, surface = "light" }: ReportPdfButtonProps) {
  const [toastOpen, setToastOpen] = useState(false);

  useEffect(() => {
    if (!toastOpen) return;
    const timer = window.setTimeout(() => setToastOpen(false), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toastOpen]);

  const handleClick = () => {
    setToastOpen(true);
  };

  const dividerClass =
    surface === "dark" ? "border-slate-600/45" : "border-slate-200";

  const toastClass =
    surface === "dark"
      ? "border-slate-500/40 bg-slate-900/95 text-slate-100 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
      : "border-slate-200 bg-white text-slate-800 shadow-lg";

  return (
    <div
      className={`relative mt-6 border-t pt-6 ${dividerClass}`}
      data-pdf-exclude
      data-report-pdf-section={section}
    >
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:bg-slate-50 active:border-slate-400 active:bg-slate-100"
          title="Скачать PDF-отчет"
        >
          <FileDown className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
          <span>Скачать PDF-отчет</span>
        </button>
      </div>

      {toastOpen ? (
        <div
          role="status"
          className={`pointer-events-none absolute bottom-full right-0 z-20 mb-2 max-w-[min(22rem,90vw)] rounded-lg border px-3 py-2 text-xs font-medium ${toastClass}`}
        >
          {STUB_MESSAGE}
        </div>
      ) : null}
    </div>
  );
}
