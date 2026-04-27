"use client";

import dynamic from "next/dynamic";

import type { MarketingTab } from "@/components/marketing/marketingTypes";

const MarketingPresentationRouteBody = dynamic(
  () =>
    import("@/components/marketing/MarketingPresentationRouteBody").then((m) => ({
      default: m.MarketingPresentationRouteBody,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">Загрузка…</div>
    ),
  },
);

type Props = {
  presentationActiveTab: MarketingTab;
};

/**
 * Обёртка для страниц `/presentation/marketing/*`: тело маршрута не рендерится на сервере, хуки навигации — только на клиенте.
 */
export function MarketingPresentationRouteBodyGate({ presentationActiveTab }: Props) {
  return <MarketingPresentationRouteBody presentationActiveTab={presentationActiveTab} />;
}
