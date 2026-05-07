"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useMarketingDealsJson, type MarketingDealsJsonFeed } from "@/components/marketing/useMarketingDealsJson";

const Ctx = createContext<MarketingDealsJsonFeed | null>(null);

/**
 * Один `/api/deals` + нормализация на всю вкладку «Маркетинг» (План / Сделки / Рассрочка).
 * Оборачивает {@link MarketingWorkspace}.
 */
export function MarketingDealsFeedProvider({ children }: { children: ReactNode }) {
  const feed = useMarketingDealsJson();
  return <Ctx.Provider value={feed}>{children}</Ctx.Provider>;
}

export function useMarketingDealsFeed(): MarketingDealsJsonFeed {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useMarketingDealsFeed: требуется <MarketingDealsFeedProvider> (корень MarketingWorkspace).");
  }
  return v;
}
