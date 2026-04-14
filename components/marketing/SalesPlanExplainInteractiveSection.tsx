"use client";

import { useMemo, useState } from "react";

import type {
  SalesPlanChartExplainBundle,
  SalesPlanDashboardExplainContext,
  SalesPlanPresentationExplainBlock,
} from "@/lib/buildSalesPlanPresentationExplain";
import type { SalesTempoExplainMetricId } from "@/lib/salesPlanExplainMetricIds";
import {
  buildVelocityLineRows,
  buildVelocityMonthlyBars,
  salesPlanPeriodKeyThisMonth,
  velocityFooterFromMonthly,
} from "@/lib/salesPlanVelocityChartData";

import { dec1Fmt } from "@/lib/salesPlanChartFormat";

import { FactVsPlanChart, SalesTempoChart } from "@/components/marketing/salesPlanCharts";
import { ExplainMetricBlock } from "@/components/marketing/ExplainMetricBlock";

function SalesTempoNormFooterStrip({
  velocityCompletionPct,
  actualPerMonth,
  onExplainMetricHover,
}: {
  velocityCompletionPct: number;
  actualPerMonth: number;
  onExplainMetricHover?: (id: SalesTempoExplainMetricId | null) => void;
}) {
  return (
    <div
      className={`flex min-h-[40px] items-center justify-center gap-x-3 rounded-lg border border-cyan-500/25 bg-slate-950/40 px-3 py-2 text-[10px] font-medium leading-tight text-slate-600 ${onExplainMetricHover ? "cursor-help transition-colors hover:border-cyan-400/40 hover:bg-slate-950/60" : ""}`}
      onMouseEnter={() => onExplainMetricHover?.("tempoNorm")}
      onMouseLeave={() => onExplainMetricHover?.(null)}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-slate-500" />
        <span>Факт</span>
      </span>
      <span aria-hidden>—</span>
      <span className="tabular-nums">{velocityCompletionPct}%</span>
      <span className="font-semibold tabular-nums text-amber-700">{dec1Fmt.format(actualPerMonth)} сделок</span>
    </div>
  );
}
import {
  SalesPlanExplainStructureBalance,
  SalesPlanExplainUpsellConvChart,
} from "@/components/marketing/SalesPlanExplainDashboardCharts";

type Props = {
  block: SalesPlanPresentationExplainBlock;
  /** Дашборд: пояснения под каждым графиком (те же числа, что в bundle / презентации). */
  chartExplainBundle?: SalesPlanChartExplainBundle | null;
  /** Дашборд: контекст расчётов для визуалов баланса и upsell-конверсии. */
  dashboardExplainContext?: SalesPlanDashboardExplainContext | null;
};

export function SalesPlanExplainInteractiveSection({ block, chartExplainBundle, dashboardExplainContext }: Props) {
  const interactive = block.interactive;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMetricId, setActiveMetricId] = useState<SalesTempoExplainMetricId | null>(null);
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

  const showChartExplains = chartExplainBundle != null;

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
      <div
        className="mt-4 space-y-4"
        onMouseLeave={() => {
          setActiveId(null);
          setActiveMetricId(null);
        }}
      >
        <p className="text-[11px] leading-snug text-slate-500">
          Наведите на столбец или точку на линии — соответствующая строка в списке ниже подсветится.
          {showChartExplains ? " Пунктир — норма (planPerMonth), цветная линия — скользящий факт (actualPerMonth); подсветится карточка формулы справа." : null}
        </p>
        <div className="space-y-6">
          <div
            className={
              "rounded-xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            }
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-cyan-200/80">Темп по месяцам</span>
              {showChartExplains ? (
                <button
                  type="button"
                  className="rounded border border-cyan-500/25 bg-slate-950/50 px-2 py-0.5 text-[9px] font-medium text-cyan-100/80 hover:bg-cyan-950/40"
                  onMouseEnter={() => setActiveMetricId("sumPlanFact")}
                  onMouseLeave={() => setActiveMetricId(null)}
                >
                  Σ план / Σ факт
                </button>
              ) : null}
            </div>
            <SalesTempoChart
              mode="explain"
              lineData={lineData}
              velocityCompletionPct={velocityCompletionPct}
              actualPerMonth={actualPerMonth}
              activePointId={activeId}
              onPointHover={setActiveId}
              onExplainMetricHover={showChartExplains ? setActiveMetricId : undefined}
              showVelocityFooter={false}
            />
            {showChartExplains ? (
              <ExplainMetricBlock content={chartExplainBundle.salesTempoLine} activeMetricId={activeMetricId} />
            ) : null}
          </div>

          <div
            className={
              "rounded-xl border border-sky-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            }
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-200/85">Темп к норме</div>
            <SalesTempoNormFooterStrip
              velocityCompletionPct={velocityCompletionPct}
              actualPerMonth={actualPerMonth}
              onExplainMetricHover={showChartExplains ? setActiveMetricId : undefined}
            />
            {showChartExplains ? (
              <ExplainMetricBlock content={chartExplainBundle.salesTempoNorm} activeMetricId={activeMetricId} />
            ) : null}
          </div>

          <div
            className={
              "rounded-xl border border-amber-500/15 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            }
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200/75">Факт vs план</div>
            <FactVsPlanChart
              mode="explain"
              rows={barRows}
              valueKind="deals"
              velocityCompletionPct={velocityCompletionPct}
              activePointId={activeId}
              onPointHover={setActiveId}
              onExplainMetricHover={showChartExplains ? setActiveMetricId : undefined}
            />
            {showChartExplains ? (
              <ExplainMetricBlock content={chartExplainBundle.factVsPlanDeals} activeMetricId={activeMetricId} />
            ) : null}
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

  const isStructure = block.id === "structure";
  const isUpsell = block.id === "upsell";
  const balanceDiagnostic = dashboardExplainContext?.structureBalanceDiagnostic;

  return (
    <div className="mt-4 space-y-4" onMouseLeave={() => setActiveId(null)}>
      <p className="text-[11px] leading-snug text-slate-500">
        Диаграмма «факт vs план» в едином стиле с планом продаж. Наведите на столбец — соответствующая строка в списке ниже подсветится.
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
        {showChartExplains ? (
          <ExplainMetricBlock content={isStructure ? chartExplainBundle.structureFactVsPlanRub : chartExplainBundle.upsellCategoriesRub} />
        ) : null}
      </div>

      {isStructure && showChartExplains && balanceDiagnostic ? (
        <div className="space-y-0">
          <SalesPlanExplainStructureBalance diagnostic={balanceDiagnostic} />
          <ExplainMetricBlock content={chartExplainBundle.structureBalance} />
        </div>
      ) : null}

      {isUpsell && showChartExplains && dashboardExplainContext ? (
        <div className="space-y-0">
          <SalesPlanExplainUpsellConvChart rows={dashboardExplainContext.up.convCompare} yMax={dashboardExplainContext.up.convChartYMax} />
          <ExplainMetricBlock content={chartExplainBundle.upsellConversion} />
        </div>
      ) : null}

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
