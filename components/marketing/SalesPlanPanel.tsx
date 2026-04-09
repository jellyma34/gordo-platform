"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  filterByObjectAndDealType,
  marketingMockData,
  type FunnelStageRow,
} from "@/lib/marketingMockData";
import {
  marketingSalesReportMock,
  type SalesCategoryId,
  type SalesSeriesPoint,
} from "@/lib/marketingSalesReportData";
import {
  buildDiagnosticRows,
  buildSalesInsights,
  buildStructureRows,
  execStatusFromPercent,
  type ExecStatus,
} from "@/lib/salesPlanAnalytics";
import type { MarketingPeriodGranularity } from "./MarketingFilters";
import { SalesPlanRadarChart } from "./SalesPlanRadarChart";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false });
const ReferenceLine = dynamic(() => import("recharts").then((m) => m.ReferenceLine), { ssr: false });

const CARD = "rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5";
const CARD_EDIT = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

const rubFmt = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
const numFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const compactRub = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${n < 0 ? "−" : ""}${numFmt.format(Math.round(Math.abs(n) / 1_000_000))} млн ₽`
    : rubFmt.format(n);

type ChartMetric = "revenue" | "units" | "area";

function metricLabel(m: ChartMetric): string {
  if (m === "revenue") return "Выручка";
  if (m === "units") return "Штуки";
  return "Площадь";
}

function seriesToLineData(points: SalesSeriesPoint[], metric: ChartMetric) {
  return points.map((row) => {
    const b = row[metric];
    return {
      periodKey: row.periodKey,
      label: row.label,
      plan: b.planCumulative,
      fact: b.factCumulative,
      forecast: b.forecastCumulative,
    };
  });
}

function statusMeta(
  s: ExecStatus,
  presentation: boolean,
): { label: string; bar: string; ring: string } {
  if (s === "green") {
    return {
      label: "Перевыполнение",
      bar: presentation ? "bg-emerald-500" : "bg-emerald-500",
      ring: presentation ? "ring-emerald-400/40" : "ring-emerald-500/30",
    };
  }
  if (s === "yellow") {
    return {
      label: "В зоне контроля",
      bar: presentation ? "bg-amber-400" : "bg-amber-500",
      ring: presentation ? "ring-amber-400/35" : "ring-amber-500/30",
    };
  }
  return {
    label: "Риск выполнения",
    bar: presentation ? "bg-red-500" : "bg-red-500",
    ring: presentation ? "ring-red-500/40" : "ring-red-500/30",
  };
}

function statusLabelTable(s: ExecStatus): string {
  if (s === "green") return "Перевып.";
  if (s === "yellow") return "Норма";
  return "Риск";
}

function statusDotClass(s: ExecStatus, presentation: boolean): string {
  if (s === "green") return presentation ? "bg-emerald-400" : "bg-emerald-500";
  if (s === "yellow") return presentation ? "bg-amber-400" : "bg-amber-500";
  return presentation ? "bg-red-400" : "bg-red-500";
}

function LineChartTooltip({
  active,
  payload,
  metric,
  presentation,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: { label: string; plan: number; fact: number; forecast: number } }>;
  metric: ChartMetric;
  presentation: boolean;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const fmt =
    metric === "revenue"
      ? (v: number) => rubFmt.format(v)
      : metric === "area"
        ? (v: number) => `${numFmt.format(v)} м²`
        : (v: number) => `${numFmt.format(v)} шт.`;
  const shell = presentation
    ? "max-w-xs rounded-lg border border-slate-500/50 bg-[#0f172a] p-3 text-xs text-slate-200 shadow-xl"
    : "max-w-xs rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-lg";
  return (
    <div className={shell}>
      <div className={`font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>{p.label}</div>
      <div className="mt-2 space-y-1">
        <div className="flex justify-between gap-4 tabular-nums">
          <span className="text-slate-500">План</span>
          <span>{fmt(p.plan)}</span>
        </div>
        <div className="flex justify-between gap-4 tabular-nums">
          <span className="text-slate-500">Факт</span>
          <span>{fmt(p.fact)}</span>
        </div>
        <div className="flex justify-between gap-4 tabular-nums">
          <span className="text-slate-500">Прогноз</span>
          <span>{fmt(p.forecast)}</span>
        </div>
      </div>
    </div>
  );
}

function FunnelBlock({ stages, presentation }: { stages: FunnelStageRow[]; presentation: boolean }) {
  const transitions = useMemo(() => {
    const out: {
      key: string;
      from: string;
      to: string;
      fromCount: number;
      toCount: number;
      loss: number;
      conversion: number;
      finalContributionPct: number;
    }[] = [];
    const finalCount = stages[stages.length - 1]?.count ?? 0;
    for (let i = 0; i < stages.length - 1; i++) {
      const a = stages[i]!.count;
      const b = stages[i + 1]!.count;
      const conversion = a > 0 ? (b / a) * 100 : 0;
      const finalContributionPct = finalCount > 0 ? (b / finalCount) * 100 : 0;
      out.push({
        key: `${stages[i]!.stage}-${stages[i + 1]!.stage}`,
        from: stages[i]!.name,
        to: stages[i + 1]!.name,
        fromCount: a,
        toCount: b,
        loss: Math.max(0, a - b),
        conversion: Math.round(conversion * 10) / 10,
        finalContributionPct: Math.round(finalContributionPct * 10) / 10,
      });
    }
    return out;
  }, [stages]);

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const biggestLoss = useMemo(() => {
    if (!transitions.length) return null;
    return [...transitions].sort((a, b) => b.loss - a.loss)[0] ?? null;
  }, [transitions]);

  const potential = useMemo(() => {
    if (!transitions.length || !biggestLoss) return null;
    const idx = transitions.findIndex((x) => x.key === biggestLoss.key);
    if (idx < 0) return null;
    const t = transitions[idx]!;
    const currentRate = t.fromCount > 0 ? t.toCount / t.fromCount : 0;
    const improvedRate = Math.min(1, currentRate * 1.1);
    const deltaToNext = Math.max(0, Math.round((improvedRate - currentRate) * t.fromCount));
    const downstreamRate = t.toCount > 0 ? (stages[stages.length - 1]!.count || 0) / t.toCount : 0;
    const extraDeals = Math.round(deltaToNext * downstreamRate);
    return { stage: t.to, extraDeals };
  }, [transitions, biggestLoss, stages]);

  const maxLoss = Math.max(...transitions.map((t) => t.loss), 1);

  const convTone = (v: number) => {
    if (v > 50)
      return presentation
        ? { bg: "bg-emerald-500/20", text: "text-emerald-300", bar: "bg-emerald-500" }
        : { bg: "bg-emerald-100", text: "text-emerald-700", bar: "bg-emerald-500" };
    if (v >= 30)
      return presentation
        ? { bg: "bg-amber-500/20", text: "text-amber-300", bar: "bg-amber-500" }
        : { bg: "bg-amber-100", text: "text-amber-700", bar: "bg-amber-500" };
    return presentation
      ? { bg: "bg-red-500/20", text: "text-red-300", bar: "bg-red-500" }
      : { bg: "bg-red-100", text: "text-red-700", bar: "bg-red-500" };
  };

  return (
    <div className="space-y-4">
      {biggestLoss ? (
        <div
          className={
            presentation
              ? "rounded-xl border border-red-500/35 bg-red-950/30 px-3 py-2.5"
              : "rounded-xl border border-red-200 bg-red-50 px-3 py-2.5"
          }
        >
          <div className={`text-xs ${presentation ? "text-red-200" : "text-red-800"}`}>Основная потеря</div>
          <div className={`text-sm font-semibold ${presentation ? "text-red-100" : "text-red-900"}`}>
            этап {biggestLoss.to} (−{numFmt.format(biggestLoss.loss)} лидов)
          </div>
        </div>
      ) : null}

      {potential ? (
        <div
          className={
            presentation
              ? "rounded-xl border border-violet-500/30 bg-violet-950/20 px-3 py-2.5"
              : "rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5"
          }
        >
          <div className={`text-xs ${presentation ? "text-violet-200" : "text-violet-800"}`}>Потенциал (+10% к конверсии)</div>
          <div className={`text-sm font-semibold ${presentation ? "text-violet-100" : "text-violet-900"}`}>
            этап {potential.stage}: +{numFmt.format(potential.extraDeals)} доп. сделок
          </div>
        </div>
      ) : null}

      <div className="space-y-2.5">
        {transitions.map((t) => {
          const tone = convTone(t.conversion);
          const lossWidth = Math.max(10, (t.loss / maxLoss) * 100);
          const active = hoveredKey === t.key;
          return (
            <div
              key={t.key}
              onMouseEnter={() => setHoveredKey(t.key)}
              onMouseLeave={() => setHoveredKey(null)}
              className={
                presentation
                  ? `rounded-xl border p-3 transition-colors ${
                      active ? "border-slate-400/70 bg-slate-900/60" : "border-slate-600/50 bg-slate-900/30"
                    }`
                  : `rounded-xl border p-3 transition-colors ${
                      active ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50/70"
                    }`
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>
                    {t.from} → {t.to}
                  </div>
                  <div className={`mt-0.5 text-[11px] ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                    было: {numFmt.format(t.fromCount)} · стало: {numFmt.format(t.toCount)} · потеря:{" "}
                    <span className={presentation ? "text-red-300" : "text-red-700"}>{numFmt.format(t.loss)}</span>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums ${tone.bg} ${tone.text}`}>
                  {t.conversion.toFixed(1)}%
                </span>
              </div>

              <div className={`mt-2 h-2 overflow-hidden rounded-full ${presentation ? "bg-slate-800" : "bg-slate-200"}`}>
                <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${lossWidth}%` }} />
              </div>

              {active ? (
                <div
                  className={
                    presentation
                      ? "mt-2 rounded-lg border border-slate-600/50 bg-black/20 p-2 text-[11px] text-slate-200"
                      : "mt-2 rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-700"
                  }
                >
                  <div>Конверсия: {t.conversion.toFixed(1)}%</div>
                  <div>Потери: {numFmt.format(t.loss)}</div>
                  <div>Вклад в финальные сделки: {t.finalContributionPct.toFixed(1)}%</div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CATEGORY_LABELS: Record<SalesCategoryId, string> = {
  apartments: "Квартиры",
  parking: "Парковки",
  storages: "Кладовые",
  commercial: "Коммерция",
};

type Props = {
  presentation: boolean;
  period: MarketingPeriodGranularity;
  objectId: string;
  dealTypeId: string;
};

export function SalesPlanPanel({ presentation, period, objectId, dealTypeId }: Props) {
  const card = presentation ? CARD : CARD_EDIT;
  const h4 = presentation ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900";
  const sub = presentation ? "text-[11px] text-slate-500" : "text-[11px] text-slate-600";
  const [chartMetric, setChartMetric] = useState<ChartMetric>("revenue");

  const report = marketingSalesReportMock;
  const rev = report.salesData.revenue;
  const analytics = period === "month" ? report.planAnalytics.month : report.planAnalytics.quarter;
  const seriesPoints = period === "month" ? report.series.month : report.series.quarter;
  const lineData = useMemo(() => seriesToLineData(seriesPoints, chartMetric), [seriesPoints, chartMetric]);

  const currentLabel = useMemo(() => {
    const hit = seriesPoints.find((p) => p.periodKey === analytics.currentPeriodKey);
    return hit?.label ?? seriesPoints[seriesPoints.length - 1]?.label;
  }, [seriesPoints, analytics.currentPeriodKey]);

  const execStatus = execStatusFromPercent(rev.percentComplete);
  const status = statusMeta(execStatus, presentation);

  const diagnosticRows = useMemo(() => buildDiagnosticRows(report.categories), [report.categories]);
  const structureRows = useMemo(() => buildStructureRows(report.categories), [report.categories]);
  const insights = useMemo(
    () => buildSalesInsights(report.categories, report.radarCategories, rev),
    [report.categories, report.radarCategories, rev],
  );

  const dynamics = useMemo(() => {
    return filterByObjectAndDealType(marketingMockData.salesDynamics, objectId, dealTypeId);
  }, [objectId, dealTypeId]);

  const funnel = marketingMockData.funnel;

  const deviationPct = rev.planCumulative > 0 ? ((rev.factCumulative - rev.planCumulative) / rev.planCumulative) * 100 : 0;

  const axisColor = presentation ? "#94a3b8" : "#64748b";
  const gridColor = presentation ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";

  const yTick =
    chartMetric === "revenue"
      ? (v: number) => `${Math.round(v / 1_000_000)}M`
      : chartMetric === "area"
        ? (v: number) => `${numFmt.format(v)}`
        : (v: number) => `${numFmt.format(v)}`;

  const segmentedBtn = (active: boolean) =>
    presentation
      ? `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          active ? "bg-slate-100 text-slate-900 shadow-sm" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
        }`
      : `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
        }`;

  const heroBorder =
    execStatus === "red"
      ? presentation
        ? "border-red-500/45"
        : "border-red-200"
      : execStatus === "yellow"
        ? presentation
          ? "border-amber-500/40"
          : "border-amber-200"
        : presentation
          ? "border-emerald-500/35"
          : "border-emerald-200";

  const heroBg = presentation
    ? execStatus === "red"
      ? "bg-gradient-to-br from-red-950/50 to-[#0f172a]"
      : execStatus === "yellow"
        ? "bg-gradient-to-br from-amber-950/35 to-[#0f172a]"
        : "bg-gradient-to-br from-emerald-950/35 to-[#0f172a]"
    : execStatus === "red"
      ? "bg-gradient-to-br from-red-50 to-white"
      : execStatus === "yellow"
        ? "bg-gradient-to-br from-amber-50 to-white"
        : "bg-gradient-to-br from-emerald-50 to-white";

  const insightTone = (tone: "risk" | "ok" | "neutral") => {
    if (tone === "risk")
      return presentation ? "border-l-red-400/80 text-slate-200" : "border-l-red-500 text-slate-800";
    if (tone === "ok")
      return presentation ? "border-l-emerald-400/80 text-slate-200" : "border-l-emerald-600 text-slate-800";
    return presentation ? "border-l-slate-500 text-slate-300" : "border-l-slate-400 text-slate-700";
  };

  const rr = analytics.runRate;
  const forecastGapRub = rr.horizonPlanCumulativeRub - rr.forecastCumulativeEndRub;

  return (
    <div className="flex flex-col gap-4">
      {/* HERO */}
      <div className={`overflow-hidden rounded-2xl border p-5 sm:p-6 ${heroBorder} ${heroBg}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className={sub}>План продаж · выручка, накопительно</p>
            <h3 className={`mt-1 text-lg font-semibold sm:text-xl ${presentation ? "text-slate-50" : "text-slate-900"}`}>
              {report.projectName ?? "Проект"}
            </h3>
            <p className={`mt-1 text-[11px] ${presentation ? "text-slate-500" : "text-slate-500"}`}>
              Отчётная дата {report.asOf} · прогноз и темп — модель на мок-данных (готово к API)
            </p>
          </div>
          <div
            className={`flex shrink-0 flex-col items-stretch gap-2 rounded-xl p-3 ring-2 sm:min-w-[220px] ${status.ring} ${
              presentation ? "bg-black/25" : "bg-white/80"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.bar}`} aria-hidden />
              <span className={`text-xs font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>
                {status.label}
              </span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${presentation ? "text-slate-50" : "text-slate-900"}`}>
              {rev.percentComplete.toFixed(1)}%
            </div>
            <div className={`text-[11px] leading-snug ${presentation ? "text-slate-400" : "text-slate-600"}`}>
              Факт к плану · прогноз к концу периода:{" "}
              <span
                className={`font-semibold tabular-nums ${presentation ? "text-violet-300" : "text-violet-700"}`}
              >
                {analytics.forecastPercentComplete.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className={presentation ? "rounded-xl bg-black/20 p-3" : "rounded-xl bg-white/70 p-3 shadow-sm"}>
            <div className={sub}>План</div>
            <div className={`mt-1 text-base font-bold tabular-nums sm:text-lg ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              {compactRub(rev.planCumulative)}
            </div>
          </div>
          <div className={presentation ? "rounded-xl bg-black/20 p-3" : "rounded-xl bg-white/70 p-3 shadow-sm"}>
            <div className={sub}>Факт</div>
            <div className={`mt-1 text-base font-bold tabular-nums sm:text-lg ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              {compactRub(rev.factCumulative)}
            </div>
          </div>
          <div className={presentation ? "rounded-xl bg-black/20 p-3" : "rounded-xl bg-white/70 p-3 shadow-sm"}>
            <div className={sub}>Отклонение</div>
            <div
              className={`mt-1 text-base font-bold tabular-nums sm:text-lg ${
                rev.deviationCumulative < 0
                  ? presentation
                    ? "text-red-300"
                    : "text-red-700"
                  : presentation
                    ? "text-emerald-300"
                    : "text-emerald-700"
              }`}
            >
              {rev.deviationCumulative < 0 ? "−" : "+"}
              {compactRub(Math.abs(rev.deviationCumulative))}
            </div>
            <div className={`mt-0.5 text-[11px] tabular-nums ${presentation ? "text-slate-500" : "text-slate-600"}`}>
              {deviationPct >= 0 ? "+" : ""}
              {deviationPct.toFixed(1)}% к плану
            </div>
          </div>
          <div className={presentation ? "rounded-xl bg-black/20 p-3" : "rounded-xl bg-white/70 p-3 shadow-sm"}>
            <div className={sub}>Прогноз выполнения</div>
            <div
              className={`mt-1 text-base font-bold tabular-nums sm:text-lg ${presentation ? "text-violet-300" : "text-violet-700"}`}
            >
              {analytics.forecastPercentComplete.toFixed(1)}%
            </div>
            <div className={`mt-0.5 text-[11px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>
              при сохранении текущего темпа
            </div>
          </div>
        </div>
      </div>

      {/* Insights */}
      <div className={card}>
        <h4 className={h4}>Выводы</h4>
        <p className={`${sub} mt-1`}>Авто-анализ по категориям и сегментам — без лишнего шума</p>
        <ul className="mt-4 space-y-2.5">
          {insights.map((b, i) => (
            <li
              key={i}
              className={`border-l-2 pl-3 text-sm leading-snug ${insightTone(b.tone)}`}
            >
              {b.text}
            </li>
          ))}
        </ul>
      </div>

      {/* Chart */}
      <div className={card}>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className={h4}>Динамика: план, факт, прогноз</h4>
            <p className={sub}>Накопительно · вертикаль — отчётная дата ({currentLabel})</p>
          </div>
          <div
            className={
              presentation
                ? "inline-flex rounded-lg border border-slate-600/60 bg-slate-900/50 p-0.5"
                : "inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
            }
            role="tablist"
            aria-label="Показатель графика"
          >
            {(["revenue", "units", "area"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={chartMetric === m}
                className={segmentedBtn(chartMetric === m)}
                onClick={() => setChartMetric(m)}
              >
                {metricLabel(m)}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[300px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} axisLine={{ stroke: gridColor }} />
              <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickFormatter={yTick} width={48} />
              <Tooltip content={<LineChartTooltip metric={chartMetric} presentation={presentation} />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} formatter={(v) => <span style={{ color: axisColor }}>{v}</span>} />
              <Line type="monotone" dataKey="plan" name="План" stroke={presentation ? "#cbd5e1" : "#64748b"} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="fact" name="Факт" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line
                type="monotone"
                dataKey="forecast"
                name="Прогноз"
                stroke="#a78bfa"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={{ r: 2 }}
              />
              {currentLabel ? (
                <ReferenceLine
                  x={currentLabel}
                  stroke={presentation ? "#fbbf24" : "#d97706"}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  label={{
                    value: "Сейчас",
                    position: "top",
                    fill: presentation ? "#fcd34d" : "#b45309",
                    fontSize: 10,
                  }}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Run rate */}
      <div className={card}>
        <h4 className={h4}>Run rate</h4>
        <p className={`${sub} mt-1`}>Темп продаж и прогноз на конец горизонта (накопительно, выручка)</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={presentation ? "rounded-xl bg-slate-900/40 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <div className={sub}>Текущий темп</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              ~{compactRub(rr.avgMonthlyRevenueRub)}
            </div>
            <div className={`mt-1 text-[11px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>в среднем за месяц (оценка)</div>
          </div>
          <div className={presentation ? "rounded-xl bg-slate-900/40 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <div className={sub}>Прогноз к концу периода</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${presentation ? "text-violet-300" : "text-violet-700"}`}>
              {compactRub(rr.forecastCumulativeEndRub)}
            </div>
            <div className={`mt-1 text-[11px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>накопительно, модель</div>
          </div>
          <div className={presentation ? "rounded-xl bg-slate-900/40 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <div className={sub}>К плану горизонта</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              {compactRub(rr.horizonPlanCumulativeRub)}
            </div>
            <div className={`mt-1 text-[11px] ${forecastGapRub > 0 ? (presentation ? "text-amber-300" : "text-amber-800") : presentation ? "text-slate-500" : "text-slate-600"}`}>
              {forecastGapRub > 0
                ? `Недобор к плану ≈ ${compactRub(forecastGapRub)} при текущем темпе`
                : "Прогноз не ниже плана горизонта"}
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics table */}
      <div className={card}>
        <h4 className={h4}>Диагностика по категориям</h4>
        <p className={`${sub} mt-1`}>От худшего к лучшему — где просадка и отклонение в деньгах</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className={presentation ? "border-b border-slate-600/50 text-slate-400" : "border-b border-slate-200 text-slate-600"}>
                <th className="pb-2 pr-3 font-medium">Категория</th>
                <th className="pb-2 pr-3 font-medium tabular-nums">План</th>
                <th className="pb-2 pr-3 font-medium tabular-nums">Факт</th>
                <th className="pb-2 pr-3 font-medium tabular-nums">%</th>
                <th className="pb-2 pr-3 font-medium">Статус</th>
                <th className="pb-2 font-medium tabular-nums">Отклонение</th>
              </tr>
            </thead>
            <tbody>
              {diagnosticRows.map((row) => (
                <tr
                  key={row.id}
                  className={presentation ? "border-b border-slate-700/40 text-slate-200" : "border-b border-slate-100 text-slate-800"}
                >
                  <td className="py-2.5 pr-3 font-medium">{row.name}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-slate-500">{rubFmt.format(row.planCumulative)}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{rubFmt.format(row.factCumulative)}</td>
                  <td className="py-2.5 pr-3 tabular-nums font-semibold">{row.percentComplete.toFixed(1)}%</td>
                  <td className="py-2.5 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${statusDotClass(row.status, presentation)}`} />
                      <span className={presentation ? "text-slate-300" : "text-slate-700"}>{statusLabelTable(row.status)}</span>
                    </span>
                  </td>
                  <td
                    className={`py-2.5 tabular-nums font-medium ${
                      row.deviation < 0
                        ? presentation
                          ? "text-red-300"
                          : "text-red-600"
                        : presentation
                          ? "text-emerald-300"
                          : "text-emerald-600"
                    }`}
                  >
                    {row.deviation < 0 ? "−" : "+"}
                    {rubFmt.format(Math.abs(row.deviation))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Structure */}
      <div className={card}>
        <h4 className={h4}>Структура продаж</h4>
        <p className={`${sub} mt-1`}>Доля в накопительном плане vs доля в фактической выручке</p>
        <div className="mt-4 space-y-3">
          {structureRows.map((r) => (
            <div key={r.id}>
              <div className="mb-1 flex justify-between text-xs">
                <span className={presentation ? "font-medium text-slate-200" : "font-medium text-slate-800"}>{r.name}</span>
                <span className={`tabular-nums ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                  план {r.planSharePct.toFixed(1)}% · факт {r.factSharePct.toFixed(1)}%
                </span>
              </div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex-1">
                  <div className={presentation ? "text-[10px] text-slate-500" : "text-[10px] text-slate-500"}>Плановая структура</div>
                  <div className={presentation ? "mt-0.5 h-2 overflow-hidden rounded-full bg-slate-800" : "mt-0.5 h-2 overflow-hidden rounded-full bg-slate-200"}>
                    <div
                      className="h-full rounded-full bg-slate-400/90"
                      style={{ width: `${Math.min(100, r.planSharePct)}%` }}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <div className={presentation ? "text-[10px] text-slate-500" : "text-[10px] text-slate-500"}>Фактическая структура</div>
                  <div className={presentation ? "mt-0.5 h-2 overflow-hidden rounded-full bg-slate-800" : "mt-0.5 h-2 overflow-hidden rounded-full bg-slate-200"}>
                    <div
                      className="h-full rounded-full bg-sky-500/90"
                      style={{ width: `${Math.min(100, r.factSharePct)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Radar */}
      <div className={card}>
        <h4 className={h4}>Выполнение по сегментам (радар)</h4>
        <p className={`${sub} mt-1`}>Накопительный % к плану по типам продуктов</p>
        <div className="mt-4">
          <SalesPlanRadarChart categories={report.radarCategories} presentation={presentation} />
        </div>
      </div>

      {/* Comments */}
      <div className={card}>
        <h4 className={`${h4} mb-1`}>Комментарии к отклонениям</h4>
        <p className={`${sub} mb-3`}>Контекст от команд (поле comments)</p>
        <ul className="space-y-2">
          {report.comments.map((c) => (
            <li
              key={c.id}
              className={
                presentation
                  ? "rounded-lg border border-slate-600/35 bg-slate-900/25 px-3 py-2 text-sm text-slate-300"
                  : "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              }
            >
              {c.categoryId ? (
                <span className={`mr-2 text-[10px] font-semibold uppercase ${presentation ? "text-sky-300" : "text-sky-700"}`}>
                  {CATEGORY_LABELS[c.categoryId]}
                </span>
              ) : (
                <span className={`mr-2 text-[10px] font-semibold uppercase ${presentation ? "text-slate-500" : "text-slate-500"}`}>
                  Общее
                </span>
              )}
              {c.text}
            </li>
          ))}
        </ul>
      </div>

      {/* Secondary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={card}>
          <h4 className={`${h4} mb-3`}>Динамика сделок</h4>
          <div className="h-[200px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dynamics} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} />
                <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid rgba(148,163,184,0.35)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#e2e8f0" }}
                />
                <Line type="monotone" dataKey="deals" name="Сделки" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={card}>
          <h4 className={`${h4} mb-3`}>Воронка</h4>
          <FunnelBlock stages={funnel} presentation={presentation} />
        </div>
      </div>
    </div>
  );
}
