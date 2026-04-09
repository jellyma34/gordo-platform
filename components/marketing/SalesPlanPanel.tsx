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
import type { MarketingPeriodGranularity } from "./MarketingFilters";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });

const PLAN_FILL = "rgba(148, 163, 184, 0.55)";
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

function factColor(plan: number, fact: number): string {
  if (fact >= plan) return "#22c55e";
  const gap = plan - fact;
  const pct = plan > 0 ? (gap / plan) * 100 : 0;
  if (pct > 12) return "#ef4444";
  return "#f59e0b";
}

function ChartTooltipBody({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; plan: number; fact: number } }>;
  metric: ChartMetric;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  const behind = p.fact < p.plan;
  const pct = p.plan > 0 && behind ? Math.round(((p.plan - p.fact) / p.plan) * 100) : 0;
  const fmt =
    metric === "revenue"
      ? (v: number) => rubFmt.format(v)
      : metric === "area"
        ? (v: number) => `${numFmt.format(v)} м²`
        : (v: number) => `${numFmt.format(v)} шт.`;
  return (
    <div className="max-w-xs rounded-lg border border-slate-500/50 bg-[#0f172a] p-3 text-xs text-slate-200 shadow-xl">
      <div className="font-semibold text-slate-100">{p.label}</div>
      <div className="mt-2 space-y-1">
        <div>План (накопит.): {fmt(p.plan)}</div>
        <div>Факт (накопит.): {fmt(p.fact)}</div>
        {behind ? (
          <div className="text-amber-200/90">Отставание: {pct}% к плану</div>
        ) : (
          <div className="text-emerald-300/90">План достигнут или перевыполнен</div>
        )}
      </div>
    </div>
  );
}

function FunnelBlock({ stages, presentation }: { stages: FunnelStageRow[]; presentation: boolean }) {
  const conversions = useMemo(() => {
    const out: { from: string; to: string; pct: number }[] = [];
    for (let i = 0; i < stages.length - 1; i++) {
      const a = stages[i]!.count;
      const b = stages[i + 1]!.count;
      const pct = a > 0 ? Math.round((b / a) * 1000) / 10 : 0;
      out.push({ from: stages[i]!.name, to: stages[i + 1]!.name, pct });
    }
    return out;
  }, [stages]);

  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const w = Math.max(18, (s.count / max) * 100);
        return (
          <div key={s.stage}>
            <div className="mb-1 flex justify-between text-xs">
              <span className={presentation ? "text-slate-300" : "text-slate-700"}>{s.name}</span>
              <span className={presentation ? "tabular-nums text-slate-200" : "tabular-nums text-slate-800"}>
                {s.count}
              </span>
            </div>
            <div
              className={
                presentation
                  ? "h-9 rounded-lg border border-slate-600/50 bg-slate-900/40"
                  : "h-9 rounded-lg border border-slate-200 bg-slate-50"
              }
              style={{ width: `${w}%` }}
            >
              <div
                className="flex h-full items-center justify-end rounded-lg bg-sky-600/80 pr-2 text-[11px] font-medium text-white"
                style={{ width: "100%" }}
              >
                {s.count}
              </div>
            </div>
            {i < conversions.length ? (
              <div
                className={
                  presentation ? "py-1.5 pl-2 text-[11px] text-sky-300/90" : "py-1.5 pl-2 text-[11px] text-sky-700"
                }
              >
                → {conversions[i]!.to}: {conversions[i]!.pct}% конверсия
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function metricLabel(m: ChartMetric): string {
  if (m === "revenue") return "Деньги";
  if (m === "units") return "Штуки";
  return "Площадь";
}

function seriesToChartData(points: SalesSeriesPoint[], metric: ChartMetric) {
  return points.map((row) => {
    const b = row[metric];
    return {
      periodKey: row.periodKey,
      label: row.label,
      plan: b.planCumulative,
      fact: b.factCumulative,
      factFill: factColor(b.planCumulative, b.factCumulative),
    };
  });
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
  const { salesData } = report;

  const seriesPoints = period === "month" ? report.series.month : report.series.quarter;
  const chartData = useMemo(() => seriesToChartData(seriesPoints, chartMetric), [seriesPoints, chartMetric]);

  const dynamics = useMemo(() => {
    return filterByObjectAndDealType(marketingMockData.salesDynamics, objectId, dealTypeId);
  }, [objectId, dealTypeId]);

  const funnel = marketingMockData.funnel;

  const rev = salesData.revenue;
  const behindRevenue = rev.deviationCumulative < 0;

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

  return (
    <div className="flex flex-col gap-4">
      {/* Hero KPI */}
      <div
        className={
          presentation
            ? `overflow-hidden rounded-2xl border ${
                behindRevenue ? "border-red-500/40 bg-gradient-to-br from-red-950/40 to-[#1e293b]" : "border-sky-500/30 bg-gradient-to-br from-sky-950/30 to-[#1e293b]"
              } p-5 sm:p-6`
            : `overflow-hidden rounded-xl border ${
                behindRevenue ? "border-red-200 bg-gradient-to-br from-red-50 to-white" : "border-sky-200 bg-gradient-to-br from-sky-50 to-white"
              } p-5 sm:p-6`
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={sub}>Выручка · накопительно к плану проекта</p>
            <h3 className={`mt-1 text-lg font-semibold sm:text-xl ${presentation ? "text-slate-50" : "text-slate-900"}`}>
              {report.projectName ?? "Продажи"}
            </h3>
            <p className={`mt-1 text-[11px] ${presentation ? "text-slate-500" : "text-slate-500"}`}>
              Данные на {report.asOf} · структура готова к API
            </p>
          </div>
          {behindRevenue ? (
            <div
              className={
                presentation
                  ? "rounded-lg border border-red-400/40 bg-red-950/50 px-3 py-2 text-right"
                  : "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-right"
              }
            >
              <div className={`text-xs font-medium ${presentation ? "text-red-200" : "text-red-800"}`}>
                Отставание: {compactRub(Math.abs(rev.deviationCumulative))}
              </div>
              <div className={`mt-0.5 text-sm font-bold tabular-nums ${presentation ? "text-red-100" : "text-red-700"}`}>
                Выполнение: {rev.percentComplete.toFixed(1)}%
              </div>
            </div>
          ) : (
            <div
              className={
                presentation
                  ? "rounded-lg border border-emerald-500/35 bg-emerald-950/30 px-3 py-2 text-right"
                  : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-right"
              }
            >
              <div className={`text-xs ${presentation ? "text-emerald-200" : "text-emerald-800"}`}>План выполнен</div>
              <div className={`text-sm font-bold tabular-nums ${presentation ? "text-emerald-100" : "text-emerald-900"}`}>
                {rev.percentComplete.toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={presentation ? "rounded-xl bg-black/20 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <div className={sub}>План накопит.</div>
            <div className={`mt-1 text-base font-bold tabular-nums sm:text-lg ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              {compactRub(rev.planCumulative)}
            </div>
          </div>
          <div className={presentation ? "rounded-xl bg-black/20 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <div className={sub}>Факт накопит.</div>
            <div className={`mt-1 text-base font-bold tabular-nums sm:text-lg ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              {compactRub(rev.factCumulative)}
            </div>
          </div>
          <div className={presentation ? "rounded-xl bg-black/20 p-3" : "rounded-xl bg-slate-50 p-3"}>
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
          </div>
          <div className={presentation ? "rounded-xl bg-black/20 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <div className={sub}>Доля от плана проекта</div>
            <div className={`mt-1 text-base font-bold tabular-nums sm:text-lg ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              {rev.percentOfTotal.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Plan / Fact chart */}
      <div className={card}>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className={h4}>План / Факт</h4>
            <p className={sub}>Накопительно по периодам · план — базовый ряд, факт — сравнение сверху</p>
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
        <div className="h-[280px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} axisLine={{ stroke: gridColor }} />
              <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickFormatter={yTick} width={44} />
              <Tooltip content={<ChartTooltipBody metric={chartMetric} />} />
              <Bar dataKey="plan" name="План" fill={PLAN_FILL} radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="fact" name="Факт" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map((row) => (
                  <Cell key={row.periodKey} fill={row.factFill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className={`mt-2 ${sub}`}>
          Основной режим — деньги (руб.). Штуки и площадь — для операционного контроля.
        </p>
      </div>

      {/* Category breakdown — карточки, не Excel */}
      <div>
        <h4 className={`${h4} mb-3`}>Разбивка по категориям</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {report.categories.map((cat) => {
            const bad = cat.deviation < 0;
            return (
              <div
                key={cat.id}
                className={
                  presentation
                    ? `rounded-2xl border p-4 ${
                        bad ? "border-amber-500/25 bg-amber-950/15" : "border-slate-700/60 bg-[#1e293b]"
                      }`
                    : `rounded-xl border p-4 ${
                        bad ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-white"
                      }`
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>
                    {cat.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      cat.percentComplete >= 100
                        ? presentation
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-emerald-100 text-emerald-800"
                        : bad
                          ? presentation
                            ? "bg-red-500/20 text-red-300"
                            : "bg-red-100 text-red-800"
                          : presentation
                            ? "bg-slate-600/40 text-slate-200"
                            : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {cat.percentComplete.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className={sub}>План (накопит.)</div>
                    <div className={`font-semibold tabular-nums ${presentation ? "text-slate-200" : "text-slate-800"}`}>
                      {compactRub(cat.planCumulative)}
                    </div>
                  </div>
                  <div>
                    <div className={sub}>Факт (накопит.)</div>
                    <div className={`font-semibold tabular-nums ${presentation ? "text-slate-200" : "text-slate-800"}`}>
                      {compactRub(cat.factCumulative)}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className={sub}>Отклонение</div>
                    <div
                      className={`font-semibold tabular-nums ${
                        cat.deviation < 0
                          ? presentation
                            ? "text-red-300"
                            : "text-red-700"
                          : presentation
                            ? "text-emerald-300"
                            : "text-emerald-700"
                      }`}
                    >
                      {cat.deviation < 0 ? "−" : "+"}
                      {compactRub(Math.abs(cat.deviation))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Причины отклонений */}
      <div className={card}>
        <h4 className={`${h4} mb-1`}>Причины отклонений</h4>
        <p className={`${sub} mb-4`}>Комментарии из отчёта (поле comments)</p>
        <ul className="space-y-3">
          {report.comments.map((c) => (
            <li
              key={c.id}
              className={
                presentation
                  ? "flex gap-3 rounded-xl border border-slate-600/40 bg-slate-900/30 px-3 py-2.5"
                  : "flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
              }
            >
              {c.categoryId ? (
                <span
                  className={
                    presentation
                      ? "shrink-0 rounded-md bg-slate-700/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300"
                      : "shrink-0 rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-700"
                  }
                >
                  {CATEGORY_LABELS[c.categoryId]}
                </span>
              ) : (
                <span
                  className={
                    presentation
                      ? "shrink-0 rounded-md bg-sky-900/50 px-2 py-0.5 text-[10px] font-medium text-sky-200"
                      : "shrink-0 rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800"
                  }
                >
                  Общее
                </span>
              )}
              <p className={`min-w-0 text-sm leading-snug ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                {c.text}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* Вторичные блоки */}
      <div className={card}>
        <h4 className={`${h4} mb-3`}>Динамика сделок</h4>
        <div className="h-[220px] w-full min-w-0">
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
        <h4 className={`${h4} mb-3`}>Воронка продаж</h4>
        <FunnelBlock stages={funnel} presentation={presentation} />
      </div>
    </div>
  );
}
