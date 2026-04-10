"use client";

import dynamic from "next/dynamic";
import { useId, useMemo, useState, type ReactNode } from "react";
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
const dec1Fmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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

type SalesVelocityLineRow = {
  label: string;
  plannedRate: number;
  actualRate: number;
  rateDelta: number;
  rateDeltaPct: number;
};

function SalesVelocityLineTooltip({
  active,
  payload,
  presentation,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: SalesVelocityLineRow }>;
  presentation: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const shell =
    presentation
      ? "max-w-xs rounded-lg border border-cyan-500/30 bg-[#0f172a]/95 p-3 text-xs text-slate-200 shadow-[0_0_24px_rgba(56,189,248,0.12)]"
      : "max-w-xs rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-lg";
  return (
    <div className={shell}>
      <div className={`font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>{row.label}</div>
      <div className="mt-2 space-y-1 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Плановый темп</span>
          <span>{dec1Fmt.format(row.plannedRate)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Фактический темп</span>
          <span>{dec1Fmt.format(row.actualRate)}</span>
        </div>
        <div className={`flex justify-between gap-4 font-medium ${row.rateDelta >= 0 ? (presentation ? "text-emerald-300" : "text-emerald-700") : presentation ? "text-rose-300" : "text-rose-700"}`}>
          <span>К плану</span>
          <span>
            {row.rateDelta >= 0 ? "+" : "−"}
            {dec1Fmt.format(Math.abs(row.rateDelta))} ({row.rateDeltaPct >= 0 ? "+" : ""}
            {row.rateDeltaPct.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  );
}

function SalesVelocityBarTooltip({
  active,
  payload,
  label,
  presentation,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: { label: string; fact: number; plan: number; deviation: number } }>;
  label?: string;
  presentation: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload.map((item) => item?.payload).find(
    (p): p is { label: string; fact: number; plan: number; deviation: number } =>
      p != null &&
      typeof (p as { fact?: unknown }).fact === "number" &&
      typeof (p as { plan?: unknown }).plan === "number",
  );
  if (!row) return null;
  const dev = row.deviation ?? row.fact - row.plan;
  const shell =
    presentation
      ? "max-w-xs rounded-lg border border-sky-500/30 bg-[#0f172a]/95 p-3 text-xs text-slate-200 shadow-[0_0_20px_rgba(56,189,248,0.14)]"
      : "max-w-xs rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-lg";
  return (
    <div className={shell}>
      <div className={`text-[11px] font-bold uppercase tracking-wide ${presentation ? "text-sky-200/90" : "text-sky-800"}`}>Факт vs План</div>
      <div className={`mt-1 font-semibold ${presentation ? "text-slate-100" : "text-slate-900"}`}>{label ?? row.label}</div>
      <div className="mt-2 space-y-1.5 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Факт</span>
          <span className="font-medium">{numFmt.format(row.fact)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>План</span>
          <span className="font-medium">{numFmt.format(row.plan)}</span>
        </div>
        <div
          className={`flex justify-between gap-4 border-t pt-1.5 ${presentation ? "border-slate-500/30" : "border-slate-200"}`}
        >
          <span className={presentation ? "text-slate-400" : "text-slate-500"}>Отклонение</span>
          <span
            className={`font-semibold ${
              dev > 0 ? (presentation ? "text-emerald-300" : "text-emerald-700") : dev < 0 ? (presentation ? "text-rose-300" : "text-rose-700") : presentation ? "text-slate-300" : "text-slate-600"
            }`}
          >
            {dev >= 0 ? "+" : "−"}
            {numFmt.format(Math.abs(dev))}
          </span>
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

type KpiCardTone = "green" | "yellow" | "red";
function miniLineColorByTone(tone: KpiCardTone, presentation: boolean): string {
  if (tone === "green") return presentation ? "#d1fae5" : "#047857";
  if (tone === "yellow") return presentation ? "#fffbeb" : "#b45309";
  return presentation ? "#ffe4e6" : "#b91c1c";
}

type KpiDashboardItem = {
  key: string;
  title: string;
  value: ReactNode;
  sub: string;
  description: string;
  tone: KpiCardTone;
  surfaceTone?: KpiCardTone;
  hideRadialOverlay?: boolean;
  hover: string;
  sparkline?: number[];
  sparkBars?: number[];
  sparkLine?: number[];
  sparkMode?: "combo" | "bars" | "line";
  sparkBarsFromBottom?: boolean;
  sparkHideBaseline?: boolean;
  sparkBaselineStroke?: string;
  sparkBaselineDasharray?: string;
  sparkBaselineWidth?: number;
  sparkLineStroke?: string;
  sparkTone?: KpiCardTone;
  tooltip: {
    metricMeaning: string;
    formula: string;
    fact: string;
    plan: string;
    deviation: string;
    miniChart: string;
    conclusion: string;
  };
};

function KpiDashboard({
  presentation,
  items,
  className = "",
}: {
  presentation: boolean;
  items: KpiDashboardItem[];
  className?: string;
}) {
  const toneStyles = (tone: KpiCardTone) =>
    tone === "green"
      ? {
          value: presentation ? "text-emerald-300" : "text-emerald-700",
          miniBar: presentation ? "#34d399" : "#10b981",
          miniLine: presentation ? "#d1fae5" : "#047857",
          glow: presentation ? "shadow-[0_14px_36px_rgba(16,185,129,0.26)]" : "shadow-[0_12px_30px_rgba(16,185,129,0.18)]",
          insetGlow: presentation ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(16,185,129,0.15)]" : "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(16,185,129,0.10)]",
          radial:
            presentation
              ? "radial-gradient(circle at 18% 15%, rgba(74,222,128,0.28), transparent 52%)"
              : "radial-gradient(circle at 18% 15%, rgba(74,222,128,0.24), transparent 55%)",
          card: presentation
            ? "bg-gradient-to-br from-emerald-900/42 via-slate-900/38 to-slate-900/60"
            : "bg-gradient-to-br from-emerald-100/85 via-white to-emerald-50/70",
        }
      : tone === "yellow"
        ? {
            value: presentation ? "text-amber-300" : "text-amber-700",
            miniBar: presentation ? "#fbbf24" : "#f59e0b",
            miniLine: presentation ? "#fffbeb" : "#b45309",
            glow: presentation ? "shadow-[0_14px_36px_rgba(245,158,11,0.24)]" : "shadow-[0_12px_30px_rgba(245,158,11,0.16)]",
            insetGlow: presentation ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(245,158,11,0.14)]" : "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(245,158,11,0.10)]",
            radial:
              presentation
                ? "radial-gradient(circle at 18% 15%, rgba(251,191,36,0.30), transparent 52%)"
                : "radial-gradient(circle at 18% 15%, rgba(251,191,36,0.26), transparent 55%)",
            card: presentation
              ? "bg-gradient-to-br from-amber-900/40 via-slate-900/38 to-slate-900/60"
              : "bg-gradient-to-br from-amber-100/85 via-white to-amber-50/70",
          }
        : {
            value: presentation ? "text-red-300" : "text-red-700",
            miniBar: presentation ? "#fb7185" : "#ef4444",
            miniLine: presentation ? "#ffe4e6" : "#b91c1c",
            glow: presentation ? "shadow-[0_14px_36px_rgba(239,68,68,0.26)]" : "shadow-[0_12px_30px_rgba(239,68,68,0.16)]",
            insetGlow: presentation ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_36px_rgba(239,68,68,0.14)]" : "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_0_26px_rgba(239,68,68,0.10)]",
            radial:
              presentation
                ? "radial-gradient(circle at 18% 15%, rgba(251,113,133,0.30), transparent 52%)"
                : "radial-gradient(circle at 18% 15%, rgba(251,113,133,0.24), transparent 55%)",
            card: presentation
              ? "bg-gradient-to-br from-red-900/40 via-slate-900/38 to-slate-900/60"
              : "bg-gradient-to-br from-red-100/85 via-white to-red-50/70",
          };

  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 ${className}`}>
      {items.map((kpi) => {
        const valueStyle = toneStyles(kpi.tone);
        const surfaceStyle = toneStyles(kpi.surfaceTone ?? kpi.tone);
        const sparkStyle = toneStyles(kpi.sparkTone ?? kpi.tone);
        const rawBars = kpi.sparkBars ?? kpi.sparkline ?? [];
        const rawLine = kpi.sparkLine ?? kpi.sparkline ?? [];
        const mode = kpi.sparkMode ?? "combo";
        const isBarsOnly = mode === "bars";
        const isLineOnly = mode === "line";
        const barsFromBottom = isBarsOnly && !!kpi.sparkBarsFromBottom;
        const pairCount = isBarsOnly
          ? rawLine.length > 0
            ? Math.min(rawBars.length, rawLine.length)
            : rawBars.length
          : Math.min(rawBars.length, rawLine.length);
        const bars = rawBars.slice(rawBars.length - pairCount);
        const line = rawLine.slice(rawLine.length - pairCount);
        const hasSpark = pairCount >= 2;
        const barMin = hasSpark ? Math.min(...bars) : 0;
        const barMax = hasSpark ? Math.max(...bars) : 1;
        const barRange = Math.max(1e-6, barMax - barMin);
        const lineMin = line.length ? Math.min(...line) : 0;
        const lineMax = line.length ? Math.max(...line) : 1;
        const lineRange = Math.max(1e-6, lineMax - lineMin);
        const w = 172;
        const h = isBarsOnly && !barsFromBottom ? 56 : 40;
        const absMax = Math.max(1, Math.abs(barMin), Math.abs(barMax));
        const zeroY = isBarsOnly ? (barsFromBottom ? h : h * 0.5) : h - ((0 - lineMin) / lineRange) * h;
        const n = pairCount;
        const gap = isBarsOnly ? 6 : 4;
        const barW = n > 0 ? (w - gap * Math.max(0, n - 1)) / Math.max(1, n) : w;
        const rx = Math.min(6, Math.max(0, barW / 2));
        const pts = hasSpark && line.length
          ? line.map((v, i) => {
              const x = i * (barW + gap) + barW / 2;
              const y = isBarsOnly
                ? barsFromBottom
                  ? h - ((v - barMin) / barRange) * h
                  : v >= 0
                  ? zeroY - (Math.abs(v) / absMax) * (h / 2)
                  : zeroY + (Math.abs(v) / absMax) * (h / 2)
                : h - ((v - lineMin) / lineRange) * h;
              return { x, y };
            })
          : [];
        const linePath =
          pts.length >= 2
            ? (() => {
                let d = `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
                for (let i = 1; i < pts.length; i++) {
                  const p0 = pts[i - 1]!;
                  const p1 = pts[i]!;
                  const mx = (p0.x + p1.x) / 2;
                  const my = (p0.y + p1.y) / 2;
                  d += ` Q ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
                }
                const last = pts[pts.length - 1]!;
                d += ` T ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
                return d;
              })()
            : "";
        const lastPt = pts.length ? pts[pts.length - 1]! : null;
        return (
          <div key={kpi.key} className={`group relative overflow-visible rounded-xl ${surfaceStyle.card} ${surfaceStyle.glow} ${surfaceStyle.insetGlow}`} title={kpi.hover}>
            {!kpi.hideRadialOverlay ? (
              <div className="pointer-events-none absolute inset-0" style={{ background: surfaceStyle.radial }} />
            ) : null}
            <div className="relative p-3 sm:p-3.5">
              <div className={`text-[11px] uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-500"}`}>{kpi.title}</div>
              {typeof kpi.value === "string" ? (
                <div className={`mt-1.5 text-2xl font-extrabold leading-none tabular-nums sm:text-[30px] ${valueStyle.value}`}>{kpi.value}</div>
              ) : (
                <div className={`mt-1.5 ${valueStyle.value}`}>{kpi.value}</div>
              )}
              {hasSpark ? (
                <div className="mt-2">
                  <svg
                    viewBox={`0 0 ${w} ${h}`}
                    className={`${isBarsOnly && !barsFromBottom ? "h-14" : "h-10"} w-full overflow-visible`}
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    {isBarsOnly && !kpi.sparkHideBaseline ? (
                      <line
                        x1={0}
                        y1={zeroY}
                        x2={w}
                        y2={zeroY}
                        stroke={kpi.sparkBaselineStroke ?? (presentation ? "rgba(148,163,184,0.55)" : "rgba(71,85,105,0.45)")}
                        strokeDasharray={kpi.sparkBaselineDasharray}
                        strokeWidth={kpi.sparkBaselineWidth ?? 1}
                      />
                    ) : null}
                    {/* bars: background layer */}
                    {!isLineOnly
                      ? bars.map((_, i) => {
                          const x = i * (barW + gap);
                          return (
                            <rect
                              key={`bg-${kpi.key}-${i}`}
                              x={x}
                              y={0}
                              width={barW}
                              height={h}
                              rx={rx}
                              fill={sparkStyle.miniBar}
                              opacity={isBarsOnly ? 0.12 : 0.2}
                            />
                          );
                        })
                      : null}
                    {/* bars: main layer */}
                    {!isLineOnly
                      ? bars.map((v, i) => {
                          const x = i * (barW + gap);
                          const hh = isBarsOnly
                            ? barsFromBottom
                              ? ((v - barMin) / barRange) * h
                              : (Math.abs(v) / absMax) * (h / 2)
                            : ((v - barMin) / barRange) * h;
                          const y = isBarsOnly ? (barsFromBottom ? h - hh : (v >= 0 ? zeroY - hh : zeroY)) : h - hh;
                          const neutralBand = absMax * 0.06;
                          const toneForBar = isBarsOnly
                            ? Math.abs(v) <= neutralBand
                              ? "neutral"
                              : v > 0
                                ? "positive"
                                : "negative"
                            : null;
                          const fill = isBarsOnly
                            ? toneForBar === "positive"
                              ? "rgba(52, 211, 153, 0.82)"
                              : toneForBar === "negative"
                                ? "rgba(251, 113, 133, 0.82)"
                                : "rgba(148, 163, 184, 0.62)"
                            : sparkStyle.miniBar;
                          const isLastBar = i === bars.length - 1;
                          const scaleBoost = isBarsOnly && isLastBar ? 1.06 : 1;
                          const activeGlow =
                            toneForBar === "positive"
                              ? "rgba(52, 211, 153, 0.38)"
                              : toneForBar === "negative"
                                ? "rgba(251, 113, 133, 0.4)"
                                : "rgba(148, 163, 184, 0.28)";
                          const activeGlowWide =
                            toneForBar === "positive"
                              ? "rgba(52, 211, 153, 0.15)"
                              : toneForBar === "negative"
                                ? "rgba(251, 113, 133, 0.15)"
                                : "rgba(148, 163, 184, 0.12)";
                          const glowFilter = isBarsOnly && isLastBar
                            ? `drop-shadow(0 0 12px ${activeGlow}) drop-shadow(0 0 24px ${activeGlowWide})`
                            : undefined;
                          return (
                            <rect
                              key={`main-${kpi.key}-${i}`}
                              x={x}
                              y={y}
                              width={barW}
                              height={hh}
                              rx={rx}
                              fill={fill}
                              opacity={isBarsOnly ? (isLastBar ? 0.98 : 0.5) : 0.7}
                              style={
                                isBarsOnly
                                  ? {
                                      transformBox: "fill-box",
                                      transformOrigin: "center",
                                      transform: `scale(${scaleBoost})`,
                                      filter: glowFilter,
                                    }
                                  : undefined
                              }
                            />
                          );
                        })
                      : null}
                    {/* line overlay */}
                    {linePath ? (
                      <path
                        d={linePath}
                        fill="none"
                        stroke={kpi.sparkLineStroke ?? sparkStyle.miniLine}
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null}
                    {lastPt ? (
                      <>
                        <circle cx={lastPt.x} cy={lastPt.y} r="2.75" fill={kpi.sparkLineStroke ?? sparkStyle.miniLine} />
                        <circle cx={lastPt.x} cy={lastPt.y} r="5.5" fill={kpi.sparkLineStroke ?? sparkStyle.miniLine} opacity={0.14} />
                      </>
                    ) : null}
                  </svg>
                </div>
              ) : null}
              <div className={`mt-1 text-[11px] ${presentation ? "text-slate-400" : "text-slate-600"}`}>{kpi.sub}</div>
              <p
                className={`mt-2 text-[12px] leading-tight ${presentation ? "text-slate-300/70" : "text-slate-700/70"}`}
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {kpi.description}
              </p>
            </div>
            <div
              className={`pointer-events-none absolute left-2 right-2 top-[calc(100%+8px)] z-20 rounded-xl px-3 py-3 opacity-0 backdrop-blur-md transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 sm:left-auto sm:right-0 sm:w-[320px] ${
                presentation
                  ? "border border-slate-500/45 bg-[#0b1220]/90 text-slate-200 shadow-[0_16px_40px_rgba(15,23,42,0.65)]"
                  : "border border-slate-200/80 bg-slate-900/92 text-slate-100 shadow-[0_14px_34px_rgba(15,23,42,0.28)]"
              }`}
            >
              <div className="text-[12px] font-semibold leading-tight">{kpi.title}</div>
              <div className="mt-1 text-[12px] leading-snug text-slate-300">
                {kpi.tooltip.metricMeaning}
              </div>
              <div className="mt-1 text-[11px] leading-snug text-slate-400">{kpi.tooltip.formula}</div>

              <div className="mt-2 space-y-1 text-[12px] tabular-nums">
                <div className="flex justify-between gap-3"><span className="text-slate-400">Факт</span><span>{kpi.tooltip.fact}</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-400">План</span><span>{kpi.tooltip.plan}</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-400">Отклонение</span><span>{kpi.tooltip.deviation}</span></div>
              </div>

              <div className="mt-2 text-[11px] leading-snug text-slate-300">
                Mini chart: {kpi.tooltip.miniChart}
              </div>
              <div className="mt-1 text-[12px] leading-snug text-slate-100">
                Вывод: {kpi.tooltip.conclusion}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
};

export function SalesPlanPanel({ presentation, period, objectId, dealTypeId }: Props) {
  const isPresentationMode = presentation;
  const card = presentation ? CARD : CARD_EDIT;
  const h4 = presentation ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900";
  const sub = presentation ? "text-[11px] text-slate-500" : "text-[11px] text-slate-600";
  const [chartMetric, setChartMetric] = useState<ChartMetric>("revenue");
  const [mode, setMode] = useState<PlanMode>("view");
  const [scenario, setScenario] = useState<PlanScenario>("realistic");
  const salesVelocityUid = useId().replace(/:/g, "");

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
  const revenueLineData = useMemo(() => seriesToLineData(seriesPoints, "revenue"), [seriesPoints]);

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
  const requiredPerPeriod = remainingPeriods > 0 ? Math.max(0, (planEndDeals - currentFactCum) / remainingPeriods) : null;
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
  const riskExecutionPct = Math.min(100, Math.max(0, 100 - forecastPercentAdjusted));
  const dealsExecutionPct = currentPlanCum > 0 ? (currentFactCum / currentPlanCum) * 100 : 0;

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
  const cumulativeExecTone: "green" | "yellow" | "red" =
    forecastPercentAdjusted >= 100 ? "green" : forecastPercentAdjusted >= 90 ? "yellow" : "red";
  const monthExecTone: "green" | "yellow" | "red" = monthExecPct >= 100 ? "green" : monthExecPct >= 95 ? "yellow" : "red";
  const monthDevTone: "green" | "yellow" | "red" = monthDeviationDeals >= 0 ? "green" : monthDeviationDeals >= -5 ? "yellow" : "red";
  const cumulativeDevTone: "green" | "yellow" | "red" = currentDeviation >= 0 ? "green" : currentDeviation >= -5 ? "yellow" : "red";
  const riskTone: "green" | "yellow" | "red" = riskExecutionPct <= 10 ? "green" : riskExecutionPct <= 25 ? "yellow" : "red";
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
  const cumulativeLineTone: KpiCardTone = (() => {
    const n = cumulativeDeviationSeries.length;
    if (n < 2) return "yellow";
    const last = cumulativeDeviationSeries[n - 1] ?? 0;
    const prev = cumulativeDeviationSeries[n - 2] ?? 0;
    if (last < 0 && last < prev) return "red";
    return "yellow";
  })();
  const cumulativeDeviationHeader = `${currentDeviation > 0 ? "+" : currentDeviation < 0 ? "−" : ""}${numFmt.format(Math.abs(currentDeviation))} / ${cumulativeDeviationRevenue > 0 ? "+" : cumulativeDeviationRevenue < 0 ? "−" : ""}${numFmt.format(Math.round(Math.abs(cumulativeDeviationRevenue) / 1_000_000))} млн`;
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
    const tempoPct = planPerMonth > 0 ? (delta / planPerMonth) * 100 : 0;
    const velocityComparisonMax = Math.max(planPerMonth, actualPerMonth, 1);
    let tone: TrafficStatus;
    if (delta >= 0) {
      tone = "green";
    } else if (planPerMonth > 0 && delta >= -0.1 * planPerMonth) {
      tone = "yellow";
    } else {
      tone = "red";
    }
    const tempoDeltaLabel =
      tempoPct >= 0 ? `+${tempoPct.toFixed(1)}% к плановому темпу` : `−${Math.abs(tempoPct).toFixed(1)}% к плановому темпу`;
    return {
      totalMonths,
      monthsPassed,
      totalPlan,
      currentFact,
      monthFact,
      planPerMonth,
      actualPerMonth,
      delta,
      tempoPct,
      tempoDeltaLabel,
      velocityComparisonMax,
      tone,
    };
  }, [monthlyPlanExecutionData, currentMonthIdx]);
  const velocityKpiCards = [
    { key: "plan-month", title: "План на месяц", value: velocityMetrics.planPerMonth, tone: presentation ? "text-slate-100" : "text-slate-900" },
    { key: "fact-month", title: "Факт за месяц", value: velocityMetrics.monthFact, tone: presentation ? "text-slate-100" : "text-slate-900" },
    { key: "plan-rate", title: "Плановый темп", value: velocityMetrics.planPerMonth, tone: presentation ? "text-slate-100" : "text-slate-900" },
    {
      key: "actual-rate",
      title: "Фактический темп",
      value: velocityMetrics.actualPerMonth,
      tone:
        velocityMetrics.tone === "green"
          ? presentation
            ? "text-emerald-300"
            : "text-emerald-700"
          : velocityMetrics.tone === "yellow"
            ? presentation
              ? "text-amber-300"
              : "text-amber-700"
            : presentation
              ? "text-red-300"
              : "text-red-700",
    },
  ];
  const velocityLineData = useMemo((): SalesVelocityLineRow[] => {
    const totalPlan = monthlyPlanExecutionData.reduce((sum, r) => sum + r.plan, 0);
    const totalMonths = Math.max(1, monthlyPlanExecutionData.length);
    const plannedRate = totalPlan / totalMonths;
    let factRun = 0;
    return monthlyPlanExecutionData.map((r, idx) => {
      factRun += r.fact;
      const passed = idx + 1;
      const actualRate = factRun / passed;
      const rateDelta = actualRate - plannedRate;
      const rateDeltaPct = plannedRate > 0 ? (rateDelta / plannedRate) * 100 : 0;
      return {
        label: r.label,
        plannedRate,
        actualRate,
        rateDelta,
        rateDeltaPct,
      };
    });
  }, [monthlyPlanExecutionData]);
  const velocityMonthlyBarsData = useMemo(
    () =>
      monthlyPlanExecutionData.map((r) => ({
        periodKey: r.periodKey,
        label: r.label,
        fact: r.fact,
        plan: r.plan,
        deviation: r.fact - r.plan,
      })),
    [monthlyPlanExecutionData],
  );
  const velocityFactPlanWorstIndex = useMemo(() => {
    if (velocityMonthlyBarsData.length === 0) return -1;
    let worst = 0;
    let minDev = velocityMonthlyBarsData[0]!.deviation;
    velocityMonthlyBarsData.forEach((row, i) => {
      if (row.deviation < minDev) {
        minDev = row.deviation;
        worst = i;
      }
    });
    return worst;
  }, [velocityMonthlyBarsData]);

  function velocityFactPlanBarFill(entry: { fact: number; plan: number }): string {
    const { fact, plan } = entry;
    if (plan <= 0) {
      return fact >= 0 ? `url(#${salesVelocityUid}-barGreen)` : `url(#${salesVelocityUid}-barRed)`;
    }
    if (fact >= plan) return `url(#${salesVelocityUid}-barGreen)`;
    if (fact >= plan * 0.9) return `url(#${salesVelocityUid}-barYellow)`;
    return `url(#${salesVelocityUid}-barRed)`;
  }
  const dynamicsKpiItems: KpiDashboardItem[] = [
    {
      key: "cum-exec",
      title: "Выполнение плана (накопительно)",
      value: `${rev.percentComplete.toFixed(1)}%`,
      sub: `Прогноз к концу: ${forecastPercentAdjusted.toFixed(1)}%`,
      description:
        forecastPercentAdjusted < 90
          ? `Основное отставание дает ${lagSegment}; заметный недобор начался с ${firstLagMonth}.`
          : forecastPercentAdjusted < 100
            ? `Риск связан с ${lagSegment}, но ${trendShort} и просадка частично компенсируется.`
            : `План закрывается за счет ускорения в последних месяцах; ${lagSegment} уже не критичен.`,
      tone: cumulativeExecTone,
      hover: `План: ${compactRub(rev.planCumulative)} | Факт: ${compactRub(rev.factCumulative)} | Отклонение: ${rev.deviationCumulative >= 0 ? "+" : "−"}${compactRub(Math.abs(rev.deviationCumulative))}`,
      sparkline: cumulativeExecSeriesPct,
      tooltip: {
        metricMeaning: "Показывает, какую долю накопительного плана уже закрыли по факту.",
        formula: "Формула: накопительный факт / накопительный план × 100%.",
        fact: `${compactRub(rev.factCumulative)}`,
        plan: `${compactRub(rev.planCumulative)}`,
        deviation: `${rev.deviationCumulative >= 0 ? "+" : "−"}${compactRub(Math.abs(rev.deviationCumulative))}`,
        miniChart: "Столбцы и линия показывают динамику % выполнения по месяцам; точка — последний месяц.",
        conclusion: forecastPercentAdjusted < 100 ? `Риск недовыполнения связан с ${lagSegment}.` : "Текущая динамика позволяет закрыть план.",
      },
    },
    {
      key: "month-exec",
      title: "Выполнение за месяц",
      value: `${monthExecPct.toFixed(1)}%`,
      sub: `${currentMonthPoint?.label ?? "Текущий месяц"} · факт/план`,
      description:
        monthExecPct < 90
          ? `Месяц недовыполнен: слабее всего ${lagSegment}, а точка спада — ${worstLagMonth}.`
          : monthExecPct < 100
            ? `Почти в плане; отрыв дают ${lagSegment}, но ${trendShort}.`
            : `Месяц компенсирует прошлый недобор, особенно в сегменте ${weakSegment}.`,
      tone: monthExecTone,
      hover: `План: ${numFmt.format(monthPlanDeals)} шт | Факт: ${numFmt.format(monthFactDeals)} шт | Отклонение: ${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт`,
      sparkBars: monthlyExecPctSeries,
      sparkLine: monthlyExecPctSeries,
      tooltip: {
        metricMeaning: "Показывает выполнение плана именно за текущий месяц.",
        formula: "Формула: факт месяца / план месяца × 100%.",
        fact: `${numFmt.format(monthFactDeals)} шт`,
        plan: `${numFmt.format(monthPlanDeals)} шт`,
        deviation: `${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт`,
        miniChart: "Столбцы — % выполнения по последним месяцам, линия — сглаженный тренд %, точка — текущее значение.",
        conclusion: monthExecPct < 100 ? `Недобор формируется в ${lagSegment}.` : "Месяц отрабатывает план с запасом.",
      },
    },
    {
      key: "month-dev",
      title: "Отклонение за месяц",
      value: `${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт / ${monthDeviationRevenue >= 0 ? "+" : "−"}${compactRub(Math.abs(monthDeviationRevenue))}`,
      sub: `${currentMonthPoint?.label ?? "Текущий месяц"} · к плану`,
      description:
        monthDeviationDeals < 0
          ? `Минус месяца формируют ${lagSegment}; худший период — ${worstLagMonth}.`
          : `Плюс месяца частично компенсирует провал с ${firstLagMonth}, динамика: ${trendShort}.`,
      tone: monthDevTone,
      hover: `План: ${numFmt.format(monthPlanDeals)} шт, ${compactRub(monthPlanRevenue)} | Факт: ${numFmt.format(monthFactDeals)} шт, ${compactRub(monthFactRevenue)} | Отклонение: ${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт, ${monthDeviationRevenue >= 0 ? "+" : "−"}${compactRub(Math.abs(monthDeviationRevenue))}`,
      sparkBars: monthlyDeviationSeries,
      sparkMode: "bars",
      sparkBaselineStroke: miniLineColorByTone(monthExecTone, presentation),
      sparkBaselineDasharray: "6 4",
      sparkBaselineWidth: 1.75,
      tooltip: {
        metricMeaning: "Показывает отклонение текущего месяца в штуках и выручке.",
        formula: "Формула: факт месяца − план месяца.",
        fact: `${numFmt.format(monthFactDeals)} шт / ${compactRub(monthFactRevenue)}`,
        plan: `${numFmt.format(monthPlanDeals)} шт / ${compactRub(monthPlanRevenue)}`,
        deviation: `${monthDeviationDeals >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviationDeals))} шт / ${monthDeviationRevenue >= 0 ? "+" : "−"}${compactRub(Math.abs(monthDeviationRevenue))}`,
        miniChart: "Столбцы вверх/вниз показывают отклонение по месяцам; зеленый — плюс, красный — минус.",
        conclusion: monthDeviationDeals < 0 ? `Минус месяца усиливает отставание, особенно в ${lagSegment}.` : "Плюс месяца частично компенсирует предыдущий недобор.",
      },
    },
    {
      key: "cum-dev",
      title: "Отклонение накопительное",
      value: cumulativeDeviationHeader,
      sub: "К 31 мар. 2026",
      description:
        currentDeviation < 0
          ? "Накопленное отставание растёт с окт. 2025; ключевой источник — квартиры."
          : `Накопительное отклонение сокращается; ключевой драйвер — ${weakSegment}.`,
      tone: cumulativeDevTone,
      hover: `План: ${numFmt.format(currentPlanCum)} шт | Факт: ${numFmt.format(currentFactCum)} шт | Отклонение: ${currentDeviation >= 0 ? "+" : "−"}${numFmt.format(Math.abs(currentDeviation))} шт`,
      sparkBars: cumulativeDeviationSeries,
      sparkLine: cumulativeDeviationSeries,
      sparkMode: "bars",
      sparkBarsFromBottom: true,
      sparkTone: currentDeviation < 0 ? "red" : cumulativeLineTone,
      surfaceTone: monthExecTone,
      hideRadialOverlay: true,
      sparkBaselineStroke: "rgba(255,255,255,0.8)",
      sparkBaselineDasharray: "6 4",
      sparkBaselineWidth: 2,
      sparkLineStroke: "rgba(255,255,255,0.92)",
      tooltip: {
        metricMeaning: "Показывает суммарное отклонение от плана к текущей дате.",
        formula: "Формула: накопительный факт − накопительный план.",
        fact: `${numFmt.format(currentFactCum)} шт / ${compactRub(rev.factCumulative)}`,
        plan: `${numFmt.format(currentPlanCum)} шт / ${compactRub(rev.planCumulative)}`,
        deviation: `${currentDeviation >= 0 ? "+" : "−"}${numFmt.format(Math.abs(currentDeviation))} шт / ${cumulativeDeviationRevenue >= 0 ? "+" : "−"}${compactRub(Math.abs(cumulativeDeviationRevenue))}`,
        miniChart: "Линия показывает накопительное отклонение по месяцам; выделенная точка — текущее накопленное значение.",
        conclusion: currentDeviation < 0 ? `Отставание накоплено с ${firstLagMonth}; ключевой вклад — ${lagSegment}.` : "Накопительное отклонение компенсируется текущим ростом.",
      },
    },
  ];

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

      {/* B. Dynamics KPI dashboard */}
      <KpiDashboard presentation={presentation} items={dynamicsKpiItems} className="mb-7" />

      {/* Sales Velocity */}
      <div className={card}>
        <div className="mb-3 flex flex-col gap-2">
          <h4 className={h4}>Темп продаж</h4>
          <p className={sub}>Сравнение фактического и планового темпа по сделкам и сигнал для решений.</p>
        </div>

        <div className="mt-1 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div
            className={
              presentation
                ? "rounded-xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                : "rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm"
            }
          >
            <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${presentation ? "text-cyan-200/80" : "text-slate-600"}`}>Темп по месяцам</div>
            <div className="h-[220px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={velocityLineData} margin={{ top: 12, right: 10, left: 0, bottom: 10 }}>
                  <defs>
                    <linearGradient id={`${salesVelocityUid}-actualStroke`} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="48%" stopColor="#fbbf24" />
                      <stop offset="100%" stopColor="#fb7185" />
                    </linearGradient>
                    <linearGradient id={`${salesVelocityUid}-actualArea`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.32} />
                      <stop offset="42%" stopColor="#fbbf24" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#fb7185" stopOpacity={0.03} />
                    </linearGradient>
                    <filter id={`${salesVelocityUid}-actualGlow`} x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="2.6" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id={`${salesVelocityUid}-lastDotGlow`} x="-120%" y="-120%" width="340%" height="340%">
                      <feGaussianBlur stdDeviation="3.5" result="b" />
                      <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} />
                  <YAxis tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={40} tickFormatter={yTickDeals} />
                  <Tooltip content={<SalesVelocityLineTooltip presentation={presentation} />} />
                  <Area
                    type="monotone"
                    dataKey="actualRate"
                    stroke="none"
                    fill={`url(#${salesVelocityUid}-actualArea)`}
                    fillOpacity={1}
                    baseLine={0}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="plannedRate"
                    name="Плановый темп"
                    stroke={presentation ? "rgba(248,250,252,0.92)" : "#64748b"}
                    strokeWidth={1.85}
                    strokeDasharray="6 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="actualRate"
                    name="Фактический темп"
                    stroke={`url(#${salesVelocityUid}-actualStroke)`}
                    strokeWidth={2.85}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={(dotProps: { cx?: number; cy?: number; index?: number }) => {
                      const { cx, cy, index } = dotProps;
                      if (cx == null || cy == null || index == null) return false;
                      if (index !== velocityLineData.length - 1) return false;
                      return (
                        <g>
                          <circle cx={cx} cy={cy} r={11} fill="#38bdf8" fillOpacity={0.22} filter={`url(#${salesVelocityUid}-lastDotGlow)`} />
                          <circle cx={cx} cy={cy} r={6} fill="#fefce8" stroke="#38bdf8" strokeWidth={2.2} />
                        </g>
                      );
                    }}
                    isAnimationActive={false}
                    style={{ filter: `url(#${salesVelocityUid}-actualGlow)` }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            className={
              presentation
                ? "rounded-xl border border-amber-500/15 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                : "rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm"
            }
          >
            <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${presentation ? "text-amber-200/75" : "text-slate-600"}`}>Факт по месяцам vs план</div>
            <div className="flex min-h-0 flex-col gap-2">
              <div className="h-[228px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={velocityMonthlyBarsData}
                    margin={{ top: 6, right: 10, left: 0, bottom: 2 }}
                    barGap="-100%"
                    barCategoryGap="14%"
                  >
                    <defs>
                      <linearGradient id={`${salesVelocityUid}-barGreen`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#bbf7d0" />
                        <stop offset="40%" stopColor="#4ade80" />
                        <stop offset="100%" stopColor="#15803d" />
                      </linearGradient>
                      <linearGradient id={`${salesVelocityUid}-barYellow`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fef9c3" />
                        <stop offset="45%" stopColor="#facc15" />
                        <stop offset="100%" stopColor="#a16207" />
                      </linearGradient>
                      <linearGradient id={`${salesVelocityUid}-barRed`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fecdd3" />
                        <stop offset="50%" stopColor="#f87171" />
                        <stop offset="100%" stopColor="#b91c1c" />
                      </linearGradient>
                      <filter id={`${salesVelocityUid}-barSoftGlow`} x="-40%" y="-40%" width="180%" height="180%">
                        <feGaussianBlur stdDeviation="2.4" result="bg" />
                        <feMerge>
                          <feMergeNode in="bg" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 9 }} axisLine={{ stroke: gridColor }} tickLine={false} />
                    <YAxis tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} width={40} tickFormatter={yTickDeals} />
                    <Tooltip content={<SalesVelocityBarTooltip presentation={presentation} />} />
                    <Bar
                      dataKey="plan"
                      name="План"
                      fill={presentation ? "rgba(255,255,255,0.42)" : "rgba(71,85,105,0.4)"}
                      stroke={presentation ? "rgba(255,255,255,0.28)" : "rgba(100,116,139,0.45)"}
                      strokeWidth={0.9}
                      maxBarSize={36}
                      radius={[8, 8, 2, 2]}
                      isAnimationActive={false}
                      legendType="rect"
                    />
                    <Bar
                      dataKey="fact"
                      name="Факт"
                      fill={`url(#${salesVelocityUid}-barYellow)`}
                      maxBarSize={24}
                      radius={[7, 7, 2, 2]}
                      style={{ filter: `url(#${salesVelocityUid}-barSoftGlow)` }}
                      legendType="rect"
                    >
                      {velocityMonthlyBarsData.map((entry, index) => {
                        const isWorst = index === velocityFactPlanWorstIndex && velocityFactPlanWorstIndex >= 0;
                        return (
                          <Cell
                            key={`velocity-fact-${entry.label}-${index}`}
                            fill={velocityFactPlanBarFill(entry)}
                            stroke={
                              isWorst
                                ? presentation
                                  ? "#fda4af"
                                  : "#e11d48"
                                : presentation
                                  ? "rgba(255,255,255,0.38)"
                                  : "rgba(248,250,252,0.65)"
                            }
                            strokeWidth={isWorst ? 2.75 : 1.1}
                            style={
                              isWorst
                                ? { filter: "drop-shadow(0 0 10px rgba(244,63,94,0.75))" }
                                : undefined
                            }
                          />
                        );
                      })}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div
                role="group"
                aria-label="Легенда графика: факт и план"
                className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[10px] font-medium leading-tight ${presentation ? "text-slate-400" : "text-slate-600"}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-4 shrink-0 rounded-sm shadow-sm"
                    style={{
                      background: presentation
                        ? "linear-gradient(180deg, #4ade80 0%, #facc15 55%, #f87171 100%)"
                        : "linear-gradient(180deg, #16a34a 0%, #ca8a04 55%, #dc2626 100%)",
                    }}
                  />
                  <span>Факт</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-3 w-4 shrink-0 rounded-sm border ${presentation ? "border-white/25 bg-white/[0.42]" : "border-slate-400/50 bg-slate-500/40"}`}
                  />
                  <span>План</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <div
            className={
              presentation
                ? "rounded-xl border border-slate-500/30 bg-gradient-to-br from-slate-900/75 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                : "rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/90 p-3"
            }
          >
            <div className={sub}>Сравнение темпов</div>
            <div className="mt-2 space-y-3">
              <div>
                <div className={`mb-1 flex items-center justify-between text-xs ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                  <span>Фактический</span>
                  <span className="tabular-nums">{dec1Fmt.format(velocityMetrics.actualPerMonth)}</span>
                </div>
                <div className={`h-2.5 w-full overflow-hidden rounded-full ${presentation ? "bg-slate-700/50" : "bg-slate-200/90"}`}>
                  <div
                    className="h-2.5 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (velocityMetrics.actualPerMonth / velocityMetrics.velocityComparisonMax) * 100)}%`,
                      background:
                        velocityMetrics.delta >= 0
                          ? "linear-gradient(90deg, #047857 0%, #10b981 42%, #6ee7b7 100%)"
                          : "linear-gradient(90deg, #7f1d1d 0%, #ef4444 48%, #fb7185 100%)",
                      boxShadow:
                        velocityMetrics.delta >= 0
                          ? "0 0 14px rgba(52,211,153,0.45), 0 0 4px rgba(16,185,129,0.35)"
                          : "0 0 16px rgba(248,113,113,0.5), 0 0 4px rgba(239,68,68,0.35)",
                    }}
                  />
                </div>
              </div>
              <div>
                <div className={`mb-1 flex items-center justify-between text-xs ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                  <span>Плановый</span>
                  <span className="tabular-nums">{dec1Fmt.format(velocityMetrics.planPerMonth)}</span>
                </div>
                <div className={`h-2.5 w-full overflow-hidden rounded-full ${presentation ? "bg-slate-700/50" : "bg-slate-200/90"}`}>
                  <div
                    className="h-2.5 rounded-full"
                    style={{
                      width: `${Math.min(100, (velocityMetrics.planPerMonth / velocityMetrics.velocityComparisonMax) * 100)}%`,
                      background: presentation
                        ? "linear-gradient(90deg, rgba(226,232,240,0.35) 0%, rgba(248,250,252,0.75) 55%, rgba(203,213,225,0.9) 100%)"
                        : "linear-gradient(90deg, #cbd5e1 0%, #94a3b8 100%)",
                      boxShadow: presentation ? "0 0 10px rgba(248,250,252,0.12)" : "0 0 6px rgba(148,163,184,0.25)",
                    }}
                  />
                </div>
              </div>
            </div>
            <p
              className={`mt-2.5 text-[11px] font-semibold tabular-nums ${
                velocityMetrics.tempoPct >= 0
                  ? presentation
                    ? "text-emerald-300/90"
                    : "text-emerald-700"
                  : presentation
                    ? "text-rose-300/90"
                    : "text-rose-700"
              }`}
            >
              {velocityMetrics.tempoDeltaLabel}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {velocityKpiCards.map((m) => (
              <div
                key={m.key}
                className={
                  presentation ? "rounded-xl border border-slate-600/40 bg-slate-900/35 p-3" : "rounded-xl border border-slate-200 bg-white p-3"
                }
              >
                <div className={sub}>{m.title}</div>
                <div className={`mt-1 text-lg font-bold tabular-nums sm:text-xl ${m.tone}`}>
                  {dec1Fmt.format(m.value)} <span className="text-xs font-normal">сделок/мес</span>
                </div>
              </div>
            ))}
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
              <div className={`mt-1 text-lg font-bold tabular-nums ${
                requiredPerPeriod == null
                  ? (presentation ? "text-slate-300" : "text-slate-700")
                  : requiredPerPeriod > runRateDeals
                    ? (presentation ? "text-red-300" : "text-red-700")
                    : (presentation ? "text-emerald-300" : "text-emerald-700")
              }`}>
                {requiredPerPeriod == null ? "Период завершен" : `${numFmt.format(Math.round(requiredPerPeriod))} сделка / месяц`}
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
        <p className={sub}>
          Сводка по накопительному факту к дате, помесячному разрыву факт − план, темпу и прогнозу к концу помесячного горизонта — с явными
          выводами над графиком.
        </p>

        {/* Главный KPI */}
        <div className={`mt-4 grid grid-cols-2 gap-3 border-b pb-4 sm:grid-cols-4 ${presentation ? "border-slate-600/40" : "border-slate-200"}`}>
          <div>
            <div className={`text-[11px] font-medium uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-500"}`}>Отклонение</div>
            <div
              className={`mt-1 text-2xl font-semibold tabular-nums sm:text-3xl ${
                currentDeviation >= 0
                  ? presentation
                    ? "text-emerald-300"
                    : "text-emerald-700"
                  : presentation
                    ? "text-red-300"
                    : "text-red-700"
              }`}
            >
              {currentDeviation >= 0 ? "+" : "−"}
              {numFmt.format(Math.abs(currentDeviation))}{" "}
              <span className="text-lg font-normal sm:text-xl">шт</span>
            </div>
          </div>
          <div>
            <div className={`text-[11px] font-medium uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-500"}`}>Факт</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums sm:text-3xl ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              {numFmt.format(currentFactCum)}
            </div>
            <div className={`mt-0.5 text-[10px] ${presentation ? "text-slate-500" : "text-slate-500"}`}>накопит. к дате</div>
          </div>
          <div>
            <div className={`text-[11px] font-medium uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-500"}`}>План</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums sm:text-3xl ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              {numFmt.format(currentPlanCum)}
            </div>
            <div className={`mt-0.5 text-[10px] ${presentation ? "text-slate-500" : "text-slate-500"}`}>накопит. к дате</div>
          </div>
          <div>
            <div className={`text-[11px] font-medium uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-500"}`}>Выполнение</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums sm:text-3xl ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              {dealsExecutionPct.toFixed(1)}%
            </div>
            <div className={`mt-0.5 text-[10px] ${presentation ? "text-slate-500" : "text-slate-500"}`}>факт / план</div>
          </div>
        </div>

        <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${presentation ? "text-slate-400" : "text-slate-600"}`}>
          <span className={`rounded px-2 py-0.5 font-medium ${statusTone}`}>{statusText}</span>
          <span className="tabular-nums">
            Конец помесячного горизонта: план {numFmt.format(monthlyExecutionInsights.planEndMonthly)} · прогноз{" "}
            {numFmt.format(monthlyExecutionInsights.forecastEndMonthly)} сделок
          </span>
        </div>

        {/* Помесячное выполнение плана */}
        <div className="mt-5">
          <h5 className={`text-sm font-semibold ${presentation ? "text-slate-200" : "text-slate-800"}`}>Помесячное выполнение плана</h5>
          <p className={`mt-0.5 text-[11px] font-medium ${presentation ? "text-slate-300" : "text-slate-700"}`}>Отклонение от плана по месяцам</p>
          <p className={`mt-1 text-[11px] ${presentation ? "text-slate-400" : "text-slate-600"}`}>
            Каждый столбец — факт минус план за месяц (сделки). Так видно, где впервые появился недобор и усиливается ли он к концу ряда.
          </p>

          <div
            className={`mt-3 grid gap-2 rounded-lg border px-3 py-3 text-sm sm:grid-cols-3 ${presentation ? "border-slate-600/45 bg-slate-900/35" : "border-slate-200 bg-slate-50/90"}`}
          >
            <div>
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-slate-500" : "text-slate-500"}`}>
                Начало отклонения
              </div>
              <div className={`mt-1 font-medium tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>
                {monthlyExecutionInsights.firstNegative ? (
                  <>
                    {monthlyExecutionInsights.firstNegative.label}
                    <span className={`block text-xs font-normal ${presentation ? "text-red-300" : "text-red-700"}`}>
                      −{numFmt.format(Math.abs(monthlyExecutionInsights.firstNegative.deviation))} шт к плану
                    </span>
                  </>
                ) : (
                  <span className={presentation ? "text-emerald-300" : "text-emerald-700"}>Недобор не зафиксирован</span>
                )}
              </div>
            </div>
            <div>
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-slate-500" : "text-slate-500"}`}>
                Самый слабый месяц
              </div>
              <div className={`mt-1 font-medium tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>
                {monthlyExecutionInsights.worstMonth ? (
                  <>
                    {monthlyExecutionInsights.worstMonth.label}
                    <span
                      className={`block text-xs font-normal ${
                        monthlyExecutionInsights.worstMonth.deviation < 0
                          ? presentation
                            ? "text-red-300"
                            : "text-red-700"
                          : presentation
                            ? "text-slate-400"
                            : "text-slate-600"
                      }`}
                    >
                      {monthlyExecutionInsights.worstMonth.deviation >= 0 ? "+" : "−"}
                      {numFmt.format(Math.abs(monthlyExecutionInsights.worstMonth.deviation))} шт к плану
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div className="sm:col-span-1">
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${presentation ? "text-slate-500" : "text-slate-500"}`}>
                Динамика
              </div>
              <p className={`mt-1 text-xs leading-snug ${presentation ? "text-slate-300" : "text-slate-700"}`}>
                {monthlyExecutionInsights.trend === "improving" ? "^ " : monthlyExecutionInsights.trend === "worsening" ? "v " : "- "}
                {monthlyExecutionInsights.trendLabel}
              </p>
            </div>
          </div>

          <div
            className={`mt-3 rounded-md border px-3 py-2 text-center text-sm font-semibold tabular-nums ${presentation ? "border-slate-600/50 bg-slate-900/25 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
          >
            Суммарное отклонение:{" "}
            <span
              className={
                monthlyExecutionInsights.sumDeviation >= 0
                  ? presentation
                    ? "text-emerald-300"
                    : "text-emerald-700"
                  : presentation
                    ? "text-red-300"
                    : "text-red-700"
              }
            >
              {monthlyExecutionInsights.sumDeviation >= 0 ? "+" : "−"}
              {numFmt.format(Math.abs(monthlyExecutionInsights.sumDeviation))} сделок
            </span>
          </div>

          <div className="mt-2 h-[248px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyPlanExecutionData} margin={{ top: 16, right: 8, left: 0, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: axisColor, fontSize: 9 }}
                  axisLine={{ stroke: gridColor }}
                  tickLine={false}
                  label={{ value: "Месяц", position: "bottom", offset: 0, fill: axisColor, fontSize: 10 }}
                />
                <YAxis
                  tick={{ fill: axisColor, fontSize: 10 }}
                  axisLine={false}
                  tickFormatter={yTickDeals}
                  width={40}
                  label={{ value: "Отклонение, шт", angle: -90, position: "insideLeft", fill: axisColor, fontSize: 10 }}
                />
                <Tooltip content={<MonthlyPlanDeviationTooltip presentation={presentation} />} cursor={{ fill: presentation ? "rgba(148,163,184,0.08)" : "rgba(100,116,139,0.08)" }} />
                <ReferenceLine y={0} stroke={presentation ? "rgba(148,163,184,0.45)" : "rgba(100,116,139,0.35)"} strokeWidth={1} />
                <Bar dataKey="deviation" name="Отклонение" maxBarSize={40} radius={[2, 2, 0, 0]}>
                  {monthlyPlanExecutionData.map((entry, i) => (
                    <Cell
                      key={`mpe-${entry.periodKey}-${i}`}
                      fill={monthlyDeviationFill(entry.deviation, entry.periodKey === monthlyExecutionInsights.worstMonth?.periodKey)}
                      stroke={entry.periodKey === monthlyExecutionInsights.worstMonth?.periodKey ? "#f8fafc" : "none"}
                      strokeWidth={entry.periodKey === monthlyExecutionInsights.worstMonth?.periodKey ? 1.8 : 0}
                    />
                  ))}
                  <LabelList
                    dataKey="deviation"
                    content={(props: { x?: number; y?: number; width?: number; height?: number; value?: unknown }) => {
                      const v = props.value;
                      const num = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
                      return (
                        <MonthlyDeviationBarLabel
                          x={props.x}
                          y={props.y}
                          width={props.width}
                          height={props.height}
                          value={Number.isFinite(num) ? num : undefined}
                          presentation={presentation}
                        />
                      );
                    }}
                  />
                  <LabelList
                    dataKey="deviation"
                    content={(props: { x?: number; y?: number; width?: number; value?: unknown; index?: number }) => {
                      const idx = props.index ?? -1;
                      const row = idx >= 0 ? monthlyPlanExecutionData[idx] : null;
                      if (!row || row.periodKey !== monthlyExecutionInsights.worstMonth?.periodKey) return null;
                      if (props.x == null || props.y == null || props.width == null) return null;
                      const cx = props.x + props.width / 2;
                      const ly = row.deviation < 0 ? props.y - 10 : props.y - 16;
                      return (
                        <text x={cx} y={ly} textAnchor="middle" fill="#f43f5e" fontSize={10} fontWeight={700}>
                          Худший месяц
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Темп (по помесячному ряду — согласован с графиком выше) */}
        <div className={`mt-5 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-3 ${presentation ? "border-slate-600/40" : "border-slate-200"}`}>
          <p className={`sm:col-span-3 text-[11px] ${presentation ? "text-slate-500" : "text-slate-600"}`}>
            Темп считается по помесячным сделкам: средний факт за прошедшие месяцы до текущего и темп, который нужен до конца ряда, чтобы
            закрыть план.
          </p>
          <div>
            <div className={`text-[11px] font-medium uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-500"}`}>Текущий темп</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              {dec1Fmt.format(monthlyExecutionInsights.runRateMonthly)} <span className="text-sm font-normal">сделок / мес</span>
            </div>
          </div>
          <div>
            <div className={`text-[11px] font-medium uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-500"}`}>Требуемый темп</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${presentation ? "text-slate-100" : "text-slate-900"}`}>
              {monthlyExecutionInsights.requiredMonthly == null ? (
                "Период завершен"
              ) : (
                <>
                  {dec1Fmt.format(monthlyExecutionInsights.requiredMonthly)} <span className="text-sm font-normal">сделок / мес</span>
                </>
              )}
            </div>
          </div>
          <div>
            {monthlyExecutionInsights.periodCompleted ? (
              <>
                <div className={`text-[11px] font-medium uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-500"}`}>Итоговое отклонение</div>
                <div
                  className={`mt-1 text-xl font-semibold tabular-nums ${
                    monthlyExecutionInsights.sumDeviation >= 0
                      ? presentation
                        ? "text-emerald-300"
                        : "text-emerald-700"
                      : presentation
                        ? "text-red-300"
                        : "text-red-700"
                  }`}
                >
                  {monthlyExecutionInsights.sumDeviation >= 0 ? "+" : "−"}
                  {numFmt.format(Math.abs(monthlyExecutionInsights.sumDeviation))}{" "}
                  <span className="text-sm font-normal">сделок</span>
                </div>
              </>
            ) : (
              <>
                <div className={`text-[11px] font-medium uppercase tracking-wide ${presentation ? "text-slate-400" : "text-slate-500"}`}>Разница темпов</div>
                <div
                  className={`mt-1 text-xl font-semibold tabular-nums ${
                    (monthlyExecutionInsights.tempoDiffMonthly ?? 0) >= 0
                      ? presentation
                        ? "text-emerald-300"
                        : "text-emerald-700"
                      : presentation
                        ? "text-red-300"
                        : "text-red-700"
                  }`}
                >
                  {(monthlyExecutionInsights.tempoDiffMonthly ?? 0) >= 0 ? "+" : "−"}
                  {dec1Fmt.format(Math.abs(monthlyExecutionInsights.tempoDiffMonthly ?? 0))}{" "}
                  <span className="text-sm font-normal">сделок / мес</span>
                </div>
                <div className={`mt-0.5 text-[10px] ${presentation ? "text-slate-500" : "text-slate-500"}`}>текущий − требуемый</div>
              </>
            )}
          </div>
        </div>

        {/* Вывод */}
        <div
          className={`mt-5 rounded-lg border px-4 py-3 ${
            monthlyExecutionInsights.planAchievableAtMonthlyTempo
              ? presentation
                ? "border-emerald-500/40 bg-emerald-950/15"
                : "border-emerald-200 bg-emerald-50/80"
              : presentation
                ? "border-red-500/40 bg-red-950/15"
                : "border-red-200 bg-red-50/80"
          }`}
        >
          <div
            className={`text-lg font-semibold ${
              monthlyExecutionInsights.planAchievableAtMonthlyTempo
                ? presentation
                  ? "text-emerald-200"
                  : "text-emerald-800"
                : presentation
                  ? "text-red-200"
                  : "text-red-800"
            }`}
          >
            {monthlyExecutionInsights.planAchievableAtMonthlyTempo ? "План достижим" : "План недостижим"}
          </div>
          <p className={`mt-1 text-sm ${presentation ? "text-slate-400" : "text-slate-600"}`}>
            при сохранении текущего помесячного темпа: прогноз {numFmt.format(monthlyExecutionInsights.forecastEndMonthly)} при целевых{" "}
            {numFmt.format(monthlyExecutionInsights.planEndMonthly)} сделок к концу горизонта.
          </p>
        </div>

        {/* Вторичный график: накопительные кривые */}
        <div className="mt-5">
          <h5 className={`text-xs font-medium uppercase tracking-wide ${presentation ? "text-slate-500" : "text-slate-500"}`}>
            Справочно: накопительные план, факт и прогноз
          </h5>
          <div className="mt-1 h-[112px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dealControlData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 8 }} axisLine={{ stroke: gridColor }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: axisColor, fontSize: 9 }} axisLine={false} allowDecimals={false} width={34} tickFormatter={yTickDeals} />
                <Tooltip content={<DealControlTooltip presentation={presentation} />} />
                <Line type="monotone" dataKey="planCumulative" name="План" stroke={presentation ? "rgba(148,163,184,0.85)" : "#94a3b8"} strokeWidth={1} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="factCumulative" name="Факт" stroke="#38bdf8" strokeWidth={1.15} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="forecastCumulative" name="Прогноз" stroke="#a78bfa" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                {todayLabelDealControl ? (
                  <ReferenceLine x={todayLabelDealControl} stroke="#ca8a04" strokeWidth={1} strokeDasharray="3 3" />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
