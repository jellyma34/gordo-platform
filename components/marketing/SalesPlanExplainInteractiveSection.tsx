"use client";

import { useMemo, useState } from "react";

import type {
  ExplainFormulaDetailCard,
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

import { FactVsPlanChart, SalesTempoChart } from "@/components/marketing/salesPlanCharts";
import { ExplainMetricBlock } from "@/components/marketing/ExplainMetricBlock";

const TEMPO_LINE_FORMULA_ORDER: readonly SalesTempoExplainMetricId[] = ["sumPlanFact", "planPerMonth", "actualPerMonth", "tempoNorm"];
const TEMPO_BAR_FORMULA_ORDER: readonly SalesTempoExplainMetricId[] = ["monthlyCompare", "monthlyRatio"];

function pickOrderedTempoFormulaCards(
  cards: ExplainFormulaDetailCard[],
  order: readonly SalesTempoExplainMetricId[],
): ExplainFormulaDetailCard[] {
  const byMetric = new Map<SalesTempoExplainMetricId, ExplainFormulaDetailCard>();
  for (const c of cards) {
    if (c.metricId) byMetric.set(c.metricId, c);
  }
  return order.map((id) => byMetric.get(id)).filter((c): c is ExplainFormulaDetailCard => c != null);
}

function TempoChartFormulasRow({
  cards,
  activeMetricId,
  onHoverMetric,
}: {
  cards: ExplainFormulaDetailCard[];
  activeMetricId: SalesTempoExplainMetricId | null;
  onHoverMetric: (id: SalesTempoExplainMetricId | null) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="mt-3">
      <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Формулы на этом графике</h4>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:gap-3 sm:overflow-x-auto sm:pb-1">
        {cards.map((card, i) => {
          const active = activeMetricId != null && card.metricId === activeMetricId;
          return (
            <div
              key={`${card.metricId ?? `card-${i}`}`}
              className={`min-w-0 flex-1 rounded-lg border border-slate-700/50 bg-slate-950/55 px-2.5 py-2 sm:min-w-[168px] sm:shrink-0 ${
                active ? "ring-2 ring-sky-400/75 ring-offset-2 ring-offset-[#0f172a]" : ""
              } ${card.metricId ? "cursor-default" : ""}`}
              onMouseEnter={() => card.metricId != null && onHoverMetric(card.metricId)}
              onMouseLeave={() => onHoverMetric(null)}
            >
              <div className="text-[10px] font-semibold leading-tight text-slate-200">{card.name}</div>
              <p className="mt-1.5 font-mono text-[9px] leading-snug text-slate-400">{card.formula}</p>
              <p className="mt-1.5 text-[9px] leading-snug text-slate-300">{card.calculation}</p>
            </div>
          );
        })}
      </div>
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

    const lineFormulaSource =
      showChartExplains && chartExplainBundle
        ? [
            ...(chartExplainBundle.salesTempoLine.formulaDetailCards ?? []),
            ...(chartExplainBundle.salesTempoNorm.formulaDetailCards ?? []),
          ]
        : (block.formulaDetailCards ?? []);
    const barFormulaSource =
      showChartExplains && chartExplainBundle
        ? (chartExplainBundle.factVsPlanDeals.formulaDetailCards ?? [])
        : (block.formulaDetailCards ?? []);

    const lineFormulaCards = pickOrderedTempoFormulaCards([...lineFormulaSource], TEMPO_LINE_FORMULA_ORDER);
    const barFormulaCards = pickOrderedTempoFormulaCards([...barFormulaSource], TEMPO_BAR_FORMULA_ORDER);

    return (
      <div
        className="mt-4 space-y-4"
        onMouseLeave={() => {
          setActiveId(null);
          setActiveMetricId(null);
        }}
      >
        <p className="text-[11px] leading-snug text-slate-500">
          Наведите на линию, индикатор темпа или столбец — подсветится формула этого графика в ряду ниже.
        </p>
        <div className="space-y-6">
          <div
            className={
              "rounded-xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            }
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-cyan-200/80">Темп по месяцам</span>
              {lineFormulaCards.some((c) => c.metricId === "sumPlanFact") ? (
                <button
                  type="button"
                  className="rounded border border-cyan-500/25 bg-slate-950/50 px-2 py-0.5 text-[9px] font-medium text-cyan-100/80 hover:bg-cyan-950/40"
                  onMouseEnter={() => setActiveMetricId("sumPlanFact")}
                  onMouseLeave={() => setActiveMetricId(null)}
                >
                  Σ plan_month / Σ fact_month
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
              onExplainMetricHover={setActiveMetricId}
              showVelocityFooter={false}
            />
            <div className="mt-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Что на графике:</h4>
              <ul className="mt-1.5 list-inside list-disc space-y-1 text-[11px] leading-relaxed text-slate-300">
                <li>
                  <span className="font-medium text-slate-200">Линия</span> — скользящий средний факт по месяцам (
                  <span className="font-mono text-[10px] text-slate-400">actualPerMonth</span>).
                </li>
                <li>
                  <span className="font-medium text-slate-200">Пунктир</span> — ровная норма (
                  <span className="font-mono text-[10px] text-slate-400">planPerMonth</span> = Σ plan / N).
                </li>
                <li>
                  <span className="font-medium text-slate-200">Цвет линии</span> — отклонение от нормы (выше / около / ниже
                  плановой планки).
                </li>
              </ul>
            </div>
            <TempoChartFormulasRow cards={lineFormulaCards} activeMetricId={activeMetricId} onHoverMetric={setActiveMetricId} />
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
              activePointId={activeId}
              onPointHover={setActiveId}
              onExplainMetricHover={setActiveMetricId}
              showBottomLegend={false}
            />
            <div className="mt-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Что на графике:</h4>
              <ul className="mt-1.5 list-inside list-disc space-y-1 text-[11px] leading-relaxed text-slate-300">
                <li>
                  <span className="font-medium text-slate-200">Жёлтые столбцы</span> (градиент жёлтый / зелёный / красный
                  по исполнению) — факт периода (<span className="font-mono text-[10px] text-slate-400">fact_month</span>
                  ).
                </li>
                <li>
                  <span className="font-medium text-slate-200">Серые столбцы</span> — план периода (
                  <span className="font-mono text-[10px] text-slate-400">plan_month</span>).
                </li>
              </ul>
            </div>
            <TempoChartFormulasRow cards={barFormulaCards} activeMetricId={activeMetricId} onHoverMetric={setActiveMetricId} />
          </div>
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
