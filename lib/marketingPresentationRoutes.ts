/** Презентация «Маркетинг» внутри оболочки /presentation (как «Строительство»). */
export const MARKETING_PRESENTATION = {
  salesPlan: "/presentation/marketing/sales-plan",
  installments: "/presentation/marketing/installments",
  deals: "/presentation/marketing/deals",
} as const;

export type MarketingPresentationPath =
  (typeof MARKETING_PRESENTATION)[keyof typeof MARKETING_PRESENTATION];

export function marketingPresentationUrl(
  path: MarketingPresentationPath,
  searchParams: Pick<URLSearchParams, "toString">,
): string {
  const q = searchParams.toString();
  return q ? `${path}?${q}` : path;
}
