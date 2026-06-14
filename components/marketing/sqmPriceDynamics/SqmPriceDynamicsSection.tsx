"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { AnalyticsChartModeToggle } from "@/components/marketing/analytics/AnalyticsChartModeToggle";
import { AnalyticsSectionShell } from "@/components/marketing/analytics/AnalyticsSectionShell";
import { SqmPriceDynamicsGrid } from "@/components/marketing/sqmPriceDynamics/SqmPriceDynamicsGrid";
import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { useMarketingDealsFeedOptional } from "@/components/marketing/marketingDealsFeedContext";
import { filterByObject } from "@/lib/marketingMockData";
import {
  buildSqmPriceDynamicsBundle,
  resolveSqmPriceDynamicsTimelineMonthKeys,
  SQM_PRICE_DYNAMICS_DISPLAY_ROWS,
  type SqmPriceChartMode,
} from "@/lib/sqmPriceDynamicsFromDeals";
import type { MarketingPdfRenderProps } from "@/utils/pdf/marketingPdfRenderProps";

type Props = MarketingPdfRenderProps & {
  presentation: boolean;
  presDark: boolean;
  mplPremium?: boolean;
  period?: MarketingPeriodGranularity;
  objectId?: string;
};

export function SqmPriceDynamicsSection({
  presentation,
  presDark,
  mplPremium = false,
  objectId = "all",
  pdfRender = false,
  forcedChartMode,
  hideInteractiveControls = false,
}: Props) {
  const dealsFeed = useMarketingDealsFeedOptional();
  const [chartMode, setChartMode] = useState<SqmPriceChartMode>("monthly");
  const effectiveChartMode = forcedChartMode ?? chartMode;

  const dealRowsForFact = useMemo(() => {
    const rows = dealsFeed?.rows ?? [];
    if (!rows.length) return [];
    return filterByObject(rows as { objectId?: string }[], objectId) as NormalizedDealRow[];
  }, [dealsFeed?.rows, objectId]);

  const bundle = useMemo(() => buildSqmPriceDynamicsBundle(dealRowsForFact), [dealRowsForFact]);

  const displayRows = useMemo(() => {
    if (bundle.rows.length > 0) return bundle.rows;
    return SQM_PRICE_DYNAMICS_DISPLAY_ROWS.map((meta) => ({
      key: meta.id,
      label: meta.label,
      accentHex: meta.stroke,
      months: [],
      overallAvgPricePerSqmRub: null,
      totalDeals: 0,
    }));
  }, [bundle.rows]);

  const timelineMonthKeys = useMemo(() => {
    if (bundle.timelineMonthKeys.length > 0) return bundle.timelineMonthKeys;
    return resolveSqmPriceDynamicsTimelineMonthKeys();
  }, [bundle.timelineMonthKeys]);

  const loading = Boolean(dealsFeed?.loading && dealRowsForFact.length === 0);
  const subCls = presDark ? "text-slate-400" : "text-slate-600";

  const headerRight = hideInteractiveControls ? null : (
    <AnalyticsChartModeToggle
      mode={effectiveChartMode}
      onModeChange={setChartMode}
      presDark={presDark}
      presentation={presentation}
      mplPremium={mplPremium}
    />
  );

  return (
    <AnalyticsSectionShell
      id="marketing-sqm-price-dynamics"
      title="Динамика стоимости м²"
      subtitle="Средняя цена ₽/м² по сделкам JSON (взвешенная по площади); помесячно — за месяц, нарастающим — средняя с начала периода."
      presDark={presDark}
      presentation={presentation}
      mplPremium={mplPremium}
      headerRight={headerRight}
      className="sqm-price-dynamics-section"
    >
      {loading ? (
        <div className={`flex items-center gap-2 text-sm ${subCls}`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка сделок…
        </div>
      ) : (
        <SqmPriceDynamicsGrid
          rows={displayRows}
          timelineMonthKeys={timelineMonthKeys}
          presDark={presDark}
          chartMode={effectiveChartMode}
        />
      )}
    </AnalyticsSectionShell>
  );
}
