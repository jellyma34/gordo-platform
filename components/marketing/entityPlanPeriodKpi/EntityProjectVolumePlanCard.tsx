"use client";

import type { DealSegmentKey } from "@/components/marketing/DealsSection";
import { PremiumSegmentVolumeCard } from "@/components/marketing/PremiumSegmentVolumeCard";

type Props = {
  rub: number;
  caption?: string;
  subtitle?: string;
  illustrationSegment?: DealSegmentKey;
  presDark: boolean;
  skeleton?: boolean;
  showCurrencySymbol?: boolean;
  projectPlanFullNumber?: boolean;
};

/** Карточка «План проекта» в premium-сетке KPI (DDU / стоимость проекта). */
export function EntityProjectVolumePlanCard({
  rub,
  caption = "План проекта",
  subtitle = "Общий план продаж",
  illustrationSegment = "apartment",
  presDark,
  skeleton = false,
  showCurrencySymbol = true,
  projectPlanFullNumber = false,
}: Props) {
  return (
    <PremiumSegmentVolumeCard
      rub={rub}
      caption={caption}
      subtitle={subtitle}
      illustrationSegment={illustrationSegment}
      presDark={presDark}
      skeleton={skeleton}
      showCurrencySymbol={showCurrencySymbol}
      projectPlanFullNumber={projectPlanFullNumber}
    />
  );
}
