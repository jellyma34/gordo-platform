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
 * Квадратная обёртка иконки (фикс. 40×40): светлый фон в work, без деформации SVG внутри.
 */
export const MARKETING_DEAL_SEGMENT_ICON_WRAP_CLASS = {
  dark:
    "box-border flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white/12 p-2 ring-1 ring-white/12",
  premium:
    "box-border flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white/90 p-2 ring-1 ring-black/[0.05]",
  presentation:
    "box-border flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white/92 p-2 ring-1 ring-black/[0.06]",
  work:
    "box-border flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-slate-100/95 p-2 ring-1 ring-slate-200/70",
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
