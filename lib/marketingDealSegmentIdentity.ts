import type { LucideIcon } from "lucide-react";
import { Building2, Car, CircleHelp, Package, ShoppingBag } from "lucide-react";

/**
 * Ключи сегментов сделок для маркетингового UI (совпадают с DealSegmentKey в DealsSection).
 */
export type MarketingDealSegmentUiKey = "apartment" | "parking" | "storage" | "commercial" | "other";

/** Lucide-иконки сегментов — один источник для KPI и карточек «Сделки». */
export const MARKETING_DEAL_SEGMENT_ICONS: Record<MarketingDealSegmentUiKey, LucideIcon> = {
  apartment: Building2,
  parking: Car,
  storage: Package,
  commercial: ShoppingBag,
  other: CircleHelp,
};

/** Цвет обводки иконки (как в «Структура продаж»). */
export const MARKETING_DEAL_SEGMENT_ICON_LUCIDE_CLASS: Record<MarketingDealSegmentUiKey, string> = {
  apartment: "text-indigo-500",
  parking: "text-purple-500",
  storage: "text-cyan-500",
  commercial: "text-orange-500",
  other: "text-slate-400",
};

/**
 * Квадратная обёртка иконки (40×40): мягкая обводка, лёгкий фон, без резкого ring — единый enterprise-стиль.
 */
export const MARKETING_DEAL_SEGMENT_ICON_WRAP_CLASS = {
  dark:
    "box-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.055] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
  premium:
    "box-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-900/[0.04] bg-white/78 p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
  presentation:
    "box-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-900/[0.045] bg-white/82 p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.035)]",
  work:
    "box-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/25 bg-gradient-to-br from-white to-slate-50/90 p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.035)]",
} as const;

export type MarketingDealSegmentIconWrapTone = keyof typeof MARKETING_DEAL_SEGMENT_ICON_WRAP_CLASS;

/**
 * Типографика подписи сегмента рядом с иконкой.
 * Premium наследует те же цвета, что work (см. SEGMENT_VISUAL_PREMIUM в SalesPlanSegmentStructure).
 */
export const MARKETING_DEAL_SEGMENT_HEADER_LABEL_CLASS: Record<
  "work" | "dark",
  Record<MarketingDealSegmentUiKey, string>
> = {
  work: {
    apartment: "text-indigo-700/90",
    parking: "text-violet-800/90",
    storage: "text-cyan-900",
    commercial: "text-orange-900",
    other: "text-slate-600",
  },
  dark: {
    apartment: "text-indigo-300/90",
    parking: "text-violet-300/90",
    storage: "text-cyan-300/90",
    commercial: "text-orange-300/90",
    other: "text-slate-400/95",
  },
};

/** Базовая строка заголовка сегмента (без uppercase — меньше визуального шума). */
export const MARKETING_DEAL_SEGMENT_HEADER_TITLE_BASE =
  "min-w-0 text-[12px] font-semibold leading-snug tracking-tight";
