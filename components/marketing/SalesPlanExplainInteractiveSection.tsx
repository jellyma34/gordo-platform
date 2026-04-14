"use client";

import { useMemo, useState } from "react";

import type { SalesPlanPresentationExplainBlock } from "@/lib/buildSalesPlanPresentationExplain";
import {
  buildVelocityLineRows,
  buildVelocityMonthlyBars,
  salesPlanPeriodKeyThisMonth,
  velocityFooterFromMonthly,
} from "@/lib/salesPlanVelocityChartData";

import { FactVsPlanChart, SalesTempoChart } from "@/components/marketing/salesPlanCharts";

export function SalesPlanExplainInteractiveSection({ block }: { block: SalesPlanPresentationExplainBlock }) {
  const interactive = block.interactive;
  const [activeId, setActiveId] = useState<string | null>(null);
  const hasActive = activeId != null;

  const explainMeta = useMemo(
    () => ({
      dataSources: block.dataSources,
      formulaLines: block.formulaLines,
      howSection: block.howSection,
    }),
    [block.dataSources, block.formulaLines, block.howSection],
  );

  if (!interactive) return null;

  const dimClass = (pointId: string) =>
    activeId === pointId
      ? "cursor-default rounded-lg border border-sky-500/50 bg-sky-950/55 px-2 py-2 font-mono text-[11px] leading-relaxed text-slate-100 shadow-[0_0_22px_-6px_rgba(56,189,248,0.55)]"
      : hasActive
        ? "cursor-default rounded-lg border border-transparent px-2 py-2 font-mono text-[11px] leading-relaxed text-slate-400 opacity-30"
        : "cursor-default rounded-lg border border-transparent px-2 py-2 font-mono text-[11px] leading-relaxed text-slate-300";

  if (block.id === "salesTempo") {
    const monthlyInputs = interactive.points.map((p) => ({
      periodKey: p.pointId,
      label: p.label,
      plan: p.plan,
      fact: p.fact,
    }));
    const periodKeys = monthlyInputs.map((m) => m.periodKey);
    const { actualPerMonth, velocityCompletionPct } = velocityFooterFromMonthly(
      monthlyInputs,
      periodKeys,
      salesPlanPeriodKeyThisMonth(),
    );
    const detailByKey = new Map(interactive.points.map((p) => [p.pointId, p.detailLine]));
    const lineData = buildVelocityLineRows(monthlyInputs).map((row) => ({
      ...row,
      detailLine: detailByKey.get(row.periodKey),
    }));
    const barRows = buildVelocityMonthlyBars(monthlyInputs).map((row) => ({
      ...row,
      pointId: row.periodKey,
      detailLine: detailByKey.get(row.periodKey),
    }));

    return (
      <div className="mt-4 space-y-4" onMouseLeave={() => setActiveId(null)}>
        <p className="text-[11px] leading-snug text-slate-500">
          Те же графики, что в режиме презентации. Наведите на столбец или точку на линии — список подсветится по id точки (период или категория). В
          подсказке — источники, формулы и пояснение.
        </p>
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <div
            className={
              "rounded-xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            }
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-200/80">Темп по месяцам</div>
            <SalesTempoChart
              mode="explain"
              lineData={lineData}
              velocityCompletionPct={velocityCompletionPct}
              actualPerMonth={actualPerMonth}
              activePointId={activeId}
              onPointHover={setActiveId}
              blockExplain={explainMeta}
            />
          </div>
          <div
            className={
              "rounded-xl border border-amber-500/15 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            }
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200/75">Факт по месяцам vs план</div>
            <FactVsPlanChart
              mode="explain"
              rows={barRows}
              valueKind="deals"
              activePointId={activeId}
              onPointHover={setActiveId}
              blockExplain={explainMeta}
            />
          </div>
        </div>

        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">По каждой точке</h4>
          <ul className="mt-2 space-y-1.5">
            {interactive.points.map((p) => (
              <li key={`${block.id}-row-${p.pointId}`} onMouseEnter={() => setActiveId(p.pointId)} className={dimClass(p.pointId)}>
                <span className="mr-2 inline-block min-w-[5.5rem] text-[10px] font-semibold text-sky-400/90">{p.pointId}</span>
                <span>{p.detailLine}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const barRows = interactive.points.map((p) => ({
    periodKey: p.pointId,
    label: p.label,
    fact: p.fact,
    plan: p.plan,
    deviation: p.fact - p.plan,
    pointId: p.pointId,
    detailLine: p.detailLine,
  }));

  return (
    <div className="mt-4 space-y-4" onMouseLeave={() => setActiveId(null)}>
      <p className="text-[11px] leading-snug text-slate-500">
        Тот же тип диаграммы «факт vs план», что на дашборде презентации (цвета и вёрстка). Наведите на столбец — строка с тем же id подсветится; в
        подсказке — источники данных, формулы и расшифровка точки.
      </p>
      <div
        className={
          "rounded-xl border border-amber-500/15 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        }
      >
        <FactVsPlanChart
          mode="explain"
          rows={barRows}
          valueKind={interactive.valueKind}
          activePointId={activeId}
          onPointHover={setActiveId}
          blockExplain={explainMeta}
        />
      </div>

      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">По каждой точке</h4>
        <ul className="mt-2 space-y-1.5">
          {interactive.points.map((p) => (
            <li key={`${block.id}-row-${p.pointId}`} onMouseEnter={() => setActiveId(p.pointId)} className={dimClass(p.pointId)}>
              <span className="mr-2 inline-block min-w-[5.5rem] text-[10px] font-semibold text-sky-400/90">{p.pointId}</span>
              <span>{p.detailLine}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
