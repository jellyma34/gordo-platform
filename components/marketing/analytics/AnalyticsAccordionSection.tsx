"use client";

import { useCallback, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { resolveAnalyticsSegmentSurface } from "@/components/marketing/analytics/analyticsDashboardShell";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";

type Props = {
  title: string;
  /** Опционально: «Квартиры (79)». */
  count?: number | null;
  defaultExpanded?: boolean;
  /** PDF: всегда развёрнуто, children в DOM. */
  forceExpanded?: boolean;
  presDark: boolean;
  presentation: boolean;
  mplPremium?: boolean;
  children: ReactNode;
  className?: string;
  /** @deprecated Единый стиль сегментов — флаг не меняет оформление. */
  accent?: boolean;
};

/**
 * Компактный collapsible-сегмент внутри analytics shell (тонкая рамка, мягкий hover, как вкладки ДДУ).
 */
export function AnalyticsAccordionSection({
  title,
  count,
  defaultExpanded = false,
  forceExpanded = false,
  presDark,
  presentation,
  mplPremium = false,
  children,
  className = "",
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded || forceExpanded);
  const panelId = useId();
  const headerId = useId();
  const surface = resolveAnalyticsSegmentSurface(presDark, presentation, mplPremium);
  const isExpanded = forceExpanded || expanded;

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const countLabel =
    count != null && Number.isFinite(count) && count > 0 ? ` (${Math.round(count)})` : "";

  const borderCls = presDark ? "border-white/10" : presentation ? "border-black/[0.06]" : "border-slate-200/70";

  const shellBg = presDark
    ? isExpanded
      ? "bg-white/[0.04]"
      : "bg-transparent"
    : presentation
      ? isExpanded
        ? "bg-white/70"
        : "bg-white/40"
      : isExpanded
        ? "bg-white/80"
        : "bg-white/50";

  const chevronCls = presDark ? "text-slate-500" : "text-slate-400";

  const panelBorder = presDark ? "border-white/8" : presentation ? "border-black/[0.05]" : "border-slate-200/60";

  const headerTabCls = segmentedControlTabClass(isExpanded, surface);

  return (
    <div
      className={`min-w-0 overflow-hidden rounded-lg border ${borderCls} ${shellBg} ${className}`.trim()}
      data-accordion-expanded={isExpanded ? "true" : "false"}
    >
      {!forceExpanded ? (
        <button
          type="button"
          id={headerId}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 sm:px-3.5 ${headerTabCls}`}
          onClick={toggle}
        >
          <span className="min-w-0 truncate text-[13px] font-medium leading-snug tracking-tight">
            {title}
            {countLabel ? (
              <span className={`font-normal tabular-nums ${presDark ? "text-slate-500" : "text-slate-500"}`}>
                {countLabel}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none ${chevronCls} ${
              isExpanded ? "rotate-180" : "rotate-0"
            }`}
            aria-hidden
          />
        </button>
      ) : (
        <div id={headerId} className={`px-3 py-2 sm:px-3.5 ${headerTabCls}`}>
          <span className="text-[13px] font-medium leading-snug tracking-tight">
            {title}
            {countLabel}
          </span>
        </div>
      )}

      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
      >
        <div
          className={`min-h-0 overflow-hidden transition-opacity duration-200 ease-out motion-reduce:transition-none ${
            isExpanded ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className={`border-t px-3 pb-3 pt-2 sm:px-3.5 sm:pb-3.5 sm:pt-2.5 ${panelBorder}`}>
            {isExpanded ? children : null}
          </div>
        </div>
      </div>
    </div>
  );
}
