"use client";

import { LayoutDashboard } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ChangeEvent, type RefObject } from "react";

import {
  groupDealsBySegment,
  type DealSegmentKey,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";
import { MarketingDealSegmentHeader } from "@/components/marketing/MarketingDealSegmentHeader";
import {
  MARKETING_DEAL_SEGMENT_HEADER_TITLE_BASE,
  MARKETING_DEAL_SEGMENT_ICON_WRAP_CLASS,
  type MarketingDealSegmentIconWrapTone,
} from "@/lib/marketingDealSegmentIdentity";
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
import type { DealsAnalyticsSegmentKey } from "@/lib/buildDealsSegmentMonthAnalytics";
import {
  revenueFactCsvDocIsValid,
  type MarketingRevenueFactCsvStoredV1,
} from "@/lib/marketingRevenueFactCsv";
import { resolveFactRevenueBySegmentForStructure } from "@/lib/resolveFactRevenueForSalesStructure";
import { uploadMarketingRevenueFactCsvFile } from "@/lib/marketingRevenueFactCsvUpload";
import { compactRub, formatAvgPricePerM2Rub, formatFactReceiptRub, numFmt, rubFmt } from "@/lib/salesPlanChartFormat";

const shareFmt = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });

const SEGMENT_ORDER: DealSegmentKey[] = ["apartment", "parking", "storage", "commercial", "other"];

/** Сегменты, входящие в карточку «По проекту» (сумма KPI по типам объектов). */
const PROJECT_STRUCTURE_SEGMENTS: readonly DealSegmentKey[] = ["apartment", "parking", "storage", "commercial"];

type SalesStructureCardRow = {
  isProject?: boolean;
  key: DealSegmentKey;
  count: number;
  sum: number;
  factRevenue: number;
  avg: number;
  share: number;
  soldAreaM2: number;
  inventoryTotal: number | null;
};

/** Визуал карточки «По проекту» — тот же каркас, чуть насыщеннее фон / обводка. */
const PROJECT_VISUAL_PRESENTATION: SegmentVisual = {
  card: "bg-gradient-to-br from-indigo-800/52 via-slate-900/40 to-slate-900/58 border border-indigo-400/30",
  glow: "shadow-[0_16px_40px_rgba(99,102,241,0.32)]",
  insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_40px_rgba(99,102,241,0.18)]",
  hoverGlow: "hover:shadow-[0_24px_48px_rgba(99,102,241,0.42)]",
  radial: "radial-gradient(circle at 18% 15%, rgba(129,140,248,0.32), transparent 52%)",
  sheen: "linear-gradient(125deg, rgba(129,140,248,0.26) 0%, transparent 40%, rgba(255,255,255,0.05) 100%)",
  barFill: "rgba(129, 140, 248, 0.92)",
  value: "text-indigo-50",
  tertiary: "text-slate-500/85",
};

const PROJECT_VISUAL_WORK: SegmentVisual = {
  card: "bg-gradient-to-br from-white via-indigo-50/70 to-slate-100/80 border border-indigo-200/80 ring-1 ring-indigo-100/90",
  glow: "shadow-[0_6px_28px_rgba(99,102,241,0.14)]",
  insetGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.98)]",
  hoverGlow: "hover:shadow-[0_10px_32px_rgba(99,102,241,0.18)]",
  radial: "radial-gradient(circle at 18% 15%, rgba(99,102,241,0.16), transparent 58%)",
  sheen: "linear-gradient(125deg, rgba(99,102,241,0.14) 0%, transparent 48%, rgba(255,255,255,0.5) 100%)",
  barFill: "rgba(79, 70, 229, 0.88)",
  value: "text-indigo-950",
  tertiary: "text-slate-400",
};

const PROJECT_VISUAL_PREMIUM: SegmentVisual = {
  ...PROJECT_VISUAL_WORK,
  card: "border border-indigo-200/70 bg-gradient-to-br from-white/92 via-indigo-50/55 to-slate-50/65 shadow-[0_12px_28px_rgba(99,102,241,0.1)] ring-1 ring-indigo-100/80",
  glow: "",
  insetGlow: "",
  hoverGlow:
    "hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(99,102,241,0.14)] transition-[transform,box-shadow] duration-200 ease-out",
};

/** Одна строка на lg+, равные доли на всю ширину дашборда (как блоки графиков ниже). */
function segmentKpiGridLgClass(cardCount: number): string {
  if (cardCount <= 1) return "lg:grid-cols-1";
  if (cardCount === 2) return "lg:grid-cols-2";
  if (cardCount === 3) return "lg:grid-cols-3";
  if (cardCount === 4) return "lg:grid-cols-[repeat(4,minmax(0,1fr))]";
  if (cardCount === 5) return "lg:grid-cols-[repeat(5,minmax(0,1fr))]";
  return "lg:grid-cols-[repeat(6,minmax(0,1fr))]";
}

function aggregateProjectStructureMetrics(segments: readonly SalesStructureCardRow[]): SalesStructureCardRow {
  const count = segments.reduce((s, m) => s + m.count, 0);
  const sum = segments.reduce((s, m) => s + m.sum, 0);
  const factRevenue = segments.reduce((s, m) => s + m.factRevenue, 0);
  const soldAreaM2 = segments.reduce((s, m) => s + m.soldAreaM2, 0);
  const inventorySum = segments.reduce((s, m) => s + (m.inventoryTotal ?? 0), 0);
  return {
    isProject: true,
    key: "apartment",
    count,
    sum,
    factRevenue,
    avg: count > 0 ? sum / count : 0,
    share: 1,
    soldAreaM2,
    inventoryTotal: inventorySum > 0 ? inventorySum : null,
  };
}

function ProjectStructureCardHeader({
  iconWrapTone,
  labelTone,
  className = "",
  titleClassName,
}: {
  iconWrapTone: MarketingDealSegmentIconWrapTone;
  labelTone: "work" | "dark";
  className?: string;
  titleClassName?: string;
}) {
  const wrap = MARKETING_DEAL_SEGMENT_ICON_WRAP_CLASS[iconWrapTone];
  const labelClass =
    titleClassName ??
    `${MARKETING_DEAL_SEGMENT_HEADER_TITLE_BASE} ${
      labelTone === "dark" ? "text-indigo-300/95" : "text-indigo-800/95"
    }`;
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`.trim()}>
      <div className={wrap} aria-hidden>
        <LayoutDashboard className="h-5 w-5 shrink-0 text-indigo-500" strokeWidth={2} />
      </div>
      <span className={labelClass}>По проекту</span>
    </div>
  );
}

type ProjectStructureSummaryHeroProps = {
  card: SalesStructureCardRow;
  presentation: boolean;
  presDark: boolean;
  mplPremium: boolean;
  segmentCardRadius: string;
  iconWrapTone: MarketingDealSegmentIconWrapTone;
  labelTone: "work" | "dark";
};

/** Full-width summary-блок «По проекту» над рядом сегментных карточек. */
function ProjectStructureSummaryHero({
  card,
  presentation,
  presDark,
  mplPremium,
  segmentCardRadius,
  iconWrapTone,
  labelTone,
}: ProjectStructureSummaryHeroProps) {
  const vs = presDark
    ? PROJECT_VISUAL_PRESENTATION
    : mplPremium && presentation
      ? PROJECT_VISUAL_PREMIUM
      : PROJECT_VISUAL_WORK;
  const muted = presDark ? "text-slate-500" : "text-slate-400";
  const metricValue = presDark ? "text-slate-50" : "text-[#111827]";
  const heroTitle = presDark
    ? "text-[13px] font-semibold tracking-tight text-indigo-200/95"
    : "text-[13px] font-semibold tracking-tight text-indigo-800/95";
  const avgPriceM2 = card.soldAreaM2 > 0 ? formatAvgPricePerM2Rub(card.sum / card.soldAreaM2) : "—";

  const metric = (label: string, value: string, valueClassName?: string) => (
    <div className="min-w-0 tabular-nums">
      <div className={`text-[11px] font-medium leading-tight sm:text-[12px] ${muted}`}>{label}</div>
      <div
        className={`mt-1 text-[15px] font-semibold leading-tight sm:text-base ${valueClassName ?? metricValue}`}
      >
        {value}
      </div>
    </div>
  );

  return (
    <div className="sales-structure-project-hero w-full min-w-0 max-w-none">
      <div
        className={`sales-structure-card group relative w-full overflow-hidden ${segmentCardRadius} ${vs.card} ${vs.glow} ${vs.insetGlow} ${vs.hoverGlow} transition-[transform,box-shadow] duration-200 ease-out`}
      >
        <div className="pointer-events-none absolute inset-0" style={{ background: vs.radial }} aria-hidden />
        <div
          className={`pointer-events-none absolute inset-0 ${segmentCardRadius} segment-card-gradient-sheen ${
            presentation ? "opacity-[0.42] mix-blend-soft-light" : "opacity-[0.26]"
          }`}
          style={{ backgroundImage: vs.sheen }}
          aria-hidden
        />
        <div
          className={`pointer-events-none absolute inset-0 ${segmentCardRadius} mix-blend-overlay ${
            presentation ? "opacity-[0.16]" : "opacity-[0.07]"
          }`}
          style={{
            backgroundImage: `repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0px, transparent 1px, transparent 5px)`,
          }}
          aria-hidden
        />
        <div className="relative px-4 py-4 sm:px-5 sm:py-4 md:px-6 md:py-4">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between md:gap-8 lg:gap-10">
            <div className="min-w-0 flex-1">
              <ProjectStructureCardHeader
                iconWrapTone={iconWrapTone}
                labelTone={labelTone}
                titleClassName={heroTitle}
                className="mb-3 sm:mb-3.5"
              />
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span
                  className={`text-[28px] font-bold leading-none tabular-nums tracking-tight sm:text-[32px] ${vs.value}`}
                >
                  {numFmt.format(card.count)}
                </span>
                {card.inventoryTotal != null && card.inventoryTotal > 0 ? (
                  <span className={`shrink-0 text-[13px] font-normal leading-none tabular-nums sm:text-sm ${muted} opacity-60`}>
                    из {numFmt.format(card.inventoryTotal)} шт
                  </span>
                ) : (
                  <span className={`shrink-0 text-[13px] font-normal leading-none sm:text-sm ${muted} opacity-60`}>шт</span>
                )}
              </div>
              <div className={`mt-2 text-xl font-semibold leading-none tabular-nums sm:mt-2.5 sm:text-2xl ${vs.value}`}>
                {compactRub(card.sum)}
              </div>
            </div>
            <div
              className={`grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3 md:max-w-[min(100%,26rem)] md:grid-cols-1 md:gap-3.5 md:border-l md:pl-6 lg:max-w-[22rem] lg:pl-8 ${
                presDark ? "md:border-white/10" : "md:border-indigo-200/55"
              }`}
            >
              {metric("Факт поступлений", formatFactReceiptRub(card.factRevenue))}
              {metric("Средний чек", rubFmt.format(card.avg))}
              {metric("Средняя стоимость м²", avgPriceM2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
  /** CSV факта поступлений (сервер), приоритет над JSON сделок для KPI «Факт поступлений». */
  revenueFactCsv?: MarketingRevenueFactCsvStoredV1 | null;
  onRevenueFactCsvDocChange?: (doc: MarketingRevenueFactCsvStoredV1 | null) => void;
  /** Проект для POST `/api/projects/.../marketing/storage` (edit mode). */
  csvUploadProjectId?: string;
  csvUploadedBy?: string;
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

function SalesStructureBlockHeader({
  titleClass,
  presentation,
  presDark,
  revenueFactCsv,
  revenueFactUploadError,
  revenueFactUploading,
  onUploadClick,
  csvInputRef,
  onCsvSelected,
}: {
  titleClass: string;
  presentation: boolean;
  presDark: boolean;
  revenueFactCsv: MarketingRevenueFactCsvStoredV1 | null | undefined;
  revenueFactUploadError: string | null;
  revenueFactUploading: boolean;
  onUploadClick: () => void;
  csvInputRef: RefObject<HTMLInputElement | null>;
  onCsvSelected: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const csvLoaded = revenueFactCsvDocIsValid(revenueFactCsv);
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <h2 className={`text-sm font-semibold ${titleClass}`}>Структура продаж</h2>
      {!presentation ? (
        <div className="flex min-w-0 flex-col items-end gap-1">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onCsvSelected}
          />
          <button
            type="button"
            onClick={onUploadClick}
            disabled={revenueFactUploading}
            className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              presDark
                ? "border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700/90 disabled:opacity-50"
                : "border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            }`}
          >
            {revenueFactUploading ? "Загрузка…" : "Подгрузить CSV"}
          </button>
          {csvLoaded ? (
            <span className={`text-[10px] font-medium ${presDark ? "text-emerald-300/90" : "text-emerald-700"}`}>
              Файл поступлений загружен
            </span>
          ) : null}
          {revenueFactUploadError ? (
            <span className={`max-w-[220px] text-right text-[10px] font-medium ${presDark ? "text-rose-300" : "text-rose-600"}`}>
              {revenueFactUploadError}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RevenueFactCsvDiagnostics({
  doc,
  presDark,
}: {
  doc: MarketingRevenueFactCsvStoredV1;
  presDark: boolean;
}) {
  const s = doc.summary;
  const box = presDark
    ? "rounded-lg border border-slate-600/50 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-300"
    : "rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-[11px] text-slate-700";
  return (
    <div className={`mb-3 space-y-0.5 tabular-nums ${box}`}>
      <div>
        CSV TYPE: <span className="font-mono font-semibold">{doc.csvType ?? "fact_revenue_csv"}</span>
        {doc.encoding ? (
          <>
            {" "}
            · ENCODING: <span className="font-mono font-semibold">{doc.encoding}</span>
          </>
        ) : null}
      </div>
      <div>
        FACT SOURCE: <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">CSV</span>
      </div>
      <div>Найдено строк: {numFmt.format(doc.rows.length)}</div>
      <div>Квартиры: {compactRub(s.bySegment.apartment)}</div>
      <div>Парковки: {compactRub(s.bySegment.parking)}</div>
      <div>Кладовые: {compactRub(s.bySegment.storage)}</div>
      <div>Коммерция: {compactRub(s.bySegment.commercial)}</div>
      {doc.warnings?.length ? (
        <div className={presDark ? "text-amber-300/90" : "text-amber-800"}>{doc.warnings.join(" ")}</div>
      ) : null}
    </div>
  );
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
  revenueFactCsv = null,
  onRevenueFactCsvDocChange,
  csvUploadProjectId,
  csvUploadedBy = "—",
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

  const revenueFactCsvInputRef = useRef<HTMLInputElement>(null);
  const [revenueFactUploadError, setRevenueFactUploadError] = useState<string | null>(null);
  const [revenueFactUploading, setRevenueFactUploading] = useState(false);

  const titleClass = presDark ? "text-slate-300" : presentation ? "text-mpl-text" : "text-slate-800";

  const onRevenueFactCsvUploadClick = useCallback(() => {
    revenueFactCsvInputRef.current?.click();
  }, []);

  const onRevenueFactCsvSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !csvUploadProjectId || !onRevenueFactCsvDocChange) return;
      setRevenueFactUploadError(null);
      setRevenueFactUploading(true);
      try {
        const result = await uploadMarketingRevenueFactCsvFile(file, csvUploadProjectId, csvUploadedBy);
        if (!result.ok) {
          setRevenueFactUploadError(result.error);
          return;
        }
        onRevenueFactCsvDocChange(result.doc);
        if (result.localOnly) {
          setRevenueFactUploadError(null);
        }
      } catch (e) {
        console.error("[SalesPlanSegmentStructure] revenue fact CSV upload", e);
        setRevenueFactUploadError("Не удалось обработать CSV поступлений.");
      } finally {
        setRevenueFactUploading(false);
      }
    },
    [csvUploadProjectId, csvUploadedBy, onRevenueFactCsvDocChange],
  );

  const factRevenueBySegment = useMemo(
    () => resolveFactRevenueBySegmentForStructure(filteredRows, revenueFactCsv),
    [filteredRows, revenueFactCsv],
  );

  const headerProps = {
    titleClass,
    presentation,
    presDark,
    revenueFactCsv,
    revenueFactUploadError,
    revenueFactUploading,
    onUploadClick: onRevenueFactCsvUploadClick,
    csvInputRef: revenueFactCsvInputRef,
    onCsvSelected: onRevenueFactCsvSelected,
  };

  const inventoryPools = useMemo(
    () => ({
      apartments: apartmentsRevenuePool,
      parking: parkingRevenuePool,
      storages: storagesRevenuePool,
      commercialInventoryUnits,
    }),
    [apartmentsRevenuePool, parkingRevenuePool, storagesRevenuePool, commercialInventoryUnits],
  );

  const structureCards = useMemo((): {
    projectCard: SalesStructureCardRow;
    segmentCards: SalesStructureCardRow[];
  } | null => {
    const totalSum = filteredRows.reduce((s, r) => s + r.sumRub, 0);
    const grouped = groupDealsBySegment(filteredRows);

    const buildSegmentRow = (key: DealSegmentKey, list: NormalizedDealRow[]): SalesStructureCardRow => {
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
      const factRevenue = key === "other" ? 0 : factRevenueBySegment[key as DealsAnalyticsSegmentKey];
      return {
        key,
        count,
        sum,
        factRevenue,
        avg: count > 0 ? sum / count : 0,
        share,
        soldAreaM2,
        inventoryTotal: resolveSegmentInventoryTotal(key, inventoryPools),
      };
    };

    const segmentCards: SalesStructureCardRow[] = [];
    for (const key of SEGMENT_ORDER) {
      const list = grouped[key];
      if (!list?.length) continue;
      segmentCards.push(buildSegmentRow(key, list));
    }
    if (segmentCards.length === 0) return null;

    const projectSourceRows: SalesStructureCardRow[] = PROJECT_STRUCTURE_SEGMENTS.map((key) =>
      buildSegmentRow(key, grouped[key] ?? []),
    );
    const projectCard = aggregateProjectStructureMetrics(projectSourceRows);
    return { projectCard, segmentCards };
  }, [
    filteredRows,
    apartmentsRevenuePool,
    parkingRevenuePool,
    storagesRevenuePool,
    factRevenueBySegment,
    inventoryPools,
  ]);

  if (loadingDeals) {
    return (
      <div className="mb-7 w-full min-w-0 max-w-none">
        <SalesStructureBlockHeader {...headerProps} />
        <p className={`text-xs ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>Загрузка сделок…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mb-7 w-full min-w-0 max-w-none">
        <SalesStructureBlockHeader {...headerProps} />
        <p className={`text-xs ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>{loadError}</p>
      </div>
    );
  }

  if (!structureCards) {
    return (
      <div className="mb-7 w-full min-w-0 max-w-none">
        <SalesStructureBlockHeader {...headerProps} />
        {!presentation && revenueFactCsvDocIsValid(revenueFactCsv) ? (
          <RevenueFactCsvDiagnostics doc={revenueFactCsv!} presDark={presDark} />
        ) : null}
        <p className={`text-xs ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
          Нет сделок по сегментам в текущем срезе (загрузите выгрузку или смените фильтр объекта).
        </p>
      </div>
    );
  }

  const { projectCard, segmentCards } = structureCards;
  const segmentGridClass = `sales-structure grid w-full min-w-0 max-w-none grid-cols-1 gap-3 items-start sm:grid-cols-2 ${segmentKpiGridLgClass(segmentCards.length)}`;
  const iconWrapTone = presDark
    ? "dark"
    : mplPremium && presentation
      ? "premium"
      : presentation
        ? "presentation"
        : "work";
  const labelTone = presDark ? "dark" : "work";

  return (
    <div className="mb-7 w-full min-w-0 max-w-none">
      <SalesStructureBlockHeader {...headerProps} />
      {!presentation && revenueFactCsvDocIsValid(revenueFactCsv) ? (
        <RevenueFactCsvDiagnostics doc={revenueFactCsv!} presDark={presDark} />
      ) : null}
      {apartmentsShareWarning ? (
        <p className={`mb-3 text-xs font-medium ${presDark ? "text-amber-300/90" : "text-amber-800"}`}>{apartmentsShareWarning}</p>
      ) : null}
      <div className="flex w-full min-w-0 max-w-none flex-col gap-3">
        <ProjectStructureSummaryHero
          card={projectCard}
          presentation={presentation}
          presDark={presDark}
          mplPremium={mplPremium}
          segmentCardRadius={segmentCardRadius}
          iconWrapTone={iconWrapTone}
          labelTone={labelTone}
        />
        <div className={segmentGridClass}>
          {segmentCards.map((c) => {
            const vs = presDark
              ? SEGMENT_VISUAL_PRESENTATION[c.key]
              : mplPremium && presentation
                ? SEGMENT_VISUAL_PREMIUM[c.key]
                : SEGMENT_VISUAL_WORK[c.key];
            const sharePct = Math.min(100, Math.max(0, c.share * 100));
            return (
              <div key={c.key} className="flex min-w-0 flex-col self-start">
                <div
                  className={`sales-structure-card group relative flex min-w-0 flex-col overflow-hidden ${segmentCardRadius} ${vs.card} ${vs.glow} ${vs.insetGlow} ${vs.hoverGlow} transition-[transform,box-shadow] duration-200 ease-out will-change-transform hover:z-[1]`}
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
                  <div className="relative flex min-w-0 flex-col px-2.5 py-2.5 sm:px-3 sm:py-3">
                    <MarketingDealSegmentHeader
                      segment={c.key}
                      iconWrapTone={iconWrapTone}
                      labelTone={labelTone}
                      className="mb-1"
                    />
                    <SegmentStructurePrimaryKpi
                      count={c.count}
                      inventoryTotal={c.inventoryTotal}
                      sumRub={c.sum}
                      valueClass={vs.value}
                      presDark={presDark}
                    />
                    <div className="mt-1.5 tabular-nums leading-snug">
                      <div className={`text-[12px] leading-tight ${presDark ? "text-slate-500" : "text-slate-400"}`}>
                        Факт поступлений
                      </div>
                      <div
                        className={`mt-0.5 text-[14px] font-medium leading-tight ${presDark ? "text-slate-50" : "text-[#111827]"}`}
                      >
                        {formatFactReceiptRub(c.factRevenue)}
                      </div>
                    </div>
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
    </div>
  );
}
