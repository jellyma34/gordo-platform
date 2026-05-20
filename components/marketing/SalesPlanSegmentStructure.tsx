"use client";

import { useMemo } from "react";

import {
  groupDealsBySegment,
  type DealSegmentKey,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";
import { MarketingDealSegmentHeader } from "@/components/marketing/MarketingDealSegmentHeader";
import { useMarketingPresentationLight, useMarketingPresVisual } from "@/components/marketing/marketingPresentationLightContext";
import type { MarketingDealsJsonFeed } from "@/components/marketing/useMarketingDealsJson";
import {
  APARTMENTS_PRICE_COLUMN_WARNING,
  apartmentRevenueShareFromCsvPool,
  sumApartmentsCsvTotalRevenue,
} from "@/lib/apartmentsCsvMetrics";
import type { MarketingParkingCsvStoredV1 } from "@/lib/marketingParkingCsv";
import type { MarketingStoragesCsvStoredV1 } from "@/lib/marketingStoragesCsv";
import {
  parkingRevenueShareFromCsvPool,
  sumParkingCsvTotalRevenue,
} from "@/lib/parkingCsvMetrics";
import {
  storageRevenueShareFromCsvPool,
  sumStoragesCsvTotalRevenue,
} from "@/lib/storagesCsvMetrics";
import type { MarketingApartmentsCsvStoredV1 } from "@/lib/marketingApartmentsCsv";
import { marketingMockData } from "@/lib/marketingMockData";
import { compactRub, formatAvgPricePerM2Rub, numFmt, rubFmt } from "@/lib/salesPlanChartFormat";

const shareFmt = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });

const SEGMENT_ORDER: DealSegmentKey[] = ["apartment", "parking", "storage", "commercial", "other"];

/** Одна строка на lg+, равные доли на всю ширину дашборда (как блоки графиков ниже). */
function segmentKpiGridLgClass(cardCount: number): string {
  if (cardCount <= 1) return "lg:grid-cols-1";
  if (cardCount === 2) return "lg:grid-cols-2";
  if (cardCount === 3) return "lg:grid-cols-3";
  if (cardCount === 4) return "lg:grid-cols-[repeat(4,minmax(0,1fr))]";
  return "lg:grid-cols-[repeat(5,minmax(0,1fr))]";
}

/**
 * Визуал сегментов = та же база, что KPI (SalesPlanKpiDashboard): тройной градиент,
 * shadow 14px/36px, inset, radial сверху-слева; без жёсткой рамки — акцент через свечение.
 */
type SegmentVisual = {
  card: string;
  glow: string;
  insetGlow: string;
  hoverGlow: string;
  radial: string;
  /** Мягкий переливающийся слой (linear-gradient + .segment-card-gradient-sheen) */
  sheen: string;
  /** Заливка микро-бара доли выручки */
  barFill: string;
  value: string;
  tertiary: string;
};

const SEGMENT_VISUAL_PRESENTATION: Record<DealSegmentKey, SegmentVisual> = {
  apartment: {
    card: "bg-gradient-to-br from-indigo-900/42 via-slate-900/38 to-slate-900/60",
    glow: "shadow-[0_14px_36px_rgba(99,102,241,0.26)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(99,102,241,0.15)]",
    hoverGlow: "hover:shadow-[0_22px_44px_rgba(99,102,241,0.38)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(129,140,248,0.28), transparent 52%)",
    sheen: "linear-gradient(125deg, rgba(129,140,248,0.22) 0%, transparent 42%, rgba(255,255,255,0.04) 100%)",
    barFill: "rgba(129, 140, 248, 0.92)",
    value: "text-indigo-50",
    tertiary: "text-slate-500/85",
  },
  parking: {
    card: "bg-gradient-to-br from-violet-900/40 via-slate-900/38 to-slate-900/60",
    glow: "shadow-[0_14px_36px_rgba(139,92,246,0.24)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(167,139,250,0.14)]",
    hoverGlow: "hover:shadow-[0_22px_44px_rgba(139,92,246,0.36)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(167,139,250,0.26), transparent 52%)",
    sheen: "linear-gradient(125deg, rgba(167,139,250,0.2) 0%, transparent 42%, rgba(255,255,255,0.035) 100%)",
    barFill: "rgba(167, 139, 250, 0.9)",
    value: "text-violet-50",
    tertiary: "text-slate-500/85",
  },
  storage: {
    card: "bg-gradient-to-br from-slate-800/48 via-slate-900/38 to-slate-900/60",
    glow: "shadow-[0_14px_36px_rgba(34,211,238,0.16)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(103,232,249,0.08)]",
    hoverGlow: "hover:shadow-[0_22px_44px_rgba(34,211,238,0.24)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(103,232,249,0.14), transparent 52%)",
    sheen: "linear-gradient(125deg, rgba(148,163,184,0.14) 0%, transparent 45%, rgba(103,232,249,0.08) 100%)",
    barFill: "rgba(103, 232, 249, 0.55)",
    value: "text-slate-100",
    tertiary: "text-slate-500/80",
  },
  commercial: {
    card: "bg-gradient-to-br from-orange-900/40 via-slate-900/38 to-slate-900/60",
    glow: "shadow-[0_14px_36px_rgba(249,115,22,0.24)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(251,146,60,0.12)]",
    hoverGlow: "hover:shadow-[0_22px_44px_rgba(249,115,22,0.36)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(251,146,60,0.26), transparent 52%)",
    sheen: "linear-gradient(125deg, rgba(251,146,60,0.22) 0%, transparent 40%, rgba(248,113,113,0.08) 100%)",
    barFill: "rgba(251, 146, 60, 0.95)",
    value: "text-orange-50",
    tertiary: "text-slate-500/85",
  },
  other: {
    card: "bg-gradient-to-br from-slate-800/52 via-slate-900/38 to-slate-900/62",
    glow: "shadow-[0_14px_36px_rgba(148,163,184,0.12)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_0_32px_rgba(100,116,139,0.1)]",
    hoverGlow: "hover:shadow-[0_22px_44px_rgba(148,163,184,0.2)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(148,163,184,0.12), transparent 52%)",
    sheen: "linear-gradient(125deg, rgba(148,163,184,0.16) 0%, transparent 45%, rgba(255,255,255,0.03) 100%)",
    barFill: "rgba(148, 163, 184, 0.75)",
    value: "text-slate-50",
    tertiary: "text-slate-500/80",
  },
};

const SEGMENT_VISUAL_WORK: Record<DealSegmentKey, SegmentVisual> = {
  apartment: {
    card: "bg-gradient-to-br from-white via-white to-indigo-50/40",
    glow: "shadow-[0_4px_22px_rgba(15,23,42,0.045)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]",
    hoverGlow: "hover:shadow-[0_8px_26px_rgba(99,102,241,0.12)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(129,140,248,0.12), transparent 58%)",
    sheen: "linear-gradient(125deg, rgba(129,140,248,0.10) 0%, transparent 50%, rgba(255,255,255,0.45) 100%)",
    barFill: "rgba(79, 70, 229, 0.88)",
    value: "text-indigo-950",
    tertiary: "text-slate-400",
  },
  parking: {
    card: "bg-gradient-to-br from-white via-white to-violet-50/38",
    glow: "shadow-[0_4px_22px_rgba(15,23,42,0.045)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]",
    hoverGlow: "hover:shadow-[0_8px_26px_rgba(139,92,246,0.11)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(167,139,250,0.11), transparent 58%)",
    sheen: "linear-gradient(125deg, rgba(167,139,250,0.09) 0%, transparent 50%, rgba(255,255,255,0.4) 100%)",
    barFill: "rgba(124, 58, 237, 0.82)",
    value: "text-violet-950",
    tertiary: "text-slate-400",
  },
  storage: {
    card: "bg-gradient-to-br from-white via-white to-cyan-50/35",
    glow: "shadow-[0_4px_22px_rgba(15,23,42,0.04)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]",
    hoverGlow: "hover:shadow-[0_8px_26px_rgba(14,116,144,0.09)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(34,211,238,0.08), transparent 58%)",
    sheen: "linear-gradient(125deg, rgba(148,163,184,0.08) 0%, transparent 50%, rgba(236,254,255,0.45) 100%)",
    barFill: "rgba(8, 145, 178, 0.65)",
    value: "text-slate-900",
    tertiary: "text-slate-400",
  },
  commercial: {
    card: "bg-gradient-to-br from-white via-white to-amber-50/38",
    glow: "shadow-[0_4px_22px_rgba(15,23,42,0.045)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]",
    hoverGlow: "hover:shadow-[0_8px_26px_rgba(234,88,12,0.10)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(251,146,60,0.10), transparent 58%)",
    sheen: "linear-gradient(125deg, rgba(251,146,60,0.09) 0%, transparent 48%, rgba(254,215,170,0.35) 100%)",
    barFill: "rgba(234, 88, 12, 0.88)",
    value: "text-orange-950",
    tertiary: "text-slate-400",
  },
  other: {
    card: "bg-gradient-to-br from-white via-white to-slate-50/70",
    glow: "shadow-[0_4px_22px_rgba(15,23,42,0.04)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]",
    hoverGlow: "hover:shadow-[0_8px_26px_rgba(71,85,105,0.08)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(148,163,184,0.10), transparent 58%)",
    sheen: "linear-gradient(125deg, rgba(148,163,184,0.07) 0%, transparent 52%, rgba(248,250,252,0.55) 100%)",
    barFill: "rgba(100, 116, 139, 0.55)",
    value: "text-slate-900",
    tertiary: "text-slate-400",
  },
};

/** Светлая презентация маркетинга: мягкая «стеклянная» плитка без тяжёлых теней сегментов. */
const SEGMENT_VISUAL_PREMIUM: Record<DealSegmentKey, SegmentVisual> = {
  apartment: {
    ...SEGMENT_VISUAL_WORK.apartment,
    card: "border border-black/[0.03] bg-gradient-to-br from-white/90 via-white to-indigo-50/45 shadow-[0_10px_25px_rgba(0,0,0,0.05)]",
    glow: "",
    insetGlow: "",
    hoverGlow:
      "hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(0,0,0,0.07)] transition-[transform,box-shadow] duration-200 ease-out",
  },
  parking: {
    ...SEGMENT_VISUAL_WORK.parking,
    card: "border border-black/[0.03] bg-gradient-to-br from-white/90 via-white to-violet-50/45 shadow-[0_10px_25px_rgba(0,0,0,0.05)]",
    glow: "",
    insetGlow: "",
    hoverGlow:
      "hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(0,0,0,0.07)] transition-[transform,box-shadow] duration-200 ease-out",
  },
  storage: {
    ...SEGMENT_VISUAL_WORK.storage,
    card: "border border-black/[0.03] bg-gradient-to-br from-white/92 via-white to-cyan-50/35 shadow-[0_10px_25px_rgba(0,0,0,0.05)]",
    glow: "",
    insetGlow: "",
    hoverGlow:
      "hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(0,0,0,0.07)] transition-[transform,box-shadow] duration-200 ease-out",
  },
  commercial: {
    ...SEGMENT_VISUAL_WORK.commercial,
    card: "border border-black/[0.03] bg-gradient-to-br from-white/90 via-white to-amber-50/40 shadow-[0_10px_25px_rgba(0,0,0,0.05)]",
    glow: "",
    insetGlow: "",
    hoverGlow:
      "hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(0,0,0,0.07)] transition-[transform,box-shadow] duration-200 ease-out",
  },
  other: {
    ...SEGMENT_VISUAL_WORK.other,
    card: "border border-black/[0.03] bg-gradient-to-br from-white/93 via-white to-slate-50/50 shadow-[0_10px_25px_rgba(0,0,0,0.05)]",
    glow: "",
    insetGlow: "",
    hoverGlow:
      "hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(0,0,0,0.07)] transition-[transform,box-shadow] duration-200 ease-out",
  },
};

/**
 * Сужает строки по выбранному ЖК (мок-фильтры маркетинга). API-сделки матчятся по objectLabel.
 */
export function filterNormalizedDealsForMarketingObject(rows: NormalizedDealRow[], objectId: string): NormalizedDealRow[] {
  if (!objectId || objectId === "all") return rows;
  if (objectId === "gordo-park") {
    return rows.filter((r) => /паркинг/i.test(r.objectLabel));
  }
  if (objectId === "gordo-main") {
    return rows.filter((r) => !/паркинг/i.test(r.objectLabel));
  }
  const opt = marketingMockData.objects.find((o) => o.id === objectId);
  if (!opt || opt.id === "all") return rows;
  const needle = opt.name.slice(0, 12).toLowerCase();
  return rows.filter((r) => r.objectLabel.toLowerCase().includes(needle));
}

type Props = {
  presentation: boolean;
  objectId: string;
  /** Поток сделок с панели (один GET `/api/deals`). */
  dealsFeed: MarketingDealsJsonFeed;
  /** База квартир из CSV (все лоты) — для доли выручки в карточке «Квартиры». */
  apartmentsCsv?: MarketingApartmentsCsvStoredV1 | null;
  /** База машино-мест из CSV — для доли выручки в карточке «Машино-места». */
  parkingCsv?: MarketingParkingCsvStoredV1 | null;
  /** База кладовых из CSV — для доли выручки в карточке «Кладовые». */
  storagesCsv?: MarketingStoragesCsvStoredV1 | null;
  /** План проекта в штуках (CSV исполнения) — «из X шт» в карточке «Коммерция». */
  commercialInventoryUnits?: number | null;
  /** Предупреждение об отсутствии колонки стоимости — только режим редактирования. */
  showApartmentsShareWarning?: boolean;
};

type SegmentStructurePrimaryKpiProps = {
  count: number;
  inventoryTotal: number | null;
  sumRub: number;
  valueClass: string;
  presDark: boolean;
};

/** Единый блок KPI: крупное число + «из X шт», выручка отдельной строкой. */
function SegmentStructurePrimaryKpi({
  count,
  inventoryTotal,
  sumRub,
  valueClass,
  presDark,
}: SegmentStructurePrimaryKpiProps) {
  const mutedCount = presDark ? "text-slate-500" : "text-slate-400";
  return (
    <div className="mt-1 min-w-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className={`text-[30px] font-bold leading-none tabular-nums tracking-tight sm:text-[34px] ${valueClass}`}
        >
          {numFmt.format(count)}
        </span>
        {inventoryTotal != null && inventoryTotal > 0 ? (
          <span
            className={`shrink-0 text-[12px] font-normal leading-none tabular-nums sm:text-[13px] ${mutedCount} opacity-50`}
          >
            из {numFmt.format(inventoryTotal)} шт
          </span>
        ) : (
          <span
            className={`shrink-0 text-[12px] font-normal leading-none sm:text-[13px] ${mutedCount} opacity-50`}
          >
            шт
          </span>
        )}
      </div>
      <div className={`mt-1.5 text-xl font-semibold leading-none tabular-nums sm:text-2xl ${valueClass}`}>
        {compactRub(sumRub)}
      </div>
    </div>
  );
}

function resolveSegmentInventoryTotal(
  key: DealSegmentKey,
  pools: {
    apartments: ReturnType<typeof sumApartmentsCsvTotalRevenue> | null;
    parking: ReturnType<typeof sumParkingCsvTotalRevenue> | null;
    storages: ReturnType<typeof sumStoragesCsvTotalRevenue> | null;
    commercialInventoryUnits: number | null | undefined;
  },
): number | null {
  if (key === "apartment" && pools.apartments != null && pools.apartments.totalCount > 0) {
    return pools.apartments.totalCount;
  }
  if (key === "parking" && pools.parking != null && pools.parking.totalCount > 0) {
    return pools.parking.totalCount;
  }
  if (key === "storage" && pools.storages != null && pools.storages.totalCount > 0) {
    return pools.storages.totalCount;
  }
  if (key === "commercial" && pools.commercialInventoryUnits != null && pools.commercialInventoryUnits > 0) {
    return pools.commercialInventoryUnits;
  }
  return null;
}

export function SalesPlanSegmentStructure({
  presentation,
  objectId,
  dealsFeed,
  apartmentsCsv = null,
  parkingCsv = null,
  storagesCsv = null,
  commercialInventoryUnits = null,
  showApartmentsShareWarning = false,
}: Props) {
  const mplPremium = useMarketingPresentationLight();
  const presDark = useMarketingPresVisual(presentation) === "presDark";
  const segmentCardRadius = mplPremium && presentation && !presDark ? "rounded-[18px]" : "rounded-xl";

  const filteredRows = useMemo(
    () => filterNormalizedDealsForMarketingObject(dealsFeed.rows, objectId),
    [dealsFeed.rows, objectId],
  );

  const loadError = dealsFeed.error;
  const loadingDeals = dealsFeed.loading && dealsFeed.rows.length === 0;

  const apartmentsRevenuePool = useMemo(() => {
    if (!apartmentsCsv?.headers?.length || !apartmentsCsv.rows?.length) return null;
    return sumApartmentsCsvTotalRevenue(apartmentsCsv.headers, apartmentsCsv.rows);
  }, [apartmentsCsv]);

  const parkingRevenuePool = useMemo(() => {
    if (!parkingCsv?.headers?.length || !parkingCsv.rows?.length) return null;
    return sumParkingCsvTotalRevenue(parkingCsv.headers, parkingCsv.rows);
  }, [parkingCsv]);

  const storagesRevenuePool = useMemo(() => {
    if (!storagesCsv?.headers?.length || !storagesCsv.rows?.length) return null;
    return sumStoragesCsvTotalRevenue(storagesCsv.headers, storagesCsv.rows);
  }, [storagesCsv]);

  const apartmentsShareWarning = useMemo(() => {
    if (!showApartmentsShareWarning || !apartmentsCsv) return null;
    if (apartmentsRevenuePool?.priceColumnIndex != null) return null;
    return APARTMENTS_PRICE_COLUMN_WARNING;
  }, [apartmentsCsv, apartmentsRevenuePool?.priceColumnIndex, showApartmentsShareWarning]);

  const cards = useMemo(() => {
    const totalSum = filteredRows.reduce((s, r) => s + r.sumRub, 0);
    const grouped = groupDealsBySegment(filteredRows);
    const out: Array<{
      key: DealSegmentKey;
      count: number;
      sum: number;
      avg: number;
      share: number;
      soldAreaM2: number;
    }> = [];
    for (const key of SEGMENT_ORDER) {
      const list = grouped[key];
      if (list.length === 0) continue;
      const sum = list.reduce((s, r) => s + r.sumRub, 0);
      const count = list.length;
      const soldAreaM2 = list.reduce((s, r) => {
        const a = r.objectParams.areaTotal;
        return s + (a != null && Number.isFinite(a) && a > 0 ? a : 0);
      }, 0);
      let share = totalSum > 0 ? sum / totalSum : 0;
      if (key === "apartment") {
        const fromCsvPool = apartmentRevenueShareFromCsvPool(sum, apartmentsRevenuePool);
        if (fromCsvPool != null) share = fromCsvPool;
      }
      if (key === "parking") {
        const fromCsvPool = parkingRevenueShareFromCsvPool(sum, parkingRevenuePool, { soldCount: count });
        if (fromCsvPool != null) share = fromCsvPool;
      }
      if (key === "storage") {
        const fromCsvPool = storageRevenueShareFromCsvPool(sum, storagesRevenuePool);
        if (fromCsvPool != null) share = fromCsvPool;
      }
      out.push({
        key,
        count,
        sum,
        avg: count > 0 ? sum / count : 0,
        share,
        soldAreaM2,
      });
    }
    return out;
  }, [filteredRows, apartmentsRevenuePool, parkingRevenuePool, storagesRevenuePool]);

  if (loadingDeals) {
    return (
      <div className="mb-7 w-full min-w-0 max-w-none">
        <h2 className={`mb-3 text-sm font-semibold ${presDark ? "text-slate-300" : presentation ? "text-mpl-text" : "text-slate-800"}`}>Структура продаж</h2>
        <p className={`text-xs ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>Загрузка сделок…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mb-7 w-full min-w-0 max-w-none">
        <h2 className={`mb-3 text-sm font-semibold ${presDark ? "text-slate-300" : presentation ? "text-mpl-text" : "text-slate-800"}`}>Структура продаж</h2>
        <p className={`text-xs ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>{loadError}</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="mb-7 w-full min-w-0 max-w-none">
        <h2 className={`mb-3 text-sm font-semibold ${presDark ? "text-slate-300" : presentation ? "text-mpl-text" : "text-slate-800"}`}>Структура продаж</h2>
        <p className={`text-xs ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
          Нет сделок по сегментам в текущем срезе (загрузите выгрузку или смените фильтр объекта).
        </p>
      </div>
    );
  }

  const gridClass = `sales-structure grid w-full min-w-0 max-w-none grid-cols-1 gap-3 items-stretch sm:grid-cols-2 ${segmentKpiGridLgClass(cards.length)}`;

  return (
    <div className="mb-7 w-full min-w-0 max-w-none">
      <h2 className={`mb-4 text-sm font-semibold ${presDark ? "text-slate-300" : presentation ? "text-mpl-text" : "text-slate-800"}`}>Структура продаж</h2>
      {apartmentsShareWarning ? (
        <p className={`mb-3 text-xs font-medium ${presDark ? "text-amber-300/90" : "text-amber-800"}`}>{apartmentsShareWarning}</p>
      ) : null}
      <div className={gridClass}>
        {cards.map((c) => {
          const vs = presDark
            ? SEGMENT_VISUAL_PRESENTATION[c.key]
            : mplPremium && presentation
              ? SEGMENT_VISUAL_PREMIUM[c.key]
              : SEGMENT_VISUAL_WORK[c.key];
          const sharePct = Math.min(100, Math.max(0, c.share * 100));
          const iconWrapTone = presDark
            ? "dark"
            : mplPremium && presentation
              ? "premium"
              : presentation
                ? "presentation"
                : "work";
          const labelTone = presDark ? "dark" : "work";
          return (
            <div key={c.key} className="flex h-full min-h-0 min-w-0 flex-col">
              <div
                className={`sales-structure-card group relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${segmentCardRadius} ${vs.card} ${vs.glow} ${vs.insetGlow} ${vs.hoverGlow} transition-[transform,box-shadow] duration-200 ease-out will-change-transform hover:z-[1]`}
              >
                <div className="pointer-events-none absolute inset-0" style={{ background: vs.radial }} aria-hidden />
                <div
                  className={`pointer-events-none absolute inset-0 ${segmentCardRadius} segment-card-gradient-sheen ${
                    presentation ? "opacity-[0.38] mix-blend-soft-light" : "opacity-[0.22]"
                  }`}
                  style={{ backgroundImage: vs.sheen }}
                  aria-hidden
                />
                <div
                  className={`pointer-events-none absolute inset-0 ${segmentCardRadius} mix-blend-overlay ${
                    presentation ? "opacity-[0.14]" : "opacity-[0.06]"
                  }`}
                  style={{
                    backgroundImage: `repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0px, transparent 1px, transparent 5px)`,
                  }}
                  aria-hidden
                />
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col px-2.5 py-2.5 sm:px-3 sm:py-3">
                  <MarketingDealSegmentHeader
                    segment={c.key}
                    iconWrapTone={iconWrapTone}
                    labelTone={labelTone}
                    className="mb-1"
                  />
                  <SegmentStructurePrimaryKpi
                    count={c.count}
                    inventoryTotal={resolveSegmentInventoryTotal(c.key, {
                      apartments: apartmentsRevenuePool,
                      parking: parkingRevenuePool,
                      storages: storagesRevenuePool,
                      commercialInventoryUnits,
                    })}
                    sumRub={c.sum}
                    valueClass={vs.value}
                    presDark={presDark}
                  />
                  <div className="mt-1.5 tabular-nums leading-snug">
                    <div className={`text-[12px] leading-tight ${presDark ? "text-slate-500" : "text-slate-400"}`}>Средний чек</div>
                    <div
                      className={`mt-0.5 text-[14px] font-medium leading-tight ${presDark ? "text-slate-50" : "text-[#111827]"}`}
                    >
                      {rubFmt.format(c.avg)}
                    </div>
                  </div>
                  <div className="mt-1.5 tabular-nums leading-snug">
                    <div className={`text-[12px] leading-tight ${presDark ? "text-slate-500" : "text-slate-400"}`}>Средняя стоимость м²</div>
                    <div
                      className={`mt-0.5 text-[14px] font-medium leading-tight whitespace-nowrap tabular-nums ${presDark ? "text-slate-50" : "text-[#111827]"}`}
                    >
                      {c.soldAreaM2 > 0 ? formatAvgPricePerM2Rub(c.sum / c.soldAreaM2) : "—"}
                    </div>
                  </div>
                  {!presentation ? (
                  <div className="mt-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-[10px] font-medium tracking-normal ${vs.tertiary}`}>Доля выручки</span>
                      <span className={`text-[11px] tabular-nums leading-none ${vs.tertiary}`}>{shareFmt.format(c.share)}</span>
                    </div>
                    <div
                      className={`mt-1.5 h-1 w-full overflow-hidden rounded-full ${
                        presentation ? "bg-white/[0.08] ring-1 ring-white/[0.06]" : "bg-slate-200/90 ring-1 ring-slate-300/50"
                      }`}
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                          presentation ? "shadow-[0_0_12px_rgba(255,255,255,0.12)]" : ""
                        }`}
                        style={{
                          width: `${sharePct}%`,
                          backgroundColor: vs.barFill,
                        }}
                      />
                    </div>
                  </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
