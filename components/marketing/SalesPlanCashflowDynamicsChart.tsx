"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import {
  CASHFLOW_PLAN_FROM_REVENUE_RATIO,
  cashflowRowsForChart,
  type CashflowChartMode,
  type CashflowChartRow,
  type CashflowSeriesRow,
} from "@/lib/buildCashflowSeries";
import { formatCompactCashflowRub, numFmt } from "@/lib/salesPlanChartFormat";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const Customized = dynamic(() => import("recharts").then((m) => m.Customized), { ssr: false });

function formatRubLabel(n: number): string {
  return `${numFmt.format(Math.round(n))} ₽`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Если на одной точке обе подписи и точки близко по Y — скрываем подпись плана. */
const SAME_INDEX_HIDE_PLAN_IF_Y_WITHIN_PX = 28;
const LABEL_OFFSET_ABOVE_PT = 14;
const X_SHIFT_FACT = -4;
const X_SHIFT_PLAN = 4;
const APPROX_LABEL_HALF_H = 7;
const CHART_LABEL_FONT_PX = 12;

/** Индексы: первая, последняя, макс., мин. (по значению ряда). */
function smartLabelIndices(values: number[]): Set<number> {
  const n = values.length;
  if (n === 0) return new Set();
  if (n === 1) return new Set([0]);
  let maxIdx = 0;
  let minIdx = 0;
  for (let i = 1; i < n; i++) {
    if (values[i]! > values[maxIdx]!) maxIdx = i;
    if (values[i]! < values[minIdx]!) minIdx = i;
  }
  return new Set([0, n - 1, maxIdx, minIdx]);
}

function CashflowTooltip({
  active,
  payload,
  presentation,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: CashflowChartRow }>;
  presentation: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CashflowChartRow | undefined;
  if (!row) return null;
  const base = presentation ? "border-slate-500/45 bg-[#0b1220]/95 text-slate-100" : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-lg px-3 py-2 text-xs shadow-lg ring-1 ${base}`}>
      <div className={`font-semibold ${presentation ? "text-slate-200" : "text-slate-800"}`}>{row.label}</div>
      <div className={`mt-1.5 text-[12px] font-medium leading-snug tabular-nums ${presentation ? "text-slate-200" : "text-slate-800"}`}>
        <span className="text-[#1e40af]">Факт: {formatRubLabel(row.fact)}</span>
        <span className={presentation ? "text-slate-500" : "text-slate-400"}> / </span>
        <span className="text-orange-500">План: {formatRubLabel(row.plan)}</span>
      </div>
      <div className={`mt-2 flex justify-between gap-4 border-t pt-1.5 tabular-nums ${presentation ? "border-slate-600/40" : "border-slate-200"}`}>
        <span className={presentation ? "text-slate-400" : "text-slate-500"}>Отклонение</span>
        <span className={row.deviation >= 0 ? "text-emerald-400" : "text-rose-400"}>{formatRubLabel(row.deviation)}</span>
      </div>
    </div>
  );
}

function resolveCategoryCenterX(
  xAxis: { scale?: (v: string) => number; bandwidth?: () => number } | undefined,
  label: string,
  index: number,
  offset: { left: number; width: number },
  n: number,
): number {
  if (xAxis?.scale) {
    try {
      const pos = xAxis.scale(label);
      if (typeof pos === "number" && Number.isFinite(pos)) {
        const bw = typeof xAxis.bandwidth === "function" ? xAxis.bandwidth() : 0;
        return offset.left + pos + (bw > 0 ? bw / 2 : 0);
      }
    } catch {
      /* fallback */
    }
  }
  return offset.left + ((index + 0.5) / Math.max(1, n)) * offset.width;
}

type AxisMapsProps = {
  xAxisMap?: Record<string, { scale: (v: string) => number; bandwidth?: () => number }>;
  yAxisMap?: Record<string, { scale: (v: number) => number }>;
  offset?: { top: number; left: number; width: number; height: number };
  width?: number;
  height?: number;
};

function buildCashflowLabelLayer(
  chartData: CashflowChartRow[],
  presentation: boolean,
  showFactIndices: Set<number>,
  showPlanIndices: Set<number>,
) {
  return function CashflowValueLabelsLayer(props: AxisMapsProps) {
    const { xAxisMap, yAxisMap, offset, width: svgWidth, height: svgHeight } = props;
    if (!offset || !yAxisMap) return null;
    const yAxis = Object.values(yAxisMap)[0];
    const xAxis = xAxisMap ? Object.values(xAxisMap)[0] : undefined;
    if (!yAxis?.scale) return null;

    const n = chartData.length;
    const plotRight = offset.left + offset.width;
    const plotBottom = offset.top + offset.height;
    const innerW = typeof svgWidth === "number" && svgWidth > 0 ? svgWidth : plotRight + 12;
    const innerH = typeof svgHeight === "number" && svgHeight > 0 ? svgHeight : plotBottom + 12;
    const padX = 4;
    const padY = 4;

    return (
      <g pointerEvents="none">
        {chartData.map((row, i) => {
          const cx = resolveCategoryCenterX(xAxis, row.label, i, offset, n);
          const yFactPt = yAxis.scale(row.fact);
          const yPlanPt = yAxis.scale(row.plan);
          if (!Number.isFinite(yFactPt) || !Number.isFinite(yPlanPt)) return null;

          let drawFact = showFactIndices.has(i);
          let drawPlan = showPlanIndices.has(i);
          if (drawFact && drawPlan && Math.abs(yFactPt - yPlanPt) < SAME_INDEX_HIDE_PLAN_IF_Y_WITHIN_PX) {
            drawPlan = false;
          }

          let factY = yFactPt - LABEL_OFFSET_ABOVE_PT;
          let planY = yPlanPt - LABEL_OFFSET_ABOVE_PT;

          let factX = cx + X_SHIFT_FACT;
          let planX = cx + X_SHIFT_PLAN;
          factX = clamp(factX, padX + APPROX_LABEL_HALF_H, innerW - padX - APPROX_LABEL_HALF_H);
          planX = clamp(planX, padX + APPROX_LABEL_HALF_H, innerW - padX - APPROX_LABEL_HALF_H);

          factY = clamp(factY, padY + APPROX_LABEL_HALF_H, innerH - padY - APPROX_LABEL_HALF_H);
          planY = clamp(planY, padY + APPROX_LABEL_HALF_H, innerH - padY - APPROX_LABEL_HALF_H);

          return (
            <g key={`${row.periodKey}-${i}`}>
              {drawFact ? (
                <text
                  x={factX}
                  y={factY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={presentation ? "#93c5fd" : "#1e40af"}
                  fontSize={CHART_LABEL_FONT_PX}
                  fontWeight={500}
                  className="tabular-nums"
                >
                  {formatCompactCashflowRub(row.fact)}
                </text>
              ) : null}
              {drawPlan ? (
                <text
                  x={planX}
                  y={planY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={presentation ? "#fdba74" : "#c2410c"}
                  fontSize={CHART_LABEL_FONT_PX}
                  fontWeight={500}
                  className="tabular-nums"
                >
                  {formatCompactCashflowRub(row.plan)}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    );
  };
}

type Props = {
  rows: CashflowSeriesRow[];
  planScale: number;
  presentation: boolean;
};

export function SalesPlanCashflowDynamicsChart({ rows, planScale, presentation }: Props) {
  const [mode, setMode] = useState<CashflowChartMode>("monthly");

  const chartData = useMemo(() => cashflowRowsForChart(rows, mode, planScale), [rows, mode, planScale]);

  const yDomain = useMemo((): [number, number] => {
    const vals = chartData.flatMap((d) => [d.fact, d.plan]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || Math.max(Math.abs(max), 1) * 0.05;
    const pad = span * 0.14;
    return [min - pad, max + pad];
  }, [chartData]);

  const toggleClass = (active: boolean) =>
    presentation
      ? active
        ? "bg-slate-700/80 text-slate-100 ring-1 ring-slate-500/50"
        : "text-slate-400 ring-1 ring-slate-600/60 hover:bg-slate-800/80"
      : active
        ? "bg-slate-900 text-white"
        : "text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50";

  const { showFactIndices, showPlanIndices } = useMemo(() => {
    const facts = chartData.map((d) => d.fact);
    const plans = chartData.map((d) => d.plan);
    return {
      showFactIndices: smartLabelIndices(facts),
      showPlanIndices: smartLabelIndices(plans),
    };
  }, [chartData]);

  const labelLayer = useMemo(
    () => buildCashflowLabelLayer(chartData, presentation, showFactIndices, showPlanIndices),
    [chartData, presentation, showFactIndices, showPlanIndices],
  );

  if (chartData.length === 0) {
    return (
      <div
        className={
          presentation
            ? "rounded-xl border border-slate-600/45 bg-[#1e293b]/80 p-4 text-sm text-slate-400"
            : "rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"
        }
      >
        Нет данных поступлений по месяцам для графика.
      </div>
    );
  }

  const gridStroke = presentation ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.35)";
  const axisColor = presentation ? "#94a3b8" : "#64748b";

  return (
    <div
      className={
        presentation
          ? "mb-7 overflow-visible rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5"
          : "mb-7 overflow-visible rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      }
    >
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className={`text-sm font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>Динамика поступлений, ₽</h3>
          <p className={`mt-0.5 text-[11px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>
            План и факт поступлений на эскроу (без сделок). План: из помесячного плана выручки × {CASHFLOW_PLAN_FROM_REVENUE_RATIO}.
          </p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg p-0.5 ring-1 ring-inset ring-slate-600/40">
          <button
            type="button"
            onClick={() => setMode("monthly")}
            className={`rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition ${toggleClass(mode === "monthly")}`}
          >
            Помесячно
          </button>
          <button
            type="button"
            onClick={() => setMode("cumulative")}
            className={`rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition ${toggleClass(mode === "cumulative")}`}
          >
            Нарастающим итогом
          </button>
        </div>
      </div>

      <div className="min-w-0 overflow-visible overflow-x-visible overflow-y-visible pt-6 pb-4">
        <div className="h-[320px] min-h-[320px] w-full overflow-visible [&_svg]:overflow-visible">
          <ResponsiveContainer
            width="100%"
            height="100%"
            className="!overflow-visible [&_svg]:overflow-visible"
            style={{ overflow: "visible" }}
          >
            <LineChart data={chartData} margin={{ top: 24, right: 10, left: 4, bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} axisLine={{ stroke: gridStroke }} tickLine={false} />
            <YAxis
              domain={yDomain}
              tick={{ fill: axisColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${numFmt.format(Math.round(v as number))}`}
              width={56}
            />
            <Tooltip content={<CashflowTooltip presentation={presentation} />} cursor={{ stroke: presentation ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.35)" }} />
            <Line
              type="monotone"
              dataKey="fact"
              name="Факт"
              stroke="#1e40af"
              strokeWidth={2.25}
              dot={{ r: 4, fill: "#1e40af", stroke: presentation ? "#0f172a" : "#fff", strokeWidth: 1 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="plan"
              name="План"
              stroke="#ea580c"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3.5, fill: "#ea580c", stroke: presentation ? "#0f172a" : "#fff", strokeWidth: 1 }}
              activeDot={{ r: 4.5 }}
              isAnimationActive={false}
            />
            <Customized component={labelLayer} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`mt-3 flex flex-wrap items-center gap-4 text-[10px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-6 rounded bg-[#1e40af]" />
          Факт
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-6 rounded border border-dashed border-orange-500 bg-transparent" />
          План
        </span>
      </div>
    </div>
  );
}
