"use client";

import { useCallback, useState } from "react";

import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { marketingMockData } from "@/lib/marketingMockData";
import {
  resolvePresentationProjectName,
  resolvePresentationProjectPhase,
} from "@/lib/presentationProjectName";
import {
  exportElementToPdf,
  marketingPeriodLabel,
  marketingReportFileName,
  type PdfExportMeta,
} from "@/utils/exportPdf";

const PDF_ROOT_SELECTOR = "[data-marketing-pdf-export-root]";

export type UseMarketingPdfExportOptions = {
  reportTitle: string;
  period: MarketingPeriodGranularity;
  objectId: string;
};

export function useMarketingPdfExport({ reportTitle, period, objectId }: UseMarketingPdfExportOptions) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const objectLabel =
    marketingMockData.objects.find((o) => o.id === objectId)?.name ??
    (objectId === "all" ? "Все объекты" : objectId);

  const exportPdf = useCallback(async () => {
    const root = document.querySelector(PDF_ROOT_SELECTOR);
    if (!(root instanceof HTMLElement)) {
      setError("Не найден контент для экспорта");
      return;
    }

    setExporting(true);
    setError(null);
    document.documentElement.classList.add("marketing-pdf-capturing");

    const generatedAt = new Date();
    const meta: PdfExportMeta = {
      projectName: resolvePresentationProjectName(null),
      projectPhase: resolvePresentationProjectPhase(null),
      reportTitle,
      periodLabel: marketingPeriodLabel(period),
      objectLabel,
      generatedAt,
      fileName: marketingReportFileName(generatedAt),
    };

    try {
      await exportElementToPdf(root, meta, { scale: 2, backgroundColor: "#ffffff" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось сформировать PDF";
      setError(msg);
    } finally {
      document.documentElement.classList.remove("marketing-pdf-capturing");
      setExporting(false);
    }
  }, [objectLabel, period, reportTitle]);

  return { exportPdf, exporting, error, clearError: () => setError(null) };
}
