"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type MarketingLayoutChrome = {
  modeLabel: string;
  presentation: boolean;
  onBackToBlocks: () => void;
};

const Ctx = createContext<{
  chrome: MarketingLayoutChrome | null;
  setChrome: (c: MarketingLayoutChrome | null) => void;
} | null>(null);

export function MarketingLayoutChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<MarketingLayoutChrome | null>(null);
  return <Ctx.Provider value={{ chrome, setChrome }}>{children}</Ctx.Provider>;
}

export function useMarketingLayoutChromeSetter() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("MarketingLayoutChromeProvider is required");
  return ctx.setChrome;
}

export function useMarketingLayoutChrome(): MarketingLayoutChrome | null {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("MarketingLayoutChromeProvider is required");
  return ctx.chrome;
}

export function useRegisterMarketingLayoutChrome(chrome: MarketingLayoutChrome | null) {
  const setChrome = useMarketingLayoutChromeSetter();
  useEffect(() => {
    setChrome(chrome);
    return () => setChrome(null);
  }, [chrome, setChrome]);
}
