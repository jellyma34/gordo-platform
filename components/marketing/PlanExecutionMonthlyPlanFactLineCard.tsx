"use client";

import { useMemo } from "react";

import { CashflowInflowChartLegendToolbar } from "@/components/marketing/CashflowInflowChartLegend";
import {
  CashflowDynamicsSvgLabels,
  CashflowTooltip,
} from "@/components/marketing/SalesPlanCashflowDynamicsChart";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import { periodKeyToRuChartLabel, type CashflowChartRow } from "@/lib/buildCashflowSeries";
import { cashflowInflowFactLineProps, cashflowInflowPlanLineProps } from "@/lib/cashflowInflowChartSeries";
import {
  createMarketingDealsStyleMonthTickRenderer,
  MARKETING_DEALS_STYLE_MONTH_X_AXIS,
} from "@/components/marketing/marketingDealsStyleMonthXAxis";
import type { SalesPlanExecutionMonthlyPoint } from "@/lib/marketingSalesPlanExecutionTable";
import { MPL_PREMIUM_CHART_SHELL } from "@/lib/marketingPremiumUi";
import { cashflowYAxisScale, formatCashflowYAxisMlnRub } from "@/lib/salesPlanChartFormat";

/** Согласовано с `SalesPlanCashflowDynamicsChart` (помесячный режим + подписи). */
const CHART_MARGIN_TOP_LIGHT = 40;
const CHART_MARGIN_TOP_DARK = 30;
const CHART_MARGIN_BOTTOM = 82;
const CHART_MARGIN_LEFT = 10;
const CHART_Y_AXIS_WIDTH = 88;

type Props = {
  monthlyPlanFact: readonly SalesPlanExecutionMonthlyPoint[] | null | undefined;
  presentation: boolean;
  presDark: boolean;
  mplPremium: boolean;
};

export function PlanExecutionMonthlyPlanFactLineCard({ monthlyPlanFact, presentation, presDark, mplPremium }: Props) {
  const chartData = useMemo((): CashflowChartRow[] => {
    const rows = monthlyPlanFact ?? [];
    return [...rows]
      .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
      .map((row) => ({
        periodKey: row.periodKey,
        label: periodKeyToRuChartLabel(row.periodKey),
        plan: row.planRub,
        fact: row.factRub,
        deviation: row.factRub - row.planRub,
      }));
  }, [monthlyPlanFact]);

  const { domainMax, ticks } = useMemo(() => {
    const vals: number[] = [];
    for (const r of chartData) {
      if (r.plan != null && Number.isFinite(r.plan)) vals.push(r.plan);
      if (r.fact != null && Number.isFinite(r.fact)) vals.push(r.fact);
    }
    return cashflowYAxisScale(vals);
  }, [chartData]);

  const presentationMonthXTick = useMemo(
    () =>
      createMarketingDealsStyleMonthTickRenderer({
        presDark,
        tickCount: Math.max(1, chartData.length),
      }),
    [presDark, chartData.length],
  );

  if (chartData.length === 0) return null;

  const shell =
    presDark
      ? "mb-0 overflow-visible rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5"
      : mplPremium && presentation
        ? `mb-0 overflow-visible p-4 sm:p-5 ${MPL_PREMIUM_CHART_SHELL}`
        : presentation
          ? "mb-0 overflow-visible rounded-2xl border border-mpl-border bg-mpl-chart p-4 shadow-sm sm:p-5"
          : "mb-0 overflow-visible rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

  const gridStroke = presDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.35)";
  const axisColor = presDark ? "#94a3b8" : "#64748b";

  return (
    <div className={`w-full min-w-0 ${shell}`}>
      <div className="mb-4">
        <h3
          className={`mb-2 text-sm font-semibold leading-tight ${presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900"}`}
        >
          План vs факт
        </h3>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p
            className={`text-[11px] leading-snug ${presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-500"}`}
          >
            Помесячно · те же линии и подписи, что в блоке «Динамика поступлений»
          </p>
          <CashflowInflowChartLegendToolbar chrome={{ presDark, presentation }} className="sm:justify-end" />
        </div>
      </div>

      <div className="min-h-[300px] min-w-0 overflow-visible overflow-x-visible overflow-y-visible pt-3 pb-4">
        <div className="h-[320px] min-h-[300px] w-full min-w-0 overflow-visible [&_svg]:overflow-visible">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minHeight={300}
            className="!overflow-visible [&_svg]:overflow-visible"
            style={{ overflow: "visible", minHeight: 300 }}
          >
            <LineChart
              data={chartData}
              margin={{
                top: presDark ? CHART_MARGIN_TOP_DARK : CHART_MARGIN_TOP_LIGHT,
                right: 12,
                left: CHART_MARGIN_LEFT,
                bottom: CHART_MARGIN_BOTTOM,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="label"
                type="category"
                {...(presentation
                  ? { ...MARKETING_DEALS_STYLE_MONTH_X_AXIS, tick: presentationMonthXTick }
                  : {
                      tick: { fill: axisColor, fontSize: 10 },
                      axisLine: { stroke: gridStroke },
                      tickLine: false,
                      angle: -90,
                      textAnchor: "end" as const,
                      tickMargin: 12,
                      interval: 0,
                      minTickGap: 5,
                    })}
              />
              <YAxis
                domain={[0, domainMax]}
                ticks={ticks}
                tick={{ fill: axisColor, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCashflowYAxisMlnRub(Number(v))}
                width={CHART_Y_AXIS_WIDTH}
                allowDataOverflow
              />
              <Tooltip
                content={<CashflowTooltip darkChrome={presDark} mplPremium={mplPremium && presentation} />}
                cursor={{ stroke: presDark ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.35)" }}
              />
              <Line type="monotone" dataKey="plan" name="План" {...cashflowInflowPlanLineProps(presDark)} />
              <Line type="monotone" dataKey="fact" name="Факт" {...cashflowInflowFactLineProps(presDark)} />
              <CashflowDynamicsSvgLabels
                chartData={chartData}
                presDark={presDark}
                mode="monthly"
                presentation={presentation}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
