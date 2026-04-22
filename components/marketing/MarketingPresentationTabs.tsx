"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { MARKETING_PRESENTATION, marketingPresentationUrl } from "@/lib/marketingPresentationRoutes";
import { useMarketingPresentationLight } from "@/components/marketing/marketingPresentationLightContext";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";

export type MarketingPresentationTabItem = {
  id: string;
  label: string;
  href: (typeof MARKETING_PRESENTATION)[keyof typeof MARKETING_PRESENTATION];
};

const DEFAULT_TABS: MarketingPresentationTabItem[] = [
  { id: "sales-plan", label: "План продаж", href: MARKETING_PRESENTATION.salesPlan },
  { id: "deals", label: "Сделки", href: MARKETING_PRESENTATION.deals },
  { id: "installments", label: "Рассрочка ДДУ", href: MARKETING_PRESENTATION.installments },
];

type MarketingPresentationTabsProps = {
  /** Расширение списка без дублирования разметки */
  tabs?: MarketingPresentationTabItem[];
  className?: string;
};

export function MarketingPresentationTabs({
  tabs = DEFAULT_TABS,
  className = "flex flex-wrap items-center gap-2",
}: MarketingPresentationTabsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mplLight = useMarketingPresentationLight();

  return (
    <div className={className} role="tablist" aria-label="Разделы маркетинга">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const surface = mplLight ? "premium" : "dark";
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => router.push(marketingPresentationUrl(tab.href, searchParams), { scroll: false })}
            className={segmentedControlTabClass(active, surface)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
