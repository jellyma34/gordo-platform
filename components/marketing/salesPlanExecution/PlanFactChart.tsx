"use client";

import { useMemo } from "react";

import { CashflowInflowChartLegendToolbar } from "@/components/marketing/CashflowInflowChartLegend";
import { CashflowTooltip } from "@/components/marketing/SalesPlanCashflowDynamicsChart";
import {
  createMarketingDealsStyleMonthTickRenderer,
  MARKETING_DEALS_STYLE_MONTH_X_AXIS,
} from "@/components/marketing/marketingDealsStyleMonthXAxis";
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
  cashflowChartYAxisScale,
  formatCashflowAxisTick,
  rubToCashflowChartUnit,
} from "@/lib/chartFormatters";
import {
  cashflowInflowFactLineProps,
  cashflowInflowPlanLineProps,
} from "@/lib/cashflowInflowChartSeries";
import type { SalesPlanExecutionChartRow } from "@/lib/salesPlanExecution/buildSalesPlanExecutionData";

const CHART_MARGIN_TOP = 40;
const CHART_MARGIN_BOTTOM = 72;
const CHART_MARGIN_LEFT = 10;

type Props = {
  rows: readonly SalesPlanExecutionChartRow[];
  chartKey: string;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  emptyMessage?: string;
};

export function PlanFactChart({
  rows,
  chartKey,
  presDark,
  presentation,
  mplPremium,
  emptyMessage = "Нет данных для графика план / факт",
}: Props) {
  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        periodKey: r.periodKey,
        label: r.label,
        plan: rubToCashflowChartUnit(r.plan),
        fact: rubToCashflowChartUnit(r.fact),
      })),
    [rows],
  );

  const { yDomainMax, yTicks } = useMemo(() => {
    const vals = chartData.flatMap((d) => [d.plan, d.fact].filter((x): x is number => x != null));
    const { domainMax, ticks } = cashflowChartYAxisScale(vals, { tickStep25Mln: true });
    return { yDomainMax: domainMax, yTicks: ticks };
  }, [chartData]);

  const monthXTick = useMemo(
    () =>
      createMarketingDealsStyleMonthTickRenderer({
        presDark,
        tickCount: Math.max(1, chartData.length),
        translateYPx: 6,
        tickFill: presDark ? "#cbd5e1" : "#374151",
        labelRotateDeg: 0,
      }),
    [presDark, chartData.length],
  );

  const monthXAxis = useMemo(
    () => ({
      ...MARKETING_DEALS_STYLE_MONTH_X_AXIS,
      height: 34,
      tickMargin: 6,
      tick: monthXTick,
    }),
    [monthXTick],
  );

  if (!chartData.length) {
    return (
      <p className={`py-10 text-center text-sm ${presDark ? "text-slate-400" : "text-slate-500"}`}>
        {emptyMessage}
      </p>
    );
  }

  const gridStroke = presDark ? "rgba(148,163,184,0.22)" : "#E5E7EB";
  const axisColor = presDark ? "#94a3b8" : "#475569";

  return (
    <div
      key={chartKey}
      className="min-w-0 transition-opacity duration-300 ease-out motion-reduce:transition-none"
    >
      <CashflowInflowChartLegendToolbar
        chrome={{ presDark, presentation }}
        showPlan
        className="mb-1.5"
      />
      <div className="min-w-0 overflow-visible pb-1">
        <div className="h-[280px] min-h-[280px] w-full overflow-visible sm:h-[300px] sm:min-h-[300px] [&_svg]:overflow-visible">
          <ResponsiveContainer width="100%" height="100%" className="!overflow-visible [&_svg]:overflow-visible">
            <LineChart
              data={chartData}
              margin={{
                top: CHART_MARGIN_TOP,
                right: 18,
                left: CHART_MARGIN_LEFT,
                bottom: CHART_MARGIN_BOTTOM,
              }}
            >
              <CartesianGrid
                strokeDasharray="4 4"
                stroke={gridStroke}
                vertical={false}
                horizontalValues={yTicks}
              />
              <XAxis dataKey="label" type="category" {...monthXAxis} />
              <YAxis
                domain={[0, yDomainMax]}
                ticks={yTicks}
                allowDecimals={false}
                tick={{ fill: axisColor, fontSize: 10, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCashflowAxisTick(Number(v))}
                width={88}
                allowDataOverflow
              />
              <Tooltip
                content={
                  <CashflowTooltip darkChrome={presDark} mplPremium={mplPremium && presentation} />
                }
                cursor={{
                  stroke: presDark ? "rgba(148,163,184,0.28)" : "rgba(100,116,139,0.22)",
                }}
              />
              <Line type="monotone" dataKey="plan" name="План" {...cashflowInflowPlanLineProps(presDark)} />
              <Line type="monotone" dataKey="fact" name="Факт" {...cashflowInflowFactLineProps(presDark)} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
