"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type CSSProperties } from "react";
import {
  filterByObjectAndDealType,
  mergeSalesPlanFact,
  marketingMockData,
  type FunnelStageRow,
} from "@/lib/marketingMockData";
import {
  marketingSalesReportMock,
  type SalesCategoryId,
  type SalesSeriesPoint,
} from "@/lib/marketingSalesReportData";
import type { MarketingPeriodGranularity } from "./MarketingFilters";
import {
  rechartsPresentationMiniTooltip,
  SalesTempoChart,
  SalesTempoCumulativeChart,
  type FormulaVariableEntry,
  type SalesPlanChartMode,
} from "@/components/marketing/salesPlanCharts";
import { compactRub, dec1Fmt, numFmt, rubFmt, structureBalanceBarLabelLine } from "@/lib/salesPlanChartFormat";
import {
  buildDynamicsKpiItems,
  formatSalesPlanAsOfKpiSub,
  type DynamicsKpiInput,
} from "@/lib/salesPlanDynamicsKpi";
import { buildVelocityLineRows } from "@/lib/salesPlanVelocityChartData";
import { KpiDashboard } from "@/components/marketing/SalesPlanKpiDashboard";
import { SalesPlanSegmentStructure } from "@/components/marketing/SalesPlanSegmentStructure";
import { MarketingDealsDynamicsSection } from "@/components/marketing/MarketingDealsDynamicsSection";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const ComposedChart = dynamic(() => import("recharts").then((m) => m.ComposedChart), { ssr: false });
const Area = dynamic(() => import("recharts").then((m) => m.Area), { ssr: false });
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });
const LabelList = dynamic(() => import("recharts").then((m) => m.LabelList), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false });
const ReferenceLine = dynamic(() => import("recharts").then((m) => m.ReferenceLine), { ssr: false });
const ReferenceArea = dynamic(() => import("recharts").then((m) => m.ReferenceArea), { ssr: false });
const ReferenceDot = dynamic(() => import("recharts").then((m) => m.ReferenceDot), { ssr: false });

const CARD = "rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5";
const CARD_EDIT = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

/** Выполнение по шт. высокое, а выручка ниже плана — типичный конфликт цены/микса. */
function executionRevenueConflictMeta(row: {
  percent: number;
  deltaRub: number;
  planUnits: number;
  factUnits: number;
  planRub: number;
  factRub: number;
}): { conflict: boolean; hint: string | null } {
  if (row.percent < 95 || row.deltaRub >= 0) return { conflict: false, hint: null };
  const avgPlan = row.planUnits > 0 ? row.planRub / row.planUnits : 0;
  const avgFact = row.factUnits > 0 ? row.factRub / row.factUnits : 0;
  if (avgPlan > 0 && avgFact > 0 && avgFact < avgPlan * 0.985) {
    return { conflict: true, hint: "ниже средней цены сделки" };
  }
  return { conflict: true, hint: "скидки / сдвиг микса" };
}

type ChartMetric = "revenue" | "units" | "area";
type PlanMode = "view" | "edit";
export type PlanScenario = "optimistic" | "realistic" | "pessimistic";

const SCENARIO_FACTOR: Record<PlanScenario, number> = {
  optimistic: 1.08,
  realistic: 1,
  pessimistic: 0.92,
};

type TrafficStatus = "green" | "yellow" | "red";

type DealControlRow = {
  periodKey: string;
  label: string;
  planCumulative: number;
  factCumulative: number;
  forecastCumulative: number;
  deviation: number;
  deviationPct: number;
  status: TrafficStatus;
  factAbove: number | null;
  factBelow: number | null;
};

type DeviationContributionRow = {
  id: SalesCategoryId;
  name: string;
  nameWithPct: string;
  plan: number;
  fact: number;
  deviation: number;
  percentComplete: number;
  fill: string;
};

function dealStatus(plan: number, fact: number): TrafficStatus {
  const pct = plan > 0 ? (fact / plan) * 100 : 0;
  if (pct >= 100) return "green";
  if (pct >= 90) return "yellow";
  return "red";
}

function buildDealControlData(points: ReturnType<typeof mergeSalesPlanFact>): DealControlRow[] {
  const elapsed = points.length > 0 ? points.length : 1;
  const totalFact = points.reduce((s, p) => s + p.factDeals, 0);
  const runRate = totalFact / elapsed;
  let planRun = 0;
  let factRun = 0;
  return points.map((p, idx) => {
    planRun += p.planDeals;
    factRun += p.factDeals;
    const forecastCumulative = Math.round(runRate * (idx + 1));
    const status = dealStatus(planRun, factRun);
    const deviation = factRun - planRun;
    const deviationPct = planRun > 0 ? (deviation / planRun) * 100 : 0;
    return {
      periodKey: p.periodKey,
      label: p.label,
      planCumulative: planRun,
      factCumulative: factRun,
      forecastCumulative,
      deviation,
      deviationPct,
      status,
      factAbove: factRun >= planRun ? factRun : null,
      factBelow: factRun < planRun ? factRun : null,
    };
  });
}

function periodKeyToday(granularity: MarketingPeriodGranularity): string {
  const d = new Date();
  const y = d.getFullYear();
  if (granularity === "month") return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

function buildDeviationContribution(categories: Array<{
  id: SalesCategoryId;
  name: string;
  planCumulative: number;
  factCumulative: number;
  deviation: number;
  percentComplete: number;
}>): DeviationContributionRow[] {
  return [...categories]
    .map((c) => ({
      id: c.id,
      name: c.name,
      nameWithPct: `${c.name} · ${c.percentComplete.toFixed(1)}%`,
      plan: c.planCumulative,
      fact: c.factCumulative,
      deviation: c.deviation,
      percentComplete: c.percentComplete,
      fill: c.deviation >= 0 ? "#22c55e" : "#ef4444",
    }))
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
}

function seriesToLineData(points: SalesSeriesPoint[], metric: ChartMetric) {
  return points.map((row) => {
    const b = row[metric];
    const deviation = b.factCumulative - b.planCumulative;
    return {
      periodKey: row.periodKey,
      label: row.label,
      plan: b.planCumulative,
      fact: b.factCumulative,
      forecast: b.forecastCumulative,
      deviation,
      factBelow: b.factCumulative < b.planCumulative ? b.factCumulative : null,
      factAbove: b.factCumulative >= b.planCumulative ? b.factCumulative : null,
    };
  });
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

function DealControlTooltip({
  active,
  payload,
  presentation,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DealControlRow }>;
  presentation: boolean;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const statusColor = p.status === "green" ? "bg-emerald-500" : p.status === "yellow" ? "bg-amber-500" : "bg-red-500";
  const statusText = p.status === "green" ? "В плане" : p.status === "yellow" ? "Зона риска" : "Отставание";

  return (
    <div
      className={
        presentation
          ? "max-w-xs rounded-lg border border-slate-500/50 bg-[#0f172a] p-3 text-xs text-slate-200 shadow-xl"
          : "max-w-xs rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-lg"
      }
    >
      <div className={`font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>{p.label}</div>
      <div className="mt-2 space-y-1.5">
        <div>План (накопит.): {numFmt.format(p.planCumulative)} сделок</div>
        <div>Факт (накопит.): {numFmt.format(p.factCumulative)} сделок</div>
        <div>Прогноз (накопит.): {numFmt.format(p.forecastCumulative)} сделок</div>
        <div>
          Отклонение: {p.deviation >= 0 ? "+" : "−"}
          {numFmt.format(Math.abs(p.deviation))} сделок ({p.deviationPct >= 0 ? "+" : ""}
          {p.deviationPct.toFixed(1)}%)
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
          <span>{statusText}</span>
        </div>
      </div>
    </div>
  );
}

type MonthlyPlanExecutionRow = {
  periodKey: string;
  label: string;
  plan: number;
  fact: number;
  deviation: number;
};

type MonthlyExecutionInsights = {
  sumDeviation: number;
  firstNegative: MonthlyPlanExecutionRow | null;
  worstMonth: MonthlyPlanExecutionRow | null;
  trend: "improving" | "worsening" | "stable" | "neutral";
  trendLabel: string;
  runRateMonthly: number;
  requiredMonthly: number | null;
  tempoDiffMonthly: number | null;
  periodCompleted: boolean;
  planEndMonthly: number;
  forecastEndMonthly: number;
  planAchievableAtMonthlyTempo: boolean;
};

function monthlyDeviationTone(deviation: number): "green" | "yellow" | "red" {
  if (deviation >= 0) return "green";
  if (deviation >= -5) return "yellow";
  return "red";
}

function monthlyDeviationFill(deviation: number, isWorst: boolean): string {
  const tone = monthlyDeviationTone(deviation);
  if (isWorst) {
    if (tone === "green") return "#34d399";
    if (tone === "yellow") return "#fbbf24";
    return "#dc2626";
  }
  if (tone === "green") return "#22c55e";
  if (tone === "yellow") return "#f59e0b";
  return "#ef4444";
}

function buildMonthlyExecutionInsights(rows: MonthlyPlanExecutionRow[], todayMonthKey: string): MonthlyExecutionInsights {
  const sumDeviation = rows.reduce((s, r) => s + r.deviation, 0);
  const firstNegative = rows.find((r) => r.deviation < 0) ?? null;
  let worstMonth: MonthlyPlanExecutionRow | null = null;
  for (const r of rows) {
    if (!worstMonth || r.deviation < worstMonth.deviation) worstMonth = r;
  }

  const n = rows.length;
  let trend: MonthlyExecutionInsights["trend"] = "neutral";
  let trendLabel = "Тренд: недостаточно месяцев для сравнения.";
  if (n >= 3) {
    const k = Math.max(1, Math.floor(n / 3));
    const avgDev = (slice: MonthlyPlanExecutionRow[]) =>
      slice.reduce((s, r) => s + r.deviation, 0) / Math.max(1, slice.length);
    const firstAvg = avgDev(rows.slice(0, k));
    const lastAvg = avgDev(rows.slice(n - k));
    const diff = lastAvg - firstAvg;
    const threshold = 0.75;
    if (diff > threshold) {
      trend = "improving";
      trendLabel =
        "Тренд: улучшается — в последних месяцах среднее помесячное отклонение выше, чем в начале ряда (ближе к плану или с перевыполнением).";
    } else if (diff < -threshold) {
      trend = "worsening";
      trendLabel =
        "Тренд: ухудшается — недавние месяцы в среднем сильнее отстают от плана, чем старт периода.";
    } else {
      trend = "stable";
      trendLabel = "Тренд: без выраженного сдвига — среднее помесячное отклонение близко к началу ряда.";
    }
  }

  let planCum = 0;
  let factCum = 0;
  const withCum = rows.map((r) => {
    planCum += r.plan;
    factCum += r.fact;
    return { ...r, planCum, factCum };
  });
  const hit = withCum.findIndex((r) => r.periodKey === todayMonthKey);
  const effIdx = hit >= 0 ? hit : Math.max(0, withCum.length - 1);
  const elapsed = Math.max(1, effIdx + 1);
  const total = Math.max(1, withCum.length);
  const remaining = Math.max(0, total - elapsed);
  const pt = withCum[effIdx] ?? withCum[withCum.length - 1]!;
  const end = withCum[withCum.length - 1]!;
  const runRateMonthly = pt.factCum / elapsed;
  const planEndMonthly = end.planCum;
  const forecastEndMonthly = Math.round(pt.factCum + runRateMonthly * remaining);
  const periodCompleted = remaining <= 0;
  const requiredMonthly = remaining > 0 ? Math.max(0, (planEndMonthly - pt.factCum) / remaining) : null;
  const tempoDiffMonthly = requiredMonthly != null ? runRateMonthly - requiredMonthly : null;
  const planAchievableAtMonthlyTempo = forecastEndMonthly >= planEndMonthly;

  return {
    sumDeviation,
    firstNegative,
    worstMonth,
    trend,
    trendLabel,
    runRateMonthly,
    requiredMonthly,
    tempoDiffMonthly,
    periodCompleted,
    planEndMonthly,
    forecastEndMonthly,
    planAchievableAtMonthlyTempo,
  };
}

function MonthlyDeviationBarLabel({
  x,
  y,
  width,
  height,
  value,
  presentation,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
  presentation: boolean;
}) {
  if (x == null || y == null || width == null || height == null || value == null || Number.isNaN(value)) return null;
  const cx = x + width / 2;
  const isNeg = value < 0;
  const labelY = isNeg ? y + height + 14 : y - 8;
  const fill = presentation ? "#cbd5e1" : "#475569";
  const text = `${value >= 0 ? "+" : "−"}${numFmt.format(Math.abs(value))}`;
  return (
    <text x={cx} y={labelY} textAnchor="middle" fill={fill} fontSize={9} className="tabular-nums">
      {text}
    </text>
  );
}

function MonthlyPlanDeviationTooltip({
  active,
  payload,
  presentation,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: MonthlyPlanExecutionRow }>;
  presentation: boolean;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div
      className={
        presentation
          ? "max-w-xs rounded-md border border-slate-500/50 bg-[#0f172a] px-2.5 py-2 text-xs text-slate-200"
          : "max-w-xs rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800"
      }
    >
      <div className={`font-medium ${presentation ? "text-slate-100" : "text-slate-900"}`}>{p.label}</div>
      <div className="mt-2 space-y-1 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-500" : "text-slate-500"}>План</span>
          <span>{numFmt.format(p.plan)} шт</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-500" : "text-slate-500"}>Факт</span>
          <span>{numFmt.format(p.fact)} шт</span>
        </div>
        <div className={`flex justify-between gap-4 border-t pt-1 ${presentation ? "border-slate-600/35" : "border-slate-200"}`}>
          <span className={presentation ? "text-slate-500" : "text-slate-500"}>Отклонение</span>
          <span className={p.deviation >= 0 ? (presentation ? "text-emerald-300" : "text-emerald-700") : presentation ? "text-red-300" : "text-red-700"}>
            {p.deviation >= 0 ? "+" : "−"}
            {numFmt.format(Math.abs(p.deviation))} шт
          </span>
        </div>
      </div>
    </div>
  );
}

function DeviationContributionTooltip({
  active,
  payload,
  presentation,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DeviationContributionRow }>;
  presentation: boolean;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div
      className={
        presentation
          ? "max-w-xs rounded-lg border border-slate-500/50 bg-[#0f172a] p-3 text-xs text-slate-200 shadow-xl"
          : "max-w-xs rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-lg"
      }
    >
      <div className={`font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>{p.name}</div>
      <div className="mt-2 space-y-1">
        <div>План: {rubFmt.format(p.plan)}</div>
        <div>Факт: {rubFmt.format(p.fact)}</div>
        <div className={p.deviation < 0 ? "text-red-400" : "text-emerald-400"}>
          Отклонение: {p.deviation < 0 ? "−" : "+"}
          {rubFmt.format(Math.abs(p.deviation))}
        </div>
      </div>
    </div>
  );
}

function FunnelBlock({
  stages,
  presentation,
  planRevenue,
  factRevenue,
}: {
  stages: FunnelStageRow[];
  presentation: boolean;
  planRevenue: number;
  factRevenue: number;
}) {
  const finalDeals = stages[stages.length - 1]?.count ?? 0;
  const avgCheck = finalDeals > 0 ? factRevenue / finalDeals : 0;

  const stageLosses = useMemo(() => {
    const out: {
      key: string;
      stage: string;
      lostLeads: number;
      lostDeals: number;
      lostRevenue: number;
    }[] = [];
    for (let i = 0; i < stages.length - 1; i++) {
      const from = stages[i]!;
      const to = stages[i + 1]!;
      const lostLeads = Math.max(0, from.count - to.count);
      const downstreamToDeal = to.count > 0 ? finalDeals / to.count : 0;
      const lostDeals = Math.round(lostLeads * downstreamToDeal);
      const lostRevenue = Math.round(lostDeals * avgCheck);
      out.push({
        key: `${from.stage}-${to.stage}`,
        stage: to.name,
        lostLeads,
        lostDeals,
        lostRevenue,
      });
    }
    return out.sort((a, b) => b.lostRevenue - a.lostRevenue);
  }, [stages, finalDeals, avgCheck]);

  const topProblem = stageLosses[0] ?? null;
  const projectedFactIfFixed = topProblem ? factRevenue + topProblem.lostRevenue : factRevenue;
  const planGap = planRevenue - factRevenue;
  const willPlanBeMetIfFixed = projectedFactIfFixed >= planRevenue;

  const tone = (lostRevenue: number) => {
    const ratio = planRevenue > 0 ? lostRevenue / planRevenue : 0;
    if (ratio > 0.1)
      return presentation
        ? "border-red-500/40 bg-red-950/20 text-red-100"
        : "border-red-200 bg-red-50 text-red-900";
    if (ratio >= 0.05)
      return presentation
        ? "border-amber-500/35 bg-amber-950/20 text-amber-100"
        : "border-amber-200 bg-amber-50 text-amber-900";
    return presentation
      ? "border-emerald-500/35 bg-emerald-950/20 text-emerald-100"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";
  };

  return (
    <div className="space-y-3.5">
      <div
        className={
          presentation
            ? "rounded-2xl border border-red-500/45 bg-gradient-to-br from-red-900/45 to-red-950/20 p-4"
            : "rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-4"
        }
      >
        <div className={`text-xs uppercase ${presentation ? "text-red-200" : "text-red-700"}`}>Корневая причина</div>
        <div className={`mt-1 text-xl font-black sm:text-2xl ${presentation ? "text-red-100" : "text-red-800"}`}>
          План не выполняется из-за этапа {topProblem?.stage ?? "—"}
        </div>
        <div className={`mt-1 text-sm ${presentation ? "text-red-200" : "text-red-700"}`}>
          Текущий недобор к плану: {compactRub(Math.max(0, planGap))}
        </div>
      </div>

      <div className="space-y-2">
        {stageLosses.map((row) => (
          <div key={row.key} className={`rounded-xl border p-3 ${tone(row.lostRevenue)}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold">{row.stage}</div>
              <div className="text-sm font-black tabular-nums">−{compactRub(row.lostRevenue)}</div>
            </div>
            <div className={`mt-1 grid grid-cols-3 gap-2 text-xs ${presentation ? "text-slate-200" : "text-slate-700"}`}>
              <div>Лиды: −{numFmt.format(row.lostLeads)}</div>
              <div>Сделки: −{numFmt.format(row.lostDeals)}</div>
              <div>Выручка: −{compactRub(row.lostRevenue)}</div>
            </div>
          </div>
        ))}
      </div>

      <div
        className={
          presentation
            ? "rounded-xl border border-slate-600/60 bg-slate-900/35 p-3"
            : "rounded-xl border border-slate-200 bg-slate-50 p-3"
        }
      >
        <div className={`text-xs ${presentation ? "text-slate-400" : "text-slate-600"}`}>Вывод</div>
        <div className={`mt-1 text-sm font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>
          Если исправить этап {topProblem?.stage ?? "—"}, план {willPlanBeMetIfFixed ? "выполнится" : "не выполнится"}.
        </div>
        <div className={`mt-1 text-xs ${presentation ? "text-slate-400" : "text-slate-600"}`}>
          Потенциальная выручка после исправления: {compactRub(projectedFactIfFixed)} из {compactRub(planRevenue)}.
        </div>
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
  /** Начальный сценарий слайда (из query при переходе из пояснения). */
  initialPlanScenario?: PlanScenario;
};

export function SalesPlanPanel({ presentation, period, objectId, dealTypeId, initialPlanScenario }: Props) {
  const isPresentationMode = presentation;
  const card = presentation ? CARD : CARD_EDIT;
  const h4 = presentation ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900";
  const sub = presentation ? "text-[11px] text-slate-500" : "text-[11px] text-slate-600";
  const [mode, setMode] = useState<PlanMode>("view");
  const [scenario, setScenario] = useState<PlanScenario>(initialPlanScenario ?? "realistic");

  const report = marketingSalesReportMock;
  const baseRev = report.salesData.revenue;
  const baseCategoryPlans = useMemo(
    () =>
      report.categories.reduce<Record<SalesCategoryId, number>>((acc, row) => {
        acc[row.id] = row.planCumulative;
        return acc;
      }, {} as Record<SalesCategoryId, number>),
    [report.categories],
  );
  const [savedTotalPlan, setSavedTotalPlan] = useState<number>(baseRev.planCumulative);
  const [savedCategoryPlans, setSavedCategoryPlans] = useState<Record<SalesCategoryId, number>>(baseCategoryPlans);
  const [draftTotalPlan, setDraftTotalPlan] = useState<number>(baseRev.planCumulative);
  const [draftCategoryPlans, setDraftCategoryPlans] = useState<Record<SalesCategoryId, number>>(baseCategoryPlans);

  const scenarioFactor = SCENARIO_FACTOR[scenario];
  const effectiveTotalPlan = Math.max(0, Math.round(savedTotalPlan * scenarioFactor));
  const effectiveCategoryPlans: Record<SalesCategoryId, number> = {
    apartments: Math.max(0, Math.round((savedCategoryPlans.apartments ?? 0) * scenarioFactor)),
    parking: Math.max(0, Math.round((savedCategoryPlans.parking ?? 0) * scenarioFactor)),
    storages: Math.max(0, Math.round((savedCategoryPlans.storages ?? 0) * scenarioFactor)),
    commercial: Math.max(0, Math.round((savedCategoryPlans.commercial ?? 0) * scenarioFactor)),
  };

  const rev = {
    ...baseRev,
    planCumulative: effectiveTotalPlan,
    deviationCumulative: baseRev.factCumulative - effectiveTotalPlan,
    percentComplete: effectiveTotalPlan > 0 ? (baseRev.factCumulative / effectiveTotalPlan) * 100 : 0,
  };

  const categoriesAdjusted = useMemo(
    () =>
      report.categories.map((cat) => {
        const plan = effectiveCategoryPlans[cat.id] ?? cat.planCumulative;
        const fact = cat.factCumulative;
        const deviation = fact - plan;
        const percentComplete = plan > 0 ? (fact / plan) * 100 : 0;
        return { ...cat, planCumulative: plan, deviation, percentComplete };
      }),
    [report.categories, effectiveCategoryPlans],
  );

  const radarCategoriesAdjusted = useMemo(() => {
    const ratio = (id: SalesCategoryId): number => {
      const base = baseCategoryPlans[id] || 1;
      return (effectiveCategoryPlans[id] || base) / base;
    };
    return report.radarCategories.map((r) => {
      let group: SalesCategoryId = "commercial";
      if (r.id.startsWith("apt-")) group = "apartments";
      else if (r.id.includes("parking")) group = "parking";
      else if (r.id.includes("storage")) group = "storages";
      const k = ratio(group);
      return { ...r, planCumulative: Math.round(r.planCumulative * k) };
    });
  }, [report.radarCategories, baseCategoryPlans, effectiveCategoryPlans]);

  const handleCancelEdit = () => {
    setDraftTotalPlan(savedTotalPlan);
    setDraftCategoryPlans(savedCategoryPlans);
    setMode("view");
  };
  const handleSaveEdit = () => {
    setSavedTotalPlan(Math.max(0, draftTotalPlan));
    setSavedCategoryPlans({
      apartments: Math.max(0, draftCategoryPlans.apartments),
      parking: Math.max(0, draftCategoryPlans.parking),
      storages: Math.max(0, draftCategoryPlans.storages),
      commercial: Math.max(0, draftCategoryPlans.commercial),
    });
    setMode("view");
  };

  const planManagementPayload = useMemo(
    () => ({
      scenario,
      salesPlan: {
        totalPlanRub: savedTotalPlan,
        categoryPlansRub: savedCategoryPlans,
      },
      meta: {
        asOf: report.asOf,
        source: "mock",
      },
    }),
    [scenario, savedTotalPlan, savedCategoryPlans, report.asOf],
  );
  const analytics = period === "month" ? report.planAnalytics.month : report.planAnalytics.quarter;
  const seriesPoints = period === "month" ? report.series.month : report.series.quarter;
  const revenueLineData = useMemo(() => seriesToLineData(seriesPoints, "revenue"), [seriesPoints]);

  const financialCashFlow = useMemo(() => {
    const cf = report.cashFlowDiagnostic;
    const pts = period === "month" ? cf.month : cf.quarter;
    const planByKey = new Map(seriesPoints.map((p) => [p.periodKey, p.revenue.planCumulative]));
    const planScale = baseRev.planCumulative > 0 ? rev.planCumulative / baseRev.planCumulative : 1;
    const execPctArr = pts.map((p) => {
      const basePlan = planByKey.get(p.periodKey) ?? 0;
      const planAdj = basePlan * planScale;
      return planAdj > 0 ? (p.escrowCumulative / planAdj) * 100 : 0;
    });
    const chartRows = pts.map((p, i) => {
      const gapCumulative = p.dduCumulative - p.escrowCumulative;
      const prevGap = i > 0 ? pts[i - 1].dduCumulative - pts[i - 1].escrowCumulative : 0;
      const gapPeriod = i === 0 ? gapCumulative : gapCumulative - prevGap;
      const spread = p.dduCumulative - p.escrowCumulative;
      const conversionPct = p.dduCumulative > 0 ? (p.escrowCumulative / p.dduCumulative) * 100 : 0;
      return {
        label: p.label,
        periodKey: p.periodKey,
        ddu: p.dduCumulative,
        escrow: p.escrowCumulative,
        spread,
        conversionPct,
        gapCumulative,
        gapPeriod,
        execPct: execPctArr[i] ?? 0,
      };
    });
    const n = chartRows.length;
    const lastGap = n > 0 ? chartRows[n - 1].gapCumulative : 0;
    const prevGap = n >= 2 ? chartRows[n - 2].gapCumulative : lastGap;
    const firstGap = n > 0 ? chartRows[0].gapCumulative : 0;
    const gapDeltaLastRub = n >= 2 ? lastGap - prevGap : 0;
    const gapDeltaHorizonRub = n >= 1 ? lastGap - firstGap : 0;
    const noiseRub = 2_000_000;
    const gapTrend: "up" | "down" | "flat" =
      gapDeltaLastRub > noiseRub ? "up" : gapDeltaLastRub < -noiseRub ? "down" : "flat";

    let slopePerPeriod = 0;
    if (n >= 2) {
      const xs = chartRows.map((_, i) => i);
      const ys = chartRows.map((r) => r.gapCumulative);
      const mx = xs.reduce((a, b) => a + b, 0) / n;
      const my = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - mx) * (ys[i] - my);
        den += (xs[i] - mx) ** 2;
      }
      slopePerPeriod = den !== 0 ? num / den : 0;
    }
    const forecastNextGapRub = lastGap + slopePerPeriod;
    const relSlope = lastGap > 1 ? slopePerPeriod / lastGap : 0;
    let liquidityRiskForecast: "increasing" | "stable" | "decreasing";
    if (slopePerPeriod > Math.max(lastGap * 0.06, 12_000_000)) liquidityRiskForecast = "increasing";
    else if (slopePerPeriod < Math.min(-lastGap * 0.02, -8_000_000)) liquidityRiskForecast = "decreasing";
    else liquidityRiskForecast = "stable";

    const liquidityRiskLabelRu =
      liquidityRiskForecast === "increasing"
        ? "Риск ликвидности растёт"
        : liquidityRiskForecast === "decreasing"
          ? "Риск снижается"
          : "Риск стабилен";

    const gapChartData = [
      ...chartRows.map((r) => ({ label: r.label, gapCumulative: r.gapCumulative, isForecast: false })),
      ...(n >= 2
        ? ([{ label: "Прогноз*", gapCumulative: forecastNextGapRub, isForecast: true }] as const)
        : []),
    ];

    const dduTotal = cf.dduFactCumulative;
    const escTotal = cf.escrowFactCumulative;
    const gapRub = dduTotal - escTotal;
    const gapOverThreshold = gapRub > cf.gapAlertThresholdRub;
    const escrowToDdu = dduTotal > 0 ? escTotal / dduTotal : 1;
    const conversionTotalPct = escrowToDdu * 100;
    const escrowDduWarning = escrowToDdu < 0.8;
    const revExecEscrowPct = rev.planCumulative > 0 ? (escTotal / rev.planCumulative) * 100 : 0;
    const execYMax = Math.max(105, ...execPctArr.map((x) => x * 1.12));
    const conversionYMax = Math.max(100, ...chartRows.map((r) => r.conversionPct), 92) * 1.06;

    const signedDeltaMln = (rub: number) => {
      const sign = rub >= 0 ? "+" : "−";
      const abs = Math.abs(rub);
      const mln = abs / 1_000_000;
      return `${sign}${dec1Fmt.format(mln)} млн ₽`;
    };

    const insightMerge =
      "Одна шкала ₽: линии ДДУ и эскроу; красная зона — накопительный разрыв (деньги ещё не на счёте).";
    const insightGap = gapOverThreshold
      ? `Разрыв ${compactRub(gapRub)} выше порога ${compactRub(cf.gapAlertThresholdRub)} — кассовый риск.`
      : gapRub > 0
        ? `Разрыв ${compactRub(gapRub)}: деньги отстают от договорной базы.`
        : `Разрыв по горизонту неположителен; контроль тренда сохраняйте.`;
    const insightConversion = `Эскроу / ДДУ = ${conversionTotalPct.toFixed(1)}%. Коридор 80–90% — норма отсрочки; ниже — риск отставания денег.`;
    const gapRiskHigh =
      gapOverThreshold || liquidityRiskForecast === "increasing" || (gapRub > cf.gapAlertThresholdRub * 0.5 && gapTrend === "up");
    const gapRiskStatusEn = gapRiskHigh ? "High cash gap risk" : gapRub > 0 ? "Moderate cash gap risk" : "Low cash gap risk";
    const gapRiskStatusRu = gapRiskHigh
      ? "Высокий кассовый риск разрыва"
      : gapRub > 0
        ? "Умеренный кассовый риск"
        : "Низкий кассовый риск";

    return {
      chartRows,
      gapChartData,
      dduTotal,
      escTotal,
      gapRub,
      gapOverThreshold,
      escrowDduWarning,
      escrowToDdu,
      conversionTotalPct,
      revExecEscrowPct,
      thresholdRub: cf.gapAlertThresholdRub,
      execYMax,
      conversionYMax,
      gapTrend,
      gapDeltaLastRub,
      gapDeltaHorizonRub,
      signedDeltaLast: signedDeltaMln(gapDeltaLastRub),
      signedDeltaHorizon: signedDeltaMln(gapDeltaHorizonRub),
      slopePerPeriod,
      forecastNextGapRub,
      liquidityRiskForecast,
      liquidityRiskLabelRu,
      slopePerPeriodFormatted: signedDeltaMln(slopePerPeriod),
      insightMerge,
      insightGap,
      insightConversion,
      gapRiskStatusEn,
      gapRiskStatusRu,
    };
  }, [report, period, seriesPoints, baseRev.planCumulative, rev.planCumulative]);

  const deviationContribution = useMemo(() => buildDeviationContribution(categoriesAdjusted), [categoriesAdjusted]);
  const totalDeviationRub = useMemo(
    () => deviationContribution.reduce((s, r) => s + r.deviation, 0),
    [deviationContribution],
  );
  const apt2CompensationText = useMemo(() => {
    const apt2 = radarCategoriesAdjusted.find((r) => r.id === "apt-2");
    if (!apt2) return null;
    const apt2Dev = apt2.factCumulative - apt2.planCumulative;
    const totalLag = radarCategoriesAdjusted
      .map((r) => r.factCumulative - r.planCumulative)
      .filter((v) => v < 0)
      .reduce((s, v) => s + Math.abs(v), 0);
    if (apt2Dev <= 0 || totalLag <= 0) return null;
    const pct = (apt2Dev / totalLag) * 100;
    return `Перевыполнение 2-ком компенсирует ${pct.toFixed(1)}% от отставания.`;
  }, [radarCategoriesAdjusted]);

  const dealControlData = useMemo(() => {
    const planRows = period === "month" ? marketingMockData.salesPlan.month : marketingMockData.salesPlan.quarter;
    const factRows = period === "month" ? marketingMockData.salesFact.month : marketingMockData.salesFact.quarter;
    const planFiltered = filterByObjectAndDealType(planRows, objectId, dealTypeId);
    const factFiltered = filterByObjectAndDealType(factRows, objectId, dealTypeId);
    return buildDealControlData(mergeSalesPlanFact(planFiltered, factFiltered));
  }, [period, objectId, dealTypeId]);

  const todayPeriodKey = useMemo(() => periodKeyToday(period), [period]);
  const currentIdx = Math.max(
    0,
    dealControlData.findIndex((r) => r.periodKey === todayPeriodKey),
  );
  const effectiveCurrentIdx = dealControlData.findIndex((r) => r.periodKey === todayPeriodKey) >= 0 ? currentIdx : dealControlData.length - 1;
  const elapsedPeriods = Math.max(1, effectiveCurrentIdx + 1);
  const totalPeriods = Math.max(1, dealControlData.length);
  const remainingPeriods = Math.max(0, totalPeriods - elapsedPeriods);
  const currentPoint = dealControlData[effectiveCurrentIdx];
  const endPoint = dealControlData[dealControlData.length - 1];
  const currentPlanCum = currentPoint?.planCumulative ?? 0;
  const currentFactCum = currentPoint?.factCumulative ?? 0;
  const currentDeviation = currentFactCum - currentPlanCum;
  const currentDeviationPct = currentPlanCum > 0 ? (currentDeviation / currentPlanCum) * 100 : 0;
  const runRateDeals = elapsedPeriods > 0 ? currentFactCum / elapsedPeriods : 0;
  const planEndDeals = endPoint?.planCumulative ?? 0;
  const forecastEndDeals = Math.round(currentFactCum + runRateDeals * remainingPeriods);
  const funnel = marketingMockData.funnel;
  const safeFunnel = funnel ?? [];
  const leadToDealRate =
    safeFunnel.length > 1 && safeFunnel[0].count > 0
      ? safeFunnel[safeFunnel.length - 1].count / safeFunnel[0].count
      : 0;
  const topWeakRadar = radarCategoriesAdjusted
    .map((r) => ({
      name: r.name,
      pct: r.planCumulative > 0 ? (r.factCumulative / r.planCumulative) * 100 : 0,
      deviation: r.factCumulative - r.planCumulative,
    }))
    .sort((a, b) => a.pct - b.pct)[0];
  const topNegativeContribution = deviationContribution.filter((r) => r.deviation < 0)[0];
  const funnelTopLossStage = safeFunnel.length > 1
    ? safeFunnel
        .slice(0, -1)
        .map((s, i) => {
          const next = safeFunnel[i + 1]!;
          const lostLeads = Math.max(0, s.count - next.count);
          const downstream = next.count > 0 ? (safeFunnel[safeFunnel.length - 1]!.count || 0) / next.count : 0;
          const lostDeals = Math.round(lostLeads * downstream);
          return { stage: next.name, lostLeads, lostDeals };
        })
        .sort((a, b) => b.lostDeals - a.lostDeals)[0]
    : null;
  const monthlyPlanExecutionData = useMemo((): MonthlyPlanExecutionRow[] => {
    const planFiltered = filterByObjectAndDealType(marketingMockData.salesPlan.month, objectId, dealTypeId);
    const factFiltered = filterByObjectAndDealType(marketingMockData.salesFact.month, objectId, dealTypeId);
    return mergeSalesPlanFact(planFiltered, factFiltered).map((row) => ({
      periodKey: row.periodKey,
      label: row.label,
      plan: row.planDeals,
      fact: row.factDeals,
      deviation: row.factDeals - row.planDeals,
    }));
  }, [objectId, dealTypeId]);
  const monthlyExecutionInsights = useMemo(() => {
    const todayMonthKey = periodKeyToday("month");
    return buildMonthlyExecutionInsights(monthlyPlanExecutionData, todayMonthKey);
  }, [monthlyPlanExecutionData]);
  const currentMonthIdx = useMemo(() => {
    const monthKey = periodKeyToday("month");
    const idx = monthlyPlanExecutionData.findIndex((r) => r.periodKey === monthKey);
    return idx >= 0 ? idx : Math.max(0, monthlyPlanExecutionData.length - 1);
  }, [monthlyPlanExecutionData]);
  const currentMonthPoint = monthlyPlanExecutionData[currentMonthIdx];
  const cumulativeExecSeriesPct = useMemo(() => {
    let planRun = 0;
    let factRun = 0;
    return monthlyPlanExecutionData.map((row) => {
      planRun += row.plan;
      factRun += row.fact;
      return planRun > 0 ? (factRun / planRun) * 100 : 0;
    });
  }, [monthlyPlanExecutionData]);
  const monthlyExecPctSeries = useMemo(
    () => monthlyPlanExecutionData.slice(-6).map((r) => (r.plan > 0 ? (r.fact / r.plan) * 100 : 0)),
    [monthlyPlanExecutionData],
  );
  const monthlyDeviationSeries = useMemo(
    () => monthlyPlanExecutionData.slice(-6).map((r) => r.deviation),
    [monthlyPlanExecutionData],
  );
  const cumulativeDeviationSeries = useMemo(() => {
    let run = 0;
    return monthlyPlanExecutionData.slice(-6).map((r) => {
      run += r.deviation;
      return run;
    });
  }, [monthlyPlanExecutionData]);
  const monthPlanDeals = currentMonthPoint?.plan ?? 0;
  const monthFactDeals = currentMonthPoint?.fact ?? 0;
  const monthDeviationDeals = currentMonthPoint?.deviation ?? 0;
  const monthExecPct = monthPlanDeals > 0 ? (monthFactDeals / monthPlanDeals) * 100 : 0;
  const currentRevCum = revenueLineData[effectiveCurrentIdx];
  const prevRevCum = effectiveCurrentIdx > 0 ? revenueLineData[effectiveCurrentIdx - 1] : undefined;
  const monthPlanRevenue = Math.max(0, (currentRevCum?.plan ?? 0) - (prevRevCum?.plan ?? 0));
  const monthFactRevenue = Math.max(0, (currentRevCum?.fact ?? 0) - (prevRevCum?.fact ?? 0));
  const monthDeviationRevenue = monthFactRevenue - monthPlanRevenue;
  const cumulativeDeviationRevenue = rev.deviationCumulative;
  const rr = analytics.runRate;
  const rrAdjusted = { ...rr, horizonPlanCumulativeRub: effectiveTotalPlan };
  const forecastPercentAdjusted = effectiveTotalPlan > 0 ? (rrAdjusted.forecastCumulativeEndRub / effectiveTotalPlan) * 100 : 0;
  const forecastGapRub = rrAdjusted.horizonPlanCumulativeRub - rrAdjusted.forecastCumulativeEndRub;

  const axisColor = presentation ? "#94a3b8" : "#64748b";
  const gridColor = presentation ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";
  const yTickCashM = (v: number) => `${Math.round(v / 1_000_000)}M`;
  const yTickGapBar = (v: number) => `${Math.round(v / 1_000_000)}M`;
  const yTickPct0 = (v: number) => `${Math.round(v)}%`;
  const getUpsellConvColor = (fact: number, plan: number) => {
    if (plan <= 0) return "#FF4D4F";
    if (fact >= plan) return "#22C55E";
    return "#FF4D4F";
  };

  const yTickDeals = (v: number) => `${numFmt.format(v)}`;
  const cumulativeExecTone: "green" | "yellow" | "red" =
    forecastPercentAdjusted >= 100 ? "green" : forecastPercentAdjusted >= 90 ? "yellow" : "red";
  const monthExecTone: "green" | "yellow" | "red" = monthExecPct >= 100 ? "green" : monthExecPct >= 95 ? "yellow" : "red";
  const weakSegment = topWeakRadar?.name ?? "сегменты";
  const lagSegment = topNegativeContribution?.name ?? weakSegment;
  const firstLagMonth = monthlyExecutionInsights.firstNegative?.label ?? "последние месяцы";
  const worstLagMonth = monthlyExecutionInsights.worstMonth?.label ?? firstLagMonth;
  const trendShort =
    monthlyExecutionInsights.trend === "improving"
      ? "тренд улучшается"
      : monthlyExecutionInsights.trend === "worsening"
        ? "тренд ухудшается"
        : monthlyExecutionInsights.trend === "stable"
          ? "тренд стабильный"
          : "тренд пока нечитабелен";
  const velocityMetrics = useMemo(() => {
    const totalMonths = Math.max(1, monthlyPlanExecutionData.length);
    const monthsPassed = Math.max(1, Math.min(totalMonths, currentMonthIdx + 1));
    const totalPlan = monthlyPlanExecutionData.reduce((sum, r) => sum + r.plan, 0);
    const currentFact = monthlyPlanExecutionData
      .slice(0, monthsPassed)
      .reduce((sum, r) => sum + r.fact, 0);
    const monthFact = monthlyPlanExecutionData[Math.max(0, monthsPassed - 1)]?.fact ?? 0;
    const planPerMonth = totalPlan / totalMonths;
    const actualPerMonth = currentFact / monthsPassed;
    const delta = actualPerMonth - planPerMonth;
    let tone: TrafficStatus;
    if (delta >= 0) {
      tone = "green";
    } else if (planPerMonth > 0 && delta >= -0.1 * planPerMonth) {
      tone = "yellow";
    } else {
      tone = "red";
    }
    return {
      totalMonths,
      monthsPassed,
      totalPlan,
      currentFact,
      monthFact,
      planPerMonth,
      actualPerMonth,
      tone,
    };
  }, [monthlyPlanExecutionData, currentMonthIdx]);
  const velocityMonthDeviation = velocityMetrics.monthFact - velocityMetrics.planPerMonth;
  const velocityMonthDeviationPct = velocityMetrics.planPerMonth > 0 ? (velocityMonthDeviation / velocityMetrics.planPerMonth) * 100 : 0;
  const salesStructureRows = useMemo(() => {
    const byId = new Map(radarCategoriesAdjusted.map((r) => [r.id, r]));
    const apt1 = byId.get("apt-1");
    const apt2 = byId.get("apt-2");
    const apt3 = byId.get("apt-3");
    const parking = byId.get("parking-r");
    const storages = byId.get("storage-r");
    const commercial = byId.get("commercial-r");
    const apartmentsTotal = categoriesAdjusted.find((c) => c.id === "apartments");
    const apt4PlanRub = Math.max(0, (apartmentsTotal?.planCumulative ?? 0) - ((apt1?.planCumulative ?? 0) + (apt2?.planCumulative ?? 0) + (apt3?.planCumulative ?? 0)));
    const apt4FactRub = Math.max(0, (apartmentsTotal?.factCumulative ?? 0) - ((apt1?.factCumulative ?? 0) + (apt2?.factCumulative ?? 0) + (apt3?.factCumulative ?? 0)));

    const planAvgDealRub = rev.planCumulative / Math.max(1, report.salesData.units.planCumulative);
    const factAvgDealRub = baseRev.factCumulative / Math.max(1, report.salesData.units.factCumulative);
    const toUnits = (rub: number, avg: number) => (avg > 0 ? Math.max(0, Math.round(rub / avg)) : 0);

    const rows = [
      { key: "apt-1", label: "1-комнатные", planRub: apt1?.planCumulative ?? 0, factRub: apt1?.factCumulative ?? 0 },
      { key: "apt-2", label: "2-комнатные", planRub: apt2?.planCumulative ?? 0, factRub: apt2?.factCumulative ?? 0 },
      { key: "apt-3", label: "3-комнатные", planRub: apt3?.planCumulative ?? 0, factRub: apt3?.factCumulative ?? 0 },
      { key: "apt-4", label: "4+ комнатные", planRub: apt4PlanRub, factRub: apt4FactRub },
      { key: "parking", label: "Парковки", planRub: parking?.planCumulative ?? 0, factRub: parking?.factCumulative ?? 0 },
      { key: "storages", label: "Кладовые", planRub: storages?.planCumulative ?? 0, factRub: storages?.factCumulative ?? 0 },
      { key: "commercial", label: "Коммерция", planRub: commercial?.planCumulative ?? 0, factRub: commercial?.factCumulative ?? 0 },
    ];

    return rows.map((row) => {
      const planUnits = toUnits(row.planRub, planAvgDealRub);
      const factUnits = toUnits(row.factRub, factAvgDealRub);
      const pct = planUnits > 0 ? (factUnits / planUnits) * 100 : 0;
      return {
        ...row,
        planUnits,
        factUnits,
        percent: pct,
        deltaUnits: factUnits - planUnits,
        deltaRub: row.factRub - row.planRub,
      };
    });
  }, [radarCategoriesAdjusted, categoriesAdjusted, rev.planCumulative, baseRev.factCumulative, report.salesData.units.planCumulative, report.salesData.units.factCumulative]);
  const salesStructureBalanceRows = useMemo(() => {
    const totalPlanUnits = salesStructureRows.reduce((s, r) => s + r.planUnits, 0);
    const totalFactUnits = salesStructureRows.reduce((s, r) => s + r.factUnits, 0);
    return salesStructureRows.map((row) => {
      const planShare = totalPlanUnits > 0 ? (row.planUnits / totalPlanUnits) * 100 : 0;
      const factShare = totalFactUnits > 0 ? (row.factUnits / totalFactUnits) * 100 : 0;
      const deltaShare = factShare - planShare;
      return { ...row, planShare, factShare, deltaShare };
    });
  }, [salesStructureRows]);
  const salesStructureReplacementInsight = useMemo(() => {
    const positives = [...salesStructureBalanceRows]
      .filter((r) => r.deltaShare > 0)
      .sort((a, b) => b.deltaRub - a.deltaRub || b.deltaShare - a.deltaShare);
    const negatives = [...salesStructureBalanceRows]
      .filter((r) => r.deltaShare < 0)
      .sort((a, b) => a.deltaRub - b.deltaRub || a.deltaShare - b.deltaShare);
    const topPos = positives.slice(0, 2);
    const topNeg = negatives.slice(0, 2);
    const replacementText =
      topPos.length && topNeg.length
        ? `Рост ${topPos.map((r) => r.label).join(" и ")} происходит за счёт ${topNeg.map((r) => r.label).join(" и ")}.`
        : "Существенных замещений структуры не выявлено.";
    return { topPos, topNeg, replacementText };
  }, [salesStructureBalanceRows]);
  const salesStructureExecutionDiagnostic = useMemo(() => {
    const materialRub = Math.max(2_500_000, rev.planCumulative * 0.004);
    const sorted = [...salesStructureRows].sort((a, b) => a.deltaRub - b.deltaRub);
    const worstKeys = sorted.filter((r) => r.deltaRub < 0).slice(0, 3).map((r) => r.key);
    const execWorstRankByKey = new Map(worstKeys.map((k, i) => [k, i + 1]));
    const rubTone = (deltaRub: number): "red" | "yellow" | "green" => {
      if (deltaRub > 0) return "green";
      if (deltaRub <= -materialRub * 0.45) return "red";
      if (deltaRub < 0) return "yellow";
      return "green";
    };
    const rows = sorted.map((row) => {
      const { conflict, hint } = executionRevenueConflictMeta(row);
      return {
        ...row,
        execWorstRank: execWorstRankByKey.get(row.key) ?? null,
        rubTone: rubTone(row.deltaRub),
        unitsRevenueConflict: conflict,
        conflictHint: hint,
      };
    });
    const hasUnitsRevenueConflict = rows.some((r) => r.unitsRevenueConflict);
    const topLoss = sorted.filter((r) => r.deltaRub < 0).slice(0, 3);
    const negSum = sorted.filter((r) => r.deltaRub < 0).reduce((s, r) => s + r.deltaRub, 0);
    const posSum = sorted.filter((r) => r.deltaRub > 0).reduce((s, r) => s + r.deltaRub, 0);
    const problem =
      topLoss.length > 0
        ? `Критичные минусы: ${topLoss.map((r) => `${r.label} (${compactRub(r.deltaRub)})`).join("; ")}.`
        : "Критичных провалов по выручке по категориям нет.";
    const cause = salesStructureReplacementInsight.replacementText;
    const topPosShare = salesStructureReplacementInsight.topPos.map((r) => r.label);
    const topNegShare = salesStructureReplacementInsight.topNeg.map((r) => r.label);
    const shiftCause =
      topPosShare.length && topNegShare.length
        ? `Рост ${topPosShare.join(" и ")} замещает ${topNegShare.join(" и ")}: дешевые сегменты вытесняют более маржинальные.`
        : cause;
    const action =
      topNegShare.length > 0
        ? `Сместить план продаж в ${topNegShare.join(" и ")} и ограничить давление на низкомаржинальные сегменты.`
        : "Пересобрать структурный микс в пользу высокомаржинальных сегментов.";
    const consequence =
      negSum < 0
        ? `Суммарно по «минусовым»: ${compactRub(negSum)}; компенсация +${compactRub(posSum)}. На маржу сильнее давят недоборы в дорогих форматах при тех же скидках.`
        : "Сальдо по выручке категорий неотрицательное; маржа зависит от фактических цен по сегментам.";
    return { rows, problem, cause, shiftCause, action, consequence, hasUnitsRevenueConflict, negSum };
  }, [salesStructureRows, rev.planCumulative, salesStructureReplacementInsight]);
  const salesStructureBalanceDiagnostic = useMemo(() => {
    const maxDelta = Math.max(
      1e-9,
      ...salesStructureBalanceRows.map((r) => Math.abs(r.deltaShare)),
    );
    const axisMaxPp = Math.max(1, Math.ceil(maxDelta));
    const scaleTicks = Array.from({ length: axisMaxPp * 2 + 1 }, (_, i) => -axisMaxPp + i);
    const maxAbsRub = Math.max(
      1,
      ...salesStructureBalanceRows.map((r) => Math.abs(r.deltaRub)),
    );
    const sorted = [...salesStructureBalanceRows].sort((a, b) => {
      const da = Math.abs(a.deltaRub);
      const db = Math.abs(b.deltaRub);
      if (db !== da) return db - da;
      return Math.abs(b.deltaShare) - Math.abs(a.deltaShare);
    });
    const negByLoss = [...salesStructureBalanceRows]
      .filter((r) => r.deltaRub < 0)
      .sort((a, b) => a.deltaRub - b.deltaRub);
    const lossRankByKey = new Map(negByLoss.map((r, i) => [r.key, i + 1]));
    const rows = sorted.map((row) => ({
      ...row,
      impactNorm: Math.abs(row.deltaRub) / maxAbsRub,
      lossRank: row.deltaRub < 0 ? (lossRankByKey.get(row.key) ?? null) : null,
    }));
    return { rows, maxDelta, axisMaxPp, scaleTicks, maxAbsRub };
  }, [salesStructureBalanceRows]);
  const chartMode: SalesPlanChartMode = presentation ? "presentation" : "work";
  const velocityLineData = useMemo(() => buildVelocityLineRows(monthlyPlanExecutionData), [monthlyPlanExecutionData]);
  const velocityCompletionPct = useMemo(() => {
    if (velocityMetrics.planPerMonth <= 0) return 0;
    return Math.round((velocityMetrics.actualPerMonth / velocityMetrics.planPerMonth) * 100);
  }, [velocityMetrics.actualPerMonth, velocityMetrics.planPerMonth]);

  const salesStructureBalanceExecInsight = useMemo(() => {
    const rows = salesStructureBalanceDiagnostic.rows;
    const topLoss = [...salesStructureBalanceRows]
      .filter((r) => r.deltaRub < 0)
      .sort((a, b) => a.deltaRub - b.deltaRub)
      .slice(0, 3);
    const negRubTotal = rows.filter((r) => r.deltaRub < 0).reduce((s, r) => s + r.deltaRub, 0);
    const posRubTotal = rows.filter((r) => r.deltaRub > 0).reduce((s, r) => s + r.deltaRub, 0);
    const { topPos, topNeg } = salesStructureReplacementInsight;

    const line1 =
      topLoss.length > 0
        ? `Проблема: ${topLoss.map((r) => r.label).join(", ")}.`
        : "Проблема: без явного отставания по сегментам.";

    const line2 =
      topPos.length && topNeg.length
        ? `Причина: доля ↑ ${topPos.map((r) => r.label).join(", ")} за счёт ↓ ${topNeg.map((r) => r.label).join(", ")}.`
        : "Причина: замещение по модели слабое.";

    const line3 =
      negRubTotal < 0
        ? `Следствие: ${compactRub(negRubTotal)} к выручке, компенсация +${compactRub(posRubTotal)}, темп ${velocityCompletionPct}% к плану.`
        : `Следствие: сальдо по ₽ ≥ 0, темп ${velocityCompletionPct}% к плану.`;

    return { line1, line2, line3 };
  }, [
    salesStructureBalanceDiagnostic.rows,
    salesStructureBalanceRows,
    salesStructureReplacementInsight,
    velocityCompletionPct,
  ]);

  const rootCauseDecomposition = useMemo(() => {
    const baseDrivers = report.rootCauseWaterfall.drivers;
    const baseSum = baseDrivers.reduce((s, d) => s + d.impactRub, 0);
    const target = rev.deviationCumulative;
    const scale = baseSum !== 0 ? target / baseSum : 1;
    let drivers = baseDrivers.map((d) => ({
      id: d.id,
      labelRu: d.labelRu,
      impactRub: Math.round(d.impactRub * scale),
    }));
    const sumDrivers = () => drivers.reduce((s, d) => s + d.impactRub, 0);
    const drift = target - sumDrivers();
    if (drift !== 0 && drivers.length > 0) {
      let ix = 0;
      drivers.forEach((d, i) => {
        if (Math.abs(d.impactRub) > Math.abs(drivers[ix]!.impactRub)) ix = i;
      });
      drivers = drivers.map((d, i) => (i === ix ? { ...d, impactRub: d.impactRub + drift } : d));
    }
    const driversSortedByImpact = [...drivers].sort((a, b) => Math.abs(b.impactRub) - Math.abs(a.impactRub));
    let run = 0;
    const waterfallRows = drivers.map((d) => {
      const runningStart = run;
      run += d.impactRub;
      return { ...d, runningStart, runningEnd: run };
    });
    const structureDrilldown = [...salesStructureRows]
      .filter((r) => r.deltaRub < 0)
      .sort((a, b) => a.deltaRub - b.deltaRub)
      .slice(0, 4);
    const revPts = seriesToLineData(seriesPoints, "revenue");
    const monthIncremental = revPts.map((r, i, arr) => ({
      label: r.label,
      cum: r.deviation,
      incremental: i === 0 ? r.deviation : r.deviation - arr[i - 1]!.deviation,
    }));
    const firstCum = revPts[0]?.deviation ?? 0;
    const lastCum = revPts[revPts.length - 1]?.deviation ?? 0;
    let trendRu = "стабилизируется";
    let trendDetailRu = "Накопление отклонения без экстремального ускорения на горизонте ряда.";
    if (lastCum < firstCum - 12_000_000) {
      trendRu = "углубляется";
      trendDetailRu = "Накопительный недобор по выручке к последнему периоду сильнее, чем в начале ряда.";
    } else if (lastCum > firstCum + 12_000_000) {
      trendRu = "сходится к плану";
      trendDetailRu = "Накопленное отклонение по выручке снижается относительно старта периода.";
    }
    const incs = monthIncremental.map((m) => m.incremental);
    const lastInc = incs[incs.length - 1] ?? 0;
    const firstInc = incs[0] ?? 0;
    if (incs.length >= 2 && lastInc < firstInc - 25_000_000) {
      trendDetailRu += " Добавка к план-факту в последнем периоде заметно слабее первого — темп просел.";
    } else if (incs.length >= 2 && lastInc > firstInc + 25_000_000) {
      trendDetailRu += " Последний период добавляет к выручке больше относительно самого первого.";
    }
    const worst = driversSortedByImpact[0];
    const second = driversSortedByImpact[1];
    const conversion = drivers.find((d) => d.id === "conversion");
    const showConversionBlock = conversion !== undefined && Math.abs(conversion.impactRub) >= 250_000;
    const wfMin = Math.min(...waterfallRows.flatMap((r) => [r.runningStart, r.runningEnd]));
    const wfMax = Math.max(...waterfallRows.flatMap((r) => [r.runningStart, r.runningEnd]));
    const wfSpan = Math.max(wfMax - wfMin, 1);
    const causal = {
      main: worst
        ? `Корневая причина по вкладу: ${worst.labelRu} — ${worst.impactRub >= 0 ? "+" : "−"}${compactRub(Math.abs(worst.impactRub))}.`
        : "Недостаточно данных для выделения главного драйвера.",
      secondary:
        second && worst && second.id !== worst.id
          ? `Вторичный эффект: ${second.labelRu} (${second.impactRub >= 0 ? "+" : "−"}${compactRub(Math.abs(second.impactRub))}).`
          : null,
      bridge: `Мост согласован с блоком «Выполнение структуры продаж»: ${salesStructureBalanceExecInsight.line2}`,
      final: `Финальный разрыв к плану: ${rev.deviationCumulative <= 0 ? "−" : "+"}${compactRub(Math.abs(rev.deviationCumulative))} (накопительно).`,
    };
    const insight = `Решение: приоритет — снять ${worst?.labelRu ?? "узкое место"}; ${salesStructureBalanceExecInsight.line1}`;
    return {
      drivers,
      driversSortedByImpact,
      waterfallRows,
      structureDrilldown,
      monthIncremental,
      trendRu,
      trendDetailRu,
      causal,
      insight,
      wfMin,
      wfSpan,
      showConversionBlock,
    };
  }, [
    report.rootCauseWaterfall.drivers,
    rev.deviationCumulative,
    salesStructureRows,
    seriesPoints,
    salesStructureBalanceExecInsight.line1,
    salesStructureBalanceExecInsight.line2,
  ]);

  const inventoryLiquidationAnalysis = useMemo(() => {
    const inv = report.inventoryLiquidation;
    const rows = inv.byType.map((r) => {
      const cappedRisk = Math.min(r.unsoldForecastUnits, r.remainingUnits);
      const vr = Math.min(1.2, Math.max(0.3, r.segmentVelocityRatio));
      const lowVelocity = Math.max(0, 1 - vr);
      const riskScore = r.remainingUnits * lowVelocity;
      return {
        ...r,
        cappedRisk,
        remainingSafe: Math.max(0, r.remainingUnits - cappedRisk),
        riskScore,
        segmentVelocityRatioClamped: vr,
      };
    });
    const totalPlan = rows.reduce((s, r) => s + r.planUnits, 0);
    const totalSold = rows.reduce((s, r) => s + r.soldUnits, 0);
    const totalRemaining = rows.reduce((s, r) => s + r.remainingUnits, 0);
    const totalRisk = rows.reduce((s, r) => s + r.cappedRisk, 0);
    const pctSold = totalPlan > 0 ? (totalSold / totalPlan) * 100 : 0;
    const pctRemaining = totalPlan > 0 ? (totalRemaining / totalPlan) * 100 : 0;
    const pctAtRisk = totalPlan > 0 ? (totalRisk / totalPlan) * 100 : 0;
    const portfolioBar = [
      {
        name: "Портфель",
        sold: totalSold,
        remaining: Math.max(0, totalRemaining - totalRisk),
        unsoldForecast: totalRisk,
      },
    ];
    const byLiquidityRiskDesc = [...rows].sort((a, b) => b.riskScore - a.riskScore);
    const topRiskScoreIds = new Set(byLiquidityRiskDesc.slice(0, 2).map((r) => r.id));
    const barByType = byLiquidityRiskDesc.map((r) => ({
      label: r.label,
      id: r.id,
      sold: r.soldUnits,
      remaining: r.remainingSafe,
      unsoldForecast: r.cappedRisk,
      plan: r.planUnits,
      riskScore: r.riskScore,
      highRisk: topRiskScoreIds.has(r.id),
    }));
    const actualPace = Math.max(0.01, inv.actualSalesPerMonth);
    const plannedPace = Math.max(0.01, inv.plannedSalesPerMonth);
    const monthsToClear = totalRemaining / actualPace;
    const monthsLeft = Math.max(0.01, inv.monthsRemaining);
    const paceGapMonths = monthsToClear - monthsLeft;
    const timeDeficitMonths = Math.max(0, paceGapMonths);
    const paceRatio = plannedPace > 0 ? actualPace / plannedPace : 1;
    const whyLowPace = actualPace < plannedPace * 0.95;
    const riskConcentration = [...rows]
      .filter((r) => r.cappedRisk > 0)
      .sort((a, b) => b.cappedRisk - a.cappedRisk)
      .map((r) => ({
        id: r.id,
        label: r.label,
        units: r.cappedRisk,
        pctOfTotalRisk: totalRisk > 0 ? (r.cappedRisk / totalRisk) * 100 : 0,
      }));
    const worstLiquidity = byLiquidityRiskDesc[0];
    const secondLiquidity = byLiquidityRiskDesc[1];
    const topUnsold = [...rows].sort((a, b) => b.cappedRisk - a.cappedRisk);
    const insight = {
      problem: `Проблема: прогноз непроданного ${numFmt.format(totalRisk)} шт (${pctAtRisk.toFixed(1)}% портфеля); максимальный риск ликвидности — «${worstLiquidity?.label ?? "—"}»${secondLiquidity ? ` и «${secondLiquidity.label}»` : ""} (остаток × слабый темп сегмента).`,
      cause: whyLowPace
        ? `Причина: дефицит темпа — факт ${dec1Fmt.format(actualPace)} шт/мес vs требуемый к дедлайну ${dec1Fmt.format(plannedPace)} шт/мес (${(paceRatio * 100).toFixed(0)}% от нормы); плюс сдвиг структуры в медленные линейки.`
        : `Причина: средний темп близок к плану, но сегменты с низким относительным выкупом (${topUnsold.slice(0, 2).map((r) => r.label).join(", ")}) удерживают прогноз непроданного.`,
      consequence: `Следствие: при текущем темпе остаток «снимается» ~${dec1Fmt.format(monthsToClear)} мес. при ${dec1Fmt.format(monthsLeft)} мес. до конца — ${timeDeficitMonths > 0.5 ? `дефицит времени ~${dec1Fmt.format(timeDeficitMonths)} мес., ` : ""}рост доли нереализованного запаса и давление на цену / промо.`,
    };
    return {
      rows,
      totalPlan,
      totalSold,
      totalRemaining,
      totalRisk,
      pctSold,
      pctRemaining,
      pctAtRisk,
      portfolioBar,
      barByType,
      actualPace,
      plannedPace,
      paceRatio,
      monthsToClear,
      monthsLeft,
      paceGapMonths,
      timeDeficitMonths,
      riskConcentration,
      insight,
    };
  }, [report.inventoryLiquidation]);

  const upsellDiagnosticAnalysis = useMemo(() => {
    const up = report.upsellDiagnostic;
    const aptF = Math.max(1, up.apartmentDealsFact);
    const aptP = Math.max(1, up.apartmentDealsPlan);
    const benchmarkPctExplicit = up.benchmarkConversionPct;
    const rows = up.categories.map((c) => {
      const revDelta = c.actualRevenueRub - c.planRevenueRub;
      const execPct = c.planRevenueRub > 0 ? (c.actualRevenueRub / c.planRevenueRub) * 100 : 0;
      const convGapPct = c.plannedConversionPct - c.actualConversionPct;
      const convDeltaPct = c.actualConversionPct - c.plannedConversionPct;
      const planUpsellOrders = (c.plannedConversionPct / 100) * aptP;
      const revPerPlannedUpsell = c.planRevenueRub / Math.max(1, planUpsellOrders);
      const gapConvToPlan = Math.max(0, (c.plannedConversionPct - c.actualConversionPct) / 100);
      const potentialRevFromPlanConv = gapConvToPlan * aptF * revPerPlannedUpsell;
      const gapConvToTarget = Math.max(0, (up.targetConversionPct - c.actualConversionPct) / 100);
      const potentialRevToTarget = gapConvToTarget * aptF * revPerPlannedUpsell;
      const gapConvToBenchmark =
        benchmarkPctExplicit != null ? Math.max(0, (benchmarkPctExplicit - c.actualConversionPct) / 100) : 0;
      const potentialRevToBenchmark = gapConvToBenchmark * aptF * revPerPlannedUpsell;
      const scaledPlanRev = c.planRevenueRub * (aptF / aptP);
      return {
        ...c,
        revDelta,
        execPct,
        convGapPct,
        convDeltaPct,
        potentialRevFromPlanConv,
        potentialRevToTarget,
        potentialRevToBenchmark,
        scaledPlanRev,
        revPerPlannedUpsell,
      };
    });
    const totalPlan = rows.reduce((s, r) => s + r.planRevenueRub, 0);
    const totalActual = rows.reduce((s, r) => s + r.actualRevenueRub, 0);
    const totalRevDelta = totalActual - totalPlan;
    const scaledPlanTotal = rows.reduce((s, r) => s + r.scaledPlanRev, 0);
    const volumeRevGap = totalPlan - scaledPlanTotal;
    const conversionRevGap = scaledPlanTotal - totalActual;
    const totalPotentialPlanConv = rows.reduce((s, r) => s + r.potentialRevFromPlanConv, 0);
    const totalPotentialTarget = rows.reduce((s, r) => s + r.potentialRevToTarget, 0);
    const totalPotentialBenchmark = rows.reduce((s, r) => s + r.potentialRevToBenchmark, 0);

    const wRev = totalPlan > 0 ? rows.map((r) => r.planRevenueRub / totalPlan) : rows.map(() => 1 / Math.max(1, rows.length));
    const totalConvPlan = rows.reduce((s, r, i) => s + r.plannedConversionPct * wRev[i]!, 0);
    const totalConvFact = rows.reduce((s, r, i) => s + r.actualConversionPct * wRev[i]!, 0);
    const totalConvDeltaPP = totalConvFact - totalConvPlan;
    const aptExecPct = (aptF / aptP) * 100;

    const volumePenaltyRub = Math.max(0, volumeRevGap);
    const convPenaltyRub = Math.max(0, conversionRevGap);
    const driver: "conversion" | "base" | "mixed" =
      volumePenaltyRub < totalPlan * 0.005 && convPenaltyRub < totalPlan * 0.005
        ? "mixed"
        : convPenaltyRub >= volumePenaltyRub * 1.15
          ? "conversion"
          : volumePenaltyRub >= convPenaltyRub * 1.15
            ? "base"
            : "mixed";

    const worstByConvGap = [...rows].sort((a, b) => b.convGapPct - a.convGapPct)[0];
    const weakConvName = worstByConvGap && worstByConvGap.convGapPct > 0.5 ? worstByConvGap.name : rows[0]?.name ?? "—";
    const weakConvDeltaPP = worstByConvGap?.convGapPct ?? 0;

    const revBreakdownLine = rows
      .map((r) => `${r.name}: ${r.revDelta >= 0 ? "+" : "−"}${compactRub(Math.abs(r.revDelta))}`)
      .join(" · ");

    const cause =
      driver === "base"
        ? `Основной драйвер — база: недобор сделок по квартирам (${numFmt.format(aptF)} факт / ${numFmt.format(aptP)} план, ${aptExecPct.toFixed(1)}%) съедает около ${compactRub(volumePenaltyRub)} суммарного плана upsell при пропорциональном масштабе. На фактической базе при плановой конверсии — около ${compactRub(scaledPlanTotal)} против ${compactRub(totalPlan)} «полного» плана.`
        : driver === "conversion"
          ? `Основной драйвер — конверсия: на текущей базе квартир недомонетизация около ${compactRub(convPenaltyRub)} (${compactRub(scaledPlanTotal)} ожидаемо при плановой конверсии vs ${compactRub(totalActual)} факт). Сильнее всего разрыв в «${weakConvName}».`
          : `База и конверсия сопоставимы по ущербу: недобор от объёма квартир ~${compactRub(volumePenaltyRub)} к плану upsell; недобор конверсии на этой базе ~${compactRub(convPenaltyRub)}.`;

    const upsideText =
      totalPotentialPlanConv > 0
        ? `Апсайд при доведении конверсии до плана (на текущей базе квартир): до ${compactRub(totalPotentialPlanConv)}.`
        : "Суммарная конверсия на уровне или выше планового индекса — смотрите базу квартир и целевой норматив.";
    const benchmarkUpsideText =
      benchmarkPctExplicit != null && totalPotentialBenchmark > 0
        ? ` Дополнительно до внешнего бенчмарка ${dec1Fmt.format(benchmarkPctExplicit)}% — до ${compactRub(totalPotentialBenchmark)}.`
        : "";

    const insight = {
      driver,
      cause,
      money: `Суммарно по upsell: ${totalRevDelta >= 0 ? "+" : "−"}${compactRub(Math.abs(totalRevDelta))} к плану. ${upsideText}${benchmarkUpsideText}`,
      revBreakdownLine,
    };

    const convCompare = rows.map((r) => ({
      name: r.name,
      factConv: Math.round(r.actualConversionPct * 10) / 10,
      planConv: Math.round(r.plannedConversionPct * 10) / 10,
      factPlanLabel: `${dec1Fmt.format(r.actualConversionPct)}% (plan ${dec1Fmt.format(r.plannedConversionPct)}%)`,
      fill: getUpsellConvColor(r.actualConversionPct, r.plannedConversionPct) || "#FF4D4F",
    }));
    const convChartYMax = Math.min(
      100,
      Math.max(
        50,
        Math.ceil(
          (Math.max(
            ...rows.flatMap((r) => [r.plannedConversionPct, r.actualConversionPct]),
            up.targetConversionPct,
            benchmarkPctExplicit ?? 0,
          ) +
            4) /
            5,
        ) * 5,
      ),
    );

    return {
      rows,
      totalPlan,
      totalActual,
      totalRevDelta,
      totalPotentialPlanConv,
      totalPotentialTarget,
      totalPotentialBenchmark,
      scaledPlanTotal,
      volumeRevGap,
      conversionRevGap,
      aptF,
      aptP,
      aptExecPct,
      totalConvPlan,
      totalConvFact,
      totalConvDeltaPP,
      weakConvName,
      weakConvDeltaPP,
      targetPct: up.targetConversionPct,
      benchmarkPctExplicit,
      hasBenchmark: benchmarkPctExplicit != null,
      insight,
      convCompare,
      convChartYMax,
    };
  }, [report.upsellDiagnostic]);

  const upsellConversionSignal = useMemo(() => {
    const ratio =
      upsellDiagnosticAnalysis.totalConvPlan > 0
        ? upsellDiagnosticAnalysis.totalConvFact / upsellDiagnosticAnalysis.totalConvPlan
        : 0;
    const forceRed = upsellDiagnosticAnalysis.totalRevDelta < 0;
    const status: "green" | "yellow" | "red" = forceRed ? "red" : ratio >= 1 ? "green" : ratio >= 0.8 ? "yellow" : "red";

    if (status === "green") {
      return {
        status,
        label: "🟢 КОНВЕРСИЯ В НОРМЕ",
        cardClass: presentation ? "border-emerald-500/45 bg-emerald-950/25" : "border-emerald-200 bg-emerald-50",
        labelClass: presentation ? "text-emerald-300" : "text-emerald-700",
        valueClass: presentation ? "text-emerald-200" : "text-emerald-800",
      };
    }
    if (status === "yellow") {
      return {
        status,
        label: "🟡 КОНВЕРСИЯ В РИСКЕ",
        cardClass: presentation ? "border-amber-500/45 bg-amber-950/25" : "border-amber-200 bg-amber-50",
        labelClass: presentation ? "text-amber-300" : "text-amber-700",
        valueClass: presentation ? "text-amber-200" : "text-amber-800",
      };
    }
    return {
      status,
      label: "🔴 КОНВЕРСИЯ ПРОСЕДАЕТ",
      cardClass: presentation ? "border-rose-500/55 bg-rose-950/35" : "border-rose-300 bg-rose-50",
      labelClass: presentation ? "text-rose-300" : "text-rose-700",
      valueClass: presentation ? "text-rose-100" : "text-rose-700",
    };
  }, [
    presentation,
    upsellDiagnosticAnalysis.totalConvFact,
    upsellDiagnosticAnalysis.totalConvPlan,
    upsellDiagnosticAnalysis.totalRevDelta,
  ]);

  const executiveManagementSummary = useMemo(() => {
    const inv = inventoryLiquidationAnalysis;
    const cf = financialCashFlow;
    const up = upsellDiagnosticAnalysis;
    const paceToNorm = inv.plannedPace > 0 ? inv.actualPace / inv.plannedPace : 1;
    const revMissRub = Math.max(0, -rev.deviationCumulative);
    const upsellMissRub = Math.max(0, -up.totalRevDelta);
    const avgDealRub = baseRev.factCumulative / Math.max(1, report.salesData.units.factCumulative);
    const invRiskRub = Math.round(inv.totalRisk * avgDealRub);
    const invWorstLabel = inv.barByType[0]?.label ?? "Портфель";
    const weakStruct = [...salesStructureRows].filter((r) => r.deltaRub < 0).sort((a, b) => a.deltaRub - b.deltaRub)[0];

    const fmtSignedRub = (n: number) => `${n >= 0 ? "+" : "−"}${compactRub(Math.abs(n))}`;

    type Cand = { rubSort: number; cause: string; problem: string; action: string };
    const cands: Cand[] = [];

    if (rev.deviationCumulative < 0 || forecastPercentAdjusted < 98) {
      cands.push({
        rubSort: Math.max(revMissRub, forecastGapRub * 0.4),
        cause: `просадка спроса в ${lagSegment}`,
        problem: `просадка спроса в ${lagSegment} → ${fmtSignedRub(-revMissRub)}`,
        action: `Перезапустить оффер в ${lagSegment} на 14 дней`,
      });
    }
    if (cf.gapOverThreshold) {
      cands.push({
        rubSort: cf.gapRub,
        cause: "медленная конверсия ДДУ в эскроу",
        problem: `медленная конверсия ДДУ в эскроу → ${fmtSignedRub(-cf.gapRub)}`,
        action: "Перевести текущие ДДУ в эскроу за 5 рабочих дней",
      });
    }
    if (weakStruct && weakStruct.deltaRub < -8_000_000) {
      cands.push({
        rubSort: Math.abs(weakStruct.deltaRub),
        cause: `перекос структуры в ${weakStruct.label}`,
        problem: `перекос структуры в ${weakStruct.label} → ${fmtSignedRub(weakStruct.deltaRub)}`,
        action: `Перенаправить 60% лидов в ${weakStruct.label} до конца месяца`,
      });
    }
    if (upsellMissRub >= 3_000_000) {
      cands.push({
        rubSort: upsellMissRub,
        cause: "низкая upsell конверсия в паркинг и кладовые",
        problem: `низкая upsell конверсия в паркинг и кладовые → ${fmtSignedRub(-upsellMissRub)}`,
        action: "Добавить обязательный upsell скрипт в каждый показ квартиры",
      });
    }
    if (inv.timeDeficitMonths >= 0.5) {
      cands.push({
        rubSort: Math.max(invRiskRub, 1),
        cause: `замедление выкупа ${invWorstLabel}`,
        problem: `замедление выкупа ${invWorstLabel} → ${fmtSignedRub(-invRiskRub)}`,
        action: `Запустить спецпрайс на ${invWorstLabel} до выкупа 30% остатка`,
      });
    }

    cands.sort((a, b) => b.rubSort - a.rubSort);
    const primary = cands[0];
    const pack = primary ?? {
      cause: `слабый спрос в ${lagSegment}`,
      problem: `слабый спрос в ${lagSegment} → ${fmtSignedRub(rev.deviationCumulative)}`,
      action: `Усилить лидогенерацию в ${lagSegment} на текущей неделе`,
    };

    const bestCat = [...deviationContribution].filter((d) => d.deviation > 0).sort((a, b) => b.deviation - a.deviation)[0];
    const topNegCat = [...deviationContribution].filter((d) => d.deviation < 0).sort((a, b) => a.deviation - b.deviation)[0];
    const strongestLoss = [...rootCauseDecomposition.drivers]
      .filter((d) => d.impactRub < 0)
      .sort((a, b) => a.impactRub - b.impactRub)[0];
    let mainDriver: string;
    if (up.totalRevDelta > 0) {
      mainDriver = `Upsell компенсирует ${fmtSignedRub(up.totalRevDelta)} отклонения`;
    } else if (bestCat && bestCat.deviation >= 12_000_000) {
      mainDriver = `${bestCat.name} компенсирует ${fmtSignedRub(bestCat.deviation)} отклонения`;
    } else if (salesStructureReplacementInsight.topPos[0]) {
      const t = salesStructureReplacementInsight.topPos[0]!.label;
      mainDriver = `${t} дает частичную компенсацию в структуре`;
    } else if (velocityCompletionPct >= 97 && velocityMetrics.tone !== "red") {
      mainDriver = "Темп сделок удерживает положительный вклад месяца";
    } else if (!cf.gapOverThreshold && cf.conversionTotalPct >= 82) {
      mainDriver = "Стабильный эскроу поток снижает давление на кассовый разрыв";
    } else {
      mainDriver = "Положительный драйвер по ₽ пока не сформирован";
    }

    const paceRed = paceToNorm < 0.82 || velocityCompletionPct < 82;
    const paceYellow = paceToNorm < 0.94 || velocityCompletionPct < 92 || velocityMetrics.tone !== "green";

    let statusTone: "green" | "yellow" | "red";
    let statusLabel: string;
    if (
      forecastPercentAdjusted < 88 ||
      cumulativeExecTone === "red" ||
      cf.gapOverThreshold ||
      paceRed ||
      (revMissRub > 60_000_000 && forecastPercentAdjusted < 95)
    ) {
      statusTone = "red";
      statusLabel = "🔴 ОТСТАВАНИЕ";
    } else if (
      forecastPercentAdjusted < 100 ||
      cumulativeExecTone === "yellow" ||
      cf.gapRub > cf.thresholdRub * 0.55 ||
      paceYellow ||
      upsellMissRub > 5_000_000 ||
      inv.timeDeficitMonths >= 0.45
    ) {
      statusTone = "yellow";
      statusLabel = "🟠 РИСК";
    } else {
      statusTone = "green";
      statusLabel = "🟢 В ПЛАНЕ";
    }

    const forecastSign = forecastGapRub >= 0 ? "−" : "+";
    const forecastMln = Math.round(Math.abs(forecastGapRub) / 1_000_000);
    const forecastText = forecastMln >= 300 ? `${forecastSign}300+ млн ₽` : `${forecastSign}${compactRub(Math.abs(forecastGapRub))}`;
    const statusLabelFull = `${statusLabel} ${fmtSignedRub(rev.deviationCumulative)}`;
    const statusMetrics = `📉 Тренд ухудшается → прогноз ${forecastText}`;
    const paceLossRub = Math.max(0, forecastGapRub);
    const paceLossPerMonth = Math.round(paceLossRub / Math.max(1, velocityMetrics.totalMonths));
    const weakDemandRub = Math.max(0, -((topNegCat?.deviation ?? 0)));
    const compRub = bestCat?.deviation ?? 0;
    const compLabel = (bestCat?.name ?? "сильный сегмент").toLowerCase();
    const causalChain = [
      "Отставание",
      `← темп ниже плана (${fmtSignedRub(-paceLossPerMonth)}/мес)`,
      `← слабый спрос на квартиры (${fmtSignedRub(-weakDemandRub)})`,
    ];

    const trimWords = (s: string, max = 10) => {
      const w = s.trim().split(/\s+/).filter(Boolean);
      return w.length <= max ? s : `${w.slice(0, max).join(" ")}…`;
    };

    return {
      statusTone,
      statusLabel: statusLabelFull,
      statusMetrics,
      causalChain,
      mainDriver: compRub > 0 ? `${bestCat?.name ?? "Сильный сегмент"} компенсируют часть потерь (${fmtSignedRub(compRub)})` : trimWords(mainDriver),
      mainProblem: `Слабый спрос на квартиры → ${fmtSignedRub(-weakDemandRub)} (ключевой драйвер)`,
      requiredAction: "Ускорить продажи квартир:\n– цена\n– маркетинг\n– конверсия",
    };
  }, [
    inventoryLiquidationAnalysis,
    financialCashFlow,
    upsellDiagnosticAnalysis,
    salesStructureRows,
    baseRev.factCumulative,
    report.salesData.units.factCumulative,
    rev.deviationCumulative,
    rev.percentComplete,
    forecastPercentAdjusted,
    cumulativeExecTone,
    forecastGapRub,
    deviationContribution,
    rootCauseDecomposition.drivers,
    salesStructureReplacementInsight,
    velocityCompletionPct,
    velocityMetrics.tone,
    lagSegment,
  ]);

  const dynamicsKpiInput = useMemo((): DynamicsKpiInput => {
    return {
      rev: {
        planCumulative: rev.planCumulative,
        factCumulative: rev.factCumulative,
        deviationCumulative: rev.deviationCumulative,
        percentComplete: rev.percentComplete,
      },
      forecastPercentAdjusted,
      cumulativeExecSeriesPct,
      monthlyExecPctSeries,
      monthlyDeviationSeries,
      cumulativeDeviationSeries,
      monthPlanDeals,
      monthFactDeals,
      monthExecPct,
      monthDeviationDeals,
      monthPlanRevenue,
      monthFactRevenue,
      monthDeviationRevenue,
      currentPlanCum,
      currentFactCum,
      currentDeviation,
      cumulativeDeviationRevenue: rev.deviationCumulative,
      lagSegment,
      firstLagMonth,
      worstLagMonth,
      trendShort,
      weakSegment,
      currentMonthLabel: currentMonthPoint?.label ?? "Текущий месяц",
      cumulativeDealsSubLabel: formatSalesPlanAsOfKpiSub(report.asOf),
    };
  }, [
    rev.planCumulative,
    rev.factCumulative,
    rev.deviationCumulative,
    rev.percentComplete,
    forecastPercentAdjusted,
    cumulativeExecSeriesPct,
    monthlyExecPctSeries,
    monthlyDeviationSeries,
    cumulativeDeviationSeries,
    monthPlanDeals,
    monthFactDeals,
    monthExecPct,
    monthDeviationDeals,
    monthPlanRevenue,
    monthFactRevenue,
    monthDeviationRevenue,
    currentPlanCum,
    currentFactCum,
    currentDeviation,
    lagSegment,
    firstLagMonth,
    worstLagMonth,
    trendShort,
    weakSegment,
    currentMonthPoint?.label,
    report.asOf,
  ]);

  const dynamicsKpiItems = useMemo(
    () => buildDynamicsKpiItems(dynamicsKpiInput, presentation, presentation),
    [dynamicsKpiInput, presentation],
  );

  const segmentedBtn = (active: boolean) =>
    presentation
      ? `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          active ? "bg-slate-100 text-slate-900 shadow-sm" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
        }`
      : `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
        }`;

  const salesPlanSectionHeader = useMemo(() => {
    const name = report.projectName ?? "ЖК Гордо";
    const parts = report.asOf.split("-");
    if (parts.length !== 3) return `${name} · на ${report.asOf}`;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    const months = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"] as const;
    const mo = months[m - 1];
    if (!mo || [y, m, d].some((n) => Number.isNaN(n))) return `${name} · на ${report.asOf}`;
    return `${name} · на ${d} ${mo} ${y}`;
  }, [report.projectName, report.asOf]);

  const insightTone = (tone: "risk" | "ok" | "neutral") => {
    if (tone === "risk")
      return presentation ? "border-l-red-400/80 text-slate-200" : "border-l-red-500 text-slate-800";
    if (tone === "ok")
      return presentation ? "border-l-emerald-400/80 text-slate-200" : "border-l-emerald-600 text-slate-800";
    return presentation ? "border-l-slate-500 text-slate-300" : "border-l-slate-400 text-slate-700";
  };

  return (
    <div className="flex flex-col gap-4">
      {!isPresentationMode ? (
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className={h4}>Управление планом</h4>
              <p className={sub}>Переключайте режим и сценарий, затем сохраняйте план.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className={presentation ? "inline-flex rounded-lg border border-slate-600/60 bg-slate-900/50 p-0.5" : "inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"}>
                {(["view", "edit"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={segmentedBtn(mode === m)}
                    onClick={() => {
                      if (m === "edit") {
                        setDraftTotalPlan(savedTotalPlan);
                        setDraftCategoryPlans(savedCategoryPlans);
                      }
                      setMode(m);
                    }}
                  >
                    {m === "view" ? "View mode" : "Edit mode"}
                  </button>
                ))}
              </div>
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value as PlanScenario)}
                className={
                  presentation
                    ? "rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
                    : "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                }
              >
                <option value="optimistic">optimistic</option>
                <option value="realistic">realistic</option>
                <option value="pessimistic">pessimistic</option>
              </select>
            </div>
          </div>

          {mode === "edit" ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs">
                <span className={sub}>План (общий), ₽</span>
                <input
                  type="number"
                  min={0}
                  value={draftTotalPlan}
                  onChange={(e) => setDraftTotalPlan(Number(e.target.value || 0))}
                  className={
                    presentation
                      ? "mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-2 text-sm text-slate-100"
                      : "mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                  }
                />
              </label>
              {([
                ["apartments", "Квартиры"],
                ["parking", "Парковки"],
                ["storages", "Кладовые"],
                ["commercial", "Коммерция"],
              ] as const).map(([id, label]) => (
                <label key={id} className="text-xs">
                  <span className={sub}>План: {label}, ₽</span>
                  <input
                    type="number"
                    min={0}
                    value={draftCategoryPlans[id]}
                    onChange={(e) =>
                      setDraftCategoryPlans((prev) => ({
                        ...prev,
                        [id]: Number(e.target.value || 0),
                      }))
                    }
                    className={
                      presentation
                        ? "mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-2 text-sm text-slate-100"
                        : "mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                    }
                  />
                </label>
              ))}
              <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className={
                    presentation
                      ? "rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200"
                      : "rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                  }
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div className={`mt-3 text-[11px] ${presentation ? "text-slate-400" : "text-slate-600"}`}>
              API payload (mock): {JSON.stringify(planManagementPayload)}
            </div>
          )}
        </div>
      ) : null}

      <p
        className={`text-xs font-medium tabular-nums tracking-tight ${presentation ? "text-slate-400" : "text-slate-500"}`}
      >
        {salesPlanSectionHeader}
      </p>

      <SalesPlanSegmentStructure presentation={presentation} objectId={objectId} />

      {/* KPI summary */}
      <KpiDashboard mode={presentation ? "presentation" : "work"} items={dynamicsKpiItems} className="mb-7" />

      {/* Sales Velocity */}
      <div className={card}>
        <div className="mb-3 flex flex-col gap-2">
          <h4 className={h4}>Темп продаж</h4>
          <p className={sub}>Сравнение фактического и планового темпа по сделкам и сигнал для решений.</p>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div
              className={
                presentation
                  ? "rounded-xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  : "rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm"
              }
            >
              <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${presentation ? "text-cyan-200/80" : "text-slate-600"}`}>Темп по месяцам</div>
              <SalesTempoChart
                mode={chartMode}
                lineData={velocityLineData}
                velocityCompletionPct={velocityCompletionPct}
                actualPerMonth={velocityMetrics.actualPerMonth}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div
              className={
                presentation
                  ? "rounded-xl border border-rose-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  : "rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm"
              }
            >
              <div className={`mb-1 text-xs font-semibold uppercase tracking-wide ${presentation ? "text-rose-200/85" : "text-slate-600"}`}>
                Кумулятивное отклонение от плана
              </div>
              <p className={`mb-2 text-[10px] leading-snug ${presentation ? "text-slate-400" : "text-slate-500"}`}>
                Нарастающий итог (Σ факт − Σ план)
              </p>
              <SalesTempoCumulativeChart mode={chartMode} lineData={velocityLineData} />
            </div>
          </div>
        </div>

        {presentation ? (
          <p className="mt-3 max-w-3xl text-[11px] leading-snug text-slate-400">
            Скользящий темп к норме месяца: <span className="font-semibold tabular-nums text-slate-200">{velocityCompletionPct}%</span>
            {velocityCompletionPct >= 100
              ? " — средний факт по прошедшим месяцам не ниже равномерной нормы по сделкам."
              : " — при сохранении текущего ритма возможен недобор к суммарному плану по сделкам."}
          </p>
        ) : null}

        <div
          className={
            presentation
              ? "relative mt-4 overflow-hidden rounded-xl border border-slate-600/45 bg-[linear-gradient(120deg,rgba(15,23,42,0.94)_0%,rgba(30,41,59,0.9)_52%,rgba(15,23,42,0.94)_100%)] shadow-[0_0_24px_rgba(56,189,248,0.08)]"
              : "relative mt-4 overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(120deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,1)_52%,rgba(248,250,252,0.96)_100%)] shadow-sm"
          }
        >
          <div
            aria-hidden
            className={
              presentation
                ? "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.16)_0%,rgba(56,189,248,0.05)_38%,rgba(15,23,42,0)_74%)]"
                : "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.08)_0%,rgba(56,189,248,0.03)_35%,rgba(255,255,255,0)_72%)]"
            }
          />

          <div className="relative grid grid-cols-1 overflow-hidden xl:grid-cols-3">
            <div
              className={`px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide [clip-path:polygon(0_0,95%_0,100%_50%,95%_100%,0_100%)] ${
                presentation
                  ? "bg-[linear-gradient(90deg,rgba(127,29,29,0.82)_0%,rgba(190,24,93,0.52)_60%,rgba(251,113,133,0.38)_100%)] text-rose-100"
                  : "bg-[linear-gradient(90deg,rgba(254,202,202,0.95)_0%,rgba(254,226,226,0.9)_60%,rgba(255,241,242,0.88)_100%)] text-rose-800"
              }`}
            >
              ПРОБЛЕМА
            </div>
            <div
              className={`px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide [clip-path:polygon(0_0,95%_0,100%_50%,95%_100%,0_100%,5%_50%)] ${
                presentation
                  ? "bg-[linear-gradient(90deg,rgba(51,65,85,0.75)_0%,rgba(71,85,105,0.58)_55%,rgba(100,116,139,0.42)_100%)] text-slate-100"
                  : "bg-[linear-gradient(90deg,rgba(226,232,240,0.95)_0%,rgba(241,245,249,0.92)_60%,rgba(248,250,252,0.9)_100%)] text-slate-700"
              }`}
            >
              ПРИЧИНА
            </div>
            <div
              className={`px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,5%_50%)] ${
                presentation
                  ? "bg-[linear-gradient(90deg,rgba(6,95,70,0.72)_0%,rgba(16,185,129,0.48)_58%,rgba(110,231,183,0.34)_100%)] text-emerald-100"
                  : "bg-[linear-gradient(90deg,rgba(187,247,208,0.95)_0%,rgba(220,252,231,0.9)_60%,rgba(240,253,244,0.88)_100%)] text-emerald-800"
              }`}
            >
              ДЕЙСТВИЕ
            </div>
          </div>

          <div className="relative grid grid-cols-1 xl:grid-cols-3">
            <div className="p-4">
              <div
                className={`text-2xl font-bold tabular-nums ${
                  velocityMonthDeviation < 0
                    ? presentation
                      ? "text-rose-300"
                      : "text-rose-700"
                    : presentation
                      ? "text-emerald-300"
                      : "text-emerald-700"
                }`}
              >
                {velocityMonthDeviation < 0 ? "−" : "+"}
                {numFmt.format(Math.abs(Math.round(velocityMonthDeviation)))} сделок ({velocityMonthDeviationPct >= 0 ? "+" : ""}
                {velocityMonthDeviationPct.toFixed(1)}%)
              </div>
              <p className={`mt-1 text-sm ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                {velocityMonthDeviation < 0 ? "Факт за месяц ниже плана." : "Факт за месяц выше плана."}
              </p>
            </div>

            <div className="relative p-4">
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-y-3 left-0 hidden w-px xl:block ${
                  presentation
                    ? "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.5),transparent)]"
                    : "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.35),transparent)]"
                }`}
              />
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-y-3 right-0 hidden w-px xl:block ${
                  presentation
                    ? "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.5),transparent)]"
                    : "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.35),transparent)]"
                }`}
              />
              <p className={`text-sm leading-relaxed ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                Снижение темпа продаж наблюдается с января; основной вклад в недобор дает сегмент с длинным циклом сделки и более слабой конверсией на
                финальных этапах воронки.
              </p>
            </div>

            <div className="p-4">
              <ul className={`space-y-1.5 text-sm ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                <li>1. Усилить маркетинг в отстающих сегментах.</li>
                <li>2. Перераспределить бюджет в каналы с лучшим CPL.</li>
                <li>3. Запустить короткие промо-акции для ускорения сделки.</li>
              </ul>
            </div>
          </div>
        </div>

        <div
          id="sales-structure-diagnostic"
          className={
            presentation
              ? "mt-4 scroll-mt-24 rounded-xl border border-slate-600/45 bg-gradient-to-br from-slate-900/80 via-slate-900/55 to-slate-950/90 p-3"
              : "mt-4 scroll-mt-24 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3"
          }
        >
          <div className={`mb-1 text-xs font-semibold uppercase tracking-wide ${presentation ? "text-slate-300" : "text-slate-700"}`}>
            Выполнение структуры продаж — диагностика
          </div>
          <p className={`mb-3 text-[10px] leading-snug ${presentation ? "text-slate-500" : "text-slate-600"}`}>
            Порядок по Δ выручке (хуже сверху). Цвет полосы и акцентов — по Δ ₽, длина полосы — % по шт. Высокий % по шт. не означает выручку в плане
            {salesStructureExecutionDiagnostic.hasUnitsRevenueConflict ? " (есть метка «ниже плана по ₽»)" : ""}.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-[520px] w-full border-collapse text-xs">
              <thead>
                <tr className={presentation ? "text-slate-400" : "text-slate-600"}>
                  <th className="px-2 py-1.5 text-left font-semibold">Категория</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Выполнение</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Δ шт</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Δ выручка</th>
                </tr>
              </thead>
              <tbody>
                {salesStructureExecutionDiagnostic.rows.map((row) => {
                  const barW = Math.max(0, Math.min(100, row.percent));
                  const barClass =
                    row.rubTone === "red"
                      ? presentation
                        ? "bg-rose-600"
                        : "bg-rose-600"
                      : row.rubTone === "yellow"
                        ? presentation
                          ? "bg-amber-500"
                          : "bg-amber-500"
                        : presentation
                          ? "bg-emerald-500"
                          : "bg-emerald-600";
                  const metricTone =
                    row.rubTone === "red"
                      ? presentation
                        ? "text-rose-200"
                        : "text-rose-800"
                      : row.rubTone === "yellow"
                        ? presentation
                          ? "text-amber-200"
                          : "text-amber-900"
                        : presentation
                          ? "text-emerald-200"
                          : "text-emerald-800";
                  const rowTone =
                    row.execWorstRank === 1
                      ? presentation
                        ? "bg-rose-950/40"
                        : "bg-rose-100/90"
                      : row.execWorstRank === 2
                        ? presentation
                          ? "bg-rose-950/22"
                          : "bg-rose-50/80"
                        : row.execWorstRank === 3
                          ? presentation
                            ? "bg-amber-950/15"
                            : "bg-amber-50/70"
                          : presentation
                            ? "bg-transparent"
                            : "bg-transparent";
                  return (
                    <tr
                      key={row.key}
                      className={`${rowTone} ${presentation ? "border-t border-slate-700/35" : "border-t border-slate-200/70"} ${
                        row.unitsRevenueConflict
                          ? presentation
                            ? "border-l-2 border-l-amber-400/70"
                            : "border-l-2 border-l-amber-500"
                          : ""
                      }`}
                    >
                      <td className={`px-2 py-2.5 ${presentation ? "text-slate-50" : "text-slate-900"}`}>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-bold">{row.label}</span>
                            {row.unitsRevenueConflict ? (
                              <span
                                className={`inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide ${
                                  presentation
                                    ? "border-amber-500/45 bg-amber-950/40 text-amber-100"
                                    : "border-amber-300 bg-amber-50 text-amber-950"
                                }`}
                                title="Выполнение по штукам ≥95%, но выручка ниже плана (below revenue plan)"
                              >
                                <svg className="h-3 w-3 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                  <path
                                    fillRule="evenodd"
                                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.63-1.515 2.63H3.72c-1.345 0-2.188-1.463-1.515-2.63l6.28-10.875zM11 14a1 1 0 10-2 0 1 1 0 002 0zm-1-2a1 1 0 01-1-1V9a1 1 0 112 0v2a1 1 0 01-1 1z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                <span className="whitespace-nowrap">ниже плана по ₽</span>
                              </span>
                            ) : null}
                          </div>
                          {row.unitsRevenueConflict && row.conflictHint ? (
                            <span className={`text-[9px] font-medium leading-tight ${presentation ? "text-amber-200/90" : "text-amber-900"}`}>
                              {row.conflictHint}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex min-w-[10rem] max-w-xs items-center gap-2">
                          <span className={`w-9 shrink-0 text-right text-[11px] font-bold tabular-nums ${presentation ? "text-slate-200" : "text-slate-800"}`}>
                            {Math.round(row.percent)}%
                          </span>
                          <div className={`h-2 min-w-0 flex-1 overflow-hidden rounded-full ${presentation ? "bg-slate-700/50" : "bg-slate-200"}`}>
                            <div className={`h-full rounded-full ${barClass}`} style={{ width: `${barW}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className={`px-2 py-2.5 text-right text-[11px] font-semibold tabular-nums ${metricTone}`}>
                        {row.deltaUnits >= 0 ? "+" : "−"}
                        {numFmt.format(Math.abs(row.deltaUnits))}
                      </td>
                      <td className={`px-2 py-2.5 text-right text-sm font-bold tabular-nums ${metricTone}`}>
                        {row.deltaRub >= 0 ? "+" : "−"}
                        {compactRub(Math.abs(row.deltaRub))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            className={
              presentation
                ? "relative mt-3 overflow-hidden rounded-xl border border-slate-600/45 bg-[linear-gradient(120deg,rgba(15,23,42,0.94)_0%,rgba(30,41,59,0.9)_52%,rgba(15,23,42,0.94)_100%)] shadow-[0_0_24px_rgba(56,189,248,0.08)]"
                : "relative mt-3 overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(120deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,1)_52%,rgba(248,250,252,0.96)_100%)] shadow-sm"
            }
          >
            <div
              aria-hidden
              className={
                presentation
                  ? "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.16)_0%,rgba(56,189,248,0.05)_38%,rgba(15,23,42,0)_74%)]"
                  : "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.08)_0%,rgba(56,189,248,0.03)_35%,rgba(255,255,255,0)_72%)]"
              }
            />

            <div className="relative grid grid-cols-1 overflow-hidden xl:grid-cols-3">
              <div
                className={`px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide [clip-path:polygon(0_0,95%_0,100%_50%,95%_100%,0_100%)] ${
                  presentation
                    ? "bg-[linear-gradient(90deg,rgba(127,29,29,0.82)_0%,rgba(190,24,93,0.52)_60%,rgba(251,113,133,0.38)_100%)] text-rose-100"
                    : "bg-[linear-gradient(90deg,rgba(254,202,202,0.95)_0%,rgba(254,226,226,0.9)_60%,rgba(255,241,242,0.88)_100%)] text-rose-800"
                }`}
              >
                ПРОБЛЕМА
              </div>
              <div
                className={`px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide [clip-path:polygon(0_0,95%_0,100%_50%,95%_100%,0_100%,5%_50%)] ${
                  presentation
                    ? "bg-[linear-gradient(90deg,rgba(51,65,85,0.75)_0%,rgba(71,85,105,0.58)_55%,rgba(100,116,139,0.42)_100%)] text-slate-100"
                    : "bg-[linear-gradient(90deg,rgba(226,232,240,0.95)_0%,rgba(241,245,249,0.92)_60%,rgba(248,250,252,0.9)_100%)] text-slate-700"
                }`}
              >
                ПРИЧИНА
              </div>
              <div
                className={`px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,5%_50%)] ${
                  presentation
                    ? "bg-[linear-gradient(90deg,rgba(6,95,70,0.72)_0%,rgba(16,185,129,0.48)_58%,rgba(110,231,183,0.34)_100%)] text-emerald-100"
                    : "bg-[linear-gradient(90deg,rgba(187,247,208,0.95)_0%,rgba(220,252,231,0.9)_60%,rgba(240,253,244,0.88)_100%)] text-emerald-800"
                }`}
              >
                ДЕЙСТВИЕ
              </div>
            </div>

            <div className="relative grid grid-cols-1 xl:grid-cols-3">
              <div className="p-4">
                <p
                  className={`text-2xl font-bold tabular-nums ${
                    salesStructureExecutionDiagnostic.negSum < 0
                      ? presentation
                        ? "text-rose-300"
                        : "text-rose-700"
                      : presentation
                        ? "text-emerald-300"
                        : "text-emerald-700"
                  }`}
                >
                  −{compactRub(Math.abs(salesStructureExecutionDiagnostic.negSum))}
                </p>
                <p className={`mt-1 text-sm ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                  перекос структуры
                </p>
                <p className={`mt-1 text-sm ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                  деньги не добраны из-за структуры продаж
                </p>
              </div>
              <div className="relative p-4">
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-3 left-0 hidden w-px xl:block ${
                    presentation
                      ? "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.5),transparent)]"
                      : "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.35),transparent)]"
                  }`}
                />
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-3 right-0 hidden w-px xl:block ${
                    presentation
                      ? "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.5),transparent)]"
                      : "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.35),transparent)]"
                  }`}
                />
                <p className={`text-sm leading-relaxed ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                  рост кладовых и парковок вытесняет
                </p>
                <p className={`text-sm leading-relaxed ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                  2-комнатные и коммерцию → падение выручки
                </p>
              </div>
              <div className="p-4">
                <p className={`text-sm leading-relaxed ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                  сместить продажи в 2-комнатные и коммерцию
                </p>
                <p className={`text-sm leading-relaxed ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                  ограничить давление низкомаржинальных сегментов
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          className={
            presentation
              ? "mt-4 rounded-xl border border-slate-600/45 bg-gradient-to-br from-slate-900/75 via-slate-900/50 to-slate-950/90 p-3"
              : "mt-4 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3"
          }
        >
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className={`text-xs font-semibold uppercase tracking-wide ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                Баланс структуры продаж
              </div>
              <p className={`mt-0.5 max-w-sm text-[10px] leading-snug ${presentation ? "text-slate-500" : "text-slate-600"}`}>
                Ширина от центра = (|Δ доли| / max|Δ|)·50%. Центр — 0. Толщина — |Δ ₽|; порядок — по |₽|.
              </p>
            </div>
            <div className={`flex flex-wrap gap-x-3 gap-y-1 text-[10px] ${presentation ? "text-slate-500" : "text-slate-500"}`}>
              <span>0 — план</span>
              <span>← минус</span>
              <span>плюс →</span>
            </div>
          </div>

          <div
            className={`mb-2 hidden text-[10px] md:grid md:gap-2 ${presentation ? "text-slate-400" : "text-slate-600"}`}
            style={{ gridTemplateColumns: "minmax(0,8rem) minmax(0,1fr)" }}
          >
            <span className="font-semibold">Сегмент</span>
            <span className="text-center font-medium">Δ доля · шкала</span>
          </div>

          <ul className="space-y-2.5">
            <li className="hidden md:grid md:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] md:gap-2 md:items-end">
              <div aria-hidden className="min-h-[1px]" />
              <div className={`relative h-6 w-full ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                {salesStructureBalanceDiagnostic.scaleTicks.map((v) => {
                  const leftPct = 50 + (v / salesStructureBalanceDiagnostic.axisMaxPp) * 50;
                  return (
                    <div
                      key={`scale-${v}`}
                      className="pointer-events-none absolute bottom-0 flex flex-col items-center"
                      style={{ left: `${leftPct}%`, transform: "translateX(-50%)" }}
                    >
                      <div
                        className={`${v === 0 ? `w-[2px] ${presentation ? "h-5 bg-slate-100" : "h-5 bg-slate-800"}` : `w-px ${presentation ? "h-3 bg-slate-500/[0.06]" : "h-3 bg-slate-400/[0.08]"}`}`}
                      />
                      <span className="mt-0.5 text-[9px] font-medium tabular-nums leading-none">
                        {v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </li>
            {salesStructureBalanceDiagnostic.rows.map((row) => {
              const { maxDelta, axisMaxPp, scaleTicks } = salesStructureBalanceDiagnostic;
              const barWPct = Math.min(50, (Math.abs(row.deltaShare) / maxDelta) * 50);
              const topProblem = row.lossRank != null && row.lossRank <= 3 && row.deltaRub < 0;
              const { impactNorm } = row;
              let trackPx = 13 + impactNorm * 24;
              if (topProblem) {
                trackPx += row.lossRank === 1 ? 16 : row.lossRank === 2 ? 10 : 6;
              }
              trackPx = Math.min(50, Math.round(trackPx));

              const negOpacity = topProblem ? 1 : 0.42 + 0.58 * impactNorm;
              const posOpacity = 0.48 + 0.52 * impactNorm;

              const negGrad = (() => {
                if (row.deltaShare >= 0) return "";
                if (topProblem) {
                  if (row.lossRank === 1)
                    return presentation
                      ? "linear-gradient(90deg, #fecdd8 0%, #f87171 42%, #b91c1c 100%)"
                      : "linear-gradient(90deg, #fee2e2 0%, #f87171 45%, #991b1b 100%)";
                  if (row.lossRank === 2)
                    return presentation
                      ? "linear-gradient(90deg, #fce4e9 0%, #fb7185 48%, #c2183f 100%)"
                      : "linear-gradient(90deg, #fff1f2 0%, #fb7185 48%, #a21c3f 100%)";
                  return presentation
                    ? "linear-gradient(90deg, #fdf2f8 0%, #fb7185 52%, #c2183f 100%)"
                    : "linear-gradient(90deg, #fff1f2 0%, #fb7185 52%, #a21c3f 100%)";
                }
                if (row.deltaRub < 0)
                  return presentation
                    ? "linear-gradient(90deg, #ffe4e6 0%, #fca5a5 52%, #e11d48 100%)"
                    : "linear-gradient(90deg, #fff1f2 0%, #fca5a5 50%, #dc2626 100%)";
                return presentation
                  ? "linear-gradient(90deg, #fffbeb 0%, #fcd34d 48%, #ca8a04 100%)"
                  : "linear-gradient(90deg, #fffbeb 0%, #fcd34d 50%, #b45309 100%)";
              })();

              const posGrad = (() => {
                if (row.deltaShare <= 0) return "";
                if (row.deltaRub > 0)
                  return presentation
                    ? "linear-gradient(90deg, #0f766e 0%, #14b8a6 45%, #5eead4 100%)"
                    : "linear-gradient(90deg, #0d9488 0%, #2dd4bf 48%, #99f6e4 100%)";
                return presentation
                  ? "linear-gradient(90deg, #b45309 0%, #eab308 48%, #fde047 100%)"
                  : "linear-gradient(90deg, #a16207 0%, #eab308 50%, #facc15 100%)";
              })();

              const rowShell = presentation ? "border-slate-700/40 bg-slate-950/25" : "border-slate-200/90 bg-white/90";
              const tickLine = presentation ? "bg-slate-400/[0.06]" : "bg-slate-500/[0.08]";
              const centerZero = presentation ? "bg-slate-100" : "bg-slate-800";

              const labelLine = structureBalanceBarLabelLine(row.deltaShare, row.deltaRub);
              const amberBar =
                (row.deltaShare < 0 && row.deltaRub >= 0) || (row.deltaShare > 0 && row.deltaRub <= 0);
              const labelPillBase =
                "max-w-[min(100%,11rem)] truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none";
              const labelPillStyle: CSSProperties = amberBar
                ? { backgroundColor: "rgba(255,255,255,0.92)" }
                : { backgroundColor: "rgba(0,0,0,0.45)" };
              const labelTextClass = amberBar ? "text-slate-900" : "text-white";

              const labelOutside = barWPct < 12 && barWPct > 0;

              return (
                <li
                  key={row.key}
                  className={`rounded-lg border px-2 py-2 sm:py-1.5 ${rowShell}`}
                  aria-label={`${row.label}: отклонение доли ${row.deltaShare >= 0 ? "+" : "−"}${Math.abs(row.deltaShare).toFixed(1)} процентных пункта, влияние ${compactRub(row.deltaRub)}`}
                >
                  <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] md:gap-2">
                    <div
                      className={`text-xs font-bold tracking-tight ${presentation ? "text-slate-50" : "text-slate-900"}`}
                    >
                      {row.label}
                    </div>
                    <div className="flex min-w-0 items-center" style={{ minHeight: trackPx }}>
                      <div
                        className="relative w-full overflow-hidden rounded-md"
                        style={{
                          height: trackPx,
                          backgroundColor: presentation ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.07)",
                        }}
                      >
                        {scaleTicks.map((v) => {
                          const leftPct = 50 + (v / axisMaxPp) * 50;
                          const isZero = v === 0;
                          return (
                            <div
                              key={`${row.key}-tick-${v}`}
                              className={`pointer-events-none absolute bottom-0 top-0 z-[1] -translate-x-1/2 ${
                                isZero ? `w-[2px] ${centerZero}` : `w-px ${tickLine}`
                              }`}
                              style={{ left: `${leftPct}%` }}
                              aria-hidden
                            />
                          );
                        })}
                        {row.deltaShare < 0 ? (
                          <>
                            <div
                              className={`absolute bottom-0 top-0 z-[5] overflow-hidden rounded-l-sm border-l-2 ${
                                presentation ? "border-l-slate-100" : "border-l-white"
                              }`}
                              style={{
                                right: "50%",
                                width: `${barWPct}%`,
                                opacity: negOpacity,
                                background: negGrad,
                              }}
                            >
                              {!labelOutside ? (
                                <div className="relative z-[7] flex h-full items-center justify-end pr-1">
                                  <span className={labelPillBase} style={labelPillStyle}>
                                    <span className={labelTextClass}>{labelLine}</span>
                                  </span>
                                </div>
                              ) : null}
                            </div>
                            {labelOutside ? (
                              <div
                                className="pointer-events-none absolute z-[8] flex items-center"
                                style={{
                                  left: `calc(50% - ${barWPct}% - 6px)`,
                                  top: "50%",
                                  transform: "translate(-100%, -50%)",
                                }}
                              >
                                <span className={labelPillBase} style={labelPillStyle}>
                                  <span className={labelTextClass}>{labelLine}</span>
                                </span>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                        {row.deltaShare > 0 ? (
                          <>
                            <div
                              className={`absolute bottom-0 top-0 z-[5] overflow-hidden rounded-r-sm border-r-2 ${
                                presentation ? "border-r-slate-100" : "border-r-white"
                              }`}
                              style={{
                                left: "50%",
                                width: `${barWPct}%`,
                                opacity: posOpacity,
                                background: posGrad,
                              }}
                            >
                              {!labelOutside ? (
                                <div className="relative z-[7] flex h-full items-center justify-start pl-1">
                                  <span className={labelPillBase} style={labelPillStyle}>
                                    <span className={labelTextClass}>{labelLine}</span>
                                  </span>
                                </div>
                              ) : null}
                            </div>
                            {labelOutside ? (
                              <div
                                className="pointer-events-none absolute z-[8] flex items-center"
                                style={{
                                  left: `calc(50% + ${barWPct}% + 6px)`,
                                  top: "50%",
                                  transform: "translateY(-50%)",
                                }}
                              >
                                <span className={labelPillBase} style={labelPillStyle}>
                                  <span className={labelTextClass}>{labelLine}</span>
                                </span>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div
            className={
              presentation
                ? "relative mt-4 overflow-hidden rounded-xl border border-slate-600/45 bg-[linear-gradient(120deg,rgba(15,23,42,0.94)_0%,rgba(30,41,59,0.9)_52%,rgba(15,23,42,0.94)_100%)] shadow-[0_0_24px_rgba(56,189,248,0.08)]"
                : "relative mt-4 overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(120deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,1)_52%,rgba(248,250,252,0.96)_100%)] shadow-sm"
            }
          >
            <div
              aria-hidden
              className={
                presentation
                  ? "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.16)_0%,rgba(56,189,248,0.05)_38%,rgba(15,23,42,0)_74%)]"
                  : "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.08)_0%,rgba(56,189,248,0.03)_35%,rgba(255,255,255,0)_72%)]"
              }
            />

            <div className="relative grid grid-cols-1 overflow-hidden xl:grid-cols-3">
              <div
                className={`px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide [clip-path:polygon(0_0,95%_0,100%_50%,95%_100%,0_100%)] ${
                  presentation
                    ? "bg-[linear-gradient(90deg,rgba(127,29,29,0.82)_0%,rgba(190,24,93,0.52)_60%,rgba(251,113,133,0.38)_100%)] text-rose-100"
                    : "bg-[linear-gradient(90deg,rgba(254,202,202,0.95)_0%,rgba(254,226,226,0.9)_60%,rgba(255,241,242,0.88)_100%)] text-rose-800"
                }`}
              >
                ПРОБЛЕМА
              </div>
              <div
                className={`px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide [clip-path:polygon(0_0,95%_0,100%_50%,95%_100%,0_100%,5%_50%)] ${
                  presentation
                    ? "bg-[linear-gradient(90deg,rgba(51,65,85,0.75)_0%,rgba(71,85,105,0.58)_55%,rgba(100,116,139,0.42)_100%)] text-slate-100"
                    : "bg-[linear-gradient(90deg,rgba(226,232,240,0.95)_0%,rgba(241,245,249,0.92)_60%,rgba(248,250,252,0.9)_100%)] text-slate-700"
                }`}
              >
                ПРИЧИНА
              </div>
              <div
                className={`px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,5%_50%)] ${
                  presentation
                    ? "bg-[linear-gradient(90deg,rgba(6,95,70,0.72)_0%,rgba(16,185,129,0.48)_58%,rgba(110,231,183,0.34)_100%)] text-emerald-100"
                    : "bg-[linear-gradient(90deg,rgba(187,247,208,0.95)_0%,rgba(220,252,231,0.9)_60%,rgba(240,253,244,0.88)_100%)] text-emerald-800"
                }`}
              >
                ДЕЙСТВИЕ
              </div>
            </div>

            <div className="relative grid grid-cols-1 xl:grid-cols-3">
              <div className="p-4">
                <p
                  className={`text-2xl font-bold tabular-nums ${
                    salesStructureExecutionDiagnostic.negSum < 0
                      ? presentation
                        ? "text-rose-300"
                        : "text-rose-700"
                      : presentation
                        ? "text-emerald-300"
                        : "text-emerald-700"
                  }`}
                >
                  −{compactRub(Math.abs(salesStructureExecutionDiagnostic.negSum))}
                </p>
                <p className={`mt-1 text-sm ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                  перекос структуры продаж
                </p>
              </div>
              <div className="relative p-4">
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-3 left-0 hidden w-px xl:block ${
                    presentation
                      ? "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.5),transparent)]"
                      : "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.35),transparent)]"
                  }`}
                />
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-3 right-0 hidden w-px xl:block ${
                    presentation
                      ? "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.5),transparent)]"
                      : "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.35),transparent)]"
                  }`}
                />
                <p className={`text-sm leading-relaxed ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                  рост кладовых и парковок вытесняет
                </p>
                <p className={`text-sm leading-relaxed ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                  2-комнатные и коммерцию → потеря выручки
                </p>
              </div>
              <div className="p-4">
                <p className={`text-sm leading-relaxed ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                  сместить продажи в 2-комнатные и коммерцию
                </p>
                <p className={`text-sm leading-relaxed ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                  ограничить долю низкомаржинальных сегментов
                </p>
              </div>
            </div>
          </div>
        </div>

        <MarketingDealsDynamicsSection presentation={presentation} period={period} objectId={objectId} dealTypeId={dealTypeId} />

        <div
          className={
            presentation
              ? "mt-4 rounded-xl border border-slate-600/45 bg-gradient-to-br from-slate-900/75 via-slate-900/50 to-slate-950/90 p-3 sm:p-4"
              : "mt-4 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 sm:p-4"
          }
        >
          <div className="mb-3">
            <div className={`text-xs font-semibold uppercase tracking-wide ${presentation ? "text-slate-300" : "text-slate-700"}`}>
              Финансовые показатели
            </div>
            <p className={`mt-0.5 max-w-3xl text-[10px] leading-snug ${presentation ? "text-slate-500" : "text-slate-600"}`}>
              Сетка 2×2: ДДУ vs эскроу, конверсия, разрыв и план по эскроу — сравнимые карточки одной высоты.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:auto-rows-fr sm:grid-cols-2 sm:grid-rows-2 sm:gap-3 sm:items-stretch">
            <div
              className={`flex h-auto max-h-[320px] min-h-0 flex-col overflow-hidden rounded-xl border p-3 sm:h-[320px] sm:max-h-[320px] ${
                presentation ? "border-slate-600/60 bg-slate-950/55" : "border-slate-200 bg-white"
              }`}
            >
              <div className={`text-[9px] font-extrabold uppercase tracking-wide ${presentation ? "text-slate-300" : "text-slate-700"}`}>ДДУ vs эскроу</div>
              <div className={`mt-1 truncate text-[10px] font-semibold tabular-nums ${presentation ? "text-slate-200" : "text-slate-800"}`}>
                {rubFmt.format(financialCashFlow.dduTotal)} · {rubFmt.format(financialCashFlow.escTotal)}
              </div>
              <div className="mt-2 h-[140px] w-full min-w-0 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={financialCashFlow.chartRows} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="finMergeDiv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.06} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 8 }} axisLine={{ stroke: gridColor }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: axisColor, fontSize: 8 }} axisLine={false} width={36} tickFormatter={yTickCashM} domain={[0, "auto"]} />
                    <Tooltip
                      cursor={presentation ? { stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 } : undefined}
                      content={
                        presentation ? rechartsPresentationMiniTooltip((n) => rubFmt.format(n), { dataKey: "ddu" }) : undefined
                      }
                      formatter={presentation ? undefined : (v, name) => [rubFmt.format(Number(v)), String(name)]}
                      contentStyle={
                        presentation
                          ? undefined
                          : { borderRadius: 6, fontSize: 10 }
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 8, paddingTop: 0 }} formatter={(value) => <span style={{ color: axisColor }}>{value}</span>} />
                    <Area type="monotone" dataKey="gapCumulative" name="Разрыв" stroke="none" fill="url(#finMergeDiv)" baseLine={0} />
                    <Line type="monotone" dataKey="escrow" name="Эскроу" stroke="#38bdf8" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="ddu" name="ДДУ" stroke={presentation ? "#f8fafc" : "#0f172a"} strokeWidth={2} dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className={`mt-2 line-clamp-2 text-[9px] leading-snug ${presentation ? "text-slate-400" : "text-slate-600"}`}>{financialCashFlow.insightMerge}</p>
            </div>

            <div
              className={`flex h-auto max-h-[320px] min-h-0 flex-col overflow-hidden rounded-xl border p-3 sm:h-[320px] sm:max-h-[320px] ${
                presentation ? "border-slate-600/60 bg-slate-950/55" : "border-slate-200 bg-white"
              }`}
            >
              <div className={`text-[9px] font-extrabold uppercase tracking-wide ${presentation ? "text-slate-300" : "text-slate-700"}`}>Конверсия эскроу / ДДУ</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className={`text-xl font-black tabular-nums ${presentation ? "text-rose-200" : "text-rose-700"}`}>
                  {financialCashFlow.conversionTotalPct.toFixed(1)}%
                </span>
                {financialCashFlow.escrowDduWarning ? (
                  <span className={`rounded border px-1 py-0.5 text-[7px] font-bold uppercase ${presentation ? "border-amber-400/50 text-amber-100" : "border-amber-300 text-amber-950"}`}>
                    ниже 80%
                  </span>
                ) : null}
              </div>
              <p className={`text-[8px] font-medium leading-tight ${presentation ? "text-slate-500" : "text-slate-600"}`}>Benchmark 80–90%</p>
              <div className="mt-1 h-[140px] w-full min-w-0 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={financialCashFlow.chartRows} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 8 }} axisLine={{ stroke: gridColor }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: axisColor, fontSize: 8 }} axisLine={false} width={30} domain={[60, financialCashFlow.conversionYMax]} tickFormatter={yTickPct0} />
                    <Tooltip
                      cursor={presentation ? { stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 } : undefined}
                      content={
                        presentation
                          ? rechartsPresentationMiniTooltip((n) => `${n.toFixed(1)}%`, { dataKey: "conversionPct" })

                          : undefined
                      }
                      formatter={presentation ? undefined : (v) => [`${Number(v).toFixed(1)}%`, "Эскроу/ДДУ"]}
                      contentStyle={presentation ? undefined : { fontSize: 10, borderRadius: 6 }}
                    />
                    <ReferenceArea y1={80} y2={90} fill={presentation ? "rgba(34,197,94,0.14)" : "rgba(22,163,74,0.12)"} strokeOpacity={0} />
                    <ReferenceLine y={80} stroke="#4ade80" strokeDasharray="3 2" strokeWidth={0.8} />
                    <ReferenceLine y={90} stroke="#4ade80" strokeDasharray="3 2" strokeWidth={0.8} />
                    <Line type="monotone" dataKey="conversionPct" stroke="#f87171" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className={`mt-2 line-clamp-2 text-[9px] leading-snug ${presentation ? "text-slate-400" : "text-slate-600"}`}>{financialCashFlow.insightConversion}</p>
            </div>

            <div
              className={`flex h-auto max-h-[320px] min-h-0 flex-col overflow-hidden rounded-xl border-2 p-3 shadow-lg sm:h-[320px] sm:max-h-[320px] ${
                presentation
                  ? "border-red-500/85 bg-gradient-to-br from-red-950 via-rose-950 to-red-900 ring-1 ring-red-500/50"
                  : "border-red-500 bg-gradient-to-br from-red-100 via-rose-50 to-red-50 ring-1 ring-red-300"
              }`}
            >
              <div className={`text-[9px] font-black uppercase tracking-wide ${presentation ? "text-red-100" : "text-red-950"}`}>Разрыв (ДДУ − эскроу)</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className={`rounded border px-1.5 py-0.5 text-[7px] font-black uppercase ${presentation ? "border-white/30 bg-black/25 text-white" : "border-red-800/25 bg-white text-red-900"}`}>
                  {financialCashFlow.gapRiskStatusEn}
                </span>
                <span className={`text-lg font-black tabular-nums ${presentation ? "text-white" : "text-red-950"}`}>
                  {financialCashFlow.gapRub >= 0 ? "" : "−"}
                  {compactRub(Math.abs(financialCashFlow.gapRub))}
                </span>
              </div>
              <p className={`line-clamp-1 text-[8px] font-semibold ${presentation ? "text-red-100/90" : "text-red-900"}`}>
                {financialCashFlow.gapTrend === "up" ? "↑ " : financialCashFlow.gapTrend === "down" ? "↓ " : "→ "}
                горизонт {financialCashFlow.signedDeltaHorizon} · {financialCashFlow.liquidityRiskLabelRu}
              </p>
              <div className="mt-1 h-[140px] w-full min-w-0 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={financialCashFlow.gapChartData} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="finGapRisk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fecaca" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#7f1d1d" stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={presentation ? "rgba(254,202,202,0.1)" : "rgba(185,28,28,0.1)"} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: presentation ? "#fecaca" : "#7f1d1d", fontSize: 8 }} axisLine={{ stroke: presentation ? "rgba(254,202,202,0.2)" : "rgba(127,29,29,0.25)" }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: presentation ? "#fecaca" : "#7f1d1d", fontSize: 8 }} axisLine={false} width={36} tickFormatter={yTickGapBar} domain={[0, "auto"]} />
                    <Tooltip
                      cursor={presentation ? { stroke: "rgba(254,202,202,0.35)", strokeWidth: 1 } : undefined}
                      content={
                        presentation
                          ? rechartsPresentationMiniTooltip((n) => rubFmt.format(n), { dataKey: "gapCumulative" })

                          : undefined
                      }
                      formatter={presentation ? undefined : (v) => rubFmt.format(Number(v))}
                      contentStyle={presentation ? undefined : { borderRadius: 6, fontSize: 10 }}
                    />
                    <Area type="monotone" dataKey="gapCumulative" stroke="none" fill="url(#finGapRisk)" baseLine={0} />
                    <Line
                      type="monotone"
                      dataKey="gapCumulative"
                      stroke={presentation ? "#fff1f2" : "#b91c1c"}
                      strokeWidth={2}
                      dot={(dotProps: { cx?: number; cy?: number; payload?: { isForecast?: boolean }; index?: number }) => {
                        const { cx, cy, payload, index } = dotProps;
                        if (cx == null || cy == null) return null;
                        const k = index ?? 0;
                        if (payload?.isForecast) {
                          return <circle key={`gfc-${k}`} cx={cx} cy={cy} r={4} fill="#facc15" stroke={presentation ? "#450a0a" : "#fff"} strokeWidth={1} />;
                        }
                        return <circle key={`gh-${k}`} cx={cx} cy={cy} r={2.5} fill={presentation ? "#fecdd3" : "#ef4444"} stroke={presentation ? "#881337" : "#fff"} strokeWidth={0.8} />;
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className={`mt-2 line-clamp-2 text-[9px] leading-snug ${presentation ? "text-red-50" : "text-red-950"}`}>{financialCashFlow.insightGap}</p>
            </div>

            <div
              className={`flex h-auto max-h-[320px] min-h-0 flex-col overflow-hidden rounded-xl border p-3 sm:h-[320px] sm:max-h-[320px] ${
                presentation ? "border-slate-600/60 bg-slate-950/55" : "border-slate-200 bg-white"
              } ${financialCashFlow.revExecEscrowPct < 80 ? (presentation ? "ring-1 ring-amber-500/40" : "ring-1 ring-amber-300") : ""}`}
            >
              <div className={`text-[9px] font-extrabold uppercase tracking-wide ${presentation ? "text-slate-300" : "text-slate-700"}`}>План выручки (эскроу)</div>
              <div
                className={`mt-1 text-xl font-black tabular-nums ${
                  financialCashFlow.revExecEscrowPct >= 100
                    ? presentation
                      ? "text-emerald-300"
                      : "text-emerald-700"
                    : financialCashFlow.revExecEscrowPct >= 80
                      ? presentation
                        ? "text-sky-300"
                        : "text-sky-700"
                      : presentation
                        ? "text-amber-200"
                        : "text-amber-800"
                }`}
              >
                {financialCashFlow.revExecEscrowPct.toFixed(1)}%
              </div>
              <p className={`line-clamp-1 text-[8px] leading-tight ${presentation ? "text-slate-500" : "text-slate-600"}`}>
                Недовыполнение чаще из‑за лага эскроу (escrow lag), не из‑за отсутствия ДДУ.
              </p>
              <div className="mt-1 h-[140px] w-full min-w-0 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={financialCashFlow.chartRows} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 8 }} axisLine={{ stroke: gridColor }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: axisColor, fontSize: 8 }} axisLine={false} width={32} domain={[0, financialCashFlow.execYMax]} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      cursor={presentation ? { stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 } : undefined}
                      content={
                        presentation
                          ? rechartsPresentationMiniTooltip((n) => `${n.toFixed(1)}%`, { dataKey: "execPct" })

                          : undefined
                      }
                      formatter={presentation ? undefined : (v) => [`${Number(v).toFixed(1)}%`, "%"]}
                      contentStyle={presentation ? undefined : { fontSize: 10, borderRadius: 6 }}
                    />
                    <ReferenceLine y={100} stroke="#facc15" strokeDasharray="4 3" strokeWidth={1.2} />
                    <Line type="monotone" dataKey="execPct" stroke={presentation ? "#7dd3fc" : "#0369a1"} strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className={`mt-2 line-clamp-2 text-[9px] leading-snug ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                Связь с разрывом {compactRub(financialCashFlow.gapRub)}: % плана по деньгам на счёте отстаёт при отставании эскроу.
              </p>
            </div>
          </div>

          <div
            className={`mt-4 space-y-4 border-t pt-4 ${presentation ? "border-slate-700/40" : "border-slate-200"}`}
          >
            <div>
              <div className={`text-xs font-semibold uppercase tracking-wide ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                Разложение отклонения (корневые причины)
              </div>
              <p className={`mt-0.5 max-w-3xl text-[10px] leading-snug ${presentation ? "text-slate-500" : "text-slate-600"}`}>
                От отклонения к драйверам, затем к структуре линеек и выводу — для решений, а не для отчёта. Драйверы масштабируются при смене плана/сценария; детализация структуры совпадает с блоком ниже.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className={`min-w-0 rounded-xl border p-3 ${presentation ? "border-slate-600/50 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}>
                <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                  Водопад драйверов (порядок = цепочка)
                </div>
                <p className={`mt-1 text-[9px] leading-snug ${presentation ? "text-slate-500" : "text-slate-600"}`}>
                  Сумма столбцов = итоговое отклонение. Красный — ухудшение к плану, зелёный — перекрытие.
                </p>
                <div className="relative mx-auto mt-3 h-44 w-full max-w-xl">
                  <div className="relative flex h-40 items-stretch justify-between gap-1 px-0.5">
                    {rootCauseDecomposition.waterfallRows.map((r) => {
                      const lo = Math.min(r.runningStart, r.runningEnd);
                      const hi = Math.max(r.runningStart, r.runningEnd);
                      const bottomPct = ((lo - rootCauseDecomposition.wfMin) / rootCauseDecomposition.wfSpan) * 100;
                      const heightPct = ((hi - lo) / rootCauseDecomposition.wfSpan) * 100;
                      return (
                        <div key={r.id} className="flex min-w-0 flex-1 flex-col items-center justify-end">
                          <div className="relative w-[78%] flex-1">
                            <div
                              className={`absolute left-0 right-0 rounded-t ${r.impactRub < 0 ? "bg-rose-500/90" : "bg-emerald-500/85"}`}
                              style={{
                                bottom: `${bottomPct}%`,
                                height: `${Math.max(heightPct, 1.2)}%`,
                              }}
                            />
                          </div>
                          <div className={`mt-1 line-clamp-2 text-center text-[8px] font-medium leading-tight ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                            {r.labelRu}
                          </div>
                          <div
                            className={`text-[9px] font-bold tabular-nums ${r.impactRub < 0 ? (presentation ? "text-rose-200" : "text-rose-700") : presentation ? "text-emerald-200" : "text-emerald-700"}`}
                          >
                            {r.impactRub >= 0 ? "+" : "−"}
                            {compactRub(Math.abs(r.impactRub))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[280px] border-collapse text-[10px]">
                    <thead>
                      <tr className={presentation ? "text-slate-500" : "text-slate-500"}>
                        <th className="py-1 pr-2 text-left font-semibold">Драйвер (по |вклад|)</th>
                        <th className="py-1 text-right font-semibold">Δ ₽</th>
                        <th className="py-1 pl-2 text-right font-semibold">После шага</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rootCauseDecomposition.driversSortedByImpact.map((d) => {
                        const end = rootCauseDecomposition.waterfallRows.find((w) => w.id === d.id)?.runningEnd ?? 0;
                        return (
                          <tr key={d.id} className={presentation ? "border-t border-slate-700/35" : "border-t border-slate-200"}>
                            <td className={`py-1.5 pr-2 ${presentation ? "text-slate-200" : "text-slate-800"}`}>{d.labelRu}</td>
                            <td className={`py-1.5 text-right tabular-nums ${d.impactRub < 0 ? (presentation ? "text-rose-200" : "text-rose-700") : presentation ? "text-emerald-200" : "text-emerald-700"}`}>
                              {d.impactRub >= 0 ? "+" : "−"}
                              {compactRub(Math.abs(d.impactRub))}
                            </td>
                            <td className={`py-1.5 pl-2 text-right tabular-nums ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                              {end <= 0 ? "−" : "+"}
                              {compactRub(Math.abs(end))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-3">
                <div className={`rounded-xl border p-3 ${presentation ? "border-slate-600/50 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}>
                  <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                    Структура: топ минусов к Δ выручке
                  </div>
                  <p className={`mt-1 text-[9px] leading-snug ${presentation ? "text-slate-500" : "text-slate-600"}`}>
                    Те же строки и порядок, что в «Выполнение структуры продаж — диагностика» (Δ ₽ по линейке).{" "}
                    <a
                      href="#sales-structure-diagnostic"
                      className={`font-semibold underline decoration-dotted underline-offset-2 ${presentation ? "text-sky-300" : "text-sky-700"}`}
                    >
                      Перейти к таблице
                    </a>
                    .
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {rootCauseDecomposition.structureDrilldown.length === 0 ? (
                      <li className={`text-[10px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>Нет отрицательных Δ по линейкам.</li>
                    ) : (
                      rootCauseDecomposition.structureDrilldown.map((row) => (
                        <li
                          key={row.key}
                          className={`flex items-baseline justify-between gap-2 text-[10px] ${presentation ? "text-slate-200" : "text-slate-800"}`}
                        >
                          <span className="min-w-0 truncate">{row.label}</span>
                          <span className={`shrink-0 tabular-nums ${presentation ? "text-rose-200" : "text-rose-700"}`}>−{compactRub(Math.abs(row.deltaRub))}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                <div className={`rounded-xl border p-3 ${presentation ? "border-slate-600/50 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}>
                  <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                    Тренд отклонения по периодам ряда
                  </div>
                  <p className={`mt-1 text-[10px] leading-snug ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                    <span className="font-semibold">Накопительно: {rootCauseDecomposition.trendRu}.</span> {rootCauseDecomposition.trendDetailRu}
                  </p>
                  <div className="mt-2 h-[120px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={rootCauseDecomposition.monthIncremental} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 8 }} axisLine={{ stroke: gridColor }} tickLine={false} interval="preserveStartEnd" />
                        <YAxis
                          tick={{ fill: axisColor, fontSize: 8 }}
                          axisLine={false}
                          width={40}
                          tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`}
                        />
                        <Tooltip
                          cursor={presentation ? { stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 } : undefined}
                          content={
                            presentation
                              ? rechartsPresentationMiniTooltip((n) => rubFmt.format(n), { dataKey: "cum" })
                              : undefined
                          }
                          formatter={
                            presentation
                              ? undefined
                              : (v, name) => [
                                  rubFmt.format(Number(v)),
                                  String(name) === "cum" ? "Накопит. откл." : "За период",
                                ]
                          }
                          contentStyle={presentation ? undefined : { fontSize: 10, borderRadius: 6 }}
                        />
                        <ReferenceLine y={0} stroke={presentation ? "rgba(148,163,184,0.45)" : "rgba(100,116,139,0.5)"} />
                        <Line type="monotone" dataKey="cum" name="cum" stroke="#f87171" strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className={`mt-1 text-[8px] ${presentation ? "text-slate-500" : "text-slate-500"}`}>Линия — накопительное отклонение выручки (факт − план) по выбранной гранулярности.</p>
                </div>
              </div>
            </div>

            <div
              className={
                presentation
                  ? "relative overflow-hidden rounded-xl border border-slate-600/45 bg-[linear-gradient(120deg,rgba(15,23,42,0.94)_0%,rgba(30,41,59,0.9)_52%,rgba(15,23,42,0.94)_100%)] shadow-[0_0_24px_rgba(56,189,248,0.08)]"
                  : "relative overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(120deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,1)_52%,rgba(248,250,252,0.96)_100%)] shadow-sm"
              }
            >
              <div
                aria-hidden
                className={
                  presentation
                    ? "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.16)_0%,rgba(56,189,248,0.05)_38%,rgba(15,23,42,0)_74%)]"
                    : "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(56,189,248,0.08)_0%,rgba(56,189,248,0.03)_35%,rgba(255,255,255,0)_72%)]"
                }
              />

              <div className="relative grid grid-cols-1 overflow-hidden xl:grid-cols-2">
                <div
                  className={`px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide [clip-path:polygon(0_0,95%_0,100%_50%,95%_100%,0_100%)] ${
                    presentation
                      ? "bg-[linear-gradient(90deg,rgba(127,29,29,0.82)_0%,rgba(190,24,93,0.52)_60%,rgba(251,113,133,0.38)_100%)] text-rose-100"
                      : "bg-[linear-gradient(90deg,rgba(254,202,202,0.95)_0%,rgba(254,226,226,0.9)_60%,rgba(255,241,242,0.88)_100%)] text-rose-800"
                  }`}
                >
                  ПРОБЛЕМА
                </div>
                <div
                  className={`px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,5%_50%)] ${
                    presentation
                      ? "bg-[linear-gradient(90deg,rgba(51,65,85,0.75)_0%,rgba(71,85,105,0.58)_55%,rgba(100,116,139,0.42)_100%)] text-slate-100"
                      : "bg-[linear-gradient(90deg,rgba(226,232,240,0.95)_0%,rgba(241,245,249,0.92)_60%,rgba(248,250,252,0.9)_100%)] text-slate-700"
                  }`}
                >
                  ПРИЧИНА
                </div>
              </div>

              <div className="relative grid grid-cols-1 xl:grid-cols-2">
                <div className="p-4">
                  <p className={`text-2xl font-bold tabular-nums ${presentation ? "text-rose-300" : "text-rose-700"}`}>−177 млн ₽</p>
                  <p className={`mt-1 text-sm ${presentation ? "text-slate-400" : "text-slate-600"}`}>недовыполнение выручки</p>
                </div>

                <div className="relative p-4">
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute inset-y-3 left-0 hidden w-px xl:block ${
                      presentation
                        ? "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.5),transparent)]"
                        : "bg-[linear-gradient(to_bottom,transparent,rgba(148,163,184,0.35),transparent)]"
                    }`}
                  />
                  <p className={`text-sm leading-relaxed ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                    Темп продаж −124 млн ₽ — корневая причина
                  </p>
                  <p className={`text-sm leading-relaxed ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                    Структура −68 млн ₽ — усиливает просадку
                  </p>
                  <p className={`text-sm leading-relaxed ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                    Рост кладовых и парковок
                  </p>
                  <p className={`text-sm leading-relaxed ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                    смещает структуру
                  </p>
                  <p className={`text-sm leading-relaxed ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                    → вытесняет 2-комнатные и коммерцию
                  </p>
                  <p className={`text-sm leading-relaxed ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                    → формирует основной недобор выручки (−177 млн ₽)
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div
        className={
          presentation
            ? `mt-4 rounded-xl border p-3 sm:p-4 ${
                inventoryLiquidationAnalysis.pctAtRisk > 6 || inventoryLiquidationAnalysis.timeDeficitMonths > 0.5
                  ? "border-rose-500/45 bg-gradient-to-br from-rose-950/35 via-slate-900/80 to-slate-950/95 ring-1 ring-rose-500/25"
                  : "border-slate-600/45 bg-gradient-to-br from-slate-900/75 via-slate-900/50 to-slate-950/90"
              }`
            : `mt-4 rounded-xl border p-3 sm:p-4 ${
                inventoryLiquidationAnalysis.pctAtRisk > 6 || inventoryLiquidationAnalysis.timeDeficitMonths > 0.5
                  ? "border-rose-200 bg-gradient-to-br from-rose-50/90 via-white to-slate-50 ring-1 ring-rose-200"
                  : "border-slate-200 bg-gradient-to-br from-white to-slate-50"
              }`
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${presentation ? "text-rose-200" : "text-rose-800"}`}>
              Риск ликвидации · прогноз
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${presentation ? "text-slate-300" : "text-slate-700"}`}>
              Выбытие продукта (остатки)
            </div>
            <p className={`mt-0.5 max-w-3xl text-[10px] leading-snug ${presentation ? "text-slate-500" : "text-slate-600"}`}>
              Фокус на том, что с высокой вероятностью останется непроданным: прогноз → темп → структура.
            </p>
          </div>
        </div>

        <div
          className={`mt-4 rounded-2xl border-2 px-4 py-4 sm:px-5 sm:py-5 ${
            presentation
              ? "border-orange-500/55 bg-gradient-to-br from-orange-950/50 via-slate-950/80 to-slate-950 shadow-[inset_0_1px_0_rgba(255,237,213,0.12)]"
              : "border-orange-400 bg-gradient-to-br from-orange-50 to-amber-50/90 shadow-sm"
          }`}
        >
          <div className={`text-[10px] font-black uppercase tracking-wide ${presentation ? "text-orange-200" : "text-orange-900"}`}>
            Прогноз непроданного (ключевой KPI)
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className={`text-3xl font-black tabular-nums sm:text-4xl ${presentation ? "text-orange-100" : "text-orange-950"}`}>
              {numFmt.format(inventoryLiquidationAnalysis.totalRisk)} шт
            </span>
            <span className={`text-2xl font-black tabular-nums sm:text-3xl ${presentation ? "text-orange-200/95" : "text-orange-800"}`}>
              {inventoryLiquidationAnalysis.pctAtRisk.toFixed(1)}%
            </span>
            <span className={`text-[10px] font-medium ${presentation ? "text-orange-200/80" : "text-orange-900/80"}`}>от портфеля</span>
          </div>
          <p className={`mt-2 max-w-2xl text-[10px] leading-snug ${presentation ? "text-orange-100/85" : "text-orange-950/85"}`}>
            Оценка объёма, который модель не закрывает к дате завершения продаж при текущих темпах и миксе.
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-2">
          <div className={`rounded-lg border px-3 py-2 ${presentation ? "border-slate-600/50 bg-slate-950/50" : "border-slate-200 bg-white"}`}>
            <div className={`text-[9px] font-bold uppercase tracking-wide ${presentation ? "text-slate-500" : "text-slate-500"}`}>Продано</div>
            <div className={`mt-0.5 text-lg font-black tabular-nums ${presentation ? "text-emerald-200" : "text-emerald-800"}`}>
              {inventoryLiquidationAnalysis.pctSold.toFixed(1)}%
            </div>
            <div className={`text-[9px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>
              {numFmt.format(inventoryLiquidationAnalysis.totalSold)} / {numFmt.format(inventoryLiquidationAnalysis.totalPlan)} шт
            </div>
          </div>
          <div className={`rounded-lg border px-3 py-2 ${presentation ? "border-slate-600/50 bg-slate-950/50" : "border-slate-200 bg-white"}`}>
            <div className={`text-[9px] font-bold uppercase tracking-wide ${presentation ? "text-slate-500" : "text-slate-500"}`}>Остаток</div>
            <div className={`mt-0.5 text-lg font-black tabular-nums ${presentation ? "text-slate-200" : "text-slate-800"}`}>
              {inventoryLiquidationAnalysis.pctRemaining.toFixed(1)}%
            </div>
            <div className={`text-[9px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>
              {numFmt.format(inventoryLiquidationAnalysis.totalRemaining)} шт к выбытию
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className={`min-w-0 rounded-xl border p-3 ${presentation ? "border-orange-500/35 bg-slate-950/50" : "border-orange-200 bg-orange-50/50"}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-orange-200" : "text-orange-900"}`}>
              Портфель: продано · остаток · прогноз непроданного
            </div>
            <p className={`mt-1 text-[9px] leading-snug ${presentation ? "text-slate-400" : "text-slate-600"}`}>
              Оранжевый сегмент — прогноз непроданного (акцент); серый — остаток без этого прогноза.
            </p>
            <div className="mt-2 h-[96px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={inventoryLiquidationAnalysis.portfolioBar}
                  margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                  barCategoryGap={12}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, inventoryLiquidationAnalysis.totalPlan]}
                    tick={{ fill: axisColor, fontSize: 9 }}
                    tickFormatter={(v) => numFmt.format(v)}
                  />
                  <YAxis type="category" dataKey="name" width={68} tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} />
                  <Tooltip
                    cursor={presentation ? { stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 } : undefined}
                    content={presentation ? rechartsPresentationMiniTooltip((n) => `${numFmt.format(n)} шт`) : undefined}
                    formatter={
                      presentation
                        ? undefined
                        : (v, name) => {
                            const lab =
                              String(name) === "sold"
                                ? "Продано"
                                : String(name) === "remaining"
                                  ? "Остаток"
                                  : String(name) === "unsoldForecast"
                                    ? "Прогноз непроданного"
                                    : String(name);
                            return [`${numFmt.format(Number(v))} шт`, lab];
                          }
                    }
                    contentStyle={presentation ? undefined : { fontSize: 10, borderRadius: 6 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => <span style={{ color: axisColor }}>{v}</span>} />
                  <Bar dataKey="sold" name="Продано" stackId="inv" fill="#22c55e" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="remaining" name="Остаток" stackId="inv" fill={presentation ? "#475569" : "#94a3b8"} />
                  <Bar
                    dataKey="unsoldForecast"
                    name="Непроданный прогноз"
                    stackId="inv"
                    fill="#ea580c"
                    stroke={presentation ? "#fed7aa" : "#9a3412"}
                    strokeWidth={2}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            className={`min-w-0 rounded-xl border p-3 ${presentation ? "border-amber-500/35 bg-slate-950/45" : "border-amber-200 bg-amber-50/60"}`}
          >
            <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-amber-200" : "text-amber-900"}`}>
              Темп ликвидации и дефицит времени
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <div className={presentation ? "rounded-lg bg-slate-900/55 p-2 ring-1 ring-white/10" : "rounded-lg bg-white p-2 ring-1 ring-amber-200/80"}>
                <div className={presentation ? "text-slate-400" : "text-slate-600"}>Требуемый темп</div>
                <div className={`mt-0.5 font-bold tabular-nums ${presentation ? "text-slate-50" : "text-slate-900"}`}>
                  {dec1Fmt.format(inventoryLiquidationAnalysis.plannedPace)} шт/мес
                </div>
                <div className={`mt-0.5 text-[8px] ${presentation ? "text-slate-500" : "text-slate-500"}`}>к дедлайну</div>
              </div>
              <div className={presentation ? "rounded-lg bg-slate-900/55 p-2 ring-1 ring-white/10" : "rounded-lg bg-white p-2 ring-1 ring-amber-200/80"}>
                <div className={presentation ? "text-slate-400" : "text-slate-600"}>Фактический темп</div>
                <div
                  className={`mt-0.5 font-bold tabular-nums ${
                    inventoryLiquidationAnalysis.actualPace < inventoryLiquidationAnalysis.plannedPace * 0.95
                      ? presentation
                        ? "text-rose-300"
                        : "text-rose-700"
                      : presentation
                        ? "text-emerald-300"
                        : "text-emerald-700"
                  }`}
                >
                  {dec1Fmt.format(inventoryLiquidationAnalysis.actualPace)} шт/мес
                </div>
                <div className={`mt-0.5 text-[8px] ${presentation ? "text-slate-500" : "text-slate-500"}`}>
                  {(inventoryLiquidationAnalysis.paceRatio * 100).toFixed(0)}% к требуемому
                </div>
              </div>
              <div className={presentation ? "rounded-lg bg-slate-900/55 p-2" : "rounded-lg bg-white p-2"}>
                <div className={presentation ? "text-slate-400" : "text-slate-600"}>Мес. на полное выбытие</div>
                <div className={`mt-0.5 font-bold tabular-nums ${presentation ? "text-amber-100" : "text-amber-950"}`}>
                  {dec1Fmt.format(inventoryLiquidationAnalysis.monthsToClear)}
                </div>
                <div className={`mt-0.5 text-[8px] ${presentation ? "text-slate-500" : "text-slate-500"}`}>остаток / факт</div>
              </div>
              <div className={presentation ? "rounded-lg bg-slate-900/55 p-2" : "rounded-lg bg-white p-2"}>
                <div className={presentation ? "text-slate-400" : "text-slate-600"}>Времени до конца продаж</div>
                <div className={`mt-0.5 font-bold tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>
                  {dec1Fmt.format(inventoryLiquidationAnalysis.monthsLeft)} мес.
                </div>
              </div>
            </div>
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-[10px] font-semibold ${
                inventoryLiquidationAnalysis.timeDeficitMonths > 0.5
                  ? presentation
                    ? "border-rose-500/50 bg-rose-950/40 text-rose-100"
                    : "border-rose-300 bg-rose-50 text-rose-900"
                  : presentation
                    ? "border-slate-600/50 text-slate-300"
                    : "border-slate-200 text-slate-700"
              }`}
            >
              {inventoryLiquidationAnalysis.timeDeficitMonths > 0.5 ? (
                <>
                  Дефицит времени: ~{dec1Fmt.format(inventoryLiquidationAnalysis.timeDeficitMonths)} мес. — остаток не укладывается в горизонт при текущем
                  темпе.
                </>
              ) : (
                <>По линейной оценке темп и срок согласованы; риск остаётся в прогнозе непроданного по миксу.</>
              )}
            </div>
          </div>
        </div>

        <div className={`mt-4 rounded-xl border p-3 ${presentation ? "border-slate-600/50 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-600"}`}>
            Структура: сортировка по риску ликвидности (остаток × слабый темп сегмента)
          </div>
          <p className={`mt-1 text-[9px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>
            Топ‑2 по индексу помечены; оранжевый — прогноз непроданного по типу.
          </p>
          <div className="mt-2" style={{ height: Math.max(200, inventoryLiquidationAnalysis.barByType.length * 44) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={inventoryLiquidationAnalysis.barByType.map((r) => ({
                  ...r,
                  labelAxis: r.highRisk ? `${r.label} · риск` : r.label,
                }))}
                margin={{ top: 2, right: 8, left: 4, bottom: 2 }}
                barCategoryGap={12}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                <XAxis type="number" tick={{ fill: axisColor, fontSize: 9 }} tickFormatter={(v) => numFmt.format(v)} />
                <YAxis type="category" dataKey="labelAxis" width={132} tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} />
                <Tooltip
                  cursor={presentation ? { stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 } : undefined}
                  content={presentation ? rechartsPresentationMiniTooltip((n) => `${numFmt.format(n)} шт`) : undefined}
                  formatter={
                    presentation
                      ? undefined
                      : (v, name) => {
                          const lab =
                            String(name) === "sold"
                              ? "Продано"
                              : String(name) === "remaining"
                                ? "Остаток"
                                : String(name) === "unsoldForecast"
                                  ? "Прогноз непроданного"
                                  : String(name);
                          return [`${numFmt.format(Number(v))} шт`, lab];
                        }
                  }
                  contentStyle={presentation ? undefined : { fontSize: 10, borderRadius: 6 }}
                />
                <Legend wrapperStyle={{ fontSize: 9 }} formatter={(v) => <span style={{ color: axisColor }}>{v}</span>} />
                <Bar dataKey="sold" name="Продано" stackId="t" fill="#22c55e" />
                <Bar dataKey="remaining" name="Остаток" stackId="t" fill={presentation ? "#475569" : "#94a3b8"} />
                <Bar
                  dataKey="unsoldForecast"
                  name="Непроданный прогноз"
                  stackId="t"
                  fill="#ea580c"
                  stroke={presentation ? "#fed7aa" : "#9a3412"}
                  strokeWidth={1.5}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`mt-4 grid gap-3 lg:grid-cols-2`}>
          <div className={`rounded-xl border p-3 ${presentation ? "border-orange-500/40 bg-orange-950/25" : "border-orange-200 bg-orange-50/90"}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-orange-200" : "text-orange-900"}`}>
              Концентрация риска по типам
            </div>
            <p className={`mt-1 text-[9px] ${presentation ? "text-orange-100/75" : "text-orange-950/80"}`}>
              Доля каждой категории в суммарном прогнозе непроданного.
            </p>
            <ul className="mt-2 space-y-2">
              {inventoryLiquidationAnalysis.riskConcentration.map((r, idx) => (
                <li
                  key={r.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-[10px] ${
                    idx === 0
                      ? presentation
                        ? "border-orange-400/60 bg-black/25 font-semibold text-orange-50"
                        : "border-orange-400 bg-white font-semibold text-orange-950"
                      : presentation
                        ? "border-slate-600/40 text-slate-200"
                        : "border-slate-200 text-slate-800"
                  }`}
                >
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="shrink-0 text-right tabular-nums">
                    {numFmt.format(r.units)} шт
                    <span className={`ml-2 font-bold ${presentation ? "text-orange-200" : "text-orange-800"}`}>
                      {r.pctOfTotalRisk.toFixed(0)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div
            className={`rounded-xl border-l-4 p-3 text-[11px] leading-relaxed ${
              presentation ? "border-l-orange-400 bg-slate-950/45 text-slate-200" : "border-l-orange-500 bg-white text-slate-800"
            }`}
          >
            <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-orange-200" : "text-orange-900"}`}>
              Инсайт (проблема → причина → следствие)
            </div>
            <p className="mt-2 font-medium">{inventoryLiquidationAnalysis.insight.problem}</p>
            <p className="mt-1.5">{inventoryLiquidationAnalysis.insight.cause}</p>
            <p className="mt-1.5 font-semibold">{inventoryLiquidationAnalysis.insight.consequence}</p>
          </div>
        </div>
      </div>

      <div
        className={
          presentation
            ? "mt-4 rounded-xl border border-violet-500/25 bg-gradient-to-br from-slate-900/85 via-violet-950/20 to-slate-950/95 p-3 sm:p-4 ring-1 ring-violet-500/15"
            : "mt-4 rounded-xl border border-violet-200 bg-gradient-to-br from-white via-violet-50/40 to-slate-50 p-3 sm:p-4"
        }
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${presentation ? "text-violet-200" : "text-violet-800"}`}>
              Конверсия · монетизация
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${presentation ? "text-slate-300" : "text-slate-700"}`}>
              Дополнительные продажи (upsell)
            </div>
            <p className={`mt-0.5 max-w-3xl text-[10px] leading-snug ${presentation ? "text-slate-500" : "text-slate-600"}`}>
              Насколько эффективно монетизируем сделки по квартирам паркингом и кладовыми: сначала конверсия, затем денежный эффект и выполнение плана.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={`rounded-xl border px-4 py-3 ${presentation ? "border-slate-600/50 bg-slate-950/50" : "border-slate-200 bg-white"}`}>
            <div className={`text-[9px] font-bold uppercase tracking-wide ${presentation ? "text-slate-500" : "text-slate-500"}`}>
              Сделки по квартирам (база)
            </div>
            <div className={`mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0 text-xl font-black tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              <span className={presentation ? "text-sky-200" : "text-sky-800"}>{numFmt.format(upsellDiagnosticAnalysis.aptF)}</span>
              <span className={`text-sm font-bold ${presentation ? "text-slate-500" : "text-slate-500"}`}>/</span>
              <span>{numFmt.format(upsellDiagnosticAnalysis.aptP)}</span>
              <span className={`text-[10px] font-semibold ${presentation ? "text-slate-400" : "text-slate-600"}`}>факт / план, шт.</span>
            </div>
            <div className={`mt-1 text-[10px] font-bold tabular-nums ${presentation ? "text-violet-200" : "text-violet-800"}`}>
              {upsellDiagnosticAnalysis.aptExecPct.toFixed(1)}% выполнения плана по базе
            </div>
          </div>
          <div className={`rounded-xl border-2 px-4 py-3 ${upsellConversionSignal.cardClass}`}>
            <div className={`text-[9px] font-bold uppercase tracking-wide ${presentation ? "text-slate-500" : "text-slate-500"}`}>
              Сводная конверсия upsell
            </div>
            <div className={`mt-1 text-[10px] font-black uppercase tracking-wide ${upsellConversionSignal.labelClass}`}>
              {upsellConversionSignal.label}
            </div>
            <div className={`mt-1 text-2xl font-black tabular-nums sm:text-[30px] ${upsellConversionSignal.valueClass}`}>
              {dec1Fmt.format(upsellDiagnosticAnalysis.totalConvFact)}%
              <span className={`ml-2 text-[12px] font-semibold ${presentation ? "text-slate-300" : "text-slate-600"}`}>
                (план {dec1Fmt.format(upsellDiagnosticAnalysis.totalConvPlan)}%)
              </span>
            </div>
            <div className={`mt-1 text-[10px] font-semibold tabular-nums ${presentation ? "text-slate-300" : "text-slate-700"}`}>
              {upsellDiagnosticAnalysis.totalConvDeltaPP >= 0 ? "+" : ""}{dec1Fmt.format(upsellDiagnosticAnalysis.totalConvDeltaPP)} п.п. →
              {" "}недобор выручки
            </div>
            <div className={`mt-1 text-[10px] ${presentation ? "text-slate-300" : "text-slate-700"}`}>
              Основной провал: {upsellDiagnosticAnalysis.weakConvName} (−{dec1Fmt.format(Math.max(0, upsellDiagnosticAnalysis.weakConvDeltaPP))} п.п.)
            </div>
            <div className={`mt-1 text-[10px] font-semibold ${presentation ? "text-slate-400" : "text-slate-600"}`}>
              Норма: {Math.floor(upsellDiagnosticAnalysis.totalConvPlan)}–{Math.floor(upsellDiagnosticAnalysis.totalConvPlan) + 5}%
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={`rounded-xl border px-4 py-3 ${presentation ? "border-slate-600/50 bg-slate-950/50" : "border-slate-200 bg-white"}`}>
            <div className={`text-[9px] font-bold uppercase tracking-wide ${presentation ? "text-slate-500" : "text-slate-500"}`}>UPSSELL (₽)</div>
            <div className={`mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0 text-xl font-black tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              <span className={presentation ? "text-sky-200" : "text-sky-800"}>{compactRub(upsellDiagnosticAnalysis.totalActual)}</span>
              <span className={`text-sm font-bold ${presentation ? "text-slate-500" : "text-slate-500"}`}>/</span>
              <span>{compactRub(upsellDiagnosticAnalysis.totalPlan)}</span>
              <span className={`text-[10px] font-semibold ${presentation ? "text-slate-400" : "text-slate-600"}`}>факт / план</span>
            </div>
            <div className={`mt-1 text-[10px] font-bold tabular-nums ${presentation ? "text-violet-200" : "text-violet-800"}`}>
              {upsellDiagnosticAnalysis.totalPlan > 0
                ? `${dec1Fmt.format((upsellDiagnosticAnalysis.totalActual / upsellDiagnosticAnalysis.totalPlan) * 100)}% выполнения плана`
                : "0.0% выполнения плана"}
            </div>
            <div
              className={`mt-1 text-[10px] font-bold tabular-nums ${
                upsellDiagnosticAnalysis.totalRevDelta >= 0
                  ? presentation
                    ? "text-emerald-300"
                    : "text-emerald-700"
                  : presentation
                    ? "text-rose-300"
                    : "text-rose-700"
              }`}
            >
              Δ {upsellDiagnosticAnalysis.totalRevDelta >= 0 ? "+" : "−"}
              {compactRub(Math.abs(upsellDiagnosticAnalysis.totalRevDelta))}
            </div>
          </div>
          <div
            className={`rounded-xl border-2 px-4 py-3 ${
              upsellDiagnosticAnalysis.totalRevDelta < 0
                ? presentation
                  ? "border-rose-500/55 bg-rose-950/35"
                  : "border-rose-300 bg-rose-50"
                : presentation
                  ? "border-emerald-500/45 bg-emerald-950/25"
                  : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <div className={`text-[9px] font-black uppercase tracking-wide ${presentation ? "text-rose-200" : "text-rose-800"}`}>
              Отклонение (₽)
            </div>
            <div
              className={`mt-1 text-2xl font-black tabular-nums sm:text-3xl ${
                upsellDiagnosticAnalysis.totalRevDelta < 0
                  ? presentation
                    ? "text-rose-100"
                    : "text-rose-700"
                  : presentation
                    ? "text-emerald-200"
                    : "text-emerald-800"
              }`}
            >
              {upsellDiagnosticAnalysis.totalRevDelta >= 0 ? "+" : "−"}
              {compactRub(Math.abs(upsellDiagnosticAnalysis.totalRevDelta))}
            </div>
            <div className={`mt-1 text-[9px] leading-snug ${presentation ? "text-rose-200/85" : "text-rose-900/85"}`}>
              <span className="font-semibold">Вклад по категориям:</span> {upsellDiagnosticAnalysis.insight.revBreakdownLine}
            </div>
          </div>
        </div>

        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-[10px] leading-snug ${presentation ? "border-slate-600/40 bg-slate-950/40 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}
        >
          <span className="font-semibold">Зависимость от базы:</span> ожидаемая выручка upsell при плановой конверсии на текущей базе — около{" "}
          <span className="tabular-nums font-bold">{compactRub(upsellDiagnosticAnalysis.scaledPlanTotal)}</span> (масштаб{" "}
          <span className="tabular-nums font-bold">{numFmt.format(upsellDiagnosticAnalysis.aptF)}</span> /{" "}
          <span className="tabular-nums font-bold">{numFmt.format(upsellDiagnosticAnalysis.aptP)}</span> к «полному» плану{" "}
          <span className="tabular-nums font-bold">{compactRub(upsellDiagnosticAnalysis.totalPlan)}</span>). Недобор базы — около{" "}
          <span className="tabular-nums font-bold">{compactRub(Math.max(0, upsellDiagnosticAnalysis.volumeRevGap))}</span> к суммарному плану; недобор конверсии на
          этой базе — <span className="tabular-nums font-bold">{compactRub(Math.max(0, upsellDiagnosticAnalysis.conversionRevGap))}</span>. Динамика ядра —{" "}
          <span className="font-semibold">Темп продаж</span> («Штуки»).
        </div>

                <div className="mt-4 h-[168px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={upsellDiagnosticAnalysis.convCompare}
              margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              barGap={8}
              barCategoryGap="40%"
            >
              <XAxis dataKey="factPlanLabel" tick={{ fill: axisColor, fontSize: 10 }} axisLine={{ stroke: gridColor }} tickLine={false} interval={0} />
              <YAxis
                tick={{ fill: axisColor, fontSize: 9 }}
                axisLine={false}
                width={36}
                domain={[0, 60]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                cursor={presentation ? { stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 } : undefined}
                content={
                  presentation
                    ? rechartsPresentationMiniTooltip((n) => `${dec1Fmt.format(n)}%`, { dataKey: "factConv" })

                    : undefined
                }
                formatter={presentation ? undefined : (v) => [`${dec1Fmt.format(Number(v))}%`, ""]}
                contentStyle={presentation ? undefined : { fontSize: 10, borderRadius: 6 }}
              />
              <Bar
                dataKey="planConv"
                name="План, %"
                barSize={48}
                fill="rgba(148,163,184,0.2)"
                radius={[4, 4, 0, 0]}
              />
              <Bar dataKey="factConv" name="Факт, %" barSize={24} radius={[4, 4, 0, 0]}>
                {upsellDiagnosticAnalysis.convCompare.map((row, idx) => {
                  return <Cell key={`upsell-conv-cell-${row.name}-${idx}`} fill={row.fill || "#FF4D4F"} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {upsellDiagnosticAnalysis.rows.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border p-3 ${presentation ? "border-slate-600/50 bg-slate-950/45" : "border-slate-200 bg-white"}`}
            >
              <div className={`text-[10px] font-bold uppercase tracking-wide ${presentation ? "text-violet-200" : "text-violet-800"}`}>{r.name}</div>

              <div className={`mt-2 text-lg font-black tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>
                {dec1Fmt.format(r.plannedConversionPct)}% → {dec1Fmt.format(r.actualConversionPct)}%
                <span className={`ml-2 text-[10px] font-bold ${presentation ? "text-slate-500" : "text-slate-600"}`}>план → факт</span>
              </div>
              <div
                className={`mt-0.5 text-sm font-bold tabular-nums ${
                  r.convDeltaPct >= 0
                    ? presentation
                      ? "text-emerald-300"
                      : "text-emerald-700"
                    : presentation
                      ? "text-rose-300"
                      : "text-rose-700"
                }`}
              >
                Δ конверсии {r.convDeltaPct >= 0 ? "+" : ""}
                {dec1Fmt.format(r.convDeltaPct)} п.п.
              </div>

              <div
                className={`mt-3 text-xl font-black tabular-nums ${r.revDelta >= 0 ? (presentation ? "text-emerald-200" : "text-emerald-800") : presentation ? "text-rose-200" : "text-rose-700"}`}
              >
                {r.revDelta >= 0 ? "+" : "−"}
                {compactRub(Math.abs(r.revDelta))}
              </div>
              <div className={`text-[9px] font-medium ${presentation ? "text-slate-500" : "text-slate-600"}`}>влияние на выручку (факт − план)</div>

              <div className={`mt-2 flex items-baseline justify-between gap-2 ${presentation ? "text-slate-400" : "text-slate-600"}`}>
                <span className="text-[9px] uppercase tracking-wide">Выполнение плана</span>
                <span className={`text-base font-black tabular-nums ${presentation ? "text-violet-200" : "text-violet-700"}`}>{r.execPct.toFixed(1)}%</span>
              </div>
              <div className={`text-[9px] tabular-nums ${presentation ? "text-slate-500" : "text-slate-600"}`}>
                План {compactRub(r.planRevenueRub)} · факт {compactRub(r.actualRevenueRub)}
              </div>
            </div>
          ))}
        </div>

        <div className={`mt-4 rounded-xl border p-3 ${presentation ? "border-violet-500/35 bg-violet-950/20" : "border-violet-200 bg-violet-50/80"}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-violet-200" : "text-violet-900"}`}>
            Потенциал (разрыв до плановой конверсии и норматива)
          </div>
          <p className={`mt-1 text-[10px] leading-snug ${presentation ? "text-violet-100/85" : "text-violet-950/90"}`}>
            Закрыть разрыв до <span className="font-semibold">плановой</span> конверсии на текущей базе квартир — до{" "}
            <span className="font-bold tabular-nums">{compactRub(upsellDiagnosticAnalysis.totalPotentialPlanConv)}</span>. До единого целевого норматива{" "}
            {dec1Fmt.format(upsellDiagnosticAnalysis.targetPct)}% (покатегорочно) — до{" "}
            <span className="font-bold tabular-nums">{compactRub(upsellDiagnosticAnalysis.totalPotentialTarget)}</span>.
            {upsellDiagnosticAnalysis.hasBenchmark && upsellDiagnosticAnalysis.benchmarkPctExplicit != null ? (
              <span>
                {" "}
                Внешний бенчмарк {dec1Fmt.format(upsellDiagnosticAnalysis.benchmarkPctExplicit)}% — до{" "}
                <span className="font-bold tabular-nums">{compactRub(upsellDiagnosticAnalysis.totalPotentialBenchmark)}</span>.
              </span>
            ) : null}
          </p>
        </div>

        <div
          className={`mt-4 rounded-xl border-l-4 p-3 text-[11px] leading-relaxed ${
            presentation ? "border-l-violet-400 bg-slate-950/40 text-slate-200" : "border-l-violet-600 bg-white text-slate-800"
          }`}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-violet-200" : "text-violet-900"}`}>
            Инсайт
          </div>
          <p className="mt-2 font-semibold">
            Главный рычаг:{" "}
            <span className={presentation ? "text-violet-200" : "text-violet-900"}>
              {upsellDiagnosticAnalysis.insight.driver === "conversion"
                ? "конверсия (эффективность монетизации при текущей базе)"
                : upsellDiagnosticAnalysis.insight.driver === "base"
                  ? "база (объём сделок по квартирам)"
                  : "смешанный (база и конверсия близки по вкладу)"}
            </span>
          </p>
          <p className="mt-1.5">{upsellDiagnosticAnalysis.insight.cause}</p>
          <p className="mt-1.5 font-medium">{upsellDiagnosticAnalysis.insight.money}</p>
        </div>
      </div>

      <section
        className={
          presentation
            ? "rounded-2xl border border-slate-600/50 bg-gradient-to-b from-slate-900/95 to-slate-950 p-4 sm:p-5 ring-1 ring-white/5"
            : "rounded-2xl border border-slate-300/80 bg-white p-4 shadow-md sm:p-5"
        }
        aria-label="Итоговые управленческие индикаторы"
      >
        <div className="mb-3 flex flex-col gap-0.5 border-b border-dashed border-slate-500/20 pb-2 sm:flex-row sm:items-baseline sm:justify-between">
          <h3 className={presentation ? "text-xs font-bold uppercase tracking-wider text-slate-400" : "text-xs font-bold uppercase tracking-wider text-slate-500"}>
            Итоговые управленческие индикаторы
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            className={`rounded-2xl border-2 px-4 py-5 sm:col-span-2 sm:px-6 sm:py-7 ${
              executiveManagementSummary.statusTone === "green"
                ? presentation
                  ? "border-emerald-400/60 bg-emerald-950/40"
                  : "border-emerald-400 bg-emerald-50"
                : executiveManagementSummary.statusTone === "yellow"
                  ? presentation
                    ? "border-amber-400/55 bg-amber-950/35"
                    : "border-amber-400 bg-amber-50"
                  : presentation
                    ? "border-rose-500/60 bg-rose-950/40"
                    : "border-rose-500 bg-rose-50"
            }`}
          >
            <div
              className={`text-[9px] font-bold uppercase tracking-widest opacity-80 ${
                executiveManagementSummary.statusTone === "green"
                  ? presentation
                    ? "text-emerald-200"
                    : "text-emerald-900"
                  : executiveManagementSummary.statusTone === "yellow"
                    ? presentation
                      ? "text-amber-200"
                      : "text-amber-900"
                    : presentation
                      ? "text-rose-200"
                      : "text-rose-900"
              }`}
            >
              Статус
            </div>
            <p
              className={`mt-1 text-3xl font-black leading-none sm:text-4xl md:text-5xl ${
                executiveManagementSummary.statusTone === "green"
                  ? presentation
                    ? "text-emerald-50"
                    : "text-emerald-950"
                  : executiveManagementSummary.statusTone === "yellow"
                    ? presentation
                      ? "text-amber-50"
                      : "text-amber-950"
                    : presentation
                      ? "text-rose-50"
                      : "text-rose-950"
              }`}
            >
              {executiveManagementSummary.statusLabel}
            </p>
            <p className={`mt-2 whitespace-pre-line text-sm font-semibold tabular-nums sm:text-base ${presentation ? "text-slate-300" : "text-slate-700"}`}>
              {executiveManagementSummary.statusMetrics}
            </p>
            <div className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-snug ${presentation ? "border-slate-600/70 bg-black/20 text-slate-200" : "border-slate-200 bg-white/80 text-slate-700"}`}>
              <div className={`text-[9px] font-bold uppercase tracking-widest ${presentation ? "text-slate-500" : "text-slate-500"}`}>Причинная цепочка</div>
              <p className="mt-1 font-black tabular-nums">{executiveManagementSummary.causalChain[0]}</p>
              <p className="mt-0.5">{executiveManagementSummary.causalChain[1]}</p>
              <p className="mt-0.5">{executiveManagementSummary.causalChain[2]}</p>
            </div>
          </div>

          <div
            className={`rounded-2xl border-2 px-4 py-4 sm:px-5 sm:py-5 ${
              presentation ? "border-rose-500/60 bg-rose-950/35" : "border-rose-500 bg-rose-50"
            }`}
          >
            <div className={`text-[9px] font-bold uppercase tracking-widest ${presentation ? "text-rose-200" : "text-rose-900"}`}>
              Проблема
            </div>
            <p className={`mt-2 text-lg font-black leading-tight sm:text-xl ${presentation ? "text-rose-50" : "text-rose-950"}`}>
              {executiveManagementSummary.mainProblem}
            </p>
          </div>

          <div
            className={`rounded-2xl border-2 px-4 py-4 shadow-md sm:px-5 sm:py-5 ${
              presentation
                ? "border-sky-400/80 bg-sky-950/55 shadow-sky-950/50"
                : "border-sky-600 bg-sky-100 shadow-sky-300/60"
            }`}
          >
            <div className={`text-[9px] font-bold uppercase tracking-widest ${presentation ? "text-sky-200" : "text-sky-900"}`}>
              Действие
            </div>
            <p className={`mt-2 whitespace-pre-line text-base font-bold leading-snug sm:text-lg ${presentation ? "text-sky-50" : "text-sky-950"}`}>
              {executiveManagementSummary.requiredAction}
            </p>
          </div>

          <div
            className={`rounded-2xl border px-4 py-4 sm:col-span-2 sm:px-5 sm:py-4 ${
              presentation ? "border-slate-600/60 bg-slate-900/40" : "border-slate-200 bg-slate-50"
            }`}
          >
            <div className={`text-[9px] font-bold uppercase tracking-widest ${presentation ? "text-slate-500" : "text-slate-500"}`}>
              Драйвер
            </div>
            <p className={`mt-2 text-sm font-medium leading-snug sm:text-base ${presentation ? "text-slate-300" : "text-slate-700"}`}>
              {executiveManagementSummary.mainDriver}
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
