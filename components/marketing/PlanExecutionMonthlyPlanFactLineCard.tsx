"use client";

import { useEffect, useMemo } from "react";
import type { LabelProps } from "recharts";

import { CashflowInflowChartLegendToolbar } from "@/components/marketing/CashflowInflowChartLegend";
import { CashflowTooltip } from "@/components/marketing/SalesPlanCashflowDynamicsChart";
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
import { cashflowInflowFactLineProps, cashflowInflowPlanLineProps, cashflowInflowDotRingStroke, CASHFLOW_INFLOW_FACT, CASHFLOW_INFLOW_PLAN } from "@/lib/cashflowInflowChartSeries";
import {
  createMarketingDealsStyleMonthTickRenderer,
  MARKETING_DEALS_STYLE_MONTH_X_AXIS,
} from "@/components/marketing/marketingDealsStyleMonthXAxis";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";
import { MPL_PREMIUM_CHART_SHELL } from "@/lib/marketingPremiumUi";
import {
  formatCashflowMillionsLabelTidy,
  cashflowYAxisScale,
  formatCashflowYAxisMlnRub,
} from "@/lib/salesPlanChartFormat";

function lineDotAlwaysVisible(fill: string, strokeRing: string, r: number) {
  return function LineDot(props: { cx?: number; cy?: number }) {
    const { cx, cy } = props;
    if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={strokeRing} strokeWidth={1} />;
  };
}

/** План: подпись над точкой (вверх по SVG). Факт: подпись под точкой. */
const PLAN_LABEL_OFFSET_ABOVE_PX = 16;
const FACT_LABEL_OFFSET_BELOW_PX = 18;

/** Порог «план и факт близко» (млн ₽ по модулю разницы в рублях): доп. сдвиг подписей. */
const CLOSE_PLAN_FACT_RUB = 8 * 1_000_000;
const CLOSE_EXTRA_PLAN_ABOVE_PX = 10;
const CLOSE_EXTRA_FACT_BELOW_PX = 10;

const PLAN_LABEL_TEXT_FILL = "#F97316";
const FACT_LABEL_TEXT_FILL = "#1D4ED8";

/** Если соседние точки близки по ₽, слегаем по Y, чтобы подписи не слипались. */
function buildLabelStaggerPx(values: (number | null)[], domainHiRub: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(0);
  const eps = Math.max(domainHiRub * 0.07, 1);
  for (let i = 1; i < n; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(b - a) < eps) {
      out[i] = Math.min(28, out[i - 1]! + 8);
    }
  }
  return out;
}
const CHART_MARGIN_TOP_LIGHT = 52;
const CHART_MARGIN_TOP_DARK = 42;
const CHART_MARGIN_BOTTOM = 92;
const CHART_MARGIN_LEFT = 10;
const CHART_Y_AXIS_WIDTH = 88;

type Props = {
  /** Помесячный график «План vs факт» из plan_fact.csv (единый набор точек). */
  monthlyPlanVsFact: readonly PlanVsFactMonthlyRubPoint[] | null | undefined;
  presentation: boolean;
  presDark: boolean;
  mplPremium: boolean;
};

function rubFromLabelValue(v: LabelProps["value"]): number | null {
  if (v == null || typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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

  const factStaggerPx = useMemo(
    () => buildLabelStaggerPx(chartData.map((r) => r.fact), domainMax),
    [chartData, domainMax],
  );
  const planStaggerPx = useMemo(
    () => buildLabelStaggerPx(chartData.map((r) => r.plan), domainMax),
    [chartData, domainMax],
  );

  const planFactCloseSepPx = useMemo(
    () =>
      chartData.map((r) => {
        const p = r.plan;
        const f = r.fact;
        if (p == null || f == null || !Number.isFinite(p) || !Number.isFinite(f)) return 0;
        return Math.abs(f - p) < CLOSE_PLAN_FACT_RUB ? 1 : 0;
      }),
    [chartData],
  );

  const monthXTick = useMemo(
    () =>
      createMarketingDealsStyleMonthTickRenderer({
        presDark,
        tickCount: Math.max(1, chartData.length),
      }),
    [presDark, chartData.length],
  );

  const labelHaloStroke = presDark ? "rgba(15,23,42,0.96)" : "#ffffff";

  const ringStroke = cashflowInflowDotRingStroke(presDark);
  const factLinePropsNoDot = useMemo(() => {
    const p = cashflowInflowFactLineProps(presDark);
    const { dot: _dot, ...rest } = p;
    return rest;
  }, [presDark]);
  const planLinePropsNoDot = useMemo(() => {
    const p = cashflowInflowPlanLineProps(presDark);
    const { dot: _dot, ...rest } = p;
    return rest;
  }, [presDark]);
  const factDot = useMemo(
    () => lineDotAlwaysVisible(CASHFLOW_INFLOW_FACT.stroke, ringStroke, CASHFLOW_INFLOW_FACT.dotR),
    [ringStroke],
  );
  const planDot = useMemo(
    () => lineDotAlwaysVisible(CASHFLOW_INFLOW_PLAN.stroke, ringStroke, CASHFLOW_INFLOW_PLAN.dotR),
    [ringStroke],
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
            План и факт из одного файла plan_fact.csv (колонки «План продаж ЗМП» и «Сумма поступлений факт»). Линии как в «Динамика поступлений».
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
                cursor={false}
              />
              <Line type="monotone" dataKey="fact" name="Факт" {...factLinePropsNoDot} dot={factDot}>
                <LabelList
                  dataKey="fact"
                  content={(props: LabelProps) => {
                    const idx = props.index ?? 0;
                    const cx = Number(props.x);
                    const cy = Number(props.y);
                    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
                    const num = rubFromLabelValue(props.value);
                    if (num == null) return null;
                    const st = factStaggerPx[idx] ?? 0;
                    const close = planFactCloseSepPx[idx] ?? 0;
                    const yOff = FACT_LABEL_OFFSET_BELOW_PX + st + close * CLOSE_EXTRA_FACT_BELOW_PX;
                    return (
                      <text
                        key={`fact-lbl-${idx}`}
                        x={cx}
                        y={cy + yOff}
                        textAnchor="middle"
                        dominantBaseline="hanging"
                        fill={FACT_LABEL_TEXT_FILL}
                        stroke={labelHaloStroke}
                        strokeWidth={4}
                        paintOrder="stroke fill"
                        fontSize={10}
                        fontWeight={600}
                        style={{ lineHeight: 1 }}
                        letterSpacing="-0.2px"
                        className="tabular-nums pointer-events-none"
                      >
                        {formatCashflowMillionsLabelTidy(num, false)}
                      </text>
                    );
                  }}
                />
              </Line>
              <Line type="monotone" dataKey="plan" name="План" {...planLinePropsNoDot} dot={planDot}>
                <LabelList
                  dataKey="plan"
                  content={(props: LabelProps) => {
                    const idx = props.index ?? 0;
                    const cx = Number(props.x);
                    const cy = Number(props.y);
                    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
                    const num = rubFromLabelValue(props.value);
                    if (num == null) return null;
                    const st = planStaggerPx[idx] ?? 0;
                    const close = planFactCloseSepPx[idx] ?? 0;
                    const yOff = PLAN_LABEL_OFFSET_ABOVE_PX + st + close * CLOSE_EXTRA_PLAN_ABOVE_PX;
                    return (
                      <text
                        key={`plan-lbl-${idx}`}
                        x={cx}
                        y={cy - yOff}
                        textAnchor="middle"
                        dominantBaseline="alphabetic"
                        fill={PLAN_LABEL_TEXT_FILL}
                        stroke={labelHaloStroke}
                        strokeWidth={4}
                        paintOrder="stroke fill"
                        fontSize={10}
                        fontWeight={600}
                        style={{ lineHeight: 1 }}
                        letterSpacing="-0.2px"
                        className="tabular-nums pointer-events-none"
                      >
                        {formatCashflowMillionsLabelTidy(num, false)}
                      </text>
                    );
                  }}
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
