"use client";

import { useMemo } from "react";
import type { LabelProps } from "recharts";

import {
  ANALYTICS_MARKETING_CHART_HEIGHT_PX,
} from "@/components/marketing/analytics/analyticsSectionShellStyles";
import {
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
  createMarketingDealsStyleMonthTickRenderer,
  MARKETING_DEALS_STYLE_MONTH_X_AXIS,
} from "@/components/marketing/marketingDealsStyleMonthXAxis";
import type { SqmPriceChartMode, SqmPriceDynamicsSeriesModel } from "@/lib/sqmPriceDynamicsFromDeals";
import { buildSqmPriceChartData, sqmPricePeriodChangePct } from "@/lib/sqmPriceDynamicsFromDeals";
import {
  formatSqmPriceAxisTick,
  formatSqmPriceChangePct,
  formatSqmPriceRub,
  sqmPriceChartCenteredYScale,
} from "@/lib/sqmPriceDynamicsFormat";

const CHART_MARGIN = { top: 22, right: 16, left: 8, bottom: 8 };
const POINT_LABEL_OFFSET_PX = 10;

type Props = {
  series: SqmPriceDynamicsSeriesModel;
  timelineMonthKeys: readonly string[];
  presDark: boolean;
  chartMode?: SqmPriceChartMode;
};

function rubFromLabelValue(v: LabelProps["value"]): number | null {
  if (v == null || typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function SqmPriceDynamicsChart({
  series,
  timelineMonthKeys,
  presDark,
  chartMode = "monthly",
}: Props) {
  const chartData = useMemo(
    () => buildSqmPriceChartData(series, timelineMonthKeys, chartMode),
    [chartMode, series, timelineMonthKeys],
  );
  const values = useMemo(
    () => chartData.map((d) => d.value).filter((v): v is number => v != null && Number.isFinite(v)),
    [chartData],
  );
  const yScale = useMemo(() => {
    const mean =
      values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;
    const center = series.overallAvgPricePerSqmRub ?? mean;
    return sqmPriceChartCenteredYScale(center > 0 ? center : mean > 0 ? mean : 100_000);
  }, [series.overallAvgPricePerSqmRub, values]);
  const changePct = useMemo(() => sqmPricePeriodChangePct(chartData), [chartData]);

  const monthTickCount = Math.max(1, timelineMonthKeys.length);

  const monthXTick = useMemo(
    () =>
      createMarketingDealsStyleMonthTickRenderer({
        presDark,
        tickCount: monthTickCount,
        translateYPx: 4,
        labelRotateDeg: monthTickCount > 8 ? -35 : 0,
      }),
    [presDark, monthTickCount],
  );

  const hasData =
    series.totalDeals > 0 &&
    values.length > 0 &&
    series.overallAvgPricePerSqmRub != null &&
    Number.isFinite(series.overallAvgPricePerSqmRub);
  const axisColor = presDark ? "#94a3b8" : "#64748b";
  const gridStroke = presDark ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";
  const cardCls = presDark
    ? "w-full min-w-0 rounded-xl border border-slate-700/55 bg-slate-800/40 shadow-sm"
    : "w-full min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/50 shadow-sm";
  const cardPadCls = hasData ? "p-4 sm:p-5" : "px-4 py-3 sm:px-5 sm:py-3.5";
  const titleCls = presDark ? "text-slate-100" : "text-slate-900";
  const mutedCls = presDark ? "text-slate-400" : "text-slate-500";
  const statCls = presDark ? "text-slate-200" : "text-slate-800";
  const valueLabelFill = presDark ? "#93c5fd" : series.accentHex;
  const changeCls =
    changePct == null
      ? mutedCls
      : changePct > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : changePct < 0
          ? "text-red-600 dark:text-red-400"
          : mutedCls;

  if (!hasData) {
    return (
      <article className={`${cardCls} ${cardPadCls}`} data-sqm-chart={series.key} data-sqm-compact>
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: series.accentHex }} aria-hidden />
          <div className="min-w-0 flex-1">
            <h4 className={`text-sm font-semibold tracking-tight ${titleCls}`}>{series.label}</h4>
            <p className={`mt-0.5 text-xs leading-snug ${mutedCls}`}>Нет сделок с ценой и площадью</p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={`${cardCls} ${cardPadCls}`} data-sqm-chart={series.key}>
      <h4 className={`mb-3 text-sm font-semibold tracking-tight ${titleCls}`}>{series.label}</h4>

      <div
        className="w-full min-w-0 [&_svg]:overflow-visible"
        style={{ height: ANALYTICS_MARKETING_CHART_HEIGHT_PX }}
      >
        <ResponsiveContainer width="100%" height={ANALYTICS_MARKETING_CHART_HEIGHT_PX}>
          <LineChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis
              dataKey="labelShort"
              type="category"
              {...MARKETING_DEALS_STYLE_MONTH_X_AXIS}
              tick={monthXTick}
              tickMargin={6}
              height={monthTickCount > 8 ? 44 : 32}
            />
            <YAxis
              domain={yScale.domain}
              ticks={[...yScale.ticks]}
              allowDecimals={false}
              allowDataOverflow
              tick={{ fill: axisColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatSqmPriceAxisTick(Number(v))}
              width={40}
            />
            <Tooltip
              cursor={{ stroke: axisColor, strokeOpacity: 0.35 }}
              isAnimationActive={false}
              formatter={(v: number | null) => {
                if (v == null || !Number.isFinite(Number(v))) return ["—", "₽/м²"];
                return [formatSqmPriceRub(Number(v)), "₽/м²"];
              }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as { monthLabel?: string } | undefined;
                return row?.monthLabel ?? "";
              }}
              contentStyle={
                presDark
                  ? {
                      background: "rgba(15,23,42,0.96)",
                      border: "1px solid rgba(100,116,139,0.45)",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "#f1f5f9",
                    }
                  : {
                      background: "#fff",
                      border: "1px solid rgba(226,232,240,0.95)",
                      borderRadius: 8,
                      fontSize: 11,
                    }
              }
            />
            <Line
              type={chartMode === "monthly" ? "linear" : "monotone"}
              dataKey="value"
              name="₽/м²"
              stroke={series.accentHex}
              strokeWidth={2}
              dot={(props) => {
                const v = (props as { payload?: { value?: number | null } }).payload?.value;
                if (v == null || !Number.isFinite(Number(v)) || Number(v) <= 0) return null;
                const { cx, cy } = props;
                if (cx == null || cy == null) return null;
                return (
                  <circle cx={cx} cy={cy} r={3} fill={series.accentHex} stroke="none" />
                );
              }}
              activeDot={(props) => {
                const v = (props as { payload?: { value?: number | null } }).payload?.value;
                if (v == null || !Number.isFinite(Number(v)) || Number(v) <= 0) return null;
                const { cx, cy } = props;
                if (cx == null || cy == null) return null;
                return (
                  <circle cx={cx} cy={cy} r={4} fill={series.accentHex} stroke="none" />
                );
              }}
              connectNulls
              isAnimationActive={false}
            >
              <LabelList
                dataKey="value"
                content={(props: LabelProps) => {
                  const cx = Number(props.x);
                  const cy = Number(props.y);
                  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
                  const num = rubFromLabelValue(props.value);
                  if (num == null || num <= 0) return null;
                  const text = formatSqmPriceRub(num);
                  if (!text) return null;
                  return (
                    <text
                      key={`sqm-lbl-${props.index ?? 0}`}
                      x={cx}
                      y={cy - POINT_LABEL_OFFSET_PX}
                      textAnchor="middle"
                      dominantBaseline="auto"
                      fill={valueLabelFill}
                      fontSize={10}
                      fontWeight={700}
                      className="tabular-nums pointer-events-none"
                    >
                      {text}
                    </text>
                  );
                }}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>

      <dl className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] ${mutedCls}`}>
        <div>
          <dt className="uppercase tracking-wide">Средняя</dt>
          <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${statCls}`}>
            {series.overallAvgPricePerSqmRub != null
              ? formatSqmPriceRub(series.overallAvgPricePerSqmRub)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Изменение</dt>
          <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${changeCls}`}>
            {formatSqmPriceChangePct(changePct)}
          </dd>
        </div>
      </dl>
    </article>
  );
}
