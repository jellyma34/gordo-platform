"use client";

import type { ReactNode } from "react";

import {
  CASHFLOW_INFLOW_FACT,
  CASHFLOW_INFLOW_LEGEND_SWATCH,
  CASHFLOW_INFLOW_PLAN,
  cashflowInflowDotRingStroke,
} from "@/lib/cashflowInflowChartSeries";

type Chrome = {
  presDark: boolean;
  presentation: boolean;
};

function legendLabelClass({ presDark, presentation }: Chrome): string {
  return presDark ? "text-slate-200" : presentation ? "text-mpl-text" : "text-slate-800";
}

function legendMutedWrapClass({ presDark, presentation }: Chrome): string {
  return presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-600";
}

type SwatchProps = { presDark: boolean };

/** Миниатюра «как на графике»: отрезок линии + маркер точки. */
function CashflowInflowLegendSwatchFact({ presDark }: SwatchProps) {
  const { viewBoxW, viewBoxH, midY, lineStartX, fact } = CASHFLOW_INFLOW_LEGEND_SWATCH;
  const ring = cashflowInflowDotRingStroke(presDark);
  return (
    <svg
      width={viewBoxW}
      height={viewBoxH}
      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      <line
        x1={lineStartX}
        y1={midY}
        x2={fact.lineEndX}
        y2={midY}
        stroke={CASHFLOW_INFLOW_FACT.stroke}
        strokeWidth={CASHFLOW_INFLOW_FACT.strokeWidth}
        strokeLinecap="round"
      />
      <circle
        cx={fact.dotCx}
        cy={midY}
        r={CASHFLOW_INFLOW_FACT.dotR}
        fill={CASHFLOW_INFLOW_FACT.stroke}
        stroke={ring}
        strokeWidth={1}
      />
    </svg>
  );
}

function CashflowInflowLegendSwatchPlan({ presDark }: SwatchProps) {
  const { viewBoxW, viewBoxH, midY, lineStartX, plan } = CASHFLOW_INFLOW_LEGEND_SWATCH;
  const ring = cashflowInflowDotRingStroke(presDark);
  return (
    <svg
      width={viewBoxW}
      height={viewBoxH}
      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      <line
        x1={lineStartX}
        y1={midY}
        x2={plan.lineEndX}
        y2={midY}
        stroke={CASHFLOW_INFLOW_PLAN.stroke}
        strokeWidth={CASHFLOW_INFLOW_PLAN.strokeWidth}
        strokeDasharray={CASHFLOW_INFLOW_PLAN.strokeDasharray}
        strokeLinecap="round"
      />
      <circle
        cx={plan.dotCx}
        cy={midY}
        r={CASHFLOW_INFLOW_PLAN.dotR}
        fill={ring}
        stroke={CASHFLOW_INFLOW_PLAN.stroke}
        strokeWidth={1.5}
      />
    </svg>
  );
}

function LegendRow({
  chrome,
  swatch,
  label,
}: {
  chrome: Chrome;
  swatch: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="inline-flex shrink-0 translate-y-[2px]">{swatch}</span>
      <span className={`leading-none ${legendLabelClass(chrome)}`}>{label}</span>
    </span>
  );
}

/** Горизонтальная легенда для тулбара над графиком поступлений. */
export function CashflowInflowChartLegendToolbar({ chrome, className }: { chrome: Chrome; className?: string }) {
  const wrap = legendMutedWrapClass(chrome);
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[10.5px] font-semibold tabular-nums ${wrap} ${className ?? ""}`}
      aria-label="Легенда серий"
    >
      <LegendRow chrome={chrome} swatch={<CashflowInflowLegendSwatchFact presDark={chrome.presDark} />} label="Факт" />
      <LegendRow chrome={chrome} swatch={<CashflowInflowLegendSwatchPlan presDark={chrome.presDark} />} label="План" />
    </div>
  );
}

/**
 * Для Recharts: `content={createCashflowInflowChartLegendRechartsContent({ presDark, presentation })}`.
 * Стили серий совпадают с линиями графика.
 */
export function createCashflowInflowChartLegendRechartsContent(chrome: Chrome): () => ReactNode {
  return function CashflowInflowChartLegendRechartsContent() {
    return (
      <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-0.5 px-1 py-0.5">
        <CashflowInflowChartLegendToolbar chrome={chrome} />
      </div>
    );
  };
}
