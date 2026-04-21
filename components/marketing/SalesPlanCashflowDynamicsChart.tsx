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
import { formatCashflowDynamicsChartLabel, numFmt } from "@/lib/salesPlanChartFormat";
import { useMarketingPresVisual } from "@/components/marketing/marketingPresentationLightContext";

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

/** Базовый отступ подписи от точки (пикс.). */
const LABEL_OFFSET_FROM_POINT_PX = 14;
/** Если расстояние между фактом и планом на экране меньше — доп. сдвиг подписей (светлая презентация). */
const Y_POINT_PROXIMITY_THRESHOLD_PX = 26;
const PRES_LIGHT_PROXIMITY_EXTRA_PX = 12;
const PROXIMITY_EXTRA_SCALE = 0.72;
const X_SHIFT_FACT = -4;
const X_SHIFT_PLAN = 4;
const CHART_LABEL_FONT_PX = 11;
const APPROX_LABEL_H_PX = CHART_LABEL_FONT_PX + 3;
const CHART_MARGIN_TOP_LIGHT_LABELS = 40;

function approxLabelWidthPx(text: string, fontPx: number): number {
  return Math.max(fontPx * 2, text.length * fontPx * 0.58);
}

function centeredRectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ay - by) < (ah + bh) / 2;
}

function CashflowTooltip({
  active,
  payload,
  darkChrome,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: CashflowChartRow }>;
  darkChrome: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CashflowChartRow | undefined;
  if (!row) return null;
  const base = darkChrome ? "border-slate-500/45 bg-[#0b1220]/95 text-slate-100" : "border-mpl-border bg-mpl-card text-mpl-text";
  return (
    <div className={`rounded-lg px-3 py-2 text-xs shadow-lg ring-1 ${base}`}>
      <div className={`font-semibold ${darkChrome ? "text-slate-200" : "text-mpl-text"}`}>{row.label}</div>
      <div className={`mt-1.5 text-[12px] font-medium leading-snug tabular-nums ${darkChrome ? "text-slate-200" : "text-mpl-text"}`}>
        <span className="text-[#1e40af]">Факт: {formatRubLabel(row.fact)}</span>
        <span className={darkChrome ? "text-slate-500" : "text-mpl-muted"}> / </span>
        <span className="text-orange-500">План: {formatRubLabel(row.plan)}</span>
      </div>
      <div className={`mt-2 flex justify-between gap-4 border-t pt-1.5 tabular-nums ${darkChrome ? "border-slate-600/40" : "border-mpl-border"}`}>
        <span className={darkChrome ? "text-slate-400" : "text-mpl-muted"}>Отклонение</span>
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

function buildCashflowLabelLayer(chartData: CashflowChartRow[], presDark: boolean) {
  const presLight = !presDark;
  const factFill = presDark ? "#93c5fd" : "#1D4ED8";
  const planFill = presDark ? "#fdba74" : "#EA580C";

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
    const padX = 8;
    const padY = 6;
    const halfH = APPROX_LABEL_H_PX / 2;

    return (
      <g pointerEvents="none">
        {chartData.map((row, i) => {
          const cx = resolveCategoryCenterX(xAxis, row.label, i, offset, n);
          const yFactPt = yAxis.scale(row.fact);
          const yPlanPt = yAxis.scale(row.plan);
          if (!Number.isFinite(yFactPt) || !Number.isFinite(yPlanPt)) return null;

          const dyPts = Math.abs(yFactPt - yPlanPt);
          let off = LABEL_OFFSET_FROM_POINT_PX;
          let proximityBump = 0;
          if (presLight) {
            proximityBump = dyPts < Y_POINT_PROXIMITY_THRESHOLD_PX ? PRES_LIGHT_PROXIMITY_EXTRA_PX : 0;
          } else {
            const extra =
              dyPts < Y_POINT_PROXIMITY_THRESHOLD_PX
                ? (Y_POINT_PROXIMITY_THRESHOLD_PX - dyPts) * PROXIMITY_EXTRA_SCALE
                : 0;
            off += extra;
          }

          let factY = yFactPt - off - proximityBump;
          let planY = yPlanPt + off + proximityBump;

          let factX = cx + X_SHIFT_FACT;
          let planX = cx + X_SHIFT_PLAN;

          const factText = formatCashflowDynamicsChartLabel(row.fact);
          const planText = formatCashflowDynamicsChartLabel(row.plan);
          const wf = approxLabelWidthPx(factText, CHART_LABEL_FONT_PX);
          const wp = approxLabelWidthPx(planText, CHART_LABEL_FONT_PX);
          const hf = APPROX_LABEL_H_PX;
          const hp = APPROX_LABEL_H_PX;

          let hidePlan = false;
          if (!presLight && centeredRectsOverlap(factX, factY, wf, hf, planX, planY, wp, hp)) {
            hidePlan = true;
          }

          factX = clamp(factX, padX + wf / 2, innerW - padX - wf / 2);
          planX = clamp(planX, padX + wp / 2, innerW - padX - wp / 2);
          factY = clamp(factY, padY + halfH, innerH - padY - halfH);
          planY = clamp(planY, padY + halfH, innerH - padY - halfH);

          if (
            !presLight &&
            !hidePlan &&
            centeredRectsOverlap(factX, factY, wf, hf, planX, planY, wp, hp)
          ) {
            hidePlan = true;
          }

          if (presLight && centeredRectsOverlap(factX, factY, wf, hf, planX, planY, wp, hp)) {
            factY = clamp(yFactPt - off - proximityBump - 14, padY + halfH, innerH - padY - halfH);
            planY = clamp(yPlanPt + off + proximityBump + 14, padY + halfH, innerH - padY - halfH);
          }

          const fontWeight = presLight ? 400 : 500;
          const opacity = presLight ? 0.9 : 1;

          return (
            <g key={`${row.periodKey}-${i}`}>
              <text
                x={factX}
                y={factY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={factFill}
                fontSize={CHART_LABEL_FONT_PX}
                fontWeight={fontWeight}
                opacity={opacity}
                className="tabular-nums"
              >
                {factText}
              </text>
              {!hidePlan ? (
                <text
                  x={planX}
                  y={planY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={planFill}
                  fontSize={CHART_LABEL_FONT_PX}
                  fontWeight={fontWeight}
                  opacity={opacity}
                  className="tabular-nums"
                >
                  {planText}
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
  const presDark = useMarketingPresVisual(presentation) === "presDark";

  const chartData = useMemo(() => cashflowRowsForChart(rows, mode, planScale), [rows, mode, planScale]);

  const yDomain = useMemo((): [number, number] => {
    const vals = chartData.flatMap((d) => [d.fact, d.plan]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || Math.max(Math.abs(max), 1) * 0.05;
    const pad = span * (presDark ? 0.14 : 0.2);
    return [min - pad, max + pad];
  }, [chartData, presDark]);

  const toggleClass = (active: boolean) => {
    if (presDark) {
      return active
        ? "border-0 bg-slate-700/80 text-slate-100 ring-1 ring-slate-500/50"
        : "border-0 text-slate-400 ring-1 ring-slate-600/60 hover:bg-slate-800/80";
    }
    if (presentation) {
      return active
        ? "border-0 bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
        : "border border-solid border-[#D1D5DB] bg-transparent text-[#374151] hover:bg-[#1D4ED8] hover:text-white";
    }
    return active
      ? "bg-slate-900 text-white"
      : "text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50";
  };

  const labelLayer = useMemo(() => buildCashflowLabelLayer(chartData, presDark), [chartData, presDark]);

  if (chartData.length === 0) {
    return (
      <div
        className={
          presDark
            ? "rounded-xl border border-slate-600/45 bg-[#1e293b]/80 p-4 text-sm text-slate-400"
            : presentation
              ? "rounded-xl border border-mpl-border bg-mpl-card p-4 text-sm text-mpl-muted"
              : "rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"
        }
      >
        Нет данных поступлений по месяцам для графика.
      </div>
    );
  }

  const gridStroke = presDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.35)";
  const axisColor = presDark ? "#94a3b8" : "#64748b";

  return (
    <div
      className={
        presDark
          ? "mb-7 overflow-visible rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5"
          : presentation
            ? "mb-7 overflow-visible rounded-2xl border border-mpl-border bg-mpl-chart p-4 shadow-sm sm:p-5"
            : "mb-7 overflow-visible rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      }
    >
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className={`text-sm font-semibold ${presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900"}`}>
            Динамика поступлений, ₽
          </h3>
          <p className={`mt-0.5 text-[11px] ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
            План и факт поступлений на эскроу (без сделок). План: из помесячного плана выручки × {CASHFLOW_PLAN_FROM_REVENUE_RATIO}.
          </p>
        </div>
        <div
          className={
            presDark
              ? "flex shrink-0 gap-1 rounded-lg p-0.5 ring-1 ring-inset ring-slate-600/40"
              : presentation
                ? "flex shrink-0 gap-2"
                : "flex shrink-0 gap-1 rounded-lg p-0.5 ring-1 ring-inset ring-slate-300"
          }
        >
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
            <LineChart
              data={chartData}
              margin={{ top: presDark ? 30 : CHART_MARGIN_TOP_LIGHT_LABELS, right: 12, left: 6, bottom: 16 }}
            >
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
            <Tooltip content={<CashflowTooltip darkChrome={presDark} />} cursor={{ stroke: presDark ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.35)" }} />
            <Line
              type="monotone"
              dataKey="fact"
              name="Факт"
              stroke="#1e40af"
              strokeWidth={2.25}
              dot={{ r: 4, fill: "#1e40af", stroke: presDark ? "#0f172a" : "#fff", strokeWidth: 1 }}
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
              dot={{ r: 3.5, fill: "#ea580c", stroke: presDark ? "#0f172a" : "#fff", strokeWidth: 1 }}
              activeDot={{ r: 4.5 }}
              isAnimationActive={false}
            />
            <Customized component={labelLayer} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`mt-3 flex flex-wrap items-center gap-4 text-[10px] ${presDark ? "text-slate-500" : presentation ? "text-mpl-muted" : "text-slate-600"}`}>
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
