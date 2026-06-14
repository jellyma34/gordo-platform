"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { InstallmentDduPanel } from "@/components/marketing/InstallmentDduPanel";
import { SalesDealsSection } from "@/components/marketing/SalesDealsSection";
import { SalesPlanPanel } from "@/components/marketing/SalesPlanPanel";
import { SalesDealsSegmentMonthStackCharts } from "@/components/marketing/SalesDealsSegmentMonthStackCharts";
import { SqmPriceDynamicsSection } from "@/components/marketing/sqmPriceDynamics/SqmPriceDynamicsSection";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import type { MarketingTab } from "@/components/marketing/marketingTypes";
import { useMarketingDealsFeed } from "@/components/marketing/marketingDealsFeedContext";
import { useMarketingPresentationLight, useMarketingPresVisual } from "@/components/marketing/marketingPresentationLightContext";
import { filterNormalizedDealsForMarketingObject } from "@/components/marketing/SalesPlanSegmentStructure";
import { MarketingPdfSectionBlock } from "@/components/reports/MarketingPdfSectionBlock";
import { waitForRenderComplete } from "@/utils/pdf/chartSnapshotUtils";
import {
  MARKETING_PDF_CHART_MODE_LABELS,
  MARKETING_PDF_CHART_MODES,
  marketingPdfSnapshotKey,
} from "@/utils/pdf/marketingPdfSections";
import { MARKETING_PDF_ROOT_ATTR } from "@/utils/pdf/marketingPdfRenderProps";

type Props = {
  activeTab: MarketingTab;
  period: MarketingPeriodGranularity;
  objectId: string;
  onReady: (root: HTMLElement) => void;
  onError: (message: string) => void;
};

const pdfChartProps = { pdfRender: true, hideInteractiveControls: true } as const;

function InstallmentPdfBlocks({
  presentation,
  period,
  objectId,
}: {
  presentation: boolean;
  period: MarketingPeriodGranularity;
  objectId: string;
}) {
  const mplLight = useMarketingPresentationLight();
  const presDark = useMarketingPresVisual(presentation) === "presDark";

  return (
    <>
      <MarketingPdfSectionBlock sectionTitle="Рассрочка ДДУ — сводная аналитика" blockKey="installment-panel">
        <InstallmentDduPanel presentation={presentation} period={period} objectId={objectId} />
      </MarketingPdfSectionBlock>
      {MARKETING_PDF_CHART_MODES.map((mode) => (
        <MarketingPdfSectionBlock
          key={`installment-sqm-${mode}`}
          sectionTitle="Динамика стоимости м²"
          modeLabel={MARKETING_PDF_CHART_MODE_LABELS[mode]}
          blockKey={marketingPdfSnapshotKey(["installment-sqm", mode])}
        >
          <SqmPriceDynamicsSection
            presentation={presentation}
            presDark={presDark}
            mplPremium={mplLight}
            period={period}
            objectId={objectId}
            forcedChartMode={mode}
            {...pdfChartProps}
          />
        </MarketingPdfSectionBlock>
      ))}
    </>
  );
}

/** Offscreen renderer: все сегменты/режимы, не зависит от UI состояния экрана. */
export function MarketingPdfReport({ activeTab, period, objectId, onReady, onError }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dealsFeed = useMarketingDealsFeed();
  const dealsRows = useMemo(
    () => filterNormalizedDealsForMarketingObject(dealsFeed.rows, objectId),
    [dealsFeed.rows, objectId],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    (async () => {
      try {
        await waitForRenderComplete(root, 25_000);
        if (!cancelled) onReady(root);
      } catch (e) {
        if (!cancelled) onError(e instanceof Error ? e.message : "Не удалось подготовить PDF-отчёт");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, period, objectId, dealsFeed.loading, onReady, onError]);

  const content =
    activeTab === "sales" ? (
      <SalesPlanPanel presentation period={period} objectId={objectId} pdfMode />
    ) : activeTab === "deals" ? (
      <>
        <MarketingPdfSectionBlock sectionTitle="Сделки — воронка и динамика" blockKey="deals-main">
          <SalesDealsSection presentation period={period} objectId={objectId} />
        </MarketingPdfSectionBlock>
        {!dealsFeed.loading ? (
          <MarketingPdfSectionBlock sectionTitle="Сделки по сегментам" blockKey="deals-segments">
            <SalesDealsSegmentMonthStackCharts dealsRows={dealsRows} presentation />
          </MarketingPdfSectionBlock>
        ) : null}
      </>
    ) : (
      <InstallmentPdfBlocks presentation period={period} objectId={objectId} />
    );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className="marketing-pdf-report-root pointer-events-none fixed left-[-12000px] top-0 z-[-1] min-h-0 w-[1100px] max-w-none bg-white"
      {...{ [MARKETING_PDF_ROOT_ATTR]: true }}
      aria-hidden
    >
      <div className="flex flex-col gap-8">{content}</div>
    </div>,
    document.body,
  );
}
