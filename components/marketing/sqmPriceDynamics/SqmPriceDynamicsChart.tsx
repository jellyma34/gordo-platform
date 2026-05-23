"use client";

import { useMemo } from "react";

import {
  CartesianGrid,
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
import type { SqmPriceDynamicsSeriesModel } from "@/lib/sqmPriceDynamicsFromDeals";
import { buildSqmPriceChartData, sqmPricePeriodChangePct } from "@/lib/sqmPriceDynamicsFromDeals";
import {
  formatSqmPriceAxisTick,
  formatSqmPriceChangePct,
  formatSqmPriceRub,
  sqmPriceChartCenteredYScale,
} from "@/lib/sqmPriceDynamicsFormat";

const CHART_HEIGHT = 280;
const CHART_MARGIN = { top: 10, right: 16, left: 8, bottom: 8 };

type Props = {
  series: SqmPriceDynamicsSeriesModel;
  timelineMonthKeys: readonly string[];
  presDark: boolean;
};

export function SqmPriceDynamicsChart({ series, timelineMonthKeys, presDark }: Props) {
  const chartData = useMemo(
    () => buildSqmPriceChartData(series, timelineMonthKeys),
    [series, timelineMonthKeys],
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

  const monthXTick = useMemo(
    () =>
      createMarketingDealsStyleMonthTickRenderer({
        presDark,
        tickCount: Math.max(1, timelineMonthKeys.length),
        translateYPx: 4,
        labelRotateDeg: timelineMonthKeys.length > 8 ? -35 : 0,
      }),
    [presDark, timelineMonthKeys.length],
  );

  const hasData = series.totalDeals > 0 && values.length > 0;
  const axisColor = presDark ? "#94a3b8" : "#64748b";
  const gridStroke = presDark ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";
  const cardCls = presDark
    ? "w-full min-w-0 rounded-xl border border-slate-700/55 bg-slate-800/40 p-4 shadow-sm sm:p-5"
    : "w-full min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 shadow-sm sm:p-5";
  const titleCls = presDark ? "text-slate-100" : "text-slate-900";
  const mutedCls = presDark ? "text-slate-400" : "text-slate-500";
  const statCls = presDark ? "text-slate-200" : "text-slate-800";
  const changeCls =
    changePct == null
      ? mutedCls
      : changePct > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : changePct < 0
          ? "text-red-600 dark:text-red-400"
          : mutedCls;

  return (
    <article className={cardCls} data-sqm-chart={series.key}>
      <h4 className={`mb-3 text-sm font-semibold tracking-tight ${titleCls}`}>{series.label}</h4>

      {!hasData ? (
        <p className={`flex h-[280px] w-full items-center justify-center text-sm ${mutedCls}`}>
          Нет сделок с ценой и площадью
        </p>
      ) : (
        <div className="h-[280px] w-full min-w-0 [&_svg]:overflow-visible">
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={chartData} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="labelShort"
                type="category"
                {...MARKETING_DEALS_STYLE_MONTH_X_AXIS}
                tick={monthXTick}
                tickMargin={6}
                height={timelineMonthKeys.length > 8 ? 44 : 32}
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
                formatter={(v: number) => {
                  if (v == null || !Number.isFinite(Number(v))) return ["—", ""];
                  return [formatSqmPriceRub(Number(v)), ""];
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
                type="monotone"
                dataKey="value"
                name="₽/м²"
                stroke={series.accentHex}
                strokeWidth={2}
                dot={{ r: 3, fill: series.accentHex, strokeWidth: 0 }}
                activeDot={{ r: 4, fill: series.accentHex, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

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
