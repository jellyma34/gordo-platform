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
      <div className="theme-marketing-light -mx-3 min-h-[min(100vh,1600px)] w-[calc(100%+1.5rem)] max-w-none bg-mpl-page px-3 py-2 text-mpl-text antialiased sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 sm:py-4">
        {children}
      </div>
    </MarketingPresentationLightContext.Provider>
  );
}
