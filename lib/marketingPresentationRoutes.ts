import type { MarketingTab } from "@/components/marketing/marketingTypes";

/** Презентация «Маркетинг» внутри оболочки /presentation (как «Строительство»). */
export const MARKETING_PRESENTATION = {
  salesPlan: "/presentation/marketing/sales-plan",
  installments: "/presentation/marketing/installments",
  deals: "/presentation/marketing/deals",
} as const;

export type MarketingPresentationPath =
  (typeof MARKETING_PRESENTATION)[keyof typeof MARKETING_PRESENTATION];

export function marketingTabFromPresentationPath(pathname: string): MarketingTab {
  if (pathname.includes("/presentation/marketing/deals")) return "deals";
  if (pathname.includes("/presentation/marketing/installments")) return "installment";
  return "sales";
}

export function presentationPathForMarketingTab(tab: MarketingTab): MarketingPresentationPath {
  if (tab === "deals") return MARKETING_PRESENTATION.deals;
  if (tab === "installment") return MARKETING_PRESENTATION.installments;
  return MARKETING_PRESENTATION.salesPlan;
}

export function marketingPresentationUrl(
  path: MarketingPresentationPath,
  searchParams: Pick<URLSearchParams, "toString">,
): string {
  const q = searchParams.toString();
  return q ? `${path}?${q}` : path;
}
