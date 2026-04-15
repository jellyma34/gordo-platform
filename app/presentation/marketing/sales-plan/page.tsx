import { Suspense } from "react";

import { MarketingPresentationRouteBody } from "@/components/marketing/MarketingPresentationRouteBody";

export default function PresentationMarketingSalesPlanPage() {
  return (
    <Suspense
      fallback={<div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">Загрузка…</div>}
    >
      <MarketingPresentationRouteBody presentationActiveTab="sales" />
    </Suspense>
  );
}
