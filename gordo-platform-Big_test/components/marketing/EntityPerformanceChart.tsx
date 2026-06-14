"use client";

import { useMemo } from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import { rechartsPresentationMiniTooltip } from "@/components/marketing/salesPlanCharts";
import type { PerformanceChartRow } from "@/lib/entityPerformanceChart";
import {
  formatCompactMoneyAxis,
  formatCompactMoneyAxisTick,
  formatNumberWithoutCurrency,
  numFmt,
} from "@/lib/salesPlanChartFormat";

const PLAN_FILL = "#FFAB5C";
const PLAN_FILL_DARK = "#fdba74";
const FACT_FILL = "#2563EB";
const FACT_FILL_DARK = "#60a5fa";

type Props = {
  rows: readonly PerformanceChartRow[];
  hasCsvPlan: boolean;
  presDark: boolean;
  presentation: boolean;
  emptyMessage?: string;
  /** Суффикс в тултипе, напр. «кв.м» или «шт». */
  unitSuffix?: string;
};

export function EntityPerformanceChart({
  rows,
  hasCsvPlan,
  presDark,
  presentation,
  emptyMessage = "Нет данных для графика",
  unitSuffix = "шт",
}: Props) {
  const axisColor = presDark ? "#94a3b8" : "#64748b";
  const gridColor = presDark ? "rgba(148,163,184,0.2)" : "rgba(226,232,240,0.9)";

  const xMax = useMemo(() => {
    let m = 0;
    for (const r of rows) {
      m = Math.max(m, r.plan, r.fact);
    }
    return m > 0 ? Math.ceil(m * 1.12) : 4;
  }, [rows]);

  const planFill = presDark ? PLAN_FILL_DARK : PLAN_FILL;
  const factFill = presDark ? FACT_FILL_DARK : FACT_FILL;
  const compactRub = unitSuffix === "₽";
  const formatChartValue = (n: number) =>
    compactRub
      ? formatCompactMoneyAxis(n)
      : unitSuffix
        ? `${numFmt.format(Math.round(n))} ${unitSuffix}`
        : formatNumberWithoutCurrency(n);
  const formatAxisTick = (v: number) =>
    compactRub ? formatCompactMoneyAxisTick(Number(v)) : numFmt.format(Math.round(Number(v)));

  if (!rows.length) {
    return (
      <p className={`py-8 text-center text-sm ${presDark ? "text-slate-400" : "text-slate-500"}`}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="h-[220px] w-full min-w-0 sm:h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={[...rows]}
          margin={{ top: 8, right: 16, left: 4, bottom: 0 }}
          barCategoryGap="22%"
          barGap={4}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
          <XAxis
            type="number"
            domain={[0, xMax]}
            tick={{ fill: axisColor, fontSize: 11 }}
            tickFormatter={formatAxisTick}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="shortLabel"
            width={56}
            tick={{ fill: axisColor, fontSize: 11, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={presDark ? { stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 } : { fill: "rgba(148,163,184,0.08)" }}
            content={
              presDark || presentation
                ? rechartsPresentationMiniTooltip((n) => formatChartValue(n))
                : undefined
            }
            formatter={
              presDark || presentation
                ? undefined
                : (v, name) => {
                    const lab = String(name) === "plan" ? "План (накоп.)" : "Факт (накоп.)";
                    return [formatChartValue(Number(v)), lab];
                  }
            }
            contentStyle={
              presDark || presentation ? undefined : { fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }
            }
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 4, paddingBottom: 0 }}
            formatter={(v) => (
              <span style={{ color: axisColor }}>{v === "plan" ? "План" : "Факт"}</span>
            )}
          />
          {hasCsvPlan ? (
            <Bar
              dataKey="plan"
              name="plan"
              fill={planFill}
              radius={[0, 4, 4, 0]}
              barSize={12}
              opacity={presDark ? 0.92 : 0.88}
            />
          ) : null}
          <Bar dataKey="fact" name="fact" fill={factFill} radius={[0, 4, 4, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
