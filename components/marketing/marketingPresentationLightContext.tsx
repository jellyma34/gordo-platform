"use client";

import { createContext, useContext, type ReactNode } from "react";

export type MarketingPresVisual = "work" | "presDark" | "presLight";

const MarketingPresentationLightContext = createContext(false);

/** true только внутри /presentation/marketing/* (обёртка theme-marketing-light). */
export function useMarketingPresentationLight(): boolean {
  return useContext(MarketingPresentationLightContext);
}

/** Режим отображения маркетинга: рабочий / тёмная презентация / светлая презентация. */
export function useMarketingPresVisual(presentation: boolean): MarketingPresVisual {
  const light = useMarketingPresentationLight();
  if (!presentation) return "work";
  return light ? "presLight" : "presDark";
}

export function MarketingPresentationLightRoot({ children }: { children: ReactNode }) {
  return (
    <MarketingPresentationLightContext.Provider value={true}>
      <div className="theme-marketing-light -mx-3 flex min-h-0 w-[calc(100%+1.5rem)] max-w-none flex-1 flex-col overflow-hidden bg-[#F5F7FB] px-3 py-0 text-mpl-text antialiased sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 sm:py-0">
        {children}
      </div>
    </MarketingPresentationLightContext.Provider>
  );
}
