"use client";

import { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";

import { InventoryDepletionDonutGrid } from "@/components/marketing/inventoryDepletion/InventoryDepletionDonutGrid";
import { InventoryDepletionDynamicsChart } from "@/components/marketing/inventoryDepletion/InventoryDepletionDynamicsChart";
import { filterNormalizedDealsForMarketingObject } from "@/components/marketing/SalesPlanSegmentStructure";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { useMarketingDealsFeedOptional } from "@/components/marketing/marketingDealsFeedContext";
import { useMarketingPresentationLight } from "@/components/marketing/marketingPresentationLightContext";
import {
  clearMarketingApartmentPlanCsvLocalStorage,
  marketingApartmentPlanCsvDocIsValid,
  readMarketingApartmentPlanCsvFromLocalStorage,
  type MarketingApartmentPlanCsvStoredV1,
} from "@/lib/marketingApartmentPlanCsv";
import { marketingMockData } from "@/lib/marketingMockData";
import { MPL_PREMIUM_CHART_SHELL } from "@/lib/marketingPremiumUi";
import {
  buildInventoryDepletionBundle,
  inventoryDepletionBundleHasSales,
} from "@/lib/inventoryDepletionFromDeals";
import { useMarketingImportDoc } from "@/lib/useMarketingImportDoc";
import { marketingPaymentPlanProjectIdFromEnv } from "@/lib/marketingPaymentPlanStore";

type Props = {
  presentation: boolean;
  presDark: boolean;
  mplPremium?: boolean;
  period?: MarketingPeriodGranularity;
  objectId?: string;
};

export function InventoryDepletionSection({
  presentation,
  presDark,
  objectId = "all",
}: Props) {
  const mplLight = useMarketingPresentationLight();
  const dealsFeed = useMarketingDealsFeedOptional();
  const projectId = useMemo(() => marketingPaymentPlanProjectIdFromEnv(), []);

  const { doc: planDoc, loading: planLoading } = useMarketingImportDoc<MarketingApartmentPlanCsvStoredV1>({
    projectId,
    datasetKey: "apartmentPlan",
    importKind: "apartment_plan",
    validate: marketingApartmentPlanCsvDocIsValid,
    readLocalForMigration: readMarketingApartmentPlanCsvFromLocalStorage,
    clearLocal: clearMarketingApartmentPlanCsvLocalStorage,
  });

  /** Тот же срез, что «Структура продаж» / план KPI (`filterNormalizedDealsForMarketingObject`). */
  const dealRowsForFact = useMemo(() => {
    const rows = dealsFeed?.rows ?? [];
    if (!rows.length) return [];
    return filterNormalizedDealsForMarketingObject(rows, objectId);
  }, [dealsFeed?.rows, objectId]);

  const bundle = useMemo(() => {
    const csvType =
      planDoc?.diagnostics?.csvType ??
      (planDoc?.biReportMeta?.apartmentsSummary ? ("bi_report" as const) : undefined);
    return buildInventoryDepletionBundle({
      planRows: planDoc?.rows,
      biApartmentsSummary: planDoc?.biReportMeta?.apartmentsSummary ?? null,
      objectId,
      objects: marketingMockData.objects,
      csvType,
      dealRows: dealRowsForFact,
    });
  }, [dealRowsForFact, objectId, planDoc]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const deals = dealsFeed?.rows ?? [];
    console.log("DEALS SOURCE", deals);
    console.log("DEALS LENGTH", deals?.length);
    console.log("DEALS FILTERED LENGTH", dealRowsForFact.length);
    console.log(
      "DEALS objectType (dealType)",
      [...new Set(deals.map((x) => x.dealType))],
    );
    console.log(
      "DEALS typeLabel",
      [...new Set(deals.map((x) => x.typeLabel))],
    );
    console.log(
      "DEALS statusLabel",
      [...new Set(deals.map((x) => x.statusLabel))],
    );
    console.log("INVENTORY DEPLETION DEBUG", bundle.debug);
    console.log({
      initialSupply: bundle.debug.sampleInitialSupply,
      soldCount: bundle.debug.sampleSold,
      remaining: Object.fromEntries(
        Object.entries(bundle.debug.sampleInitialSupply).map(([k, init]) => [
          k,
          Math.max(0, init - (bundle.debug.sampleSold[k as keyof typeof bundle.debug.sampleSold] ?? 0)),
        ]),
      ),
    });
  }, [bundle.debug, dealRowsForFact.length, dealsFeed?.rows]);

  const loadingDeals = Boolean(dealsFeed?.loading && dealRowsForFact.length === 0);
  const loading = loadingDeals || (planLoading && dealRowsForFact.length === 0);
  const dealsLoaded = dealRowsForFact.length;
  const hasSales = inventoryDepletionBundleHasSales(bundle);
  const feedConnected = dealsFeed != null;

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
  const innerCardCls = presDark
    ? "rounded-xl border border-slate-700/50 bg-slate-900/35 p-4 sm:p-5"
    : "rounded-xl border border-slate-200/70 bg-slate-50/40 p-4 sm:p-5";
  const diagCls = presDark
    ? "rounded-lg border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-100"
    : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950";

  const showDiagnostics = !loading && dealsLoaded > 0 && !hasSales;

  return (
    <section className={shellClass} aria-labelledby="inventory-depletion-heading">
      <h3 id="inventory-depletion-heading" className={`mb-1 text-sm font-semibold tracking-tight ${titleCls}`}>
        Выбытие объектов
      </h3>
      <p className={`mb-4 text-[11px] leading-snug ${subCls}`}>
        Исходный ассортимент — из плана KPI (структура продаж); продажи — из JSON сделок (`/api/deals`). Остаток = план −
        продано.
      </p>

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
          <div className={diagCls}>
            <div>Deals feed: подключён</div>
            <div>Deals loaded: {dealsFeed.rows.length}</div>
            <div>После фильтра объекта: 0</div>
          </div>
        </div>
      ) : showDiagnostics ? (
        <div className="space-y-4">
          <div className={diagCls}>
            <div className="font-semibold">Диагностика выбытия (временно)</div>
            <div>Deals loaded: {bundle.debug.dealsLoaded}</div>
            <div>Matched sales: {bundle.debug.matchedSales}</div>
            <div>Без месяца: {bundle.debug.rejectedNoMonth}</div>
            <div>Отклонено (статус): {bundle.debug.rejectedNegative}</div>
            <div>Вне сегментов: {bundle.debug.rejectedSegment}</div>
            <div>Квартиры без комнатности: {bundle.debug.apartmentsWithoutRoomType}</div>
            <div>План KPI загружен: {bundle.hasPlan ? "да" : "нет"}</div>
            <div className="mt-1">dealType: {bundle.debug.uniqueDealTypes.join(", ") || "—"}</div>
            <div>status (sample): {bundle.debug.uniqueStatusLabels.join(" · ") || "—"}</div>
            <div>typeLabel (sample): {bundle.debug.uniqueTypeLabels.join(" · ") || "—"}</div>
          </div>
          <InventoryDepletionDonutGrid donuts={bundle.donuts} presDark={presDark} />
        </div>
      ) : !hasSales ? (
        <p className={`py-10 text-center text-sm ${subCls}`}>Нет данных по продажам</p>
      ) : (
        <div className="flex flex-col gap-5">
          <InventoryDepletionDonutGrid donuts={bundle.donuts} presDark={presDark} />

          <div className={innerCardCls}>
            <h4 className={`mb-1 text-sm font-semibold tracking-tight ${titleCls}`}>Динамика выбытия объектов</h4>
            <p className={`mb-4 text-[11px] ${subCls}`}>
              Остаток ассортимента по месяцам (ось Y — штуки, снижение по мере продаж).
            </p>
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
    </section>
  );
}
