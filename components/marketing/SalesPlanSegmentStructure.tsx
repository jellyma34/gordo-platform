"use client";

import { Building2, Car, Package, ShoppingBag, type LucideIcon } from "lucide-react";
import { useMemo } from "react";

import { groupDealsBySegment, type DealSegmentKey, type NormalizedDealRow } from "@/components/marketing/DealsSection";
import { useMarketingPresentationLight, useMarketingPresVisual } from "@/components/marketing/marketingPresentationLightContext";
import type { MarketingDealsJsonFeed } from "@/components/marketing/useMarketingDealsJson";
import { marketingMockData } from "@/lib/marketingMockData";
import { compactRub, numFmt, rubFmt } from "@/lib/salesPlanChartFormat";

const shareFmt = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });

const SEGMENT_ORDER: DealSegmentKey[] = ["apartment", "parking", "storage", "commercial"];

const SEGMENT_TITLES: Record<DealSegmentKey, string> = {
  apartment: "Квартиры",
  parking: "Машино-места",
  storage: "Кладовые",
  commercial: "Коммерция",
};

const SEGMENT_ICONS: Record<DealSegmentKey, LucideIcon> = {
  apartment: Building2,
  parking: Car,
  storage: Package,
  commercial: ShoppingBag,
};

const SEGMENT_ICON_CLASS: Record<DealSegmentKey, string> = {
  apartment: "text-indigo-500",
  parking: "text-purple-500",
  storage: "text-cyan-500",
  commercial: "text-orange-500",
};

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
  label: string;
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
    label: "text-indigo-300/90",
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
    label: "text-violet-300/90",
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
    label: "text-slate-400",
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
    label: "text-orange-300/90",
    value: "text-orange-50",
    tertiary: "text-slate-500/85",
  },
};

const SEGMENT_VISUAL_WORK: Record<DealSegmentKey, SegmentVisual> = {
  apartment: {
    card: "bg-gradient-to-br from-indigo-100/85 via-white to-indigo-50/70",
    glow: "shadow-[0_12px_30px_rgba(99,102,241,0.18)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(99,102,241,0.10)]",
    hoverGlow: "hover:shadow-[0_18px_38px_rgba(99,102,241,0.24)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(129,140,248,0.24), transparent 55%)",
    sheen: "linear-gradient(125deg, rgba(129,140,248,0.18) 0%, transparent 50%, rgba(255,255,255,0.5) 100%)",
    barFill: "rgba(79, 70, 229, 0.88)",
    label: "text-indigo-700/90",
    value: "text-indigo-950",
    tertiary: "text-slate-500",
  },
  parking: {
    card: "bg-gradient-to-br from-violet-100/85 via-white to-violet-50/70",
    glow: "shadow-[0_12px_30px_rgba(139,92,246,0.16)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(167,139,250,0.09)]",
    hoverGlow: "hover:shadow-[0_18px_38px_rgba(139,92,246,0.22)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(167,139,250,0.22), transparent 55%)",
    sheen: "linear-gradient(125deg, rgba(167,139,250,0.16) 0%, transparent 50%, rgba(255,255,255,0.45) 100%)",
    barFill: "rgba(124, 58, 237, 0.82)",
    label: "text-violet-800/90",
    value: "text-violet-950",
    tertiary: "text-slate-500",
  },
  storage: {
    card: "bg-gradient-to-br from-slate-100/90 via-white to-cyan-50/65",
    glow: "shadow-[0_12px_30px_rgba(14,116,144,0.12)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(34,211,238,0.07)]",
    hoverGlow: "hover:shadow-[0_18px_38px_rgba(14,116,144,0.18)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(34,211,238,0.12), transparent 55%)",
    sheen: "linear-gradient(125deg, rgba(148,163,184,0.12) 0%, transparent 50%, rgba(236,254,255,0.6) 100%)",
    barFill: "rgba(8, 145, 178, 0.65)",
    label: "text-slate-600",
    value: "text-slate-900",
    tertiary: "text-slate-500",
  },
  commercial: {
    card: "bg-gradient-to-br from-orange-100/85 via-white to-amber-50/70",
    glow: "shadow-[0_12px_30px_rgba(234,88,12,0.16)]",
    insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(251,146,60,0.10)]",
    hoverGlow: "hover:shadow-[0_18px_38px_rgba(234,88,12,0.22)]",
    radial: "radial-gradient(circle at 18% 15%, rgba(251,146,60,0.22), transparent 55%)",
    sheen: "linear-gradient(125deg, rgba(251,146,60,0.16) 0%, transparent 48%, rgba(254,215,170,0.5) 100%)",
    barFill: "rgba(234, 88, 12, 0.88)",
    label: "text-orange-800/90",
    value: "text-orange-950",
    tertiary: "text-slate-500",
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
};

export function SalesPlanSegmentStructure({ presentation, objectId, dealsFeed }: Props) {
  const mplPremium = useMarketingPresentationLight();
  const presDark = useMarketingPresVisual(presentation) === "presDark";
  const segmentCardRadius = mplPremium && presentation && !presDark ? "rounded-[18px]" : "rounded-xl";

  const filteredRows = useMemo(
    () => filterNormalizedDealsForMarketingObject(dealsFeed.rows, objectId),
    [dealsFeed.rows, objectId],
  );

  const loadError = dealsFeed.error;
  const loadingDeals = dealsFeed.loading && dealsFeed.rows.length === 0;

  const cards = useMemo(() => {
    const totalSum = filteredRows.reduce((s, r) => s + r.sumRub, 0);
    const grouped = groupDealsBySegment(filteredRows);
    const out: Array<{
      key: DealSegmentKey;
      title: string;
      count: number;
      sum: number;
      avg: number;
      share: number;
    }> = [];
    for (const key of SEGMENT_ORDER) {
      const list = grouped[key];
      if (list.length === 0) continue;
      const sum = list.reduce((s, r) => s + r.sumRub, 0);
      const count = list.length;
      out.push({
        key,
        title: SEGMENT_TITLES[key],
        count,
        sum,
        avg: count > 0 ? sum / count : 0,
        share: totalSum > 0 ? sum / totalSum : 0,
      });
    }
    return out;
  }, [filteredRows]);

  const gridClass = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4";

  if (loadingDeals) {
    return (
      <div className="mb-7">
        <h2 className={`mb-3 text-sm font-semibold ${presDark ? "text-slate-300" : presentation ? "text-mpl-text" : "text-slate-800"}`}>Структура продаж</h2>
        <p className={`text-xs ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>Загрузка сделок…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mb-7">
        <h2 className={`mb-3 text-sm font-semibold ${presDark ? "text-slate-300" : presentation ? "text-mpl-text" : "text-slate-800"}`}>Структура продаж</h2>
        <p className={`text-xs ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>{loadError}</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="mb-7">
        <h2 className={`mb-3 text-sm font-semibold ${presDark ? "text-slate-300" : presentation ? "text-mpl-text" : "text-slate-800"}`}>Структура продаж</h2>
        <p className={`text-xs ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
          Нет сделок по сегментам в текущем срезе (загрузите выгрузку или смените фильтр объекта).
        </p>
      </div>
    );
  }

  return (
    <div className="mb-7">
      <h2 className={`mb-3 text-sm font-semibold ${presDark ? "text-slate-300" : presentation ? "text-mpl-text" : "text-slate-800"}`}>Структура продаж</h2>
      <p className={`mb-4 text-[11px] leading-snug ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
        Распределение продаж по типам недвижимости.
      </p>
      <div className={`sales-structure ${gridClass} items-stretch`}>
        {cards.map((c) => {
          const vs = presDark
            ? SEGMENT_VISUAL_PRESENTATION[c.key]
            : mplPremium && presentation
              ? SEGMENT_VISUAL_PREMIUM[c.key]
              : SEGMENT_VISUAL_WORK[c.key];
          const sharePct = Math.min(100, Math.max(0, c.share * 100));
          const SegmentIcon = SEGMENT_ICONS[c.key];
          const iconWrapCls = presDark
            ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/10 backdrop-blur-[6px] ring-1 ring-white/10"
            : mplPremium && presentation
              ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/70 backdrop-blur-[6px] ring-1 ring-black/[0.05]"
              : presentation
                ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/60 backdrop-blur-[6px] ring-1 ring-black/[0.06]"
                : "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/60 backdrop-blur-[6px] ring-1 ring-slate-200/80";
          return (
            <div key={c.key} className="flex h-full min-h-0 flex-col">
              <div
                className={`sales-structure-card group relative flex h-full min-h-0 flex-1 flex-col overflow-hidden ${segmentCardRadius} ${vs.card} ${vs.glow} ${vs.insetGlow} ${vs.hoverGlow} transition-[transform,box-shadow] duration-200 ease-out will-change-transform hover:z-[1]`}
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
                <div className="relative flex min-h-0 flex-1 flex-col p-3 sm:p-3.5">
                  <div className="mb-1 flex min-w-0 items-center gap-2">
                    <div className={iconWrapCls} aria-hidden>
                      <SegmentIcon className={`h-4 w-4 shrink-0 ${SEGMENT_ICON_CLASS[c.key]}`} strokeWidth={2} />
                    </div>
                    <span className={`min-w-0 text-[11px] uppercase tracking-wide ${vs.label}`}>{c.title}</span>
                  </div>
                  <div className={`mt-1 text-2xl font-medium leading-none tabular-nums sm:text-[30px] ${vs.value}`}>
                    <span className="tabular-nums">{numFmt.format(c.count)}</span>
                    <span className="opacity-70"> шт</span>
                    <span className="inline-block px-0.5 opacity-45 select-none" aria-hidden>
                      {" · "}
                    </span>
                    <span className="tabular-nums">{compactRub(c.sum)}</span>
                  </div>
                  <div className="mt-1.5 tabular-nums leading-snug">
                    <div
                      className={`text-[12px] leading-tight ${presDark ? "text-slate-300" : "text-[#6B7280]"}`}
                    >
                      Средний чек
                    </div>
                    <div
                      className={`mt-0.5 text-[14px] font-medium leading-tight ${presDark ? "text-slate-50" : "text-[#111827]"}`}
                    >
                      {rubFmt.format(c.avg)}
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide ${vs.tertiary}`}>Доля выручки</span>
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
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
