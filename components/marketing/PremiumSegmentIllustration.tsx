"use client";

import type { DealSegmentKey } from "@/components/marketing/DealsSection";
import {
  MARKETING_DEAL_SEGMENT_ICONS,
  type MarketingDealSegmentUiKey,
} from "@/lib/marketingDealSegmentIdentity";

export type PremiumSegmentIllustrationProps = {
  segment: DealSegmentKey;
  className?: string;
};

/** Centered pastel illustration: w-24 circle + soft blue outline icon (единый стиль всех сегментов). */
export function PremiumSegmentIllustration({ segment, className = "" }: PremiumSegmentIllustrationProps) {
  const uiKey = segment as MarketingDealSegmentUiKey;
  const Icon = MARKETING_DEAL_SEGMENT_ICONS[uiKey];

  return (
    <div
      className={`flex aspect-square h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[#F3F6FF] ${className}`.trim()}
      aria-hidden
    >
      <Icon className="h-11 w-11 shrink-0 text-[#B8C7F8]" strokeWidth={1.5} />
    </div>
  );
}
