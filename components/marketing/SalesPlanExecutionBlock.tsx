"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import {
  formatReportDateRu,
  MARKETING_SALES_PLAN_EXECUTION_DEMO,
  type SalesPlanExecutionDataset,
  type SalesPlanExecutionRow,
  type SalesPlanExecutionRowId,
} from "@/lib/marketingSalesPlanExecutionTable";
import { compactRub, dec1Fmt, formatCompactMoneyAxis } from "@/lib/salesPlanChartFormat";

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

/** Агрегированные сегменты для BI-графиков (план/факт, выполнение). */
const EXECUTION_MACRO_IDS: SalesPlanExecutionRowId[] = ["apartments", "parking", "storage", "commercial"];

/** Цвет столбца «% выполнения» для графика: зелёный &gt;95%, оранжевый 85–95%, красный &lt;85%. */
function completionChartFill(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "#94a3b8";
  if (pct > 95) return "#10b981";
  if (pct >= 85) return "#f97316";
  return "#ef4444";
}

function executionRowsById(rows: SalesPlanExecutionRow[]): Map<SalesPlanExecutionRowId, SalesPlanExecutionRow> {
  return new Map(rows.map((r) => [r.id, r]));
}

type Props = {
  presentation: boolean;
  presDark: boolean;
  mplPremium: boolean;
  /** Если не задано — демо-набор до импорта Excel/JSON */
  dataset?: SalesPlanExecutionDataset;
};

export function SalesPlanExecutionBlock({ presentation, presDark, mplPremium, dataset }: Props) {
  const data = dataset ?? MARKETING_SALES_PLAN_EXECUTION_DEMO;
  const reportLabel = formatReportDateRu(data.reportDateYmd);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});

  const shell = presDark
    ? "mb-7 rounded-2xl border border-slate-700/55 bg-[#1e293b] p-5 shadow-[0_8px_28px_rgba(0,0,0,0.2)] sm:p-6"
    : mplPremium && presentation
      ? `mb-7 p-5 sm:p-6 ${MPL_PREMIUM_GLASS_MAIN}`
      : presentation
        ? "mb-7 rounded-2xl border border-mpl-border bg-mpl-card p-5 shadow-sm sm:p-6"
        : "mb-7 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_4px_24px_rgba(15,23,42,0.04)] sm:p-6";

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

  const summary = data.summary;

  const summaryItems = useMemo(
    () => [
      { label: "План", value: compactRub(summary.planCumulativeRub) },
      { label: "Факт", value: compactRub(summary.factCumulativeRub) },
      { label: "Выполнение %", value: pctText(summary.completionPct) },
      {
        label: "Отклонение",
        value: summary.deviationRub === 0 ? "—" : compactRub(summary.deviationRub),
        accent: summary.deviationRub < 0 ? "text-rose-600" : summary.deviationRub > 0 ? "text-emerald-600" : undefined,
      },
    ],
    [summary],
  );

  const kpiCard = presDark
    ? "rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2.5"
    : "rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

  const byRowId = useMemo(() => executionRowsById(data.rows), [data.rows]);

  const planFactChartRows = useMemo(
    () =>
      EXECUTION_MACRO_IDS.map((id) => {
        const r = byRowId.get(id);
        if (!r) return null;
        return { key: id, name: r.name, plan: r.planCumulativeRub, fact: r.factCumulativeRub };
      }).filter((x): x is NonNullable<typeof x> => x != null),
    [byRowId],
  );

  const completionChartRows = useMemo(() => {
    const verticalOrder: SalesPlanExecutionRowId[] = ["commercial", "storage", "parking", "apartments"];
    return verticalOrder
      .map((id) => {
        const r = byRowId.get(id);
        if (!r) return null;
        const pct = r.completionPct;
        const n = pct != null && Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : null;
        return {
          key: id,
          name: r.name,
          pct: n,
          barLen: n ?? 0,
          label: n == null ? "" : `${dec1Fmt.format(n)}%`,
          fill: completionChartFill(pct),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [byRowId]);

  const planFactYDomain = useMemo((): [number, number] => {
    let m = 0;
    for (const row of planFactChartRows) {
      m = Math.max(m, row.plan, row.fact);
    }
    if (m <= 0) return [0, 1];
    return [0, m * 1.08];
  }, [planFactChartRows]);

  const toggleComment = (id: string) => {
    setOpenComments((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const tableWrap = presDark
    ? "min-w-0 overflow-x-auto rounded-xl border border-white/10 bg-slate-900/25"
    : "min-w-0 overflow-x-auto rounded-xl border border-slate-200/70 bg-white/50 shadow-inner shadow-slate-200/30";

  return (
    <section className={shell} aria-labelledby="sales-plan-exec-heading">
      <div className="mb-4 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="sales-plan-exec-heading" className={`text-base font-semibold tracking-tight sm:text-lg ${titleCls}`}>
          Исполнение плана продаж
        </h2>
        <div className={`text-xs sm:text-sm ${mutedCls}`}>
          Отчётная дата:{" "}
          <span className={`tabular-nums font-medium ${presDark ? "text-slate-200" : "text-slate-800"}`}>{reportLabel}</span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-5 sm:grid-cols-4 sm:gap-3">
        {summaryItems.map((it) => (
          <div key={it.label} className={kpiCard}>
            <div className={`text-[10px] font-medium uppercase tracking-wide ${mutedCls}`}>{it.label}</div>
            <div
              className={`mt-1 text-sm font-bold tabular-nums sm:text-base ${it.accent ?? (presDark ? "text-slate-50" : "text-slate-900")}`}
            >
              {it.value}
            </div>
          </div>
        ))}
      </div>

      <ExecutionMacroChartsBlock
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        mutedCls={mutedCls}
        planFactChartRows={planFactChartRows}
        completionChartRows={completionChartRows}
        planFactYDomain={planFactYDomain}
      />

      <PlanExecutionMonthlyPlanFactLineCard
        monthlyPlanFact={data.monthlyPlanFact}
        presentation={presentation}
        presDark={presDark}
        mplPremium={mplPremium}
      />

      <div className={tableWrap}>
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

      <p className={`mt-3 text-[10px] leading-snug sm:text-[11px] ${mutedCls}`}>
        Данные подготовлены под импорт Excel/JSON — типы и демо:{" "}
        <code className={`rounded px-1 py-0.5 text-[10px] ${presDark ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700"}`}>
          lib/marketingSalesPlanExecutionTable.ts
        </code>
        .
      </p>
    </section>
  );
}

function ExecutionMacroChartsBlock({
  presDark,
  presentation,
  mplPremium,
  mutedCls,
  planFactChartRows,
  completionChartRows,
  planFactYDomain,
}: {
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  mutedCls: string;
  planFactChartRows: { key: string; name: string; plan: number; fact: number }[];
  completionChartRows: { key: string; name: string; pct: number | null; barLen: number; label: string; fill: string }[];
  planFactYDomain: [number, number];
}) {
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

  const hasPlanFact = planFactChartRows.length > 0;
  const hasCompletion = completionChartRows.length > 0;

  return (
    <div
      className="mb-4 grid min-w-0 grid-cols-1 gap-3 sm:mb-5 sm:grid-cols-2 sm:gap-4"
      aria-label="Визуальная аналитика исполнения плана"
    >
      <div className={chartCard}>
        <div className={chartTitle}>План vs факт (накопительно)</div>
        <div className="relative min-h-0 flex-1 w-full min-w-0">
          {hasPlanFact ? (
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <BarChart
                data={planFactChartRows}
                margin={{ top: 10, right: 6, left: 0, bottom: 4 }}
                barGap={6}
                barCategoryGap="28%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                <XAxis
                  dataKey="name"
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
                    const row = payload[0]?.payload as (typeof planFactChartRows)[0] | undefined;
                    if (!row) return null;
                    const pct = row.plan > 0 ? ((row.fact / row.plan) * 100).toFixed(1) : "—";
                    return tooltipFrame(
                      <>
                        <div className={`font-semibold ${presDark ? "text-slate-100" : "text-slate-900"}`}>{row.name}</div>
                        <div className={`mt-1.5 space-y-1 tabular-nums ${presDark ? "text-slate-200" : "text-slate-800"}`}>
                          <div>
                            <span className={presDark ? "text-slate-400" : "text-slate-500"}>План: </span>
                            <span style={{ color: "#F97316" }} className="font-medium">
                              {formatCompactMoneyAxis(row.plan)}
                            </span>
                          </div>
                          <div>
                            <span className={presDark ? "text-slate-400" : "text-slate-500"}>Факт: </span>
                            <span style={{ color: "#2563EB" }} className="font-medium">
                              {formatCompactMoneyAxis(row.fact)}
                            </span>
                          </div>
                          <div className={`border-t pt-1.5 ${presDark ? "border-slate-600/50" : "border-slate-200"}`}>
                            <span className={presDark ? "text-slate-400" : "text-slate-500"}>Выполнение: </span>
                            <span className="font-semibold">{pct === "—" ? pct : `${pct}%`}</span>
                          </div>
                        </div>
                      </>,
                    );
                  }}
                />
                <Bar dataKey="fact" name="Факт" fill="#2563EB" radius={[7, 7, 0, 0]} maxBarSize={46} isAnimationActive={false} />
                <Bar dataKey="plan" name="План" fill="#F97316" radius={[7, 7, 0, 0]} maxBarSize={46} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className={`flex h-[200px] items-center justify-center text-xs ${mutedCls}`}>Нет данных для графика</p>
          )}
        </div>
        {hasPlanFact ? (
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
        ) : null}
      </div>

      <div className={chartCard}>
        <div className={chartTitle}>Выполнение %</div>
        <div className="relative min-h-0 flex-1 w-full min-w-0">
          {hasCompletion ? (
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <BarChart
                layout="vertical"
                data={completionChartRows}
                margin={{ top: 4, right: 36, left: 4, bottom: 4 }}
                barCategoryGap={14}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 108]}
                  tick={{ fill: chartAxis, fontSize: 10 }}
                  axisLine={{ stroke: chartGrid }}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={78}
                  tick={{ fill: chartAxis, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: presDark ? "rgba(148,163,184,0.06)" : "rgba(100,116,139,0.07)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as (typeof completionChartRows)[0] | undefined;
                    if (!row) return null;
                    return tooltipFrame(
                      <>
                        <div className={`font-semibold ${presDark ? "text-slate-100" : "text-slate-900"}`}>{row.name}</div>
                        <div className={`mt-1 tabular-nums ${presDark ? "text-slate-200" : "text-slate-800"}`}>
                          {row.pct == null ? "—" : `${dec1Fmt.format(row.pct)}%`}
                        </div>
                      </>,
                    );
                  }}
                />
                <Bar dataKey="barLen" radius={[0, 6, 6, 0]} maxBarSize={14} isAnimationActive={false}>
                  {completionChartRows.map((entry) => (
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
          ) : (
            <p className={`flex h-[200px] items-center justify-center text-xs ${mutedCls}`}>Нет данных для графика</p>
          )}
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
