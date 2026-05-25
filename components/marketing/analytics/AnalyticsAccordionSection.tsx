"use client";

import { useCallback, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  title: string;
  /** Опционально: «Квартиры (79)». */
  count?: number | null;
  defaultExpanded?: boolean;
  presDark: boolean;
  presentation: boolean;
  children: ReactNode;
  className?: string;
  /** Чуть выделенный стиль (блок «Проект»). */
  accent?: boolean;
};

export function AnalyticsAccordionSection({
  title,
  count,
  defaultExpanded = false,
  presDark,
  presentation,
  children,
  className = "",
  accent = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = useId();
  const headerId = useId();

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const countLabel =
    count != null && Number.isFinite(count) && count > 0 ? ` (${Math.round(count)})` : "";

  const headerCls = presDark
    ? "text-slate-100 hover:bg-white/[0.06]"
    : presentation
      ? "text-mpl-text hover:bg-black/[0.03]"
      : "text-[#0F172A] hover:bg-slate-50/90";

  const chevronCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-500";

  const borderColor = presDark
    ? accent
      ? "rgba(99,102,241,0.35)"
      : "rgba(255,255,255,0.08)"
    : accent
      ? "rgba(99,102,241,0.28)"
      : "rgba(226,232,240,0.65)";

  const shellCls = accent
    ? presDark
      ? "bg-indigo-950/25 shadow-[0_6px_24px_rgba(0,0,0,0.18)] ring-1 ring-indigo-500/20"
      : presentation
        ? "bg-gradient-to-br from-indigo-50/70 via-white/90 to-white shadow-[0_6px_22px_rgba(99,102,241,0.1)] ring-1 ring-indigo-200/70"
        : "bg-gradient-to-br from-indigo-50/55 via-white to-white shadow-[0_6px_20px_rgba(99,102,241,0.08)] ring-1 ring-indigo-100/80"
    : "";

  return (
    <div
      className={`min-w-0 rounded-xl border ${shellCls} ${className}`.trim()}
      style={{ borderColor }}
      data-accordion-expanded={expanded ? "true" : "false"}
    >
      <button
        type="button"
        id={headerId}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors duration-200 ease-out sm:px-4 sm:py-3 ${headerCls}`}
        onClick={toggle}
      >
        <span className="min-w-0 truncate text-[15px] font-semibold leading-snug tracking-tight sm:text-base">
          {title}
          {countLabel ? (
            <span className={`font-medium tabular-nums ${presDark ? "text-slate-400" : "text-slate-500"}`}>
              {countLabel}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none ${chevronCls} ${
            expanded ? "rotate-180" : "rotate-0"
          }`}
          aria-hidden
        />
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div
          className={`min-h-0 overflow-hidden transition-opacity duration-300 ease-out motion-reduce:transition-none ${
            expanded ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="border-t px-3.5 pb-4 pt-3 sm:px-4 sm:pb-5 sm:pt-3.5" style={{ borderColor }}>
            {expanded ? children : null}
          </div>
        </div>
      </div>
    </div>
  );
}
