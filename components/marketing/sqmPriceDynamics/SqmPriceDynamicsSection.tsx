"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";

import { SqmPriceDynamicsGrid } from "@/components/marketing/sqmPriceDynamics/SqmPriceDynamicsGrid";
import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { useMarketingDealsFeedOptional } from "@/components/marketing/marketingDealsFeedContext";
import { useMarketingPresentationLight } from "@/components/marketing/marketingPresentationLightContext";
import { MPL_PREMIUM_CHART_SHELL } from "@/lib/marketingPremiumUi";
import { filterByObject } from "@/lib/marketingMockData";
import {
  buildSqmPriceDynamicsBundle,
  SQM_PRICE_DYNAMICS_DISPLAY_ROWS,
} from "@/lib/sqmPriceDynamicsFromDeals";

type Props = {
  presentation: boolean;
  presDark: boolean;
  mplPremium?: boolean;
  period?: MarketingPeriodGranularity;
  objectId?: string;
};

export function SqmPriceDynamicsSection({
  presentation,
  presDark,
  objectId = "all",
}: Props) {
  const mplLight = useMarketingPresentationLight();
  const dealsFeed = useMarketingDealsFeedOptional();

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

  const loading = Boolean(dealsFeed?.loading && dealRowsForFact.length === 0);

  const shellPad = presentation ? "p-5 sm:p-6" : "p-4 sm:p-5";
  const shellClass =
    presDark
      ? `overflow-visible rounded-2xl border border-slate-700/55 bg-[#1e293b] shadow-[0_8px_28px_rgba(0,0,0,0.2)] ${shellPad}`
      : presentation && mplLight
        ? `overflow-visible ${shellPad} ${MPL_PREMIUM_CHART_SHELL}`
        : presentation
          ? `overflow-visible rounded-2xl border border-mpl-border bg-mpl-chart shadow-[0_4px_22px_rgba(15,23,42,0.05)] ${shellPad}`
          : `overflow-visible rounded-2xl border border-slate-200/70 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.04)] ${shellPad}`;

  const titleCls = presDark ? "text-slate-100" : "text-slate-900";
  const subCls = presDark ? "text-slate-400" : "text-slate-600";

  return (
    <section className={shellClass} aria-labelledby="sqm-price-dynamics-heading">
      <h3
        id="sqm-price-dynamics-heading"
        className={`mb-4 text-sm font-semibold tracking-tight sm:mb-5 ${titleCls}`}
      >
        Динамика стоимости м²
      </h3>

      {loading ? (
        <div className={`flex items-center gap-2 text-sm ${subCls}`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка сделок…
        </div>
      ) : (
        <SqmPriceDynamicsGrid
          rows={displayRows}
          timelineMonthKeys={bundle.timelineMonthKeys}
          presDark={presDark}
        />
      )}
    </section>
  );
}
