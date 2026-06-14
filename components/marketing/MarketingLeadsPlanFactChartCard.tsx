"use client";

import { useMemo } from "react";
import type { LabelProps, TooltipProps } from "recharts";
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
import { periodKeyToRuChartLabel, type CashflowChartRow } from "@/lib/buildCashflowSeries";
import {
  createMarketingDealsStyleMonthTickRenderer,
  MARKETING_DEALS_STYLE_MONTH_X_AXIS,
} from "@/components/marketing/marketingDealsStyleMonthXAxis";
import {
  formatMarketingAdSpendAxisTick,
  formatMarketingAdSpendTooltipRub,
  formatMarketingCostPerLeadAxisTick,
  formatMarketingCostPerLeadRub,
  formatMillionsShort,
  marketingCostPerLeadYAxisScale,
  marketingLeadsIntegerYAxisScale,
  marketingLeadsRubYAxisScale,
} from "@/lib/marketingLeadsChartScale";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";
import { numFmt } from "@/lib/salesPlanChartFormat";

const FACT_STROKE = "#2453D4";
const PLAN_STROKE = "#F0AE63";
const GRID_STROKE = "#E5E7EB";
const CHART_HEIGHT = 260;
const CHART_MARGIN = { top: 20, right: 20, left: 4, bottom: 36 };
const MONTH_AXIS_HEIGHT = 44;
const MONTH_TICK_MARGIN = 8;

type Props = {
  title: string;
  monthly: readonly PlanVsFactMonthlyRubPoint[] | null | undefined;
  valueMode: "rub_mln" | "integer" | "cost_per_lead";
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  hydrated: boolean;
  emptyMessage?: string;
};

function finiteNum(n: number | null | undefined): number | null {
  if (n == null) return null;
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return null;
  return x;
}

function MarketingLeadsPlanFactTooltip({
  active,
  payload,
  presDark,
  mplPremium,
  valueMode,
}: TooltipProps<number, string> & {
  presDark: boolean;
  mplPremium: boolean;
  valueMode: Props["valueMode"];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CashflowChartRow | undefined;
  if (!row) return null;

  const formatVal = (v: number) => {
    if (valueMode === "rub_mln") return formatMarketingAdSpendTooltipRub(v);
    if (valueMode === "cost_per_lead") return formatMarketingCostPerLeadRub(v);
    return numFmt.format(v);
  };

  const base = presDark
    ? "border-slate-500/40 bg-[#0b1220]/92 text-slate-100 backdrop-blur-md"
    : mplPremium
      ? "border-black/[0.05] bg-white/92 text-mpl-text shadow-[0_10px_28px_rgba(15,23,42,0.1)] backdrop-blur-md"
      : "border-slate-200/80 bg-white/95 text-slate-900 shadow-[0_10px_28px_rgba(15,23,42,0.08)] backdrop-blur-sm";

  return (
    <div className={`rounded-xl px-3.5 py-2.5 text-xs ring-1 ring-black/[0.04] ${base}`}>
      <p className={`font-semibold ${presDark ? "text-slate-200" : "text-slate-900"}`}>{row.label}</p>
      <p
        className={`mt-1.5 text-[12px] font-medium leading-snug tabular-nums ${presDark ? "text-slate-200" : "text-slate-800"}`}
      >
        <span style={{ color: PLAN_STROKE }}>План: {row.plan != null ? formatVal(row.plan) : "—"}</span>
        {row.fact != null ? (
          <>
            <span className={presDark ? "text-slate-500" : "text-slate-400"}> / </span>
            <span style={{ color: FACT_STROKE }}>Факт: {formatVal(row.fact)}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function lineDot(fill: string, stroke: string, r: number) {
  return function Dot(props: { cx?: number; cy?: number }) {
    const { cx, cy } = props;
    if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={1} />;
  };
}

export function MarketingLeadsPlanFactChartCard({
  title,
  monthly,
  valueMode,
  presDark,
  presentation,
  mplPremium,
  hydrated,
  emptyMessage = "Нет данных",
}: Props) {
  const isInteger = valueMode === "integer";
  const isCostPerLead = valueMode === "cost_per_lead";

  const chartData = useMemo((): CashflowChartRow[] => {
    const rows = monthly ?? [];
    return [...rows]
      .filter((row) => /^\d{4}-\d{2}$/.test(row.periodKey))
      .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
      .map((row) => {
        const plan = finiteNum(row.planRub);
        const fact = finiteNum(row.factRub);
        return {
          periodKey: row.periodKey,
          label: periodKeyToRuChartLabel(row.periodKey),
          plan: plan != null && plan !== 0 ? plan : null,
          fact: fact != null && fact !== 0 ? fact : null,
          deviation: null,
        };
      })
      .filter((row) => row.plan != null || row.fact != null);
  }, [monthly]);

  const { domainMax, ticks } = useMemo(() => {
    const vals: number[] = [];
    for (const r of chartData) {
      if (r.plan != null) vals.push(r.plan);
      if (r.fact != null) vals.push(r.fact);
    }
    if (isCostPerLead) return marketingCostPerLeadYAxisScale(vals);
    if (isInteger) return marketingLeadsIntegerYAxisScale(vals);
    return marketingLeadsRubYAxisScale(vals);
  }, [chartData, isInteger, isCostPerLead]);

  const formatPointLabel = (v: number) => {
    if (isCostPerLead) return formatMarketingCostPerLeadRub(v);
    if (isInteger) return numFmt.format(Math.round(v));
    return formatMillionsShort(v);
  };

  const formatYAxisTick = (v: number) => {
    if (isCostPerLead) return formatMarketingCostPerLeadAxisTick(v);
    if (isInteger) return numFmt.format(Math.round(v));
    return formatMarketingAdSpendAxisTick(v);
  };

  const monthXTick = useMemo(
    () =>
      createMarketingDealsStyleMonthTickRenderer({
        presDark,
        tickCount: Math.max(1, chartData.length),
        translateYPx: 4,
        labelRotateDeg: 0,
      }),
    [presDark, chartData.length],
  );

  const hasData = chartData.length > 0;
  const ring = presDark ? "#0f172a" : "#FFFFFF";

  const shell = presDark
    ? "overflow-hidden rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm"
    : "overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-sm";

  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900";
  const mutedCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-500";
  const axisColor = presDark ? "#94a3b8" : "#64748b";

  return (
    <div className={`w-full min-w-0 max-h-[340px] ${shell}`}>
      <h4 className={`mb-2 text-sm font-semibold leading-tight ${titleCls}`}>{title}</h4>

      <div className="min-h-0 min-w-0">
        {!hydrated ? (
          <p className={`flex h-[200px] items-center justify-center text-sm ${mutedCls}`}>Загрузка…</p>
        ) : !hasData ? (
          <p className={`flex h-[200px] items-center justify-center px-3 text-center text-sm ${mutedCls}`}>
            {emptyMessage}
          </p>
        ) : (
          <div className="h-[260px] w-full min-w-0 [&_svg]:overflow-visible">
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={chartData} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke={presDark ? "rgba(148,163,184,0.12)" : GRID_STROKE} vertical={false} />
                <XAxis
                  dataKey="label"
                  type="category"
                  {...MARKETING_DEALS_STYLE_MONTH_X_AXIS}
                  tickMargin={MONTH_TICK_MARGIN}
                  height={MONTH_AXIS_HEIGHT}
                  tick={monthXTick}
                />
                <YAxis
                  domain={[0, domainMax]}
                  ticks={ticks}
                  allowDecimals={!isInteger}
                  tick={{ fill: axisColor, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatYAxisTick(Number(v))}
                  width={isCostPerLead ? 48 : isInteger ? 36 : 52}
                />
                <Tooltip
                  content={
                    <MarketingLeadsPlanFactTooltip
                      presDark={presDark}
                      mplPremium={mplPremium && presentation}
                      valueMode={valueMode}
                    />
                  }
                  cursor={false}
                />
                <Line
                  type="monotone"
                  dataKey="fact"
                  name="Факт"
                  stroke={FACT_STROKE}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  connectNulls={false}
                  dot={lineDot(FACT_STROKE, ring, 5)}
                >
                  <LabelList
                    dataKey="fact"
                    content={(props: LabelProps) => {
                      const cx = Number(props.x);
                      const cy = Number(props.y);
                      const num = typeof props.value === "number" ? props.value : Number(props.value);
                      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(num)) return null;
                      return (
                        <text
                          x={cx}
                          y={cy + 12}
                          textAnchor="middle"
                          fill={FACT_STROKE}
                          fontSize={9}
                          fontWeight={600}
                          className="tabular-nums pointer-events-none"
                        >
                          {formatPointLabel(num)}
                        </text>
                      );
                    }}
                  />
                </Line>
                <Line
                  type="monotone"
                  dataKey="plan"
                  name="План"
                  stroke={PLAN_STROKE}
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  connectNulls={false}
                  dot={lineDot(PLAN_STROKE, ring, 4)}
                >
                  <LabelList
                    dataKey="plan"
                    content={(props: LabelProps) => {
                      const cx = Number(props.x);
                      const cy = Number(props.y);
                      const num = typeof props.value === "number" ? props.value : Number(props.value);
                      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(num)) return null;
                      return (
                        <text
                          x={cx}
                          y={cy - 10}
                          textAnchor="middle"
                          fill={PLAN_STROKE}
                          fontSize={9}
                          fontWeight={600}
                          className="tabular-nums pointer-events-none"
                        >
                          {formatPointLabel(num)}
                        </text>
                      );
                    }}
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
