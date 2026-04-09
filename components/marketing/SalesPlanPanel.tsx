"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
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
const ComposedChart = dynamic(() => import("recharts").then((m) => m.ComposedChart), { ssr: false });
const LabelList = dynamic(() => import("recharts").then((m) => m.LabelList), { ssr: false });
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
  factGreen: number | null;
  factYellow: number | null;
  factRed: number | null;
  redZone: number;
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
      factGreen: status === "green" ? factRun : null,
      factYellow: status === "yellow" ? factRun : null,
      factRed: status === "red" ? factRun : null,
      redZone: status === "red" ? factRun : 0,
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
          {numFmt.format(Math.abs(p.deviation))} шт ({p.deviationPct >= 0 ? "+" : ""}
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

  const dealControlData = useMemo(() => {
    const planRows = period === "month" ? marketingMockData.salesPlan.month : marketingMockData.salesPlan.quarter;
    const factRows = period === "month" ? marketingMockData.salesFact.month : marketingMockData.salesFact.quarter;
    const planFiltered = filterByObjectAndDealType(planRows, objectId, dealTypeId);
    const factFiltered = filterByObjectAndDealType(factRows, objectId, dealTypeId);
    return buildDealControlData(mergeSalesPlanFact(planFiltered, factFiltered));
  }, [period, objectId, dealTypeId]);

  const todayPeriodKey = useMemo(() => periodKeyToday(period), [period]);
  const todayInData = dealControlData.some((r) => r.periodKey === todayPeriodKey);
  const todayLabelDealControl = todayInData
    ? dealControlData.find((r) => r.periodKey === todayPeriodKey)?.label
    : dealControlData[dealControlData.length - 1]?.label;
  const lagStartedLabel = dealControlData.find((r) => r.factCumulative < r.planCumulative)?.label ?? null;
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
  const requiredPerPeriod = remainingPeriods > 0 ? Math.max(0, (planEndDeals - currentFactCum) / remainingPeriods) : 0;
  const funnel = marketingMockData.funnel;
  const safeFunnel = funnel ?? [];
  const leadToDealRate =
    safeFunnel.length > 1 && safeFunnel[0].count > 0
      ? safeFunnel[safeFunnel.length - 1].count / safeFunnel[0].count
      : 0;
  const shortfallDeals = Math.max(0, planEndDeals - forecastEndDeals);
  const requiredLeads = leadToDealRate > 0 ? Math.ceil(shortfallDeals / leadToDealRate) : 0;
  const blockStatus: TrafficStatus =
    currentPlanCum > 0
      ? currentFactCum >= currentPlanCum
        ? "green"
        : currentFactCum >= currentPlanCum * 0.9
          ? "yellow"
          : "red"
      : "yellow";
  const statusText = blockStatus === "green" ? "План выполняется" : blockStatus === "yellow" ? "Риск выполнения" : "План не выполняется";
  const statusTone =
    blockStatus === "green"
      ? presentation
        ? "border-emerald-500/35 bg-emerald-950/20 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-900"
      : blockStatus === "yellow"
        ? presentation
          ? "border-amber-500/35 bg-amber-950/20 text-amber-100"
          : "border-amber-200 bg-amber-50 text-amber-900"
        : presentation
          ? "border-red-500/35 bg-red-950/20 text-red-100"
          : "border-red-200 bg-red-50 text-red-900";

  const deviationPct = rev.planCumulative > 0 ? ((rev.factCumulative - rev.planCumulative) / rev.planCumulative) * 100 : 0;

  const axisColor = presentation ? "#94a3b8" : "#64748b";
  const gridColor = presentation ? "rgba(148,163,184,0.12)" : "rgba(100,116,139,0.15)";

  const yTick =
    chartMetric === "revenue"
      ? (v: number) => `${Math.round(v / 1_000_000)}M`
      : chartMetric === "area"
        ? (v: number) => `${numFmt.format(v)}`
        : (v: number) => `${numFmt.format(v)}`;
  const yTickDeals = (v: number) => `${numFmt.format(v)}`;

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
          <h4 className={`${h4} mb-1`}>Выполнение плана продаж</h4>
          <p className={sub}>План/факт и прогноз накопительно: выполним план или нет.</p>
          <div className={`mt-3 rounded-xl border p-3 ${statusTone}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-xs uppercase opacity-80">Статус</div>
                <div className="text-sm font-black sm:text-base">{statusText}</div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase opacity-80">Отклонение сейчас</div>
                <div className="text-sm font-bold tabular-nums">
                  {currentDeviation >= 0 ? "+" : "−"}
                  {numFmt.format(Math.abs(currentDeviation))} шт ({currentDeviationPct >= 0 ? "+" : ""}
                  {currentDeviationPct.toFixed(1)}%)
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className={presentation ? "rounded-lg border border-slate-600/50 bg-slate-900/30 p-2.5" : "rounded-lg border border-slate-200 bg-slate-50 p-2.5"}>
              <div className={sub}>Прогноз к концу периода (run rate)</div>
              <div className={`mt-1 text-sm font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>
                План: <span className="tabular-nums">{numFmt.format(planEndDeals)}</span> · Прогноз:{" "}
                <span className={`tabular-nums ${forecastEndDeals >= planEndDeals ? "text-emerald-500" : "text-red-500"}`}>
                  {numFmt.format(forecastEndDeals)}
                </span>
              </div>
            </div>
            <div className={presentation ? "rounded-lg border border-slate-600/50 bg-slate-900/30 p-2.5" : "rounded-lg border border-slate-200 bg-slate-50 p-2.5"}>
              <div className={sub}>Достижимость</div>
              <div className={`mt-1 text-sm font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>
                Требуется: <span className="tabular-nums">{numFmt.format(Math.round(requiredPerPeriod))}</span> / период · Факт:{" "}
                <span className="tabular-nums">{numFmt.format(Math.round(runRateDeals))}</span> / период
              </div>
            </div>
          </div>

          <div className="mt-3 h-[240px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dealControlData} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} />
                <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} allowDecimals={false} tickFormatter={yTickDeals} />
                <Tooltip content={<DealControlTooltip presentation={presentation} />} />
                <Line
                  type="monotone"
                  dataKey="planCumulative"
                  name="План (накопит.)"
                  stroke={presentation ? "#cbd5e1" : "#475569"}
                  strokeWidth={2}
                  dot={false}
                />
                <Line type="monotone" dataKey="factGreen" name="Факт (>=100%)" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3, fill: "#22c55e" }} connectNulls />
                <Line type="monotone" dataKey="factYellow" name="Факт (90-100%)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: "#f59e0b" }} connectNulls />
                <Line type="monotone" dataKey="factRed" name="Факт (<90%)" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3, fill: "#ef4444" }} connectNulls>
                  <LabelList
                    dataKey="deviation"
                    position="top"
                    formatter={(v: number) => (v < 0 ? `${v}` : "")}
                    fill={presentation ? "#fca5a5" : "#b91c1c"}
                    fontSize={10}
                  />
                </Line>
                <Line type="monotone" dataKey="forecastCumulative" name="Forecast (run rate)" stroke="#a78bfa" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                {todayLabelDealControl ? (
                  <ReferenceLine
                    x={todayLabelDealControl}
                    stroke={presentation ? "#fbbf24" : "#d97706"}
                    strokeWidth={1.2}
                    strokeDasharray="4 4"
                    label={{ value: "Сегодня", position: "top", fill: presentation ? "#fcd34d" : "#b45309", fontSize: 10 }}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className={`mt-2 text-[11px] ${presentation ? "text-red-300" : "text-red-700"}`}>
            {lagStartedLabel ? `Отставание началось: ${lagStartedLabel}` : "Отставание не зафиксировано."}
          </p>
          <div className={presentation ? "mt-2 rounded-lg border border-slate-600/50 bg-slate-900/30 p-2.5" : "mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5"}>
            <div className={sub}>Что нужно сделать</div>
            <div className={`mt-1 text-sm font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              Не хватает: <span className="tabular-nums">{numFmt.format(shortfallDeals)}</span> сделок · нужно лидов:{" "}
              <span className="tabular-nums">{numFmt.format(requiredLeads)}</span>
            </div>
          </div>
        </div>
        <div className={card}>
          <h4 className={`${h4} mb-3`}>Воронка</h4>
          <FunnelBlock
            stages={funnel}
            presentation={presentation}
            planRevenue={rev.planCumulative}
            factRevenue={rev.factCumulative}
          />
        </div>
      </div>
    </div>
  );
}
