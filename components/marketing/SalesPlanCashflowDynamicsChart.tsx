"use client";

import { useMemo, useState } from "react";
import { useChartHeight, useChartWidth, usePlotArea, useXAxisScale, useYAxisScale } from "recharts";

import {
  cashflowRowsForChart,
  type CashflowChartMode,
  type CashflowChartRow,
  type CashflowSeriesRow,
} from "@/lib/buildCashflowSeries";
import { formatCashShort, numFmt } from "@/lib/salesPlanChartFormat";
import { MPL_PREMIUM_CHART_SHELL } from "@/lib/marketingPremiumUi";
import { useMarketingPresentationLight, useMarketingPresVisual } from "@/components/marketing/marketingPresentationLightContext";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";

function formatRubLabel(n: number): string {
  return `${numFmt.format(Math.round(n))} ₽`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Порог близости двух точек по Y (пикс.): больше отступ подписи от маркера. */
const LABEL_Y_PROXIMITY_PX = 20;
const LABEL_OFFSET_FAR_PX = 8;
const LABEL_OFFSET_NEAR_PX = 16;
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
  mplPremium,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: CashflowChartRow }>;
  darkChrome: boolean;
  mplPremium: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CashflowChartRow | undefined;
  if (!row) return null;
  const base = darkChrome
    ? "border-slate-500/45 bg-[#0b1220]/95 text-slate-100"
    : mplPremium
      ? "border-black/[0.04] bg-white/90 text-mpl-text backdrop-blur-md"
      : "border-mpl-border bg-mpl-card text-mpl-text";
  return (
    <div className={`rounded-lg px-3 py-2 text-xs shadow-lg ring-1 ${base}`}>
      <div className={`font-semibold ${darkChrome ? "text-slate-200" : "text-mpl-text"}`}>{row.label}</div>
      <div className={`mt-1.5 text-[12px] font-medium leading-snug tabular-nums ${darkChrome ? "text-slate-200" : "text-mpl-text"}`}>
        <span className="text-[#1e40af]">Факт: {formatRubLabel(row.fact)}</span>
        <span className={darkChrome ? "text-slate-500" : "text-mpl-muted"}> / </span>
        <span className="text-orange-500">План: {formatRubLabel(row.plan)}</span>
      </div>
      <div
        className={`mt-2 flex justify-between gap-4 border-t pt-1.5 tabular-nums ${darkChrome ? "border-slate-600/40" : mplPremium ? "border-black/[0.06]" : "border-mpl-border"}`}
      >
        <span className={darkChrome ? "text-slate-400" : "text-mpl-muted"}>Отклонение</span>
        <span className={row.deviation >= 0 ? "text-emerald-400" : "text-rose-400"}>{formatRubLabel(row.deviation)}</span>
      </div>
    </div>
  );
}

/**
 * Подписи в координатах SVG (Recharts 3): масштабы из контекста графика.
 * Раньше использовался Customized + xAxisMap из Recharts 2 — в v3 эти props не приходят, слой был пустым.
 */
function CashflowDynamicsSvgLabels({
  chartData,
  presDark,
}: {
  chartData: CashflowChartRow[];
  presDark: boolean;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const chartW = useChartWidth();
  const chartH = useChartHeight();
  const plot = usePlotArea();

  const presLight = !presDark;
  const factFill = presDark ? "#93c5fd" : "#1D4ED8";
  const planFill = presDark ? "#fdba74" : "#EA580C";
  const fontWeight = presLight ? 400 : 500;
  const opacity = presLight ? 0.9 : 1;

  if (!xScale || !yScale || chartW == null || chartH == null || chartW <= 0 || chartH <= 0) {
    return null;
  }

  const padX = 8;
  const padY = 6;
  const halfH = APPROX_LABEL_H_PX / 2;

  return (
    <g pointerEvents="none">
      {chartData.map((row, i) => {
        const n = chartData.length;
        let cx = xScale(row.label, { position: "middle" }) ?? xScale(row.label);
        if (cx == null && plot && n > 0) {
          cx = plot.x + ((i + 0.5) / n) * plot.width;
        }
        const yFactPt = yScale(row.fact);
        const yPlanPt = yScale(row.plan);
        if (cx == null || yFactPt == null || yPlanPt == null) return null;

        const dyPts = Math.abs(yFactPt - yPlanPt);
        const offset = dyPts < LABEL_Y_PROXIMITY_PX ? LABEL_OFFSET_NEAR_PX : LABEL_OFFSET_FAR_PX;

        let factY = yFactPt - offset;
        let planY = yPlanPt + offset;

        let factX = cx + X_SHIFT_FACT;
        let planX = cx + X_SHIFT_PLAN;

        const factText = formatCashShort(row.fact);
        const planText = formatCashShort(row.plan);

        const wf = approxLabelWidthPx(factText || "0", CHART_LABEL_FONT_PX);
        const wp = approxLabelWidthPx(planText || "0", CHART_LABEL_FONT_PX);
        const hf = APPROX_LABEL_H_PX;
        const hp = APPROX_LABEL_H_PX;

        factX = clamp(factX, padX + wf / 2, chartW - padX - wf / 2);
        planX = clamp(planX, padX + wp / 2, chartW - padX - wp / 2);
        factY = clamp(factY, padY + halfH, chartH - padY - halfH);
        planY = clamp(planY, padY + halfH, chartH - padY - halfH);

        if (centeredRectsOverlap(factX, factY, wf, hf, planX, planY, wp, hp)) {
          factY = clamp(yFactPt - offset - 12, padY + halfH, chartH - padY - halfH);
          planY = clamp(yPlanPt + offset + 12, padY + halfH, chartH - padY - halfH);
        }

        return (
          <g key={`${row.periodKey}-${i}`}>
            {factText ? (
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
            ) : null}
            {planText ? (
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
}

type Props = {
  rows: CashflowSeriesRow[];
  planScale: number;
  presentation: boolean;
};

export function SalesPlanCashflowDynamicsChart({ rows, planScale, presentation }: Props) {
  const [mode, setMode] = useState<CashflowChartMode>("monthly");
  const mplPremium = useMarketingPresentationLight();
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

  const segmentSurface = presDark ? "dark" : mplPremium && presentation ? "premium" : "light";

  if (chartData.length === 0) {
    return (
      <div
        className={
          presDark
            ? "rounded-xl border border-slate-600/45 bg-[#1e293b]/80 p-4 text-sm text-slate-400"
            : mplPremium && presentation
              ? `${MPL_PREMIUM_CHART_SHELL} p-4 text-sm text-mpl-muted`
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
          : mplPremium && presentation
            ? `mb-7 overflow-visible p-4 sm:p-5 ${MPL_PREMIUM_CHART_SHELL}`
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
            План и факт поступлений на эскроу. План рассчитывается как 88% от плановой выручки.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("monthly")}
            className={segmentedControlTabClass(mode === "monthly", segmentSurface)}
          >
            Помесячно
          </button>
          <button
            type="button"
            onClick={() => setMode("cumulative")}
            className={segmentedControlTabClass(mode === "cumulative", segmentSurface)}
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
            <Tooltip
              content={<CashflowTooltip darkChrome={presDark} mplPremium={mplPremium && presentation} />}
              cursor={{ stroke: presDark ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.35)" }}
            />
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
            <CashflowDynamicsSvgLabels chartData={chartData} presDark={presDark} />
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
