"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { MarketingTab } from "@/components/marketing/marketingTypes";

const Ctx = createContext<{
  activeTab: MarketingTab;
  setActiveTab: (t: MarketingTab) => void;
} | null>(null);

export function MarketingEditTabProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<MarketingTab>("sales");
  return <Ctx.Provider value={{ activeTab, setActiveTab }}>{children}</Ctx.Provider>;
}

export function useMarketingEditTab() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("MarketingEditTabProvider is required");
  return ctx;
}

/** Редактирование без layout-провайдера (fallback). */
export function useMarketingEditTabOptional() {
  return useContext(Ctx);
}
