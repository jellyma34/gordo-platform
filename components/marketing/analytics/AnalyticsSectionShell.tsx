"use client";

import type { ReactNode } from "react";

import {
  analyticsMarketingSectionShellClass,
} from "@/components/marketing/analytics/analyticsSectionShellStyles";

type Props = {
  id?: string;
  title: string;
  subtitle?: ReactNode;
  presDark: boolean;
  presentation: boolean;
  mplPremium?: boolean;
  headerRight?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** Карточка-оболочка маркетинговой аналитики (единый стиль с блоками рассрочки ДДУ). */
export function AnalyticsSectionShell({
  id,
  title,
  subtitle,
  presDark,
  presentation,
  mplPremium = false,
  headerRight,
  className = "",
  children,
}: Props) {
  const shellClass = analyticsMarketingSectionShellClass(presDark, presentation, mplPremium);
  const titleCls = presDark ? "text-slate-100" : "text-slate-900";
  const subCls = presDark ? "text-slate-400" : "text-slate-600";

  return (
    <section
      id={id}
      className={`${shellClass} ${className}`.trim()}
      aria-labelledby={id ? `${id}-heading` : undefined}
    >
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3
            id={id ? `${id}-heading` : undefined}
            className={`text-sm font-semibold tracking-tight ${titleCls}`}
          >
            {title}
          </h3>
          {subtitle && !presentation ? (
            <div className={`mt-1 text-[11px] leading-snug ${subCls}`}>{subtitle}</div>
          ) : null}
        </div>
        {headerRight ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{headerRight}</div> : null}
      </header>
      {children}
    </section>
  );
}
