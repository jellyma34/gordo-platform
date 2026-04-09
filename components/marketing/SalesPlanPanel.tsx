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
  buildSalesInsights,
  execStatusFromPercent,
  type ExecStatus,
} from "@/lib/salesPlanAnalytics";
import type { MarketingPeriodGranularity } from "./MarketingFilters";
import { SalesPlanRadarChart } from "./SalesPlanRadarChart";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const ComposedChart = dynamic(() => import("recharts").then((m) => m.ComposedChart), { ssr: false });
const Area = dynamic(() => import("recharts").then((m) => m.Area), { ssr: false });
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });
const LabelList = dynamic(() => import("recharts").then((m) => m.LabelList), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false });
const ReferenceLine = dynamic(() => import("recharts").then((m) => m.ReferenceLine), { ssr: false });
const ReferenceDot = dynamic(() => import("recharts").then((m) => m.ReferenceDot), { ssr: false });

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
type PlanMode = "view" | "edit";
type PlanScenario = "optimistic" | "realistic" | "pessimistic";

const SCENARIO_FACTOR: Record<PlanScenario, number> = {
  optimistic: 1.08,
  realistic: 1,
  pessimistic: 0.92,
};

function metricLabel(m: ChartMetric): string {
  if (m === "revenue") return "Выручка";
  if (m === "units") return "Штуки";
  return "Площадь";
}

function metricFormatter(metric: ChartMetric) {
  if (metric === "revenue") return (v: number) => compactRub(v);
  if (metric === "area") return (v: number) => `${numFmt.format(v)} м²`;
  return (v: number) => `${numFmt.format(v)} сделок`;
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
};

export function SalesPlanPanel({ presentation, period, objectId, dealTypeId }: Props) {
  const isPresentationMode = presentation;
  const card = presentation ? CARD : CARD_EDIT;
  const h4 = presentation ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900";
  const sub = presentation ? "text-[11px] text-slate-500" : "text-[11px] text-slate-600";
  const [chartMetric, setChartMetric] = useState<ChartMetric>("revenue");
  const [mode, setMode] = useState<PlanMode>("view");
  const [scenario, setScenario] = useState<PlanScenario>("realistic");

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
  const lineData = useMemo(() => seriesToLineData(seriesPoints, chartMetric), [seriesPoints, chartMetric]);
  const lineFmt = metricFormatter(chartMetric);
  const lastLinePoint = lineData[lineData.length - 1];
  const lastLineDiff = (lastLinePoint?.fact ?? 0) - (lastLinePoint?.plan ?? 0);

  const currentLabel = useMemo(() => {
    const hit = seriesPoints.find((p) => p.periodKey === analytics.currentPeriodKey);
    return hit?.label ?? seriesPoints[seriesPoints.length - 1]?.label;
  }, [seriesPoints, analytics.currentPeriodKey]);

  const execStatus = execStatusFromPercent(rev.percentComplete);
  const status = statusMeta(execStatus, presentation);

  const insights = useMemo(
    () => buildSalesInsights(categoriesAdjusted, radarCategoriesAdjusted, rev),
    [categoriesAdjusted, radarCategoriesAdjusted, rev],
  );
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
  const requiredConversionPct = requiredLeads > 0 ? (shortfallDeals / requiredLeads) * 100 : 0;
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
  const lastDealControlPoint = dealControlData[dealControlData.length - 1];
  const chartPointStroke = presentation ? "#0f172a" : "#ffffff";

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
  const rrAdjusted = { ...rr, horizonPlanCumulativeRub: effectiveTotalPlan };
  const forecastPercentAdjusted = effectiveTotalPlan > 0 ? (rrAdjusted.forecastCumulativeEndRub / effectiveTotalPlan) * 100 : 0;
  const forecastGapRub = rrAdjusted.horizonPlanCumulativeRub - rrAdjusted.forecastCumulativeEndRub;

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
                {forecastPercentAdjusted.toFixed(1)}%
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
              {forecastPercentAdjusted.toFixed(1)}%
            </div>
            <div className={`mt-0.5 text-[11px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>
              при сохранении текущего темпа
            </div>
          </div>
        </div>
      </div>

      {/* B. Dynamics */}
      <div className={card}>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className={h4}>B. Динамика (план vs факт vs forecast)</h4>
            <p className={sub}>
              Накопительно · старт отклонения: {lagStartedLabel ?? "не зафиксирован"} · текущая точка: {currentLabel}
            </p>
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
        <div className="h-[320px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={lineData} margin={{ top: 22, right: 44, left: 20, bottom: 20 }}>
              <defs>
                <filter id="dynFactGlow">
                  <feGaussianBlur stdDeviation="2.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} tickMargin={8} axisLine={{ stroke: gridColor }} />
              <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickFormatter={yTick} width={72} />
              <Tooltip content={<LineChartTooltip metric={chartMetric} presentation={presentation} />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} formatter={(v) => <span style={{ color: axisColor }}>{v}</span>} />
              <Area type="monotone" dataKey="factBelow" baseLine={(row: { plan: number }) => row.plan} connectNulls stroke="none" fill="rgba(239,68,68,0.18)" />
              <Area type="monotone" dataKey="factAbove" baseLine={(row: { plan: number }) => row.plan} connectNulls stroke="none" fill="rgba(34,197,94,0.14)" />
              <Line type="monotone" dataKey="plan" name="План" stroke={presentation ? "rgba(226,232,240,0.86)" : "#94a3b8"} strokeWidth={1.4} dot={false} />
              <Line type="monotone" dataKey="fact" name="Факт" stroke="#38bdf8" strokeWidth={3} dot={{ r: 3, fill: "#38bdf8" }} style={{ filter: "url(#dynFactGlow)" }} />
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
                  stroke="#facc15"
                  strokeWidth={1.8}
                  strokeDasharray="4 4"
                  label={{
                    value: "Сейчас",
                    position: "top",
                    fill: "#facc15",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                />
              ) : null}
              {lastLinePoint ? (
                <ReferenceLine
                  segment={[
                    { x: lastLinePoint.label, y: lastLinePoint.plan },
                    { x: lastLinePoint.label, y: lastLinePoint.fact },
                  ]}
                  stroke={lastLineDiff < 0 ? "#ef4444" : "#22c55e"}
                  strokeWidth={1.6}
                  label={{
                    value: `${lastLineDiff < 0 ? "−" : "+"}${lineFmt(Math.abs(lastLineDiff))}`,
                    position: "right",
                    fill: lastLineDiff < 0 ? "#ef4444" : "#22c55e",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
              ) : null}
              {lastLinePoint ? (
                <ReferenceDot
                  x={lastLinePoint.label}
                  y={lastLinePoint.fact}
                  r={6}
                  fill="#38bdf8"
                  stroke={presentation ? "#0f172a" : "#ffffff"}
                  strokeWidth={2}
                  label={{
                    value: `Факт ${lineFmt(lastLinePoint.fact)}`,
                    position: "top",
                    fill: presentation ? "#e2e8f0" : "#334155",
                    fontSize: 10,
                  }}
                />
              ) : null}
              {lastLinePoint ? (
                <ReferenceDot
                  x={lastLinePoint.label}
                  y={lastLinePoint.plan}
                  r={5}
                  fill={presentation ? "#cbd5e1" : "#94a3b8"}
                  stroke={presentation ? "#0f172a" : "#ffffff"}
                  strokeWidth={1.5}
                  label={{
                    value: `План ${lineFmt(lastLinePoint.plan)}`,
                    position: "bottom",
                    fill: presentation ? "#cbd5e1" : "#475569",
                    fontSize: 10,
                  }}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* C. Radar */}
      <div className={card}>
        <h4 className={h4}>C. Отклонение по сегментам (Radar)</h4>
        <p className={`${sub} mt-1`}>
          Слабый сегмент: {topWeakRadar?.name ?? "—"} · {topWeakRadar ? `${topWeakRadar.pct.toFixed(1)}%` : "н/д"}
        </p>
        <div className="mt-4">
          <SalesPlanRadarChart
            categories={radarCategoriesAdjusted}
            presentation={presentation}
            centerPercentComplete={rev.percentComplete}
            centerDeviationRub={rev.deviationCumulative}
          />
        </div>
      </div>

      {/* D. Segment contribution */}
      <div className={card}>
        <h4 className={h4}>D. Вклад сегментов в отклонение (₽)</h4>
        <p className={`${sub} mt-1`}>
          Источник основного минуса: {topNegativeContribution?.name ?? "—"} · связь с радаром сохранена
        </p>
        <div className="mt-4 h-[280px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deviationContribution} layout="vertical" margin={{ top: 4, right: 8, left: 14, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: axisColor, fontSize: 10 }}
                axisLine={false}
                tickFormatter={(v: number) => `${Math.round(v / 1_000_000)}M`}
              />
              <YAxis
                type="category"
                dataKey="nameWithPct"
                tick={{ fill: axisColor, fontSize: 10 }}
                axisLine={false}
                width={140}
              />
              <Tooltip content={<DeviationContributionTooltip presentation={presentation} />} />
              <ReferenceLine x={0} stroke={presentation ? "rgba(148,163,184,0.45)" : "rgba(100,116,139,0.5)"} />
              <Bar dataKey="deviation" radius={[4, 4, 4, 4]}>
                {deviationContribution.map((r) => (
                  <Cell key={r.id} fill={r.fill} />
                ))}
                <LabelList
                  dataKey="deviation"
                  position="right"
                  formatter={(v: number) => `${v < 0 ? "−" : "+"}${compactRub(Math.abs(v))}`}
                  fill={presentation ? "#cbd5e1" : "#334155"}
                  fontSize={10}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 space-y-1">
          <p className={`text-sm font-semibold ${totalDeviationRub < 0 ? (presentation ? "text-red-300" : "text-red-700") : presentation ? "text-emerald-300" : "text-emerald-700"}`}>
            Итого: {totalDeviationRub < 0 ? "−" : "+"}
            {compactRub(Math.abs(totalDeviationRub))}
          </p>
          {apt2CompensationText ? (
            <p className={`text-[11px] ${presentation ? "text-slate-300" : "text-slate-700"}`}>{apt2CompensationText}</p>
          ) : null}
        </div>
      </div>

      {/* E. Funnel */}
      <div className={card}>
        <h4 className={h4}>E. Потери в воронке и перевод в деньги</h4>
        <p className={sub}>Критичный этап: {funnelTopLossStage?.stage ?? "—"} · потери: {funnelTopLossStage ? numFmt.format(funnelTopLossStage.lostDeals) : "0"} сделок</p>
        <div className="mt-3">
          <FunnelBlock
            stages={funnel}
            presentation={presentation}
            planRevenue={rev.planCumulative}
            factRevenue={rev.factCumulative}
          />
        </div>
      </div>

      {/* F. Run rate */}
      <div className={card}>
        <h4 className={h4}>F. Run rate</h4>
        <p className={`${sub} mt-1`}>Текущий темп vs требуемый темп до конца периода</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={presentation ? "rounded-xl bg-slate-900/40 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <div className={sub}>Текущий темп</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              ~{compactRub(rrAdjusted.avgMonthlyRevenueRub)}
            </div>
          </div>
          <div className={presentation ? "rounded-xl bg-slate-900/40 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <div className={sub}>Требуемый темп</div>
              <div className={`mt-1 text-lg font-bold tabular-nums ${requiredPerPeriod > runRateDeals ? (presentation ? "text-red-300" : "text-red-700") : (presentation ? "text-emerald-300" : "text-emerald-700")}`}>
                {numFmt.format(Math.round(requiredPerPeriod))} сделка / месяц
            </div>
          </div>
          <div className={presentation ? "rounded-xl bg-slate-900/40 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <div className={sub}>Прогноз к плану</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${forecastGapRub > 0 ? (presentation ? "text-amber-300" : "text-amber-700") : (presentation ? "text-emerald-300" : "text-emerald-700")}`}>
              {compactRub(rrAdjusted.forecastCumulativeEndRub)} / {compactRub(rrAdjusted.horizonPlanCumulativeRub)}
            </div>
          </div>
        </div>
      </div>

      {/* G. Action block */}
      <div className={card}>
        <h4 className={h4}>G. Что делать сейчас</h4>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={presentation ? "rounded-xl bg-slate-900/40 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <div className={sub}>Не хватает к плану</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${presentation ? "text-red-300" : "text-red-700"}`}>{numFmt.format(shortfallDeals)} сделок</div>
          </div>
          <div className={presentation ? "rounded-xl bg-slate-900/40 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <div className={sub}>Требуемые лиды</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>{numFmt.format(requiredLeads)}</div>
          </div>
          <div className={presentation ? "rounded-xl bg-slate-900/40 p-3" : "rounded-xl bg-slate-50 p-3"}>
            <div className={sub}>Требуемая конверсия</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>{requiredConversionPct.toFixed(1)}%</div>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5">
          {insights.slice(0, 3).map((b, i) => (
            <li key={i} className={`border-l-2 pl-3 text-sm ${insightTone(b.tone)}`}>{b.text}</li>
          ))}
        </ul>
      </div>

      {/* H. Comments */}
      <div className={card}>
        <h4 className={`${h4} mb-1`}>H. Комментарии к причинам</h4>
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

      {/* Управленческий KPI-график по сделкам */}
      <div className={card}>
        <h4 className={`${h4} mb-1`}>Контроль выполнения плана (сделки)</h4>
        <p className={sub}>Выполняется ли план, успеем ли к концу периода и насколько критично отставание.</p>
        <div className={`mt-3 rounded-xl border p-3 shadow-[0_0_24px_rgba(56,189,248,0.08)] ${statusTone}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-xs uppercase opacity-80">Статус</div>
              <div className="text-sm font-black sm:text-base drop-shadow-[0_0_8px_rgba(251,191,36,0.25)]">{statusText}</div>
            </div>
            <div>
              <div className="text-xs uppercase opacity-80">Отклонение</div>
              <div className="text-sm font-bold tabular-nums drop-shadow-[0_0_10px_rgba(239,68,68,0.22)]">
                {currentDeviation >= 0 ? "+" : "−"}
                {numFmt.format(Math.abs(currentDeviation))} сделок
              </div>
            </div>
            <div>
              <div className="text-xs uppercase opacity-80">Текущий темп</div>
              <div className="text-sm font-bold tabular-nums">{numFmt.format(Math.round(runRateDeals))} сделка / месяц</div>
            </div>
            <div>
              <div className="text-xs uppercase opacity-80">Требуемый темп</div>
              <div className="text-sm font-bold tabular-nums">
                {numFmt.format(Math.round(requiredPerPeriod))} сделка / месяц
              </div>
            </div>
          </div>
        </div>
        <div className="relative mt-3 h-[240px] w-full min-w-0 overflow-hidden rounded-xl">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 20% 20%, rgba(56,189,248,0.14), transparent 45%), radial-gradient(circle at 80% 30%, rgba(168,85,247,0.12), transparent 50%)",
            }}
          />
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dealControlData} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
              <defs>
                <linearGradient id="factAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                </linearGradient>
                <filter id="factGlow">
                  <feGaussianBlur stdDeviation="2.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} />
              <YAxis
                tick={{ fill: axisColor, fontSize: 10 }}
                axisLine={false}
                allowDecimals={false}
                tickFormatter={yTickDeals}
                label={{ value: "Сделки, шт", angle: -90, position: "insideLeft", fill: axisColor, fontSize: 10 }}
              />
              <Tooltip content={<DealControlTooltip presentation={presentation} />} />
              <Area type="monotone" dataKey="factBelow" baseLine={(row: DealControlRow) => row.planCumulative} connectNulls stroke="none" fill="rgba(239,68,68,0.18)" />
              <Area type="monotone" dataKey="factAbove" baseLine={(row: DealControlRow) => row.planCumulative} connectNulls stroke="none" fill="rgba(34,197,94,0.16)" />
              <Area type="monotone" dataKey="factCumulative" stroke="none" fill="url(#factAreaGradient)" />
              <Line type="monotone" dataKey="planCumulative" name="План (накопит.)" stroke={presentation ? "rgba(226,232,240,0.82)" : "#94a3b8"} strokeWidth={1.4} dot={false} />
              <Line
                type="monotone"
                dataKey="factCumulative"
                name="Факт (накопит.)"
                stroke="#38bdf8"
                strokeWidth={2.8}
                style={{ filter: "url(#factGlow)" }}
                dot={(props: {
                  cx?: number;
                  cy?: number;
                  index?: number;
                }) => {
                  const { cx, cy, index } = props;
                  if (cx == null || cy == null) return null;
                  const isLast = index === dealControlData.length - 1;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isLast ? 12 : 10}
                      fill={isLast ? "#ef4444" : "#38bdf8"}
                      stroke={chartPointStroke}
                      strokeWidth={2}
                      style={{ filter: "drop-shadow(0 0 8px rgba(56,189,248,0.45))" }}
                    />
                  );
                }}
              >
                <LabelList
                  dataKey="factCumulative"
                  position="top"
                  formatter={(v: number) => `${v}`}
                  fill={presentation ? "#e2e8f0" : "#334155"}
                  fontSize={10}
                />
              </Line>
              <Line
                type="monotone"
                dataKey="forecastCumulative"
                name="Forecast"
                stroke="#a78bfa"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={(props: { cx?: number; cy?: number }) => {
                  const { cx, cy } = props;
                  if (cx == null || cy == null) return null;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={10}
                      fill="#a78bfa"
                      stroke={chartPointStroke}
                      strokeWidth={2}
                      style={{ filter: "drop-shadow(0 0 8px rgba(167,139,250,0.45))" }}
                    />
                  );
                }}
              />
              {todayLabelDealControl ? (
                <ReferenceLine x={todayLabelDealControl} stroke="#facc15" strokeWidth={1.8} strokeDasharray="4 4" />
              ) : null}
              {lastDealControlPoint ? (
                <ReferenceDot
                  x={lastDealControlPoint.label}
                  y={lastDealControlPoint.factCumulative}
                  r={0}
                  label={{
                    value: `${lastDealControlPoint.factCumulative} (${lastDealControlPoint.deviation >= 0 ? "+" : ""}${lastDealControlPoint.deviation})`,
                    position: "top",
                    fill: presentation ? "#fca5a5" : "#b91c1c",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className={`mt-2 text-[11px] ${presentation ? "text-slate-400" : "text-slate-600"}`}>Накопительное количество сделок</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className={presentation ? "rounded-lg border border-slate-600/50 bg-slate-900/30 p-2.5" : "rounded-lg border border-slate-200 bg-slate-50 p-2.5"}>
            <div className={sub}>Финальная точка периода</div>
            <div className={`mt-1 text-sm font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              План: {numFmt.format(planEndDeals)} · Прогноз: {numFmt.format(forecastEndDeals)} · Разница:{" "}
              <span className={forecastEndDeals >= planEndDeals ? (presentation ? "text-emerald-300" : "text-emerald-700") : (presentation ? "text-red-300" : "text-red-700")}>
                {forecastEndDeals - planEndDeals >= 0 ? "+" : "−"}
                {numFmt.format(Math.abs(forecastEndDeals - planEndDeals))} сделок
              </span>
            </div>
          </div>
          <div className={presentation ? "rounded-lg border border-slate-600/50 bg-slate-900/30 p-2.5" : "rounded-lg border border-slate-200 bg-slate-50 p-2.5"}>
            <div className={sub}>Вердикт</div>
            <div className={`mt-1 text-sm font-semibold ${forecastEndDeals < planEndDeals ? (presentation ? "text-red-300" : "text-red-700") : (presentation ? "text-emerald-300" : "text-emerald-700")}`}>
              {forecastEndDeals < planEndDeals ? "План недостижим при текущем темпе" : "План достижим при текущем темпе"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
