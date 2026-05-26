"use client";

import { useMemo, useState } from "react";
import type { LabelProps } from "recharts";

import {
  createMarketingDealsStyleMonthTickRenderer,
  MARKETING_DEALS_STYLE_MONTH_X_AXIS,
} from "@/components/marketing/marketingDealsStyleMonthXAxis";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import {
  cashflowChartYAxisScale,
  formatCashflowAxisTick,
  formatCashflowChartUnitTooltip,
} from "@/lib/chartFormatters";
import { formatCashflowChartUnitInteger } from "@/lib/cashflowChartUnits";
import type { InstallmentForecastChartPoint } from "@/lib/buildInstallmentForecastChartData";

export type ForecastChartMode = "monthly" | "cumulative";

type Props = {
  data: InstallmentForecastChartPoint[];
  presDark: boolean;
  presentation?: boolean;
  mplPremium?: boolean;
};

function ForecastTooltip({
  active,
  payload,
  presDark,
  mode,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: InstallmentForecastChartPoint }>;
  presDark: boolean;
  mode: ForecastChartMode;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const shell = presDark
    ? "rounded-lg border border-slate-500/40 bg-slate-900/95 px-3 py-2 text-xs text-slate-100 shadow-lg"
    : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-md";
  const value =
    mode === "monthly"
      ? formatCashflowChartUnitTooltip(p.amountUnit)
      : formatCashflowChartUnitTooltip(p.cumulativeUnit);
  const suffix = mode === "cumulative" ? " накопительно" : "";
  return (
    <div className={shell}>
      <div className="mb-1 font-semibold capitalize">{p.label}</div>
      <div className="tabular-nums font-medium">
        {value}
        {suffix}
      </div>
    </div>
  );
}

export function InstallmentForecastChart({
  data,
  presDark,
  presentation = false,
  mplPremium = false,
}: Props) {
  const [mode, setMode] = useState<ForecastChartMode>("monthly");

  const axisColor = presDark ? "#94a3b8" : "#475569";
  const gridStroke = presDark ? "rgba(148,163,184,0.22)" : "#E5E7EB";
  const segmentSurface = presDark ? "dark" : mplPremium && presentation ? "premium" : "light";

  const valuesForMode = useMemo(
    () => data.map((d) => (mode === "monthly" ? d.amountUnit : d.cumulativeUnit)),
    [data, mode],
  );

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
  const lineStroke = presDark ? "#38bdf8" : "#2563eb";
  const areaStroke = presDark ? "#7dd3fc" : "#3b82f6";

  const monthlyValueLabelFill = lineStroke;

  const toggleShell = presDark
    ? "inline-flex rounded-xl border border-slate-600/50 bg-slate-800/60 p-1"
    : "inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm";

  const chartMargin = {
    top: mode === "monthly" ? 20 : 12,
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
        content={<ForecastTooltip presDark={presDark} mode={mode} />}
        cursor={{ stroke: gridStroke }}
      />
    </>
  );

  return (
    <div className="min-w-0 overflow-visible pt-1 pb-3">
      <div className="mb-4 flex justify-end">
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
          {mode === "monthly" ? (
            <AreaChart data={data} margin={chartMargin}>
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
              {sharedAxes}
              <Area
                type="monotone"
                dataKey="amountUnit"
                name="Прогноз"
                stroke={areaStroke}
                fill={areaFill}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
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
            </AreaChart>
          ) : (
            <LineChart data={data} margin={chartMargin}>
              {sharedAxes}
              <Line
                type="monotone"
                dataKey="cumulativeUnit"
                name="Накопительно"
                stroke={lineStroke}
                strokeWidth={2.5}
                dot={{ r: 3, fill: lineStroke, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
