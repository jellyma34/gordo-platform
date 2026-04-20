import { Suspense } from "react";

import { MarketingPresentationRouteBody } from "@/components/marketing/MarketingPresentationRouteBody";

/** Не пререндерить страницу со статикой/поддеревом, которое может тянуть API на этапе сборки. */
export const dynamic = "force-dynamic";

export default function PresentationMarketingDealsPage() {
  return (
    <Suspense
      fallback={<div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">Загрузка…</div>}
    >
      <MarketingPresentationRouteBody presentationActiveTab="deals" />
    </Suspense>
  );
}
