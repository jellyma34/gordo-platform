"use client";

import { useMemo, useState } from "react";
import type { LabelProps } from "recharts";
import { usePlotArea, useXAxisScale } from "recharts";

import {
  createMarketingDealsStyleMonthTickRenderer,
  MARKETING_DEALS_STYLE_MONTH_X_AXIS,
} from "@/components/marketing/marketingDealsStyleMonthXAxis";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import {
  cashflowChartYAxisScale,
  formatCashflowAxisTick,
  formatPercent,
} from "@/lib/chartFormatters";
import { formatCashflowChartUnitInteger } from "@/lib/cashflowChartUnits";
import { formatCompactCurrencyRu } from "@/lib/formatCompactCurrencyRu";
import {
  INSTALLMENT_FORECAST_TODAY_LINE,
  installmentForecastTodayLineLabelFill,
  resolveInstallmentTodayLineModel,
  resolveInstallmentTodayLinePixelX,
  type InstallmentTodayLineModel,
} from "@/lib/installmentForecastChartTodayLine";
import type { InstallmentForecastChartPoint } from "@/lib/buildInstallmentForecastChartData";

export type ForecastChartMode = "monthly" | "cumulative";

type Props = {
  data: InstallmentForecastChartPoint[];
  presDark: boolean;
  presentation?: boolean;
  mplPremium?: boolean;
  /** Есть ли загруженный факт поступлений (хотя бы один месяц на шкале). */
  hasFactSeries?: boolean;
};

const FORECAST_STROKE_LIGHT = "#3b82f6";
const FORECAST_STROKE_DARK = "#7dd3fc";
const FORECAST_LINE_LIGHT = "#2563eb";
const FORECAST_LINE_DARK = "#38bdf8";
const FACT_STROKE = "#22c55e";

function InstallmentTodayLineOverlay({
  todayLine,
  presDark,
  data,
}: {
  todayLine: InstallmentTodayLineModel | null;
  presDark: boolean;
  data: InstallmentForecastChartPoint[];
}) {
  const xScale = useXAxisScale();
  const plot = usePlotArea();

  if (!todayLine || !xScale || !plot) return null;

  const x = resolveInstallmentTodayLinePixelX(
    todayLine,
    xScale as (label: string, opts?: { position?: "start" | "middle" | "end" }) => number | undefined,
    data.length,
    plot.x,
    plot.width,
  );
  if (x == null || !Number.isFinite(x)) return null;

  const xi = Math.round(x) + 0.5;
  const yTop = plot.y;
  const yBottom = plot.y + plot.height;
  const labelFill = installmentForecastTodayLineLabelFill(presDark);

  return (
    <g className="installment-today-line pointer-events-none" aria-hidden>
      <line
        x1={xi}
        y1={yTop}
        x2={xi}
        y2={yBottom}
        stroke={INSTALLMENT_FORECAST_TODAY_LINE.stroke}
        strokeWidth={INSTALLMENT_FORECAST_TODAY_LINE.strokeWidth}
        strokeDasharray={INSTALLMENT_FORECAST_TODAY_LINE.strokeDasharray}
      />
      <text
        x={x}
        y={yTop - 6}
        textAnchor="middle"
        dominantBaseline="auto"
        fill={labelFill}
        fontSize={INSTALLMENT_FORECAST_TODAY_LINE.labelFontSize}
        fontWeight={INSTALLMENT_FORECAST_TODAY_LINE.labelFontWeight}
      >
        {todayLine.dateLabel}
      </text>
    </g>
  );
}

function installmentChartHasFactData(data: InstallmentForecastChartPoint[]): boolean {
  return data.some((p) => p.factAmountUnit != null || p.factCumulativeUnit != null);
}

function ForecastTooltip({
  active,
  payload,
  presDark,
  mode,
  platformDateLabel,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: InstallmentForecastChartPoint }>;
  presDark: boolean;
  mode: ForecastChartMode;
  platformDateLabel?: string | null;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;

  const forecastRub = mode === "monthly" ? p.amount : p.cumulative;
  const factRub =
    mode === "monthly"
      ? p.factAmount
      : p.factCumulative;
  const hasFact = factRub != null && Number.isFinite(factRub);
  const deviation = hasFact ? factRub - forecastRub : null;
  const executionPct = hasFact && forecastRub > 0 ? (factRub / forecastRub) * 100 : null;

  const shell = presDark
    ? "rounded-lg border border-slate-500/40 bg-slate-900/95 px-3 py-2 text-xs text-slate-100 shadow-lg"
    : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-md";
  const muted = presDark ? "text-slate-400" : "text-slate-500";
  const deviationTone =
    deviation == null
      ? muted
      : deviation < 0
        ? presDark
          ? "text-rose-300"
          : "text-rose-600"
        : deviation > 0
          ? presDark
            ? "text-emerald-300"
            : "text-emerald-600"
          : muted;

  return (
    <div className={shell}>
      <div className="mb-1.5 font-semibold capitalize">{p.label}</div>
      <div className="space-y-0.5 tabular-nums">
        <div>
          <span className={muted}>Прогноз: </span>
          <span className="font-medium">{formatCompactCurrencyRu(forecastRub)}</span>
        </div>
        {hasFact ? (
          <>
            <div>
              <span className={muted}>Факт: </span>
              <span className="font-medium">{formatCompactCurrencyRu(factRub)}</span>
            </div>
            {deviation != null ? (
              <div className={deviationTone}>
                <span className={muted}>Отклонение: </span>
                <span className="font-medium">
                  {deviation >= 0 ? "+" : "−"}
                  {formatCompactCurrencyRu(Math.abs(deviation))}
                </span>
              </div>
            ) : null}
            {executionPct != null ? (
              <div>
                <span className={muted}>Выполнение: </span>
                <span className={`font-medium ${deviationTone}`}>{formatPercent(executionPct)}</span>
              </div>
            ) : null}
          </>
        ) : null}
        {p.isReportingMonth ? (
          <div className={`mt-1.5 border-t pt-1.5 ${presDark ? "border-slate-600/50" : "border-slate-200"}`}>
            <span className={muted}>Статус: </span>
            <span className="font-medium">Отчётный месяц</span>
          </div>
        ) : null}
        {p.isTodayMonth && platformDateLabel ? (
          <div className={`mt-1.5 border-t pt-1.5 ${presDark ? "border-slate-600/50" : "border-slate-200"}`}>
            <span className={muted}>Текущая дата: </span>
            <span className="font-medium">{platformDateLabel}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InstallmentForecastLegend({
  presDark,
  showFact,
}: {
  presDark: boolean;
  showFact: boolean;
}) {
  const labelCls = presDark ? "text-slate-300" : "text-slate-700";
  const forecastStroke = presDark ? FORECAST_LINE_DARK : FORECAST_LINE_LIGHT;

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1.5 text-xs font-medium">
      <span className={`inline-flex items-center gap-1.5 ${labelCls}`}>
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: forecastStroke }}
          aria-hidden
        />
        Прогноз
      </span>
      {showFact ? (
        <span className={`inline-flex items-center gap-1.5 ${labelCls}`}>
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: FACT_STROKE }}
            aria-hidden
          />
          Факт
        </span>
      ) : null}
    </div>
  );
}

export function InstallmentForecastChart({
  data,
  presDark,
  presentation = false,
  mplPremium = false,
  hasFactSeries,
}: Props) {
  const [mode, setMode] = useState<ForecastChartMode>("monthly");

  const axisColor = presDark ? "#94a3b8" : "#475569";
  const gridStroke = presDark ? "rgba(148,163,184,0.22)" : "#E5E7EB";
  const segmentSurface = presDark ? "dark" : mplPremium && presentation ? "premium" : "light";

  const showFact = hasFactSeries ?? installmentChartHasFactData(data);

  const todayLine = useMemo(() => resolveInstallmentTodayLineModel(data), [data]);

  const valuesForMode = useMemo(() => {
    const vals: number[] = [];
    for (const d of data) {
      if (mode === "monthly") {
        vals.push(d.amountUnit);
        if (d.factAmountUnit != null) vals.push(d.factAmountUnit);
      } else {
        vals.push(d.cumulativeUnit);
        if (d.factCumulativeUnit != null) vals.push(d.factCumulativeUnit);
      }
    }
    return vals;
  }, [data, mode]);

  const { ticks: yTicks, domainMax: yDomainMax } = useMemo(
    () => cashflowChartYAxisScale(valuesForMode, { headroom: 1.12 }),
    [valuesForMode],
  );

  const monthTick = useMemo(
    () =>
      createMarketingDealsStyleMonthTickRenderer({
        presDark,
        tickCount: data.length,
        labelRotateDeg: 0,
        tickFill: axisColor,
      }),
    [axisColor, data.length, presDark],
  );

  const areaFill = presDark ? "url(#installmentForecastAreaDark)" : "url(#installmentForecastAreaLight)";
  const areaStroke = presDark ? FORECAST_STROKE_DARK : FORECAST_STROKE_LIGHT;
  const forecastLineStroke = presDark ? FORECAST_LINE_DARK : FORECAST_LINE_LIGHT;
  const monthlyValueLabelFill = forecastLineStroke;

  const toggleShell = presDark
    ? "inline-flex rounded-xl border border-slate-600/50 bg-slate-800/60 p-1"
    : "inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm";

  const chartMargin = {
    top: 28,
    right: 12,
    left: 4,
    bottom: MARKETING_DEALS_STYLE_MONTH_X_AXIS.height,
  };

  const sharedAxes = (
    <>
      <CartesianGrid strokeDasharray="4 4" stroke={gridStroke} vertical={false} horizontalValues={yTicks} />
      <XAxis dataKey="label" type="category" {...MARKETING_DEALS_STYLE_MONTH_X_AXIS} tick={monthTick} />
      <YAxis
        domain={[0, yDomainMax]}
        ticks={yTicks}
        allowDecimals={false}
        tick={{ fill: axisColor, fontSize: 10, fontWeight: 500 }}
        axisLine={false}
        tickLine={false}
        tickFormatter={(v) => formatCashflowAxisTick(Number(v))}
        width={72}
      />
      <Tooltip
        content={
          <ForecastTooltip
            presDark={presDark}
            mode={mode}
            platformDateLabel={todayLine?.dateLabel ?? null}
          />
        }
        cursor={{ stroke: gridStroke }}
      />
    </>
  );

  const forecastSeries =
    mode === "monthly" ? (
      <Area
        type="monotone"
        dataKey="amountUnit"
        name="Прогноз"
        stroke={areaStroke}
        fill={areaFill}
        strokeWidth={2}
        dot={false}
        activeDot={{ r: 4, strokeWidth: 0 }}
        isAnimationActive={false}
      >
        <LabelList
          dataKey="amountUnit"
          content={(props: LabelProps) => {
            const cx = Number(props.x);
            const cy = Number(props.y);
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
            const v = typeof props.value === "number" ? props.value : Number(props.value);
            if (!Number.isFinite(v) || v <= 0) return null;
            const text = formatCashflowChartUnitInteger(v, false);
            if (!text) return null;
            return (
              <text
                key={`inst-monthly-lbl-${props.index ?? 0}`}
                x={cx}
                y={cy - 10}
                textAnchor="middle"
                dominantBaseline="alphabetic"
                fill={monthlyValueLabelFill}
                fontSize={12}
                fontWeight={700}
                className="tabular-nums pointer-events-none"
              >
                {text}
              </text>
            );
          }}
        />
      </Area>
    ) : (
      <Line
        type="monotone"
        dataKey="cumulativeUnit"
        name="Прогноз"
        stroke={forecastLineStroke}
        strokeWidth={2.5}
        dot={{ r: 3, fill: forecastLineStroke, strokeWidth: 0 }}
        activeDot={{ r: 5 }}
        isAnimationActive={false}
      />
    );

  const factDataKey = mode === "monthly" ? "factAmountUnit" : "factCumulativeUnit";

  return (
    <div className="min-w-0 overflow-visible pt-1 pb-3">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InstallmentForecastLegend presDark={presDark} showFact={showFact} />
        <div className={toggleShell} role="tablist" aria-label="Режим графика прогноза">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "monthly"}
            className={segmentedControlTabClass(mode === "monthly", segmentSurface)}
            onClick={() => setMode("monthly")}
          >
            Помесячно
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "cumulative"}
            className={segmentedControlTabClass(mode === "cumulative", segmentSurface)}
            onClick={() => setMode("cumulative")}
          >
            Накопительно
          </button>
        </div>
      </div>

      <div className="h-[300px] min-h-[300px] w-full overflow-visible [&_svg]:overflow-visible">
        <ResponsiveContainer width="100%" height="100%" className="!overflow-visible">
          <ComposedChart data={data} margin={chartMargin}>
            {mode === "monthly" ? (
              <defs>
                <linearGradient id="installmentForecastAreaLight" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="installmentForecastAreaDark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05} />
                </linearGradient>
              </defs>
            ) : null}
            {sharedAxes}
            <InstallmentTodayLineOverlay todayLine={todayLine} presDark={presDark} data={data} />
            {forecastSeries}
            {showFact ? (
              <Line
                type="monotone"
                dataKey={factDataKey}
                name="Факт"
                stroke={FACT_STROKE}
                strokeWidth={2.5}
                dot={{ r: 3, fill: FACT_STROKE, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: FACT_STROKE }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
