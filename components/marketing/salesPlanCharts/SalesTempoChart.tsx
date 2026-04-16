"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Customized } from "recharts";

import { dec1Fmt, numFmt } from "@/lib/salesPlanChartFormat";
import type { SalesTempoExplainMetricId } from "@/lib/salesPlanExplainMetricIds";
import { TEMPO_LINE_DATAKEY_TO_METRIC } from "@/lib/salesPlanExplainMetricIds";
import {
  velocityFactPlanBarFillId,
  velocityFactPlanWorstIndex,
  type SalesVelocityLineRow,
} from "@/lib/salesPlanVelocityChartData";

import { FormulaVariablesLegend, type FormulaVariableEntry } from "./FormulaVariablesLegend";
import { chartPresentationLike, type SalesPlanChartMode } from "./types";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const ComposedChart = dynamic(() => import("recharts").then((m) => m.ComposedChart), { ssr: false });
const Area = dynamic(() => import("recharts").then((m) => m.Area), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });
const LabelList = dynamic(() => import("recharts").then((m) => m.LabelList), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const ReferenceLine = dynamic(() => import("recharts").then((m) => m.ReferenceLine), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });

export type SalesTempoPresentationDetail = {
  formula: string;
  calculation: string;
  explanation: string;
  interpretation: string;
  variables?: FormulaVariableEntry[];
  sigmaNote?: string;
};

export type SalesTempoLineRow = SalesVelocityLineRow & {
  detailLine?: string;
  presentationDetail?: SalesTempoPresentationDetail;
  planMonth?: number;
};

/** Заглушки воронки — позже подставятся реальные данные. */
const FUNNEL_HYPOTHESIS_PLACEHOLDERS = ["трафик ↓", "конверсия ↓", "продукт ограничен"] as const;

type SalesTempoChartRow = SalesTempoLineRow & {
  factMonth: number;
  planMonthValue: number;
  monthlyDelta: number;
  cumulativeGapRunning: number;
  fact: number;
  plan: number;
  deviation: number;
  pointId: string;
};

function buildSalesTempoChartData(lineData: SalesTempoLineRow[]): SalesTempoChartRow[] {
  let prevRun = 0;
  let runFact = 0;
  let runPlan = 0;
  return lineData.map((row, idx) => {
    const passed = idx + 1;
    const run = row.actualRate * passed;
    const factMonth = run - prevRun;
    prevRun = run;
    const planMonthValue = row.planMonth ?? row.plannedRate;
    const monthlyDelta = factMonth - planMonthValue;
    runFact += factMonth;
    runPlan += planMonthValue;
    const cumulativeGapRunning = runFact - runPlan;
    return {
      ...row,
      factMonth,
      planMonthValue,
      monthlyDelta,
      cumulativeGapRunning,
      fact: factMonth,
      plan: planMonthValue,
      deviation: monthlyDelta,
      pointId: row.periodKey,
    };
  });
}

type SalesTempoCumulativeChartRow = SalesTempoChartRow & {
  x: number;
  areaFill: number | null;
  isSynthetic?: boolean;
};

/** Точки для линии и заливки: дробный x на пересечении с 0, areaFill только для ветки ≤0 (null — нет заливки). */
function buildCumulativeExpandedRows(rows: SalesTempoChartRow[]): SalesTempoCumulativeChartRow[] {
  if (rows.length === 0) return [];
  const out: SalesTempoCumulativeChartRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const c = r.cumulativeGapRunning;
    const areaFill: number | null = c < 0 ? c : c === 0 ? 0 : null;
    out.push({ ...r, x: i, areaFill });

    const next = rows[i + 1];
    if (!next) continue;
    const nc = next.cumulativeGapRunning;
    const crosses = (c < 0 && nc > 0) || (c > 0 && nc < 0);
    if (!crosses) continue;
    const t = c / (c - nc);
    if (t <= 0 || t >= 1) continue;

    out.push({
      ...r,
      isSynthetic: true,
      x: i + t,
      cumulativeGapRunning: 0,
      areaFill: 0,
      label: "",
      periodKey: `${r.periodKey}__cross${i}`,
      pointId: `${r.pointId}__cross${i}`,
      factMonth: 0,
      planMonthValue: 0,
      monthlyDelta: 0,
      fact: 0,
      plan: 0,
      deviation: 0,
    });
  }

  return out;
}

function TempoTooltipMetricBridge({
  active,
  payload,
  onExplainMetricHover,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: unknown }>;
  onExplainMetricHover?: (id: SalesTempoExplainMetricId | null) => void;
}) {
  useLayoutEffect(() => {
    if (!onExplainMetricHover) return;
    if (!active || !payload?.length) {
      onExplainMetricHover(null);
      return;
    }
    const raw = payload[0]?.dataKey;
    const dk = typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
    let id: SalesTempoExplainMetricId | undefined;
    if (dk === "fact" || dk === "factMonth") id = "monthlyCompare";
    else if (dk === "plan" || dk === "planMonthValue") id = "planPerMonth";
    else if (dk) id = TEMPO_LINE_DATAKEY_TO_METRIC[dk];
    onExplainMetricHover(id ?? null);
  }, [active, payload, onExplainMetricHover]);
  return null;
}

function SalesTempoMonthlyTooltip({
  active,
  payload,
  label,
  presentation,
  mode,
  blockExplain,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: SalesTempoChartRow }>;
  label?: string;
  presentation: boolean;
  mode: SalesPlanChartMode;
  blockExplain?: { dataSources: string[]; formulaLines: string[]; howSection?: string };
}) {
  if (!active || !payload?.length) return null;
  const row = payload.map((item) => item?.payload).find(
    (p): p is SalesTempoChartRow => p != null && typeof p.fact === "number" && typeof p.plan === "number",
  );
  if (!row) return null;
  const dev = row.deviation;
  const shell =
    presentation
      ? "max-w-sm rounded-lg border border-sky-500/30 bg-[#0f172a]/95 p-3 text-xs text-slate-200 shadow-[0_0_20px_rgba(56,189,248,0.14)]"
      : "max-w-sm rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-lg";
  return (
    <div className={shell}>
      <div className={`text-[11px] font-bold uppercase tracking-wide ${presentation ? "text-sky-200/90" : "text-sky-800"}`}>
        Факт vs план
      </div>
      <div className={`mt-1 font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>{label ?? row.label}</div>
      <div className="mt-2 space-y-1.5 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Факт</span>
          <span className="font-medium">{numFmt.format(row.fact)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>План</span>
          <span className="font-medium">{numFmt.format(row.plan)}</span>
        </div>
        <div className={`flex justify-between gap-4 border-t pt-1.5 ${presentation ? "border-slate-500/30" : "border-slate-200"}`}>
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Δ (факт − план)</span>
          <span
            className={`font-semibold ${
              dev > 0 ? (presentation ? "text-emerald-300" : "text-emerald-700") : dev < 0 ? (presentation ? "text-rose-300" : "text-rose-700") : presentation ? "text-slate-300" : "text-slate-600"
            }`}
          >
            {dev >= 0 ? "+" : "−"}
            {numFmt.format(Math.abs(Math.round(dev)))}
          </span>
        </div>
      </div>
      {mode === "explain" && blockExplain ? (
        <div className={`mt-3 space-y-2 border-t pt-2 ${presentation ? "border-slate-500/30" : "border-slate-200"}`}>
          {blockExplain.dataSources.length > 0 ? (
            <div>
              <div className={`text-[10px] font-bold uppercase ${presentation ? "text-slate-400" : "text-slate-500"}`}>Источники</div>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[10px] leading-snug">
                {blockExplain.dataSources.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {blockExplain.formulaLines.length > 0 ? (
            <div>
              <div className={`text-[10px] font-bold uppercase ${presentation ? "text-slate-400" : "text-slate-500"}`}>Формулы</div>
              <ol className="mt-1 list-inside list-decimal space-y-0.5 font-mono text-[10px] leading-snug">
                {blockExplain.formulaLines.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {row.detailLine ? (
            <p className={`text-[10px] leading-snug ${presentation ? "text-slate-300" : "text-slate-600"}`}>
              <span className="font-semibold">По точке: </span>
              {row.detailLine}
            </p>
          ) : null}
          {blockExplain.howSection ? (
            <p className={`text-[10px] leading-snug ${presentation ? "text-slate-400" : "text-slate-600"}`}>
              <span className="font-semibold">Как считается: </span>
              {blockExplain.howSection}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SalesTempoPresentationHoverStrip({ row, presentation }: { row: SalesTempoChartRow; presentation: boolean }) {
  const shell = presentation
    ? "pointer-events-none absolute left-2 top-2 z-10 max-w-[min(100%-1rem,200px)] rounded-md border border-cyan-500/35 bg-[#0f172a]/92 px-2 py-1 text-[9px] text-slate-200 shadow-md"
    : "pointer-events-none absolute left-2 top-2 z-10 max-w-[min(100%-1rem,200px)] rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[9px] text-slate-800 shadow-md";
  const d = row.monthlyDelta;
  return (
    <div className={shell}>
      <div className={`font-semibold tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>{row.label}</div>
      <div className={`mt-0.5 tabular-nums ${presentation ? "text-slate-300" : "text-slate-600"}`}>
        ф {numFmt.format(row.factMonth)} / п {numFmt.format(row.planMonthValue)}
      </div>
      <div
        className={`mt-0.5 font-semibold tabular-nums ${
          d >= 0 ? (presentation ? "text-emerald-300" : "text-emerald-700") : presentation ? "text-rose-300" : "text-rose-700"
        }`}
      >
        Δ {d >= 0 ? "+" : "−"}
        {numFmt.format(Math.abs(Math.round(d)))}
      </div>
    </div>
  );
}

function SalesTempoPresentationDetailPanel({
  row,
  presentation,
}: {
  row: SalesTempoChartRow;
  presentation: boolean;
}) {
  const shell = presentation
    ? "rounded-lg border border-cyan-500/30 bg-[#0f172a]/95 p-3 text-[10px] leading-snug text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    : "rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-snug text-slate-800 shadow-sm";
  const d = row.presentationDetail;
  return (
    <div className={shell}>
      <div className={`text-[11px] font-bold uppercase tracking-wide ${presentation ? "text-cyan-200/90" : "text-cyan-800"}`}>Точка: {row.label}</div>
      <div className="mt-2 space-y-1 tabular-nums">
        <div className="flex justify-between gap-2">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Плановый темп</span>
          <span>{dec1Fmt.format(row.plannedRate)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Фактический темп</span>
          <span>{dec1Fmt.format(row.actualRate)}</span>
        </div>
        <div
          className={`flex justify-between gap-2 border-t pt-1 font-medium ${row.rateDelta >= 0 ? (presentation ? "border-slate-500/30 text-emerald-300" : "border-slate-200 text-emerald-700") : presentation ? "border-slate-500/30 text-rose-300" : "border-slate-200 text-rose-700"}`}
        >
          <span>К плану</span>
          <span>
            {row.rateDelta >= 0 ? "+" : "−"}
            {dec1Fmt.format(Math.abs(row.rateDelta))} ({row.rateDeltaPct >= 0 ? "+" : ""}
            {row.rateDeltaPct.toFixed(1)}%)
          </span>
        </div>
      </div>
      {d ? (
        <div className={`mt-3 space-y-2 border-t pt-2 ${presentation ? "border-slate-500/30" : "border-slate-200"}`}>
          <div>
            <div className={`text-[9px] font-bold uppercase ${presentation ? "text-slate-400" : "text-slate-500"}`}>Формула</div>
            <p className="mt-0.5">{d.formula}</p>
            <FormulaVariablesLegend variables={d.variables} sigmaNote={d.sigmaNote} presentation={presentation} />
          </div>
          <div>
            <div className={`text-[9px] font-bold uppercase ${presentation ? "text-slate-400" : "text-slate-500"}`}>Подстановка</div>
            <p className="mt-0.5 font-mono text-[9px]">{d.calculation}</p>
          </div>
          <div>
            <div className={`text-[9px] font-bold uppercase ${presentation ? "text-slate-400" : "text-slate-500"}`}>Пояснение</div>
            <p className="mt-0.5">{d.explanation}</p>
          </div>
          <div>
            <div className={`text-[9px] font-bold uppercase ${presentation ? "text-slate-400" : "text-slate-500"}`}>Интерпретация</div>
            <p className="mt-0.5">{d.interpretation}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type SalesTempoChartProps = {
  mode: SalesPlanChartMode;
  lineData: SalesTempoLineRow[];
  velocityCompletionPct: number;
  actualPerMonth: number;
  activePointId?: string | null;
  onPointHover?: (pointId: string | null) => void;
  /** Explain: подсветка карточки формулы по ряду графика (dataKey → metricId). */
  onExplainMetricHover?: (id: SalesTempoExplainMetricId | null) => void;
  blockExplain?: { dataSources: string[]; formulaLines: string[]; howSection?: string };
  /** Строка «факт / % к норме» под графиком. На explain-странице можно скрыть, если блок вынесен отдельно. */
  showVelocityFooter?: boolean;
  className?: string;
  chartHeightClass?: string;
};

export function SalesTempoChart({
  mode,
  lineData,
  velocityCompletionPct,
  actualPerMonth,
  activePointId = null,
  onPointHover,
  onExplainMetricHover,
  blockExplain,
  showVelocityFooter = true,
  className = "",
  chartHeightClass = "h-[300px]",
}: SalesTempoChartProps) {
  const uid = useId().replace(/:/g, "");
  const presentation = chartPresentationLike(mode);
  const presentationTooltipUx = mode === "presentation";
  const axisColor = presentation ? "#94a3b8" : "#64748b";
  const gridColor = presentation ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";
  const yTickDeals = (v: number) => numFmt.format(v);

  const chartData = useMemo(() => buildSalesTempoChartData(lineData), [lineData]);

  const worstIdx = useMemo(
    () => velocityFactPlanWorstIndex(chartData.map((r) => ({ deviation: r.monthlyDelta }))),
    [chartData],
  );

  const tempoTotals = useMemo(() => {
    if (chartData.length === 0) return { sumFact: 0, sumPlan: 0, totalGap: 0 };
    const sumFact = chartData.reduce((s, r) => s + r.factMonth, 0);
    const sumPlan = chartData.reduce((s, r) => s + r.planMonthValue, 0);
    return { sumFact, sumPlan, totalGap: sumFact - sumPlan };
  }, [chartData]);

  const shortfallBreakdown = useMemo(() => {
    const { totalGap } = tempoTotals;
    const absGap = Math.abs(totalGap);
    const rows = chartData.map((r) => ({
      label: r.label,
      periodKey: r.periodKey,
      delta: r.monthlyDelta,
    }));
    const negative = rows.filter((r) => r.delta < 0);
    if (totalGap >= 0 || absGap === 0 || negative.length === 0) {
      return {
        items: [] as { label: string; periodKey: string; delta: number; contributionPct: number }[],
        remainderPct: 0,
        showRemainder: false,
      };
    }
    const withContribution = negative.map((r) => ({
      ...r,
      contributionRaw: (Math.abs(r.delta) / absGap) * 100,
    }));
    const items = withContribution
      .filter((r) => r.contributionRaw >= 10)
      .sort((a, b) => b.contributionRaw - a.contributionRaw)
      .slice(0, 3)
      .map((r) => ({
        label: r.label,
        periodKey: r.periodKey,
        delta: r.delta,
        contributionPct: Math.round(r.contributionRaw),
      }));
    const sumRounded = items.reduce((s, r) => s + r.contributionPct, 0);
    const remainderPct = Math.max(0, 100 - sumRounded);
    return { items, remainderPct, showRemainder: remainderPct > 0 };
  }, [chartData, tempoTotals]);

  const rootRef = useRef<HTMLDivElement>(null);
  const [hoverTickIndex, setHoverTickIndex] = useState<number | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

  useEffect(() => {
    if (!presentationTooltipUx) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      const t = e.target as Node | null;
      if (!el || !t || !el.contains(t)) setSelectedPoint(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [presentationTooltipUx]);

  const resolveTickIndex = (raw: number | string | undefined) => {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
    const i = Math.round(raw);
    if (i < 0 || i >= chartData.length) return null;
    return i;
  };

  const onPointClick = (idx: number | null) => {
    if (!presentationTooltipUx || idx == null) return;
    if (idx < 0 || idx >= chartData.length) return;
    setSelectedPoint(idx);
  };

  const setHoverFromPayload = (p: unknown) => {
    if (mode !== "explain" || !onPointHover) return;
    const row = p as SalesTempoChartRow;
    const id = row?.pointId ?? row?.periodKey ?? null;
    onPointHover(id);
  };

  const onPlanBarEnter = (p: unknown) => {
    setHoverFromPayload(p);
    if (mode === "explain") onExplainMetricHover?.("planPerMonth");
  };

  const onFactBarEnter = (p: unknown) => {
    setHoverFromPayload(p);
    if (mode === "explain") onExplainMetricHover?.("monthlyCompare");
  };

  const barPresentationClick = (item: { originalDataIndex?: number }, _index: number) => {
    const idx = typeof item.originalDataIndex === "number" ? item.originalDataIndex : _index;
    onPointClick(idx);
  };

  const dim = mode === "explain" && activePointId != null;

  return (
    <div ref={rootRef} className={className}>
      <div className="mb-2">
        <h3 className={`text-sm font-semibold sm:text-base ${presentation ? "text-slate-100" : "text-slate-900"}`}>
          Факт vs план по месяцам
        </h3>
      </div>

      {tempoTotals.totalGap < 0 ? (
        <div className={`mb-2 text-sm font-semibold tabular-nums ${presentation ? "text-rose-200" : "text-rose-800"}`}>
          🔴 Недобор: −{numFmt.format(Math.abs(Math.round(tempoTotals.totalGap)))} сделок
        </div>
      ) : null}
      <div
        className={`mb-3 text-center text-xs font-semibold tabular-nums ${
          tempoTotals.totalGap < 0
            ? presentation
              ? "text-rose-300"
              : "text-rose-700"
            : tempoTotals.totalGap > 0
              ? presentation
                ? "text-emerald-300"
                : "text-emerald-700"
              : presentation
                ? "text-slate-400"
                : "text-slate-600"
        }`}
      >
        Σ факт − Σ план: {tempoTotals.totalGap > 0 ? "+" : tempoTotals.totalGap < 0 ? "−" : ""}
        {numFmt.format(Math.abs(Math.round(tempoTotals.totalGap)))} сделок
      </div>

      <div className={`flex flex-col gap-4 xl:flex-row xl:items-start ${presentationTooltipUx ? "xl:gap-4" : ""}`}>
        <div className="min-w-0 flex-1">
          <div className={`relative ${chartHeightClass}`}>
            <div
              aria-hidden
              className={
                presentation
                  ? "pointer-events-none absolute inset-0 z-0 rounded-lg bg-[radial-gradient(circle_at_50%_62%,rgba(250,204,21,0.14)_0%,rgba(250,204,21,0.04)_38%,rgba(15,23,42,0)_74%)]"
                  : "pointer-events-none absolute inset-0 z-0 rounded-lg bg-[radial-gradient(circle_at_50%_62%,rgba(250,204,21,0.1)_0%,rgba(250,204,21,0.03)_36%,rgba(255,255,255,0)_72%)]"
              }
            />
            {presentationTooltipUx && hoverTickIndex != null && chartData[hoverTickIndex] ? (
              <SalesTempoPresentationHoverStrip row={chartData[hoverTickIndex]!} presentation={presentation} />
            ) : null}
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 28, right: 10, left: 0, bottom: 8 }}
                barGap="-100%"
                barCategoryGap="14%"
                onClick={(state) => {
                  if (!presentationTooltipUx) return;
                  const raw =
                    state && typeof state === "object" && "activeTooltipIndex" in state
                      ? (state as { activeTooltipIndex?: number }).activeTooltipIndex
                      : undefined;
                  const idx = resolveTickIndex(raw);
                  if (idx != null) onPointClick(idx);
                }}
                onMouseMove={(s) => {
                  const idx = resolveTickIndex(s.activeTooltipIndex as number | undefined);
                  if (presentationTooltipUx) setHoverTickIndex(idx);
                  if (mode === "explain" && idx != null && chartData[idx]) {
                    onPointHover?.(chartData[idx]!.periodKey ?? null);
                  }
                }}
                onMouseLeave={() => {
                  if (mode === "explain") {
                    onPointHover?.(null);
                    onExplainMetricHover?.(null);
                  }
                  if (presentationTooltipUx) setHoverTickIndex(null);
                }}
              >
                <defs>
                  <linearGradient id={`${uid}-barGreen`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#bbf7d0" />
                    <stop offset="40%" stopColor="#4ade80" />
                    <stop offset="100%" stopColor="#15803d" />
                  </linearGradient>
                  <linearGradient id={`${uid}-barYellow`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fef9c3" />
                    <stop offset="45%" stopColor="#facc15" />
                    <stop offset="100%" stopColor="#a16207" />
                  </linearGradient>
                  <linearGradient id={`${uid}-barRed`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fecdd3" />
                    <stop offset="50%" stopColor="#f87171" />
                    <stop offset="100%" stopColor="#b91c1c" />
                  </linearGradient>
                  <filter id={`${uid}-barSoftGlow`} x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="2.4" result="bg" />
                    <feMerge>
                      <feMergeNode in="bg" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} />
                <YAxis tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={40} tickFormatter={yTickDeals} />
                {presentationTooltipUx ? (
                  <Tooltip
                    content={() => null}
                    cursor={{ fill: presentation ? "rgba(148,163,184,0.07)" : "rgba(100,116,139,0.08)" }}
                    wrapperStyle={{ display: "none", pointerEvents: "none" }}
                  />
                ) : (
                  <Tooltip
                    content={({ active, payload, label }) => (
                      <>
                        {onExplainMetricHover ? (
                          <TempoTooltipMetricBridge active={active} payload={payload} onExplainMetricHover={onExplainMetricHover} />
                        ) : null}
                        <SalesTempoMonthlyTooltip
                          active={active}
                          payload={payload}
                          label={label != null ? String(label) : undefined}
                          presentation={presentation}
                          mode={mode}
                          blockExplain={blockExplain}
                        />
                      </>
                    )}
                  />
                )}
                <Bar
                  dataKey="plan"
                  name="План"
                  fill={presentation ? "rgba(255,255,255,0.38)" : "rgba(71,85,105,0.38)"}
                  stroke={presentation ? "rgba(255,255,255,0.22)" : "rgba(100,116,139,0.4)"}
                  strokeWidth={0.9}
                  maxBarSize={36}
                  radius={[8, 8, 2, 2]}
                  isAnimationActive={false}
                  onMouseEnter={mode === "explain" ? onPlanBarEnter : undefined}
                  onClick={presentationTooltipUx ? barPresentationClick : undefined}
                >
                  {presentationTooltipUx
                    ? chartData.map((entry, index) => {
                        const sel = selectedPoint === index;
                        return (
                          <Cell
                            key={`plan-${entry.periodKey}`}
                            fill={presentation ? "rgba(255,255,255,0.38)" : "rgba(71,85,105,0.38)"}
                            stroke={sel ? "#7dd3fc" : presentation ? "rgba(255,255,255,0.22)" : "rgba(100,116,139,0.4)"}
                            strokeWidth={sel ? 2.4 : 0.9}
                          />
                        );
                      })
                    : mode === "explain"
                      ? chartData.map((entry, index) => {
                          const pid = entry.pointId;
                          const on = !dim || activePointId === pid;
                          const glow = activePointId === pid;
                          return (
                            <Cell
                              key={`plan-${entry.periodKey}`}
                              fill={presentation ? "rgba(255,255,255,0.38)" : "rgba(71,85,105,0.38)"}
                              fillOpacity={on ? 1 : 0.28}
                              stroke={glow ? (presentation ? "#e2e8f0" : "#475569") : presentation ? "rgba(255,255,255,0.22)" : "rgba(100,116,139,0.4)"}
                              strokeWidth={glow ? 2.2 : 0.9}
                            />
                          );
                        })
                      : null}
                </Bar>
                <Bar
                  dataKey="fact"
                  name="Факт"
                  fill={`url(#${uid}-barYellow)`}
                  maxBarSize={24}
                  radius={[7, 7, 2, 2]}
                  style={{ filter: `url(#${uid}-barSoftGlow)` }}
                  isAnimationActive={false}
                  onMouseEnter={mode === "explain" ? onFactBarEnter : undefined}
                  onClick={presentationTooltipUx ? barPresentationClick : undefined}
                >
                  {chartData.map((entry, index) => {
                    const pid = entry.pointId;
                    const isWorst = index === worstIdx && worstIdx >= 0;
                    const baseFill = velocityFactPlanBarFillId(uid, entry);
                    const explainDim = mode === "explain" && dim && activePointId !== pid;
                    const glow = mode === "explain" && activePointId === pid;
                    const presSel = presentationTooltipUx && selectedPoint === index;
                    return (
                      <Cell
                        key={`fact-${entry.periodKey}`}
                        fill={baseFill}
                        fillOpacity={explainDim ? 0.35 : 1}
                        stroke={
                          presSel
                            ? "#e0f2fe"
                            : glow
                              ? "#38bdf8"
                              : isWorst
                                ? presentation
                                  ? "#fda4af"
                                  : "#e11d48"
                                : presentation
                                  ? "rgba(255,255,255,0.35)"
                                  : "rgba(248,250,252,0.65)"
                        }
                        strokeWidth={presSel ? 3.1 : glow ? 3 : isWorst ? 2.75 : 1.1}
                        style={
                          presSel
                            ? { filter: "drop-shadow(0 0 14px rgba(56,189,248,0.55))" }
                            : glow
                              ? { filter: "drop-shadow(0 0 12px rgba(56,189,248,0.65))" }
                              : isWorst
                                ? { filter: "drop-shadow(0 0 10px rgba(244,63,94,0.75))" }
                                : undefined
                        }
                      />
                    );
                  })}
                  <LabelList
                    dataKey="fact"
                    content={(props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
                      const idx = props.index;
                      if (idx == null || idx < 0 || idx >= chartData.length) return null;
                      const row = chartData[idx]!;
                      const d = row.monthlyDelta;
                      const text = `${d >= 0 ? "+" : "−"}${numFmt.format(Math.abs(Math.round(d)))}`;
                      const x = typeof props.x === "number" ? props.x : Number(props.x);
                      const y = typeof props.y === "number" ? props.y : Number(props.y);
                      const w = typeof props.width === "number" ? props.width : Number(props.width);
                      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w)) return null;
                      const cx = x + w / 2;
                      const cy = y - 6;
                      const fill = d >= 0 ? (presentation ? "#86efac" : "#166534") : presentation ? "#fda4af" : "#be123c";
                      return (
                        <text x={cx} y={cy} textAnchor="middle" fill={fill} fontSize={9} className="font-semibold tabular-nums">
                          {text}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {presentationTooltipUx ? (
          <aside className="w-full shrink-0 xl:sticky xl:top-2 xl:w-[min(280px,34%)] xl:max-w-[280px]" aria-label="Подробности по выбранной точке">
            {selectedPoint != null && chartData[selectedPoint] ? (
              <SalesTempoPresentationDetailPanel row={chartData[selectedPoint]!} presentation={presentation} />
            ) : (
              <div
                className={
                  presentation
                    ? "rounded-lg border border-cyan-500/20 bg-[#0f172a]/55 p-3 text-[10px] leading-snug text-slate-400"
                    : "rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px] leading-snug text-slate-600"
                }
              >
                Кликните по столбцу месяца, чтобы открыть подробную аналитику.
              </div>
            )}
          </aside>
        ) : null}
      </div>

      <p className={`mt-2 text-[10px] leading-snug ${presentation ? "text-slate-500" : "text-slate-500"}`}>
        Run rate сглаживает значения. Нарастающий итог отклонения — в графике справа.
      </p>

      <div
        className={`mt-2 text-left text-[11px] leading-snug ${
          presentation ? "text-slate-300" : "text-slate-700"
        }`}
      >
        {tempoTotals.totalGap < 0 ? (
          <>
            <div className={`mt-2 font-medium ${presentation ? "text-slate-200" : "text-slate-800"}`}>Основной вклад:</div>
            {shortfallBreakdown.items.length > 0 ? (
              <div className="mt-1.5 space-y-2.5">
                {shortfallBreakdown.items.map((m, idx) => (
                  <div
                    key={m.periodKey}
                    className={`rounded-md border px-2 py-1.5 ${
                      presentation ? "border-slate-600/40 bg-slate-950/30" : "border-slate-200 bg-slate-50/80"
                    } ${idx > 0 ? "mt-1" : ""}`}
                  >
                    <div className={`font-medium ${presentation ? "text-slate-100" : "text-slate-900"}`}>{m.label.toLowerCase()}:</div>
                    <div className="tabular-nums">
                      −{numFmt.format(Math.abs(Math.round(m.delta)))} сделок ({m.contributionPct}%)
                    </div>
                    <div
                      className={`mt-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                        presentation ? "text-slate-400" : "text-slate-500"
                      }`}
                    >
                      Причина (гипотеза):
                    </div>
                    <div className={`text-[10px] ${presentation ? "text-slate-400" : "text-slate-600"}`}>Причина:</div>
                    <ul
                      className={`mt-0.5 list-inside list-disc space-y-0.5 pl-0.5 text-[10px] ${
                        presentation ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      {FUNNEL_HYPOTHESIS_PLACEHOLDERS.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
            {shortfallBreakdown.showRemainder ? (
              <div className={`mt-1.5 tabular-nums ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                прочее: {shortfallBreakdown.remainderPct}%
              </div>
            ) : null}
            <p className={`mt-2 text-[10px] leading-snug ${presentation ? "text-slate-500" : "text-slate-500"}`}>
              Причина требует данных воронки (leads, conversion, availability)
            </p>
          </>
        ) : (
          <div className={`mt-2 ${presentation ? "text-emerald-300/95" : "text-emerald-800"}`}>
            🟢 Отклонений нет, план выполняется
          </div>
        )}
      </div>

      {showVelocityFooter ? (
        <div className={`flex h-[18px] items-center justify-center gap-x-3 text-[10px] font-medium leading-tight ${presentation ? "text-slate-400" : "text-slate-600"}`}>
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${presentation ? "bg-slate-300" : "bg-slate-500"}`} />
            <span>Факт</span>
          </span>
          <span aria-hidden>—</span>
          <span className="tabular-nums">{velocityCompletionPct}%</span>
          <span className={`font-semibold tabular-nums ${presentation ? "text-amber-200" : "text-amber-700"}`}>
            {dec1Fmt.format(actualPerMonth)} сделок
          </span>
        </div>
      ) : null}
    </div>
  );
}

export type SalesTempoCumulativeChartProps = {
  mode: SalesPlanChartMode;
  lineData: SalesTempoLineRow[];
  className?: string;
  /** Высота как у основного аналитического графика */
  chartHeightClass?: string;
};

export function SalesTempoCumulativeChart({
  mode,
  lineData,
  className = "",
  chartHeightClass = "h-[min(420px,55vh)]",
}: SalesTempoCumulativeChartProps) {
  const uid = useId().replace(/:/g, "");
  const presentation = chartPresentationLike(mode);
  const axisColor = presentation ? "#94a3b8" : "#64748b";
  const gridColor = presentation ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";
  const yTickDeals = (v: number) => numFmt.format(v);
  const chartData = useMemo(() => buildSalesTempoChartData(lineData), [lineData]);
  const expandedData = useMemo(() => buildCumulativeExpandedRows(chartData), [chartData]);
  const lastMonthIdx = chartData.length - 1;
  const firstCum = chartData[0]?.cumulativeGapRunning;
  const lastRow = lastMonthIdx >= 0 ? chartData[lastMonthIdx]! : null;
  const lastCum = lastRow?.cumulativeGapRunning ?? 0;
  const lastRealExpandedIdx = useMemo(() => {
    const lastPk = chartData[lastMonthIdx]?.periodKey;
    if (!lastPk) return -1;
    for (let i = expandedData.length - 1; i >= 0; i--) {
      const row = expandedData[i]!;
      if (!row.isSynthetic && row.periodKey === lastPk) return i;
    }
    return expandedData.length - 1;
  }, [chartData, expandedData, lastMonthIdx]);
  const showTrendNote =
    chartData.length >= 2 &&
    firstCum !== undefined &&
    lastCum < 0 &&
    lastCum < firstCum;

  const lineStroke = presentation ? "#fb7185" : "#e11d48";
  const lineFill = presentation ? "#fb7185" : "#e11d48";
  const xTicks = useMemo(() => chartData.map((_, i) => i), [chartData]);
  const xDomainMax = useMemo(() => {
    if (expandedData.length === 0) return 0;
    return Math.max(...expandedData.map((r) => r.x));
  }, [expandedData]);

  return (
    <div className={className}>
      <div className={`relative ${chartHeightClass}`}>
        <div
          aria-hidden
          className={
            presentation
              ? "pointer-events-none absolute inset-0 z-0 rounded-lg bg-[radial-gradient(circle_at_50%_40%,rgba(251,113,133,0.12)_0%,rgba(251,113,133,0.04)_40%,rgba(15,23,42,0)_72%)]"
              : "pointer-events-none absolute inset-0 z-0 rounded-lg bg-[radial-gradient(circle_at_50%_40%,rgba(225,29,72,0.08)_0%,rgba(225,29,72,0.03)_38%,rgba(255,255,255,0)_70%)]"
          }
        />
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={expandedData} margin={{ top: 20, right: 16, left: 4, bottom: 10 }}>
            <Customized
              component={(props: unknown) => {
                const clipProps = props as {
                  yAxisMap?: Record<string, { scale: (v: number) => number }>;
                  offset?: { top: number; left: number; width: number; height: number };
                };
                const { yAxisMap, offset } = clipProps;
                if (!yAxisMap || !offset) return null;
                const yAxis = Object.values(yAxisMap)[0];
                if (!yAxis?.scale) return null;
                const y0 = yAxis.scale(0);
                const plotBottom = offset.top + offset.height;
                const h = Math.max(0, plotBottom - y0);
                return (
                  <defs>
                    <clipPath id={`${uid}-cumBelowPlan`}>
                      <rect x={offset.left} y={y0} width={offset.width} height={h} />
                    </clipPath>
                  </defs>
                );
              }}
            />
            <defs>
              <linearGradient id={`${uid}-areaBelowZero`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={presentation ? "#fb7185" : "#e11d48"} stopOpacity={0.58} />
                <stop offset="38%" stopColor={presentation ? "#f43f5e" : "#be123c"} stopOpacity={0.34} />
                <stop offset="100%" stopColor="#881337" stopOpacity={0.1} />
              </linearGradient>
              <filter id={`${uid}-cumulativeGlow`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="bg" />
                <feMerge>
                  <feMergeNode in="bg" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, xDomainMax]}
              ticks={xTicks}
              allowDecimals
              tick={{ fill: axisColor, fontSize: 10 }}
              axisLine={{ stroke: gridColor }}
              tickLine={false}
              tickFormatter={(v) => chartData[Math.round(Number(v))]?.label ?? ""}
            />
            <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} width={44} tickFormatter={yTickDeals} />
            <ReferenceLine
              y={0}
              stroke={presentation ? "#e2e8f0" : "#334155"}
              strokeWidth={2.25}
              strokeDasharray="10 7"
              label={{
                value: "План (0)",
                position: "insideTopRight",
                fill: axisColor,
                fontSize: 10,
                fontWeight: 600,
              }}
            />
            <Area
              type="monotone"
              dataKey="areaFill"
              stroke="none"
              fill={`url(#${uid}-areaBelowZero)`}
              fillOpacity={1}
              baseLine={0}
              connectNulls={false}
              isAnimationActive={false}
              clipPath={`url(#${uid}-cumBelowPlan)`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as SalesTempoCumulativeChartRow | undefined;
                if (!row) return null;
                const shell = presentation
                  ? "rounded-md border border-slate-600/50 bg-[#0f172a]/95 px-2.5 py-1.5 text-[11px] text-slate-200 shadow-md"
                  : "rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-800 shadow-md";
                const title = row.isSynthetic ? "Пересечение плана" : row.label;
                return (
                  <div className={shell}>
                    <div className="font-semibold">{title}</div>
                    <div className={`mt-0.5 tabular-nums ${presentation ? "text-slate-400" : "text-slate-500"}`}>
                      Кумулятив: {row.cumulativeGapRunning >= 0 ? "+" : "−"}
                      {numFmt.format(Math.abs(Math.round(row.cumulativeGapRunning)))}
                    </div>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="cumulativeGapRunning"
              name="Нарастающий разрыв"
              stroke={lineStroke}
              strokeWidth={presentation ? 4.25 : 4}
              strokeLinecap="round"
              strokeLinejoin="round"
              isAnimationActive={false}
              dot={(dotProps: { cx?: number; cy?: number; index?: number }) => {
                const { cx, cy, index } = dotProps;
                if (cx == null || cy == null || index == null) return null;
                const pt = expandedData[index];
                if (pt?.isSynthetic) return null;
                const isLast = index === lastRealExpandedIdx && lastRealExpandedIdx >= 0;
                if (isLast) {
                  const v = Math.round(lastCum);
                  const label = `${v >= 0 ? "+" : "−"}${numFmt.format(Math.abs(v))} сделок`;
                  return (
                    <g style={{ filter: `url(#${uid}-cumulativeGlow)` }}>
                      <circle cx={cx} cy={cy} r={16} fill={lineFill} stroke={presentation ? "#0f172a" : "#fff"} strokeWidth={3} />
                      <text
                        x={cx}
                        y={cy - 22}
                        textAnchor="middle"
                        fill={presentation ? "#fecdd3" : "#9f1239"}
                        fontSize={12}
                        className="font-bold tabular-nums"
                      >
                        {label}
                      </text>
                    </g>
                  );
                }
                return <circle cx={cx} cy={cy} r={3.5} fill={lineFill} stroke={presentation ? "rgba(15,23,42,0.9)" : "#fff"} strokeWidth={1} />;
              }}
              activeDot={{ r: 10, stroke: presentation ? "#0f172a" : "#fff", strokeWidth: 2.5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {showTrendNote ? (
        <p
          className={`mt-2 text-center text-[11px] font-semibold leading-snug ${
            presentation ? "text-rose-200/95" : "text-rose-700"
          }`}
        >
          Тренд ухудшается с января
        </p>
      ) : null}
    </div>
  );
}
