"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

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
import { PlanExecutionMonthlyPlanFactLineCard } from "@/components/marketing/PlanExecutionMonthlyPlanFactLineCard";
import { MPL_PREMIUM_GLASS_MAIN, MPL_PREMIUM_TOOLTIP_SHELL } from "@/lib/marketingPremiumUi";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";
import {
  type SalesPlanExecutionDataset,
  type SalesPlanExecutionRow,
} from "@/lib/marketingSalesPlanExecutionTable";
import {
  resolveSegmentExecutionCompletionRows,
  resolveSegmentExecutionPlanFactRows,
  segmentExecutionHasSegmentPlan,
  sumPlanTotalFromMonthlyPlanVsFact,
  type SegmentExecutionChartsPayload,
} from "@/lib/marketingSegmentExecutionCsv";
import type {
  SegmentExecutionCompletionRow,
  SegmentExecutionPlanFactRow,
} from "@/lib/parseSegmentExecutionCsv";
import type { UnitsExecutionChartsPayload } from "@/lib/marketingUnitsExecutionCsv";
import {
  buildUnitsCompletionChartRows,
  buildUnitsPlanFactChartRows,
  SalesUnitsExecutionSection,
} from "@/components/marketing/SalesUnitsExecutionSection";
import {
  compactRub,
  dec1Fmt,
  formatCompactMoneyAxis,
  formatCumulativePlanFactBarLabel,
} from "@/lib/salesPlanChartFormat";
const CUMULATIVE_BAR_LABEL_OFFSET_PX = 7;

type CumulativeBarLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string;
};

function createCumulativePlanFactBarLabel(fill: string) {
  return function CumulativePlanFactBarLabel(props: CumulativeBarLabelProps) {
    const x = typeof props.x === "number" ? props.x : Number(props.x);
    const y = typeof props.y === "number" ? props.y : Number(props.y);
    const width = typeof props.width === "number" ? props.width : Number(props.width);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width)) return null;
    const text = formatCumulativePlanFactBarLabel(props.value);
    if (!text) return null;
    return (
      <text
        x={x + width / 2}
        y={y - CUMULATIVE_BAR_LABEL_OFFSET_PX}
        textAnchor="middle"
        dominantBaseline="auto"
        fill={fill}
        fontSize={12}
        fontWeight={600}
        style={{ lineHeight: 1, whiteSpace: "nowrap" }}
        className="tabular-nums pointer-events-none"
      >
        {text}
      </text>
    );
  };
}

const cumulativePlanFactFactBarLabel = createCumulativePlanFactBarLabel("#2563EB");
const cumulativePlanFactPlanBarLabel = createCumulativePlanFactBarLabel("#F97316");

function completionBarTone(pct: number | null): { track: string; fill: string } {
  if (pct == null || !Number.isFinite(pct)) {
    return { track: "bg-slate-200/80", fill: "bg-slate-400" };
  }
  if (pct >= 95) return { track: "bg-emerald-100/80", fill: "bg-emerald-500" };
  if (pct >= 75) return { track: "bg-amber-100/80", fill: "bg-amber-500" };
  return { track: "bg-rose-100/80", fill: "bg-rose-500" };
}

function pctText(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${dec1Fmt.format(pct)}%`;
}

type Props = {
  presentation: boolean;
  presDark: boolean;
  mplPremium: boolean;
  /** Таблица детализации — только вне презентации и вне edit mode (view / data). */
  showDetailTable?: boolean;
  /** Данные из CSV/JSON API (без демо в коде) */
  dataset: SalesPlanExecutionDataset;
  /** Помесячный график «План vs факт» из plan_fact.csv (план и факт в одном наборе точек). */
  monthlyPlanVsFact: readonly PlanVsFactMonthlyRubPoint[] | null | undefined;
  /**
   * Верхние два графика: только CSV «исполнение плана по сегментам» (marketingSegmentExecutionCsv).
   * `undefined` — гидратация; `null` — файл не загружен.
   */
  segmentExecutionCharts?: SegmentExecutionChartsPayload | null;
  /** Ошибка загрузки CSV сегментов (показывается только без данных на графиках). */
  segmentExecutionCsvError?: string | null;
  /** Исполнение в штуках — отдельный CSV (localStorage), не Verba / investors / plan_fact. */
  unitsExecutionCharts?: UnitsExecutionChartsPayload | null;
  /** Ошибка загрузки CSV штук (показывается только без строк на графиках). */
  unitsCsvError?: string | null;
};

export function SalesPlanExecutionBlock({
  presentation,
  presDark,
  mplPremium,
  showDetailTable = true,
  dataset,
  monthlyPlanVsFact,
  segmentExecutionCharts,
  segmentExecutionCsvError = null,
  unitsExecutionCharts,
  unitsCsvError = null,
}: Props) {
  const data = dataset;
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const segmentChartsHydrating = segmentExecutionCharts === undefined;

  const shell = presDark
    ? "mb-7 rounded-2xl border border-slate-700/55 bg-[#1e293b] px-5 pb-5 pt-4 shadow-[0_8px_28px_rgba(0,0,0,0.2)] sm:px-6 sm:pb-6 sm:pt-4"
    : mplPremium && presentation
      ? `mb-7 px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-4 ${MPL_PREMIUM_GLASS_MAIN}`
      : presentation
        ? "mb-7 rounded-2xl border border-mpl-border bg-mpl-card px-5 pb-5 pt-4 shadow-sm sm:px-6 sm:pb-6 sm:pt-4"
        : "mb-7 rounded-2xl border border-slate-200/70 bg-white px-5 pb-5 pt-4 shadow-[0_4px_24px_rgba(15,23,42,0.04)] sm:px-6 sm:pb-6 sm:pt-4";

  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-950";
  const mutedCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-500";
  const thCls = presDark
    ? "border-b border-white/10 bg-slate-900/50 px-2.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400"
    : "border-b border-slate-200/80 bg-slate-50/90 px-2.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500";
  const tdBase = presDark ? "border-b border-white/[0.06] px-2.5 py-2 text-[12px]" : "border-b border-slate-100 px-2.5 py-2 text-[12px]";
  const zebra = presDark ? "even:bg-white/[0.03] hover:bg-white/[0.05]" : "even:bg-slate-50/60 hover:bg-slate-100/50";
  const totalRow = presDark
    ? "border-t border-white/10 bg-slate-900/70 font-semibold text-slate-50"
    : "border-t border-slate-200 bg-slate-100/80 font-semibold text-slate-900";

  const hasSegmentExecutionChartRows = useMemo(() => {
    if (segmentChartsHydrating || !segmentExecutionCharts) return false;
    const pf = segmentExecutionCharts.planFactRows ?? [];
    return (
      pf.length > 0 &&
      pf.some((r) => Math.abs(r.fact) > 1e-9 || Math.abs(r.plan) > 1e-9)
    );
  }, [segmentChartsHydrating, segmentExecutionCharts]);

  const segmentExecutionMissing = !segmentChartsHydrating && segmentExecutionCharts == null;
  const segmentExecutionEmptyFile =
    !segmentChartsHydrating && segmentExecutionCharts != null && !hasSegmentExecutionChartRows;

  const macroChartPlaceholderResolved = useMemo(() => {
    if (segmentChartsHydrating) return "Загрузка…";
    if (hasSegmentExecutionChartRows) return null;
    const err = segmentExecutionCsvError?.trim();
    if (err) return err;
    if (segmentExecutionMissing) {
      return "Загрузите CSV исполнения плана продаж для графиков «План vs факт (накопительно)» и «Выполнение %»";
    }
    return "В CSV исполнения плана нет распознанных строк по сегментам.";
  }, [
    segmentChartsHydrating,
    hasSegmentExecutionChartRows,
    segmentExecutionCsvError,
    segmentExecutionMissing,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const planTotalFb = sumPlanTotalFromMonthlyPlanVsFact(monthlyPlanVsFact);
    const pf = resolveSegmentExecutionPlanFactRows(segmentExecutionCharts, planTotalFb);
    console.log("[segment execution state]", {
      store: "marketingSegmentExecutionCsv",
      error: segmentExecutionCsvError,
      planFactRows: pf,
      completionRows: resolveSegmentExecutionCompletionRows(segmentExecutionCharts, pf, planTotalFb),
      planTotal: segmentExecutionCharts?.planTotal ?? planTotalFb,
      totalFact:
        segmentExecutionCharts?.totalFact ?? pf.reduce((s, r) => s + Math.max(0, r.fact), 0),
      hasSegmentPlan: segmentExecutionHasSegmentPlan(segmentExecutionCharts, planTotalFb),
    });
  }, [segmentExecutionCsvError, segmentExecutionCharts, hasSegmentExecutionChartRows, monthlyPlanVsFact]);

  const unitsPlanFactChartRows = useMemo(
    () => buildUnitsPlanFactChartRows(unitsExecutionCharts?.segments ?? []),
    [unitsExecutionCharts],
  );
  const unitsCompletionChartRows = useMemo(
    () => buildUnitsCompletionChartRows(unitsExecutionCharts?.segments ?? []),
    [unitsExecutionCharts],
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.log("[UNITS CHART DATA]", {
      planFact: unitsPlanFactChartRows,
      completion: unitsCompletionChartRows,
      segments: unitsExecutionCharts?.segments?.map((s) => ({
        key: s.key,
        segment: s.segment,
        planCumulative: s.planCumulative,
        factCumulative: s.factCumulative,
        completionPct: s.completionPct,
      })),
    });
  }, [unitsPlanFactChartRows, unitsCompletionChartRows, unitsExecutionCharts]);

  const toggleComment = (id: string) => {
    setOpenComments((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const tableWrap = presDark
    ? "min-w-0 overflow-x-auto rounded-xl border border-white/10 bg-slate-900/25"
    : "min-w-0 overflow-x-auto rounded-xl border border-slate-200/70 bg-white/50 shadow-inner shadow-slate-200/30";

  return (
    <section className={shell} aria-labelledby="sales-plan-exec-heading">
      <div className="mb-2 sm:mb-3">
        <h2 id="sales-plan-exec-heading" className={`text-base font-semibold tracking-tight sm:text-lg ${titleCls}`}>
          Исполнение плана продаж
        </h2>
      </div>

      <div className="flex min-w-0 w-full flex-col gap-3 sm:gap-4">
        <ExecutionMacroChartsBlock
          presDark={presDark}
          presentation={presentation}
          mplPremium={mplPremium}
          mutedCls={mutedCls}
          segmentExecutionCharts={segmentExecutionCharts}
          monthlyPlanVsFact={monthlyPlanVsFact}
          macroChartPlaceholder={macroChartPlaceholderResolved}
        />

        <div className="min-w-0 w-full max-w-none">
          <PlanExecutionMonthlyPlanFactLineCard
            monthlyPlanVsFact={monthlyPlanVsFact}
            presentation={presentation}
            presDark={presDark}
            mplPremium={mplPremium}
          />
        </div>

        <SalesUnitsExecutionSection
          presentation={presentation}
          presDark={presDark}
          mplPremium={mplPremium}
          data={unitsExecutionCharts}
          planFactChartRows={unitsPlanFactChartRows}
          completionChartRows={unitsCompletionChartRows}
          unitsCsvError={unitsCsvError}
        />
      </div>

      {showDetailTable ? (
        data.rows.length === 0 ? (
          <p className={`mt-4 text-sm ${mutedCls}`}>
            Нет строк <span className="font-medium">детализации исполнения</span> (CSV Верба / API исполнения). Чтобы
            заполнить таблицу, загрузите CSV в режиме редактирования или положите файл в{" "}
            <code className={`rounded px-1 py-0.5 text-xs ${presDark ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700"}`}>
              data/marketing-sales-plan-execution/
            </code>
            .
          </p>
        ) : (
          <>
            <div className={`${tableWrap} mt-4`}>
              <table className="w-full min-w-[920px] border-collapse text-left">
              <thead>
                <tr>
                  <th
                    className={`${thCls} sticky left-0 z-[1] min-w-[10.5rem] max-w-[14rem] ${presDark ? "bg-slate-900/95" : "bg-slate-50/95"}`}
                  >
                    Наименование
                  </th>
                  <th className={`${thCls} whitespace-nowrap text-right`}>План проекта</th>
                  <th className={`${thCls} whitespace-nowrap text-right`}>План на отчётный месяц</th>
                  <th className={`${thCls} whitespace-nowrap text-right`}>План накопительно</th>
                  <th className={`${thCls} whitespace-nowrap text-right`}>Факт накопительно</th>
                  <th className={`${thCls} whitespace-nowrap text-right`}>Отклонение</th>
                  <th className={`${thCls} whitespace-nowrap`}>% выполнения</th>
                  <th className={`${thCls} whitespace-nowrap text-right`}>% от общего объёма</th>
                  <th className={`${thCls} w-10 text-center`} title="Комментарий к отклонению" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <ExecutionTableRow
                    key={row.id}
                    row={row}
                    presDark={presDark}
                    tdBase={tdBase}
                    zebra={!row.isTotal ? zebra : ""}
                    totalRow={row.isTotal ? totalRow : ""}
                    openComments={openComments}
                    onToggleComment={toggleComment}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <p className={`mt-4 text-[10px] leading-snug sm:text-[11px] ${mutedCls}`}>
            График «План vs факт»: единый файл plan_fact.csv (колонки «План продаж ЗМП» и «Сумма поступлений факт»).
            Источник: CSV →{" "}
            <code className={`rounded px-1 py-0.5 text-[10px] ${presDark ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700"}`}>
              lib/parsePlanFactCsv.ts
            </code>{" "}
            · API{" "}
            <code className={`rounded px-1 py-0.5 text-[10px] ${presDark ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700"}`}>
              /api/marketing/sales-plan-execution
            </code>
            .
          </p>
          </>
        )
      ) : null}
    </section>
  );
}

/** Два верхних bar chart: только CSV segment execution (marketingSegmentExecutionCsv). */
function ExecutionMacroChartsBlock({
  presDark,
  presentation,
  mplPremium,
  mutedCls,
  segmentExecutionCharts,
  monthlyPlanVsFact,
  macroChartPlaceholder,
}: {
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  mutedCls: string;
  segmentExecutionCharts: SegmentExecutionChartsPayload | null | undefined;
  monthlyPlanVsFact: readonly PlanVsFactMonthlyRubPoint[] | null | undefined;
  /** Текст пустого состояния, если нет строк для соответствующего графика (загрузка / нет файла / пустой CSV). */
  macroChartPlaceholder: string | null;
}) {
  const planTotalFallback = useMemo(
    () => sumPlanTotalFromMonthlyPlanVsFact(monthlyPlanVsFact),
    [monthlyPlanVsFact],
  );

  const planFactRows = useMemo(
    (): SegmentExecutionPlanFactRow[] =>
      resolveSegmentExecutionPlanFactRows(segmentExecutionCharts, planTotalFallback),
    [segmentExecutionCharts, planTotalFallback],
  );

  const hasSegmentPlan = segmentExecutionHasSegmentPlan(segmentExecutionCharts, planTotalFallback);

  const completionRows = useMemo(
    (): SegmentExecutionCompletionRow[] =>
      resolveSegmentExecutionCompletionRows(segmentExecutionCharts, planFactRows, planTotalFallback),
    [segmentExecutionCharts, planFactRows, planTotalFallback],
  );

  const planFactYDomain = useMemo((): [number, number] => {
    let m = 0;
    for (const row of planFactRows) {
      if (hasSegmentPlan && Number.isFinite(row.plan)) m = Math.max(m, row.plan);
      if (Number.isFinite(row.fact)) m = Math.max(m, row.fact);
    }
    if (m <= 0 || !Number.isFinite(m)) return [0, 1];
    return [0, m * 1.08];
  }, [planFactRows, hasSegmentPlan]);

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

  const showPlanFactChart = planFactRows.length > 0;
  const showCompletionColumn = showPlanFactChart;
  const showCompletionChart =
    showCompletionColumn && hasSegmentPlan && completionRows.length > 0;

  const emptyOrPlaceholder = macroChartPlaceholder ?? "Нет данных для графика";

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (planFactRows.length === 0) return;

    const planTotal =
      segmentExecutionCharts?.planTotal ?? planTotalFallback;
    const totalFact =
      segmentExecutionCharts?.totalFact ??
      planFactRows.reduce((s, r) => s + Math.max(0, r.fact), 0);

    console.log("[PLAN VS FACT SOURCE]", {
      dataSource: "segment-execution-csv",
      storageKey: "marketingSegmentExecutionCsv",
      parser: "lib/parseSegmentExecutionCsv.ts",
    });
    console.log("[PLAN VS FACT SOURCE]", { planFactRows, planTotal, totalFact });
    console.table(planFactRows);

    console.log("[COMPLETION SOURCE]", {
      dataSource: "segment-execution-csv",
      planFactRows,
      completionRows,
      planTotal,
      totalFact,
    });
    console.table(completionRows);
    for (const row of completionRows) {
      const pf = planFactRows.find((r) => r.key === row.key);
      console.log("[COMPLETION SOURCE]", {
        segment: row.segment,
        plan: pf?.plan,
        fact: pf?.fact,
        completion: row.pct,
        pct: row.pct,
      });
    }
  }, [planFactRows, completionRows, planTotalFallback, segmentExecutionCharts]);

  return (
    <div
      className={`grid min-w-0 grid-cols-1 gap-3 sm:gap-4 ${showCompletionColumn ? "sm:grid-cols-2" : ""}`}
      aria-label="Визуальная аналитика исполнения плана"
    >
      <div className={chartCard}>
        <div className={chartTitle}>
          {hasSegmentPlan ? "План vs факт (накопительно)" : "Факт (накопительно)"}
        </div>
        <div className="relative h-[220px] w-full min-w-0 sm:h-[252px]">
          {!showPlanFactChart ? (
            <p className={`flex h-[200px] items-center justify-center px-2 text-center text-xs ${mutedCls}`}>
              {emptyOrPlaceholder}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <BarChart
                data={planFactRows}
                margin={{ top: 32, right: 6, left: 0, bottom: 4 }}
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
                  domain={planFactYDomain}
                  tick={{ fill: chartAxis, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v) => (Number.isFinite(Number(v)) ? formatCompactMoneyAxis(Number(v)) : "")}
                />
                <Tooltip
                  cursor={{ fill: presDark ? "rgba(148,163,184,0.06)" : "rgba(100,116,139,0.07)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as SegmentExecutionPlanFactRow | undefined;
                    if (!row) return null;
                    const pct = hasSegmentPlan && row.plan > 0 ? ((row.fact / row.plan) * 100).toFixed(1) : "—";
                    return tooltipFrame(
                      <>
                        <div className={`font-semibold ${presDark ? "text-slate-100" : "text-slate-900"}`}>{row.segment}</div>
                        <div className={`mt-1.5 space-y-1 tabular-nums ${presDark ? "text-slate-200" : "text-slate-800"}`}>
                          {hasSegmentPlan ? (
                          <div>
                            <span className={presDark ? "text-slate-400" : "text-slate-500"}>План: </span>
                            <span style={{ color: "#F97316" }} className="font-medium">
                              {formatCompactMoneyAxis(row.plan)}
                            </span>
                          </div>
                          ) : null}
                          <div>
                            <span className={presDark ? "text-slate-400" : "text-slate-500"}>Факт: </span>
                            <span style={{ color: "#2563EB" }} className="font-medium">
                              {formatCompactMoneyAxis(row.fact)}
                            </span>
                          </div>
                          {hasSegmentPlan ? (
                          <div className={`border-t pt-1.5 ${presDark ? "border-slate-600/50" : "border-slate-200"}`}>
                            <span className={presDark ? "text-slate-400" : "text-slate-500"}>Выполнение: </span>
                            <span className="font-semibold">{pct === "—" ? pct : `${pct}%`}</span>
                          </div>
                          ) : null}
                        </div>
                      </>,
                    );
                  }}
                />
                <Bar dataKey="fact" name="Факт" fill="#2563EB" radius={[7, 7, 0, 0]} maxBarSize={46} isAnimationActive={false}>
                  <LabelList dataKey="fact" content={cumulativePlanFactFactBarLabel} />
                </Bar>
                {hasSegmentPlan ? (
                  <Bar dataKey="plan" name="План" fill="#F97316" radius={[7, 7, 0, 0]} maxBarSize={46} isAnimationActive={false}>
                    <LabelList dataKey="plan" content={cumulativePlanFactPlanBarLabel} />
                  </Bar>
                ) : null}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {showPlanFactChart ? (
          <div className={legendCls}>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3.5 rounded-sm bg-[#2563EB]" />
              Факт
            </span>
            {hasSegmentPlan ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-3.5 rounded-sm bg-[#F97316]" />
                План
              </span>
            ) : null}
          </div>
        ) : null}
        {showPlanFactChart && !hasSegmentPlan ? (
          <p className={`mt-2 text-[10px] leading-snug ${mutedCls}`}>
            В CSV нет плана по сегментам — показан только факт.
          </p>
        ) : null}
      </div>

      {showCompletionColumn ? (
        <div className={chartCard}>
          <div className={chartTitle}>Выполнение %</div>
          <div className="relative h-[220px] w-full min-w-0 sm:h-[252px]">
            {!showCompletionChart ? (
              <p className={`flex h-[200px] items-center justify-center px-2 text-center text-xs ${mutedCls}`}>
                Добавьте колонку «План продаж» в CSV сегментов или загрузите plan_fact.csv для расчёта %
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                <BarChart
                  layout="vertical"
                  data={completionRows}
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
                      const row = payload[0]?.payload as SegmentExecutionCompletionRow | undefined;
                      if (!row) return null;
                      return tooltipFrame(
                        <>
                          <div className={`font-semibold ${presDark ? "text-slate-100" : "text-slate-900"}`}>{row.segment}</div>
                          <div className={`mt-1 tabular-nums ${presDark ? "text-slate-200" : "text-slate-800"}`}>
                            {`${dec1Fmt.format(row.pct)}%`}
                          </div>
                        </>,
                      );
                    }}
                  />
                  <Bar dataKey="completion" radius={[0, 6, 6, 0]} maxBarSize={14} isAnimationActive={false}>
                    {completionRows.map((entry) => (
                      <Cell key={entry.key} fill={entry.fill} />
                    ))}
                    <LabelList
                      dataKey="label"
                      position="right"
                      fill={chartAxis}
                      fontSize={10}
                      fontWeight={500}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {showCompletionChart ? (
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
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ExecutionTableRow({
  row,
  presDark,
  tdBase,
  zebra,
  totalRow,
  openComments,
  onToggleComment,
}: {
  row: SalesPlanExecutionRow;
  presDark: boolean;
  tdBase: string;
  zebra: string;
  totalRow: string;
  openComments: Record<string, boolean>;
  onToggleComment: (id: string) => void;
}) {
  const tones = completionBarTone(row.completionPct);
  const pctW = row.completionPct == null ? 0 : Math.min(100, Math.max(0, row.completionPct));
  const devCls =
    row.deviationRub < 0 ? "text-rose-600" : row.deviationRub > 0 ? "text-emerald-600" : presDark ? "text-slate-300" : "text-slate-600";
  const stickyBg = row.isTotal
    ? presDark
      ? "bg-slate-900/70"
      : "bg-slate-100/80"
    : presDark
      ? "bg-[#1e293b]/95"
      : "bg-white/95";
  const stickyName = `sticky left-0 z-[1] ${stickyBg} backdrop-blur-[2px] ${row.isTotal ? "font-semibold" : ""}`;

  return (
    <>
      <tr className={`${zebra} ${totalRow}`.trim()}>
        <td className={`${tdBase} ${stickyName} border-r border-slate-200/60 dark:border-white/10`}>{row.name}</td>
        <td className={`${tdBase} text-right tabular-nums ${presDark ? "text-slate-200" : "text-slate-800"}`}>{compactRub(row.planProjectRub)}</td>
        <td className={`${tdBase} text-right tabular-nums ${presDark ? "text-slate-200" : "text-slate-800"}`}>{compactRub(row.planReportMonthRub)}</td>
        <td className={`${tdBase} text-right tabular-nums ${presDark ? "text-slate-200" : "text-slate-800"}`}>{compactRub(row.planCumulativeRub)}</td>
        <td className={`${tdBase} text-right tabular-nums ${presDark ? "text-slate-200" : "text-slate-800"}`}>{compactRub(row.factCumulativeRub)}</td>
        <td className={`${tdBase} text-right tabular-nums font-medium ${devCls}`}>{compactRub(row.deviationRub)}</td>
        <td className={`${tdBase}`}>
          <div className="flex min-w-[7.5rem] items-center gap-2">
            <div className={`h-2 min-w-[4.5rem] flex-1 overflow-hidden rounded-full ${tones.track}`}>
              <div className={`h-full rounded-full transition-[width] duration-500 ${tones.fill}`} style={{ width: `${pctW}%` }} />
            </div>
            <span className={`shrink-0 tabular-nums text-[11px] font-semibold ${presDark ? "text-slate-200" : "text-slate-800"}`}>
              {pctText(row.completionPct)}
            </span>
          </div>
        </td>
        <td className={`${tdBase} text-right tabular-nums ${presDark ? "text-slate-200" : "text-slate-800"}`}>
          {dec1Fmt.format(row.shareOfVolumePct)}%
        </td>
        <td className={`${tdBase} text-center align-middle`}>
          {row.deviationComment ? (
            <button
              type="button"
              className={`inline-flex items-center justify-center rounded-md p-1 transition ${
                presDark ? "text-slate-400 hover:bg-white/10 hover:text-slate-200" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              }`}
              title={row.deviationComment}
              aria-expanded={!!openComments[row.id]}
              aria-label={openComments[row.id] ? "Скрыть комментарий" : "Показать комментарий"}
              onClick={() => onToggleComment(row.id)}
            >
              <Info className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ) : (
            <span className="inline-block w-4" aria-hidden />
          )}
        </td>
      </tr>
      {row.deviationComment && openComments[row.id] ? (
        <tr className={presDark ? "bg-slate-900/50" : "bg-slate-50/90"}>
          <td
            colSpan={9}
            className={`border-b px-3 py-2 text-[11px] leading-snug ${
              presDark ? "border-white/[0.06] text-slate-300" : "border-slate-100 text-slate-600"
            }`}
          >
            <span className={`font-medium ${presDark ? "text-slate-200" : "text-slate-800"}`}>{row.name}:</span> {row.deviationComment}
          </td>
        </tr>
      ) : null}
    </>
  );
}
