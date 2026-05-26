"use client";

import { useMemo } from "react";

import { CashflowInflowChartLegendToolbar } from "@/components/marketing/CashflowInflowChartLegend";
import {
  CashflowDynamicsSvgLabels,
  CashflowTooltip,
} from "@/components/marketing/SalesPlanCashflowDynamicsChart";
import type { CashflowChartRow } from "@/lib/buildCashflowSeries";
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
import type {
  SalesPlanExecutionChartMode,
  SalesPlanExecutionChartRow,
} from "@/lib/salesPlanExecution/buildSalesPlanExecutionData";

/** Как у «Динамика поступлений…» — место для подписей над точками. */
const CHART_MARGIN_TOP_LIGHT = 20;
const CHART_MARGIN_TOP_DARK = 16;
const CHART_MARGIN_BOTTOM = 64;
const CHART_MARGIN_LEFT = 10;

type Props = {
  rows: readonly SalesPlanExecutionChartRow[];
  chartMode: SalesPlanExecutionChartMode;
  chartKey: string;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  emptyMessage?: string;
};

export function PlanFactChart({
  rows,
  chartMode,
  chartKey,
  presDark,
  presentation,
  mplPremium,
  emptyMessage = "Нет данных для графика план / факт",
}: Props) {
  const chartData = useMemo((): CashflowChartRow[] => {
    return rows.map((r) => {
      const planUnit = rubToCashflowChartUnit(r.plan);
      const factUnit = rubToCashflowChartUnit(r.fact);
      const deviation =
        planUnit != null && factUnit != null && Number.isFinite(planUnit) && Number.isFinite(factUnit)
          ? factUnit - planUnit
          : null;
      return {
        periodKey: r.periodKey,
        label: r.label,
        plan: planUnit,
        fact: factUnit,
        deviation,
      };
    });
  }, [rows]);

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
        <div className="h-[320px] min-h-[320px] w-full overflow-visible [&_svg]:overflow-visible">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minHeight={320}
            className="!overflow-visible [&_svg]:overflow-visible"
            style={{ overflow: "visible" }}
          >
            <LineChart
              data={chartData}
              margin={{
                top: presDark ? CHART_MARGIN_TOP_DARK : CHART_MARGIN_TOP_LIGHT,
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
              <Line
                {...cashflowInflowPlanLineProps(presDark)}
                type={chartMode === "monthly" ? "linear" : "monotone"}
                dataKey="plan"
                name="План"
                connectNulls={false}
              />
              <Line
                {...cashflowInflowFactLineProps(presDark)}
                type={chartMode === "monthly" ? "linear" : "monotone"}
                dataKey="fact"
                name="Факт"
                connectNulls={false}
              />
              <CashflowDynamicsSvgLabels
                chartData={chartData}
                presDark={presDark}
                mode={chartMode}
                presentation={presentation}
                planFactExecutionLabels
                yGridTickValues={yTicks}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
