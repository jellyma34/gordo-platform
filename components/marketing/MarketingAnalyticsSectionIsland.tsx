"use client";

import type { ReactNode } from "react";

type Props = {
  presDark: boolean;
  children: ReactNode;
  className?: string;
  /** id для aria-labelledby на заголовках внутри */
  id?: string;
};

/**
 * Крупный section break: gradient divider + island container.
 * Используется между смысловыми блоками (ДДУ → стоимость проекта → …).
 */
export function MarketingAnalyticsSectionIsland({ presDark, children, className = "", id }: Props) {
  const gradientCls = presDark
    ? "h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent"
    : "h-px w-full bg-gradient-to-r from-transparent via-[#E8EDF5] to-transparent";

  const islandCls = presDark
    ? "rounded-[32px] border border-white/10 bg-slate-900/40 p-6 sm:p-8"
    : "rounded-[32px] border border-[#F3F5F8] bg-[#FCFDFE] p-6 sm:p-8";

  return (
    <div className="relative mt-28 min-w-0 w-full">
      <div className={gradientCls} aria-hidden />
      <section id={id} className={`relative pt-12 ${islandCls} ${className}`.trim()}>
        {children}
      </section>
    </div>
  );
}
