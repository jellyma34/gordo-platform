"use client";

import type { DealSegmentKey } from "@/components/marketing/DealsSection";
import { DEAL_SEGMENT_LABEL_RU } from "@/components/marketing/DealsSection";
import {
  MARKETING_DEAL_SEGMENT_HEADER_LABEL_CLASS,
  MARKETING_DEAL_SEGMENT_HEADER_TITLE_BASE,
  MARKETING_DEAL_SEGMENT_ICON_LUCIDE_CLASS,
  MARKETING_DEAL_SEGMENT_ICON_WRAP_CLASS,
  MARKETING_DEAL_SEGMENT_ICONS,
  type MarketingDealSegmentIconWrapTone,
  type MarketingDealSegmentUiKey,
} from "@/lib/marketingDealSegmentIdentity";

export type { MarketingDealSegmentIconWrapTone } from "@/lib/marketingDealSegmentIdentity";

export type MarketingDealSegmentLabelTone = keyof typeof MARKETING_DEAL_SEGMENT_HEADER_LABEL_CLASS;

export type MarketingDealSegmentHeaderProps = {
  segment: DealSegmentKey;
  /** Обёртка иконки: как в карточках «Структура продаж». */
  iconWrapTone: MarketingDealSegmentIconWrapTone;
  /** Цвет подписи по умолчанию (светлая аналитика / тёмная презентация). */
  labelTone: MarketingDealSegmentLabelTone;
  /** Если задан — полностью заменяет классы подписи (например, titleLight/titleDark из skin карточки). */
  labelClassName?: string;
  labelOverride?: string;
  className?: string;
  iconWrapClassName?: string;
};

function asUiKey(segment: DealSegmentKey): MarketingDealSegmentUiKey {
  return segment;
}

/**
 * Единый заголовок сегмента: иконка + uppercase-подпись (KPI, «Структура продаж», карточки «Сделки»).
 */
export function MarketingDealSegmentHeader({
  segment,
  iconWrapTone,
  labelTone,
  labelClassName,
  labelOverride,
  className = "",
  iconWrapClassName = "",
}: MarketingDealSegmentHeaderProps) {
  const Icon = MARKETING_DEAL_SEGMENT_ICONS[asUiKey(segment)];
  const iconStroke = MARKETING_DEAL_SEGMENT_ICON_LUCIDE_CLASS[asUiKey(segment)];
  const wrap = `${MARKETING_DEAL_SEGMENT_ICON_WRAP_CLASS[iconWrapTone]} ${iconWrapClassName}`.trim();
  const labelResolved =
    labelClassName ??
    `${MARKETING_DEAL_SEGMENT_HEADER_TITLE_BASE} ${MARKETING_DEAL_SEGMENT_HEADER_LABEL_CLASS[labelTone][asUiKey(segment)]}`;
  const text = labelOverride ?? DEAL_SEGMENT_LABEL_RU[segment];

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`.trim()}>
      <div className={wrap} aria-hidden>
        <Icon className={`h-4 w-4 shrink-0 ${iconStroke}`} strokeWidth={2} />
      </div>
      <span className={labelResolved}>{text}</span>
    </div>
  );
}
