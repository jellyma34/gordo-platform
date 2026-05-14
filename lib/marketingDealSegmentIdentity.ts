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

/** Скруглённый контейнер иконки: те же классы, что у карточек структуры продаж. */
export const MARKETING_DEAL_SEGMENT_ICON_WRAP_CLASS = {
  dark:
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10",
  premium:
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/85 ring-1 ring-black/[0.04]",
  presentation:
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/90 ring-1 ring-black/[0.05]",
  work:
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-slate-200/60",
} as const;

export type MarketingDealSegmentIconWrapTone = keyof typeof MARKETING_DEAL_SEGMENT_ICON_WRAP_CLASS;

/**
 * Типографика подписи сегмента рядом с иконкой (uppercase, как в KPI «Структура продаж»).
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
