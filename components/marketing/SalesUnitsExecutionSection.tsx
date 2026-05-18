"use client";

import { useMemo, type ReactNode } from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import { MPL_PREMIUM_TOOLTIP_SHELL } from "@/lib/marketingPremiumUi";
import type { UnitsExecutionChartsPayload, UnitsExecutionSegmentRow } from "@/lib/marketingUnitsExecutionCsv";
import { dec1Fmt } from "@/lib/salesPlanChartFormat";

export type UnitsPlanFactChartRow = { key: string; segment: string; plan: number; fact: number };
export type UnitsCompletionChartRow = {
  key: string;
  segment: string;
  completion: number;
  pct: number;
  label: string;
  fill: string;
};

function unitsCompletionFill(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "#94a3b8";
  if (pct > 95) return "#10b981";
  if (pct >= 85) return "#f97316";
  return "#ef4444";
}

/** Строки графиков из `segments` CSV исполнения в штуках — вызывать в родителе, не деривать внутри секции. */
export function buildUnitsPlanFactChartRows(segments: readonly UnitsExecutionSegmentRow[]): UnitsPlanFactChartRow[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  return segments.map((s) => ({
    key: s.key,
    segment: s.segment,
    plan: s.planCumulative,
    fact: s.factCumulative,
  }));
}

export function buildUnitsCompletionChartRows(segments: readonly UnitsExecutionSegmentRow[]): UnitsCompletionChartRow[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  return segments.map((s) => {
    const pct = Number.isFinite(s.completionPct) ? Math.max(0, s.completionPct) : 0;
    const completion = Math.min(108, pct);
    return {
      key: s.key,
      segment: s.segment,
      completion,
      pct,
      label: `${dec1Fmt.format(pct)}%`,
      fill: unitsCompletionFill(pct),
    };
  });
}

type Props = {
  presentation: boolean;
  presDark: boolean;
  mplPremium: boolean;
  /** `undefined` — гидратация; `null` — нет файла; объект — метаданные и KPI. */
  data: UnitsExecutionChartsPayload | null | undefined;
  planFactChartRows: UnitsPlanFactChartRow[];
  completionChartRows: UnitsCompletionChartRow[];
  /** Stale parse error — не показывать, если rows уже есть. */
  unitsCsvError?: string | null;
};

function formatUnits(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("ru-RU");
}

const UNITS_BAR_LABEL_OFFSET_PX = 6;

function formatUnitsBarTopLabel(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return "";
  return Math.round(n).toLocaleString("ru-RU");
}

type UnitsBarLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string;
};

function createUnitsBarTopLabel(fill: string) {
  return function UnitsBarTopLabel(props: UnitsBarLabelProps) {
    const x = typeof props.x === "number" ? props.x : Number(props.x);
    const y = typeof props.y === "number" ? props.y : Number(props.y);
    const width = typeof props.width === "number" ? props.width : Number(props.width);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width)) return null;
    const text = formatUnitsBarTopLabel(props.value);
    if (!text) return null;
    return (
      <text
        x={x + width / 2}
        y={y - UNITS_BAR_LABEL_OFFSET_PX}
        textAnchor="middle"
        dominantBaseline="auto"
        fill={fill}
        fontSize={10}
        fontWeight={600}
        style={{ lineHeight: 1, whiteSpace: "nowrap" }}
        className="tabular-nums pointer-events-none"
      >
        {text}
      </text>
    );
  };
}

const unitsPlanFactFactBarLabel = createUnitsBarTopLabel("#2563EB");
const unitsPlanFactPlanBarLabel = createUnitsBarTopLabel("#F97316");

export function SalesUnitsExecutionSection({
  presentation,
  presDark,
  mplPremium,
  data,
  planFactChartRows,
  completionChartRows,
  unitsCsvError = null,
}: Props) {
  const hydrating = data === undefined;

  const hasData = planFactChartRows.length > 0 || completionChartRows.length > 0;
  const showPlaceholder = !hydrating && !hasData;
  const unitsErr = unitsCsvError?.trim() ?? "";

  if (process.env.NODE_ENV === "development") {
    console.log("[units execution state]", {
      error: unitsCsvError,
      planFactLen: planFactChartRows.length,
      completionLen: completionChartRows.length,
      hasRows: hasData,
    });
  }

  const yDomain = useMemo((): [number, number] => {
    let m = 0;
    for (const r of planFactChartRows) {
      m = Math.max(m, r.plan, r.fact);
    }
    if (m <= 0 || !Number.isFinite(m)) return [0, 1];
    return [0, Math.ceil(m * 1.08)];
  }, [planFactChartRows]);

  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-950";
  const mutedCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-500";
  const chartGrid = presDark ? "rgba(148,163,184,0.2)" : presentation ? "rgba(100,116,139,0.12)" : "rgba(148,163,184,0.28)";
  const chartAxis = presDark ? "#94a3b8" : "#64748b";
  const chartCard = presDark
    ? "flex min-h-[220px] min-w-0 flex-col rounded-xl border border-white/10 bg-slate-900/30 p-3 sm:min-h-[252px] sm:p-4"
    : presentation
      ? "flex min-h-[220px] min-w-0 flex-col rounded-xl border border-mpl-border/80 bg-white/60 p-3 shadow-sm sm:min-h-[252px] sm:p-4"
      : "flex min-h-[220px] min-w-0 flex-col rounded-xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:min-h-[252px] sm:p-4";
  const chartTitle = presDark
    ? "mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
    : presentation
      ? "mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-mpl-muted"
      : "mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500";
  const legendCls = `mt-2 flex flex-wrap gap-3 text-[10px] tabular-nums ${mutedCls}`;
  const mplTooltipPremium = mplPremium && presentation && !presDark;

  const tooltipFrame = (body: ReactNode) =>
    presDark ? (
      <div className="rounded-lg border border-slate-500/40 bg-[#0b1220]/95 px-3 py-2 text-xs text-slate-100 shadow-lg">{body}</div>
    ) : mplTooltipPremium ? (
      <div className={MPL_PREMIUM_TOOLTIP_SHELL}>{body}</div>
    ) : (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-lg">{body}</div>
    );

  const kpiCard = presDark
    ? "rounded-xl border border-white/10 bg-slate-900/25 px-3 py-3 sm:px-4"
    : presentation
      ? "rounded-xl border border-mpl-border/80 bg-white/55 px-3 py-3 shadow-sm sm:px-4"
      : "rounded-xl border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm sm:px-4";

  const placeholder = (text: string) => (
    <p className={`flex min-h-[200px] items-center justify-center px-3 text-center text-xs ${mutedCls}`}>{text}</p>
  );

  return (
    <div
      className={`mt-6 w-full min-w-0 border-t pt-6 ${
        presDark ? "border-white/10" : presentation ? "border-mpl-border/70" : "border-slate-200/70"
      }`}
    >
      <div className="mb-3">
        <h3 className={`text-sm font-semibold tracking-tight sm:text-base ${titleCls}`}>Исполнение плана продаж (штуки)</h3>
      </div>

      {hydrating ? (
        placeholder("Загрузка…")
      ) : showPlaceholder ? (
        placeholder(
          unitsErr && !hasData
            ? unitsErr
            : "Загрузите CSV исполнения в штуках, чтобы увидеть графики и показатели.",
        )
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4" aria-label="Исполнение в штуках">
            <div className={chartCard}>
              <div className={chartTitle}>План vs факт (шт.)</div>
              <div className="relative h-[220px] w-full min-w-0 sm:h-[252px]">
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  <BarChart
                    data={planFactChartRows}
                    margin={{ top: 22, right: 6, left: 0, bottom: 4 }}
                    barGap={6}
                    barCategoryGap="28%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                    <XAxis
                      dataKey="segment"
                      tick={{ fill: chartAxis, fontSize: 10 }}
                      axisLine={{ stroke: chartGrid }}
                      tickLine={false}
                      interval={0}
                      height={36}
                    />
                    <YAxis
                      domain={yDomain}
                      tick={{ fill: chartAxis, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                      tickFormatter={(v) => (Number.isFinite(Number(v)) ? formatUnits(Number(v)) : "")}
                    />
                    <Tooltip
                      cursor={{ fill: presDark ? "rgba(148,163,184,0.06)" : "rgba(100,116,139,0.07)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as UnitsPlanFactChartRow | undefined;
                        if (!row) return null;
                        return tooltipFrame(
                          <>
                            <div className={`font-semibold ${presDark ? "text-slate-100" : "text-slate-900"}`}>{row.segment}</div>
                            <div className={`mt-1.5 space-y-1 tabular-nums ${presDark ? "text-slate-200" : "text-slate-800"}`}>
                              <div>
                                <span className={presDark ? "text-slate-400" : "text-slate-500"}>План: </span>
                                <span style={{ color: "#F97316" }} className="font-medium">
                                  {formatUnits(row.plan)}
                                </span>
                              </div>
                              <div>
                                <span className={presDark ? "text-slate-400" : "text-slate-500"}>Факт: </span>
                                <span style={{ color: "#2563EB" }} className="font-medium">
                                  {formatUnits(row.fact)}
                                </span>
                              </div>
                            </div>
                          </>,
                        );
                      }}
                    />
                    <Bar dataKey="fact" name="Факт" fill="#2563EB" radius={[7, 7, 0, 0]} maxBarSize={46} isAnimationActive={false}>
                      <LabelList dataKey="fact" content={unitsPlanFactFactBarLabel} />
                    </Bar>
                    <Bar dataKey="plan" name="План" fill="#F97316" radius={[7, 7, 0, 0]} maxBarSize={46} isAnimationActive={false}>
                      <LabelList dataKey="plan" content={unitsPlanFactPlanBarLabel} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className={legendCls}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3.5 rounded-sm bg-[#2563EB]" />
                  Факт
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3.5 rounded-sm bg-[#F97316]" />
                  План
                </span>
              </div>
            </div>

            <div className={chartCard}>
              <div className={chartTitle}>Выполнение %</div>
              <div className="relative h-[220px] w-full min-w-0 sm:h-[252px]">
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  <BarChart
                    layout="vertical"
                    data={completionChartRows}
                    margin={{ top: 4, right: 36, left: 4, bottom: 4 }}
                    barCategoryGap={14}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                    <YAxis
                      type="category"
                      dataKey="segment"
                      width={78}
                      tick={{ fill: chartAxis, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <XAxis
                      type="number"
                      domain={[0, 108]}
                      tick={{ fill: chartAxis, fontSize: 10 }}
                      axisLine={{ stroke: chartGrid }}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      cursor={{ fill: presDark ? "rgba(148,163,184,0.06)" : "rgba(100,116,139,0.07)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as UnitsCompletionChartRow | undefined;
                        if (!row) return null;
                        return tooltipFrame(
                          <>
                            <div className={`font-semibold ${presDark ? "text-slate-100" : "text-slate-900"}`}>{row.segment}</div>
                            <div className={`mt-1 tabular-nums ${presDark ? "text-slate-200" : "text-slate-800"}`}>{row.label}</div>
                          </>,
                        );
                      }}
                    />
                    <Bar dataKey="completion" radius={[0, 6, 6, 0]} maxBarSize={14} isAnimationActive={false}>
                      {completionChartRows.map((entry) => (
                        <Cell key={entry.key} fill={entry.fill} />
                      ))}
                      <LabelList dataKey="label" position="right" fill={chartAxis} fontSize={10} fontWeight={500} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className={`${legendCls} gap-x-4 gap-y-1`}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3.5 rounded-sm bg-emerald-500" />
                  выше 95%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3.5 rounded-sm bg-orange-500" />
                  85–95%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-3.5 rounded-sm bg-red-500" />
                  ниже 85%
                </span>
              </div>
            </div>
          </div>

          {!presentation && data != null ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className={kpiCard}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${mutedCls}`}>План накопительно</div>
              <div className={`mt-1 text-lg font-bold tabular-nums ${titleCls}`}>{formatUnits(data.totals.planCumulative)}</div>
            </div>
            <div className={kpiCard}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${mutedCls}`}>Факт накопительно</div>
              <div className={`mt-1 text-lg font-bold tabular-nums ${titleCls}`}>{formatUnits(data.totals.factCumulative)}</div>
            </div>
            <div className={kpiCard}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${mutedCls}`}>Отклонение</div>
              <div
                className={`mt-1 text-lg font-bold tabular-nums ${
                  data.totals.deviationCumulative < 0
                    ? presDark
                      ? "text-rose-300"
                      : "text-rose-700"
                    : presDark
                      ? "text-emerald-300"
                      : "text-emerald-700"
                }`}
              >
                {data.totals.deviationCumulative >= 0 ? "+" : "−"}
                {formatUnits(Math.abs(data.totals.deviationCumulative))}
              </div>
            </div>
            <div className={kpiCard}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${mutedCls}`}>Выполнение %</div>
              <div className={`mt-1 text-lg font-bold tabular-nums ${titleCls}`}>{dec1Fmt.format(data.totals.completionPct)}%</div>
            </div>
          </div>
          ) : null}
        </>
      )}
    </div>
  );
}
