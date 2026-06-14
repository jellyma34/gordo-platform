"use client";

import { useCallback, useRef, useState } from "react";

import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import type { MarketingTab } from "@/components/marketing/marketingTypes";
import { marketingMockData } from "@/lib/marketingMockData";
import {
  resolvePresentationProjectName,
  resolvePresentationProjectPhase,
} from "@/lib/presentationProjectName";
import {
  exportMarketingPdfBlocksToPdf,
  marketingPeriodLabel,
  marketingReportFileName,
  type PdfExportMeta,
} from "@/utils/exportPdf";
import {
  captureMarketingPdfBlockCanvas,
  clearPdfSnapshotCache,
  collectMarketingPdfBlocks,
} from "@/utils/pdf/pdfRenderHelpers";

export type UseMarketingPdfExportOptions = {
  reportTitle: string;
  period: MarketingPeriodGranularity;
  objectId: string;
  activeTab: MarketingTab;
};

export function useMarketingPdfExport({
  reportTitle,
  period,
  objectId,
  activeTab,
}: UseMarketingPdfExportOptions) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportSession, setReportSession] = useState(0);

  const resolveRef = useRef<((root: HTMLElement | null) => void) | null>(null);
  const rejectRef = useRef<((reason?: unknown) => void) | null>(null);

  const objectLabel =
    marketingMockData.objects.find((o) => o.id === objectId)?.name ??
    (objectId === "all" ? "Все объекты" : objectId);

  const handleReportReady = useCallback((root: HTMLElement) => {
    resolveRef.current?.(root);
    resolveRef.current = null;
    rejectRef.current = null;
  }, []);

  const handleReportError = useCallback((message: string) => {
    rejectRef.current?.(new Error(message));
    resolveRef.current = null;
    rejectRef.current = null;
  }, []);

  const exportPdf = useCallback(async () => {
    setExporting(true);
    setError(null);
    clearPdfSnapshotCache();
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
      const root = await new Promise<HTMLElement | null>((resolve, reject) => {
        resolveRef.current = resolve;
        rejectRef.current = reject;
        setReportSession((n) => n + 1);
      });

      if (!root) {
        throw new Error("Не удалось подготовить контент PDF");
      }

      const blocks = collectMarketingPdfBlocks(root);
      if (blocks.length === 0) {
        throw new Error("В отчёте нет блоков для экспорта");
      }

      await exportMarketingPdfBlocksToPdf(blocks, meta, {
        scale: 2,
        backgroundColor: "#ffffff",
        captureBlock: async (block, index) => {
          const cacheKey = block.getAttribute("data-marketing-pdf-block-key") ?? `block-${index}`;
          return captureMarketingPdfBlockCanvas(
            block,
            { scale: 2, backgroundColor: "#ffffff" },
            cacheKey,
          );
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось сформировать PDF";
      setError(msg);
    } finally {
      document.documentElement.classList.remove("marketing-pdf-capturing");
      setExporting(false);
      resolveRef.current = null;
      rejectRef.current = null;
    }
  }, [objectLabel, period, reportTitle]);

  return {
    exportPdf,
    exporting,
    error,
    clearError: () => setError(null),
    reportSession,
    handleReportReady,
    handleReportError,
    activeTab,
    period,
    objectId,
  };
}
