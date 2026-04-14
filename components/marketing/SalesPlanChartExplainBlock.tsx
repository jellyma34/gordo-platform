"use client";

import { FormulaVariablesLegend } from "@/components/marketing/salesPlanCharts";
import type { SalesPlanChartExplainContent } from "@/lib/buildSalesPlanPresentationExplain";

export function SalesPlanChartExplainBlock({ content }: { content: SalesPlanChartExplainContent }) {
  const variables =
    content.variables.length > 0
      ? content.variables.map((v) => ({
          symbol: v.symbol,
          description: v.value ? `${v.label} — ${v.value}` : v.label,
        }))
      : undefined;

  return (
    <div className="mt-3 rounded-b-xl border border-t-0 border-white/10 bg-[#0f172a]/70 px-3 py-3 text-[10px] leading-snug text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{content.title}</div>
      <div className="mt-2 text-[9px] font-bold uppercase tracking-wide text-slate-500">Формула</div>
      <p className="mt-1 font-mono text-[10px] text-slate-400">{content.formula}</p>
      {variables?.length ? (
        <div className="mt-2">
          <div className="text-[9px] font-bold uppercase text-slate-500">Обозначения</div>
          <FormulaVariablesLegend variables={variables} presentation />
        </div>
      ) : null}
      <div className="mt-2">
        <span className="font-semibold text-slate-400">Пример расчёта: </span>
        <span className="text-slate-200">{content.calculationExample}</span>
      </div>
      <p className="mt-2">
        <span className="font-semibold text-slate-400">Интерпретация: </span>
        {content.interpretation}
      </p>
      <p className="mt-2 border-t border-white/10 pt-2 text-[11px] font-medium text-slate-200">{content.conclusion}</p>
    </div>
  );
}
