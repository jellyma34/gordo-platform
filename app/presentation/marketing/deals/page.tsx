import { MarketingPresentationRouteBodyGate } from "@/components/marketing/MarketingPresentationRouteBodyGate";

/** Нет SSG/prerender: клиентский контент и импорты API не должны выполняться на этапе `next build`. */
export const dynamic = "force-dynamic";

export default function PresentationMarketingDealsPage() {
  return <MarketingPresentationRouteBodyGate presentationActiveTab="deals" />;
}
