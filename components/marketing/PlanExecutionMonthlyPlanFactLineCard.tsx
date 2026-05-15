"use client";

import { useEffect, useMemo } from "react";

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
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";
import { MPL_PREMIUM_CHART_SHELL } from "@/lib/marketingPremiumUi";
import { cashflowYAxisScale, formatCashflowYAxisMlnRub } from "@/lib/salesPlanChartFormat";

/** Согласовано с `SalesPlanCashflowDynamicsChart` (помесячный режим + подписи). */
const CHART_MARGIN_TOP_LIGHT = 40;
const CHART_MARGIN_TOP_DARK = 30;
const CHART_MARGIN_BOTTOM = 82;
const CHART_MARGIN_LEFT = 10;
const CHART_Y_AXIS_WIDTH = 88;

type Props = {
  /** План из CSV исполнения + факт из CSV поступлений; merge в панели. */
  monthlyPlanVsFact: readonly PlanVsFactMonthlyRubPoint[] | null | undefined;
  presentation: boolean;
  presDark: boolean;
  mplPremium: boolean;
};

function finiteSeriesRub(n: number | null | undefined): number | null {
  if (n == null) return null;
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x) || x === Infinity || x === -Infinity) return null;
  return x;
}

export function PlanExecutionMonthlyPlanFactLineCard({ monthlyPlanVsFact, presentation, presDark, mplPremium }: Props) {
  const chartData = useMemo((): CashflowChartRow[] => {
    const rows = monthlyPlanVsFact ?? [];
    return [...rows]
      .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
      .map((row) => {
        const plan = finiteSeriesRub(row.planRub);
        const fact = finiteSeriesRub(row.factRub);
        const deviation =
          plan != null && fact != null && Number.isFinite(plan) && Number.isFinite(fact) ? fact - plan : null;
        return {
          periodKey: row.periodKey,
          label: periodKeyToRuChartLabel(row.periodKey),
          plan,
          fact,
          deviation,
        };
      });
  }, [monthlyPlanVsFact]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const rows = monthlyPlanVsFact ?? [];
    if (rows.length === 0) return;
    const datasetMln = [...rows]
      .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
      .map((r) => ({
        month: periodKeyToRuChartLabel(r.periodKey),
        plan: r.planRub == null ? null : Math.round((finiteSeriesRub(r.planRub)! / 1_000_000) * 1000) / 1000,
        fact: r.factRub == null ? null : Math.round((finiteSeriesRub(r.factRub)! / 1_000_000) * 1000) / 1000,
      }));
    console.log("[PlanVsFact] merged dataset (млн ₽)", datasetMln, rows);
  }, [monthlyPlanVsFact]);

  const { domainMax, ticks } = useMemo(() => {
    const vals: number[] = [];
    for (const r of chartData) {
      if (r.plan != null && Number.isFinite(r.plan)) vals.push(r.plan);
      if (r.fact != null && Number.isFinite(r.fact)) vals.push(r.fact);
    }
    return cashflowYAxisScale(vals);
  }, [chartData]);

  const monthXTick = useMemo(
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
            План — CSV исполнения плана (Верба); факт — CSV факта поступлений. Линии как в «Динамика поступлений».
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
            style={{ overflow: "visible" }}
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
                {...MARKETING_DEALS_STYLE_MONTH_X_AXIS}
                tick={monthXTick}
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
              {/*
                При совпадении план/факт по Y синяя линия перекрывает оранжевую, если нарисовать план первым.
                Сначала факт, затем план.
              */}
              <Line type="monotone" dataKey="fact" name="Факт" {...cashflowInflowFactLineProps(presDark)} />
              <Line type="monotone" dataKey="plan" name="План" {...cashflowInflowPlanLineProps(presDark)} />
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
