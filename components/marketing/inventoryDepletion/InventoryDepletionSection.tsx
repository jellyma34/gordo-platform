"use client";

import { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";

import { AnalyticsCsvUploadToolbar } from "@/components/marketing/analytics/AnalyticsCsvUploadToolbar";
import { AnalyticsSectionShell } from "@/components/marketing/analytics/AnalyticsSectionShell";
import { analyticsMarketingInnerCardClass } from "@/components/marketing/analytics/analyticsSectionShellStyles";
import { InventoryDepletionDonutGrid } from "@/components/marketing/inventoryDepletion/InventoryDepletionDonutGrid";
import { InventoryDepletionDynamicsChart } from "@/components/marketing/inventoryDepletion/InventoryDepletionDynamicsChart";
import { filterNormalizedDealsForMarketingObject } from "@/components/marketing/SalesPlanSegmentStructure";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { useMarketingDealsFeedOptional } from "@/components/marketing/marketingDealsFeedContext";
import { marketingMockData } from "@/lib/marketingMockData";
import {
  buildInventoryDepletionBundle,
  inventoryDepletionBundleHasSales,
} from "@/lib/inventoryDepletionFromDeals";
import {
  useInventoryDepletionPlanBlock,
  type InventoryDepletionPlanBlockState,
  type UseInventoryDepletionPlanBlockArgs,
} from "@/lib/inventoryDepletion/useInventoryDepletionPlanBlock";

type Props = UseInventoryDepletionPlanBlockArgs & {
  presentation: boolean;
  presDark: boolean;
  mplPremium?: boolean;
  period?: MarketingPeriodGranularity;
  objectId?: string;
  showCsvUpload?: boolean;
  planBlock?: InventoryDepletionPlanBlockState;
};

export function InventoryDepletionSection({
  presentation,
  presDark,
  objectId = "all",
  showCsvUpload = false,
  planBlock: externalPlanBlock,
  ...planBlockArgs
}: Props) {
  const internalPlan = useInventoryDepletionPlanBlock(planBlockArgs);
  const planBlock = externalPlanBlock ?? internalPlan;
  const dealsFeed = useMarketingDealsFeedOptional();

  const dealRowsForFact = useMemo(() => {
    const rows = dealsFeed?.rows ?? [];
    if (!rows.length) return [];
    return filterNormalizedDealsForMarketingObject(rows, objectId);
  }, [dealsFeed?.rows, objectId]);

  const bundle = useMemo(() => {
    const csvType =
      planBlock.doc?.diagnostics?.csvType ??
      (planBlock.doc?.biReportMeta?.apartmentsSummary ? ("bi_report" as const) : undefined);
    return buildInventoryDepletionBundle({
      planRows: planBlock.doc?.rows,
      biApartmentsSummary: planBlock.doc?.biReportMeta?.apartmentsSummary ?? null,
      objectId,
      objects: marketingMockData.objects,
      csvType,
      dealRows: dealRowsForFact,
    });
  }, [dealRowsForFact, objectId, planBlock.doc]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.log("[inventory depletion]", {
      dealsLoaded: dealRowsForFact.length,
      hasPlan: bundle.hasPlan,
      matchedSales: bundle.debug.matchedSales,
    });
  }, [bundle.debug.matchedSales, bundle.hasPlan, dealRowsForFact.length]);

  const loadingDeals = Boolean(dealsFeed?.loading && dealRowsForFact.length === 0);
  const loading = loadingDeals || (planBlock.busy && !planBlock.hasCsv && dealRowsForFact.length === 0);
  const dealsLoaded = dealRowsForFact.length;
  const hasSales = inventoryDepletionBundleHasSales(bundle);
  const feedConnected = dealsFeed != null;

  const titleCls = presDark ? "text-slate-100" : "text-slate-900";
  const subCls = presDark ? "text-slate-400" : "text-slate-600";
  const innerCardCls = analyticsMarketingInnerCardClass(presDark);
  const diagCls = presDark
    ? "rounded-lg border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-100"
    : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950";

  const showDiagnostics = !loading && dealsLoaded > 0 && !hasSales;

  const headerRight =
    showCsvUpload && !presentation ? (
      <AnalyticsCsvUploadToolbar
        presDark={presDark}
        busy={planBlock.busy}
        hasCsv={planBlock.hasCsv}
        updatedLabel={planBlock.updatedLabel}
        onUpload={planBlock.uploadCsv}
        onClear={planBlock.clearCsv}
      />
    ) : null;

  return (
    <AnalyticsSectionShell
      id="marketing-inventory-depletion"
      title="Выбытие объектов"
      subtitle={
        <>
          Исходный ассортимент — из плана KPI (CSV «План квартир»); продажи — из JSON сделок. Остаток = план − продано.
        </>
      }
      presDark={presDark}
      presentation={presentation}
      mplPremium={false}
      headerRight={headerRight}
      className="inventory-depletion-section"
    >
      {loading ? (
        <div className={`flex items-center gap-2 py-10 text-sm ${subCls}`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка данных…
        </div>
      ) : !feedConnected ? (
        <p className={`py-10 text-center text-sm ${subCls}`}>
          Источник сделок не подключён. Откройте раздел внутри «Маркетинг» (общий feed JSON).
        </p>
      ) : dealsLoaded === 0 ? (
        <div className="space-y-3 py-6">
          <p className={`text-center text-sm ${subCls}`}>Нет данных по продажам</p>
          {dealsFeed.error ? (
            <p className={`text-center text-xs text-rose-600 ${presDark ? "text-rose-300" : ""}`}>{dealsFeed.error}</p>
          ) : null}
        </div>
      ) : showDiagnostics ? (
        <div className="space-y-4">
          {!presentation ? (
            <div className={diagCls}>
              <div className="font-semibold">Диагностика выбытия</div>
              <div>Deals loaded: {bundle.debug.dealsLoaded}</div>
              <div>Matched sales: {bundle.debug.matchedSales}</div>
              <div>План KPI загружен: {bundle.hasPlan ? "да" : "нет"}</div>
            </div>
          ) : null}
          <InventoryDepletionDonutGrid donuts={bundle.donuts} presDark={presDark} />
        </div>
      ) : !hasSales ? (
        <p className={`py-10 text-center text-sm ${subCls}`}>Нет данных по продажам</p>
      ) : (
        <div className="flex flex-col gap-5">
          <InventoryDepletionDonutGrid donuts={bundle.donuts} presDark={presDark} />

          <div className={innerCardCls}>
            <h4 className={`mb-1 text-sm font-semibold tracking-tight ${titleCls}`}>Динамика выбытия объектов</h4>
            {!presentation ? (
              <p className={`mb-4 text-[11px] ${subCls}`}>
                Остаток ассортимента по месяцам (ось Y — штуки, снижение по мере продаж).
              </p>
            ) : null}
            {bundle.dynamics.length > 0 ? (
              <InventoryDepletionDynamicsChart
                data={bundle.dynamics}
                timelineMonthKeys={bundle.timelineMonthKeys}
                presDark={presDark}
              />
            ) : (
              <p className={`py-8 text-center text-sm ${subCls}`}>Нет данных по продажам</p>
            )}
          </div>
        </div>
      )}
    </AnalyticsSectionShell>
  );
}
