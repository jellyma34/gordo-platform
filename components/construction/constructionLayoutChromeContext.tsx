"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ConstructionLayoutChrome = {
  modeLabel: string;
  onBackToBlocks: () => void;
};

const Ctx = createContext<{
  chrome: ConstructionLayoutChrome | null;
  setChrome: (c: ConstructionLayoutChrome | null) => void;
} | null>(null);

function warnMissingProvider() {
  if (process.env.NODE_ENV === "development") {
    console.warn("ConstructionLayoutChromeProvider missing");
  }
}

const noopSetChrome: (c: ConstructionLayoutChrome | null) => void = () => {};

export function ConstructionLayoutChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<ConstructionLayoutChrome | null>(null);
  return <Ctx.Provider value={{ chrome, setChrome }}>{children}</Ctx.Provider>;
}

function useChromeSetter() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    warnMissingProvider();
    return noopSetChrome;
  }
  return ctx.setChrome;
}

export function useConstructionLayoutChrome(): ConstructionLayoutChrome | null {
  const ctx = useContext(Ctx);
  if (!ctx) {
    warnMissingProvider();
    return null;
  }
  return ctx.chrome;
}

export function useRegisterConstructionLayoutChrome(chrome: ConstructionLayoutChrome | null) {
  const setChrome = useChromeSetter();
  useEffect(() => {
    setChrome(chrome);
    return () => setChrome(null);
  }, [chrome, setChrome]);
}
