"use client";

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { listTendersFromDb } from "@/lib/constructionApi";
import { isGprLocalStorageMode } from "@/lib/gprStorageMode";
import { getGprProjectId, loadPersistedTenderItems } from "@/lib/tenderImportPersistence";
import type { Tender } from "@/lib/tenderData";
import { partIdToProjectPartKey, type ConstructionObjectScope } from "@/lib/gprUtils";
import { gprMockData } from "@/lib/gprMockData";
import { GPRTenderDependencyChart } from "@/components/construction/GPRTenderDependencyChart";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import { KpiDonutChart } from "@/components/tmc/KpiDonutChart";
import {
  TenderConductDynamicsChart,
} from "@/components/tenders/TenderConductDynamicsChart";
import { useTenderKpiDonutSegments } from "@/components/tenders/useTenderKpiDonutSegments";
import type { TmcProcurementChartMode } from "@/components/tmc/TmcProcurementDynamicsChart";
import {
  buildTenderMonthlyConductSeries,
  computeTenderBudgetFinancialResult,
  computeTenderProcurementKpi,
  logTenderConductDynamicsDiagnostics,
  logTenderConductedKpiDiagnostics,
} from "@/lib/tenderPresentationAnalytics";
import {
  buildGprTenderDependencySeries,
  buildGprTenderDependencySeriesProjectWide,
  type ForecastPart,
} from "@/lib/gprTmcDependency";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#6b7280",
  card: "#1e293b",
  plan: "#94a3b8",
  blue: "#3b82f6",
  teal: "#14b8a6",
} as const;

const TENDER_BUDGET_DEVIATION_CARD_TITLE = "ОТКЛОНЕНИЕ ОТ ТЕНДЕРНОГО БЮДЖЕТА";
const TENDER_BUDGET_DEVIATION_PCT_LABEL = "ДОЛЯ ОТКЛОНЕНИЯ, %";

const tenderLocalMode = isGprLocalStorageMode();

/** Сумма для KPI-карточек тендеров — без символа ₽. */
function rubKpiAmount(value: number): string {
  const formatted = new Intl.NumberFormat("ru-RU").format(Math.round(Math.abs(value)));
  if (value < 0) return `−${formatted}`;
  return formatted;
}

function rubKpiSignedAmount(value: number): string {
  if (value === 0) return "0";
  const formatted = new Intl.NumberFormat("ru-RU").format(Math.round(Math.abs(value)));
  if (value < 0) return `−${formatted}`;
  return `+${formatted}`;
}

function pct1(n: number): string {
  return `${n.toFixed(1).replace(".", ",")}%`;
}

function pctSigned1(n: number): string {
  const formatted = Math.abs(n).toFixed(1).replace(".", ",");
  if (n < 0) return `−${formatted}%`;
  if (n > 0) return `+${formatted}%`;
  return `${formatted}%`;
}

function TenderKpiDivider() {
  return <div className="border-t border-slate-600/35" />;
}

function TenderKpiLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{children}</div>
  );
}

type TenderKpiMetricTier = "primary" | "supporting" | "secondary" | "tertiary" | "deviation";

function TenderKpiMetricBlock({
  label,
  value,
  tier,
  accentColor,
  valueClassName,
  sectionPt = "pt-4",
}: {
  label: string;
  value: string;
  tier: TenderKpiMetricTier;
  accentColor?: string;
  valueClassName?: string;
  sectionPt?: string;
}) {
  const labelClass =
    tier === "primary"
      ? "flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300"
      : tier === "supporting" || tier === "secondary"
        ? "text-[10px] font-medium uppercase tracking-wider text-slate-500"
        : "text-[10px] font-medium uppercase tracking-wider text-slate-500/70";

  const valueClass =
    tier === "primary"
      ? "mt-1.5 text-2xl font-extrabold tabular-nums tracking-tight text-white"
      : tier === "supporting"
        ? "mt-1 text-base font-semibold tabular-nums text-white"
        : tier === "secondary"
          ? "mt-1 text-base font-semibold tabular-nums text-slate-300/80"
          : tier === "tertiary"
            ? "mt-1 text-sm font-medium tabular-nums text-slate-400/70"
            : "mt-1 text-base font-bold tabular-nums";

  const primaryGlow =
    tier === "primary" && accentColor === COLORS.blue
      ? { textShadow: "0 0 22px rgba(59,130,246,0.42)" }
      : tier === "primary" && accentColor === COLORS.green
        ? { textShadow: "0 0 18px rgba(34,197,94,0.32)" }
        : tier === "primary" && accentColor === COLORS.red
          ? { textShadow: "0 0 22px rgba(239,68,68,0.38)" }
          : tier === "primary" && accentColor === COLORS.teal
            ? { textShadow: "0 0 18px rgba(20,184,166,0.32)" }
            : undefined;

  return (
    <div className="space-y-1.5">
      <TenderKpiDivider />
      <div className={`${sectionPt} ${tier === "primary" ? "pl-0.5" : ""}`}>
        <div className={labelClass}>
          {tier === "primary" && accentColor ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: accentColor,
                boxShadow: `0 0 10px ${accentColor}cc`,
              }}
              aria-hidden
            />
          ) : null}
          {label}
        </div>
        <div className={`${valueClass} ${valueClassName ?? ""}`} style={primaryGlow}>
          {value}
        </div>
      </div>
    </div>
  );
}

function TenderKpiAmountBlock({
  label,
  amountRub,
  accentColor,
  showRubSuffix = false,
  valueClassName,
}: {
  label: string;
  amountRub: number;
  accentColor: string;
  showRubSuffix?: boolean;
  valueClassName?: string;
}) {
  const primaryGlow =
    accentColor === COLORS.blue
      ? { textShadow: "0 0 22px rgba(59,130,246,0.42)" }
      : accentColor === COLORS.red
        ? { textShadow: "0 0 22px rgba(239,68,68,0.38)" }
        : accentColor === COLORS.green
          ? { textShadow: "0 0 22px rgba(34,197,94,0.38)" }
          : undefined;
  const suffix = showRubSuffix ? " ₽" : "";

  return (
    <div className="space-y-1.5">
      <TenderKpiDivider />
      <div className="pt-5 pl-0.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 10px ${accentColor}cc`,
            }}
            aria-hidden
          />
          {label}
        </div>
        <div className="mt-2 tabular-nums tracking-tight">
          <span
            className={`text-2xl font-extrabold text-white ${valueClassName ?? ""}`}
            style={primaryGlow}
          >
            {rubKpiAmount(amountRub)}
            {suffix}
          </span>
        </div>
      </div>
    </div>
  );
}

function TenderKpiCountBlock({
  label,
  primaryCount,
  totalCount,
  accentColor,
}: {
  label: string;
  primaryCount: number;
  totalCount: number;
  accentColor: string;
}) {
  return (
    <div className="space-y-1.5">
      <TenderKpiDivider />
      <div className="pt-5 pl-0.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 10px ${accentColor}cc`,
            }}
            aria-hidden
          />
          {label}
        </div>
        <div className="mt-2 flex items-baseline gap-1 tabular-nums tracking-tight">
          <span className="text-2xl font-extrabold text-white">{primaryCount}</span>
          <span className="text-xl font-medium text-slate-300/65">из {totalCount}</span>
        </div>
      </div>
    </div>
  );
}

function TenderKpiSplitMoneyBlock({
  label,
  factRub,
  planRub,
  accentColor,
  showRubSuffix = false,
}: {
  label: string;
  factRub: number;
  planRub: number;
  accentColor: string;
  showRubSuffix?: boolean;
}) {
  const primaryGlow = { textShadow: "0 0 22px rgba(59,130,246,0.42)" };
  const suffix = showRubSuffix ? " ₽" : "";

  return (
    <div className="space-y-1.5">
      <TenderKpiDivider />
      <div className="pt-5 pl-0.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 10px ${accentColor}cc`,
            }}
            aria-hidden
          />
          {label}
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 tabular-nums tracking-tight">
          <span className="text-2xl font-extrabold text-white" style={primaryGlow}>
            {rubKpiAmount(factRub)}
            {suffix}
          </span>
          <span className="text-xl font-medium text-slate-300/65">
            из {rubKpiAmount(planRub)}
            {suffix}
          </span>
        </div>
      </div>
    </div>
  );
}

function TenderKpiWave({ color, opacity = 0.45 }: { color: string; opacity?: number }) {
  const gradId = useId().replace(/:/g, "");
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-28">
      <svg viewBox="0 0 400 96" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,52 C90,88 170,24 260,56 S350,82 400,48 L400,96 L0,96 Z"
          fill={`url(#${gradId})`}
        />
        <path
          d="M0,60 C110,74 210,40 310,64 S380,70 400,58"
          fill="none"
          stroke={color}
          strokeOpacity={opacity * 0.7}
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

function TenderPremiumKpiCard({
  glowColor,
  gradient,
  waveColor,
  waveOpacity,
  children,
}: {
  glowColor: string;
  gradient: string;
  waveColor?: string;
  waveOpacity?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="relative flex h-full min-h-[400px] flex-col overflow-hidden rounded-[20px] border p-6 backdrop-blur-[16px]"
      style={{
        background: gradient,
        borderColor: `${glowColor}55`,
        boxShadow: `0 22px 56px rgba(0,0,0,0.52), 0 0 36px ${glowColor}28, inset 0 1px 0 rgba(255,255,255,0.1)`,
      }}
    >
      {waveColor ? <TenderKpiWave color={waveColor} opacity={waveOpacity} /> : null}
      <div className="relative z-[1] flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function TenderKpiIconBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "blue" | "red" | "amber" | "green" | "teal";
}) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-500/15 text-blue-400 ring-blue-400/20"
      : tone === "red"
        ? "bg-rose-500/15 text-rose-400 ring-rose-400/20"
        : tone === "green"
          ? "bg-emerald-500/15 text-emerald-400 ring-emerald-400/20"
          : tone === "teal"
            ? "bg-teal-500/15 text-teal-400 ring-teal-400/20"
            : "bg-amber-500/15 text-amber-400 ring-amber-400/20";
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClass}`}
    >
      {children}
    </div>
  );
}

const RISK_WINDOW_DAYS = 14;
const DAY_MS = 1000 * 60 * 60 * 24;

type FactVsTodayTraffic = "green" | "yellow" | "red" | "gray";

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

function trafficFactVsToday(lastFactDate: Date | null, today: Date): FactVsTodayTraffic {
  if (!lastFactDate) return "gray";
  if (lastFactDate.getTime() < today.getTime()) return "red";
  const diff = daysDiff(lastFactDate, today);
  if (Math.abs(diff) <= RISK_WINDOW_DAYS) return "yellow";
  return "green";
}

function trafficLabel(status: FactVsTodayTraffic): string {
  if (status === "green") return "В срок / опережение";
  if (status === "yellow") return "Риск";
  if (status === "red") return "Отставание";
  return "Нет данных";
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 12, 0, 0);
}

function filterTendersForScope(list: Tender[], scope: ConstructionObjectScope): Tender[] {
  if (scope === "project") {
    return list.filter((t) => t.partId === 1 || t.partId === 2);
  }
  return list.filter((t) => t.partId === scope);
}

export function TendersPresentation({
  activePartScope,
}: {
  activePartScope: ConstructionObjectScope;
  onChangePartScope?: (scope: ConstructionObjectScope) => void;
  hidePartTabs?: boolean;
}) {
  const { token, hydrated } = useAuth();
  const projectId = useMemo(() => getGprProjectId(), []);
  const [allTenders, setAllTenders] = useState<Tender[]>([]);
  const [tick, setTick] = useState(0);
  const [conductChartMode, setConductChartMode] = useState<TmcProcurementChartMode>("cumulative");

  const reloadTenders = useCallback(async () => {
    if (tenderLocalMode) {
      try {
        const r = await loadPersistedTenderItems(projectId);
        setAllTenders(r.tenders);
      } catch (e) {
        console.error(e);
      }
      return;
    }
    if (!token) return;
    try {
      setAllTenders(await listTendersFromDb(token));
    } catch (e) {
      console.error(e);
    }
  }, [projectId, token]);

  useEffect(() => {
    if (tenderLocalMode) {
      void reloadTenders();
      return;
    }
    if (!hydrated || !token) return;
    void reloadTenders();
  }, [tenderLocalMode, hydrated, token, reloadTenders, tick]);

  useEffect(() => {
    const bump = () => setTick((x) => x + 1);
    window.addEventListener("gordo-tenders-saved", bump);
    return () => window.removeEventListener("gordo-tenders-saved", bump);
  }, []);

  const tenders = useMemo(
    () => filterTendersForScope(allTenders, "project"),
    [allTenders],
  );

  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => today.toISOString().slice(0, 10), [today]);
  const chartPart: ForecastPart = useMemo(
    () => (activePartScope === "project" ? "project" : partIdToProjectPartKey(activePartScope)),
    [activePartScope],
  );
  const gprTasksForPart = useMemo(() => {
    if (activePartScope === "project") return gprMockData;
    return gprMockData.filter((t) => t.partId === activePartScope);
  }, [activePartScope]);

  const contractPlanDates = useMemo(
    () => tenders.map((t) => parseIsoDate(t.planContractDate)).filter((d): d is Date => d !== null),
    [tenders],
  );
  const contractFactDates = useMemo(
    () =>
      tenders
        .map((t) => parseIsoDate(t.factContractDate))
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime()),
    [tenders],
  );

  const lastFactDate = contractFactDates.length > 0 ? contractFactDates[contractFactDates.length - 1] : null;
  const factStatus = trafficFactVsToday(lastFactDate, today);
  const factStatusColor = COLORS[factStatus];

  const planVsFactSeries = useMemo(() => {
    if (tenders.length === 0 || contractPlanDates.length === 0) return [] as Array<Record<string, number | string | null>>;
    const timelineStart =
      contractPlanDates.length > 0
        ? contractPlanDates.reduce((m, d) => (d.getTime() < m.getTime() ? d : m))
        : today;
    const timelineEndCandidates = [...contractPlanDates, ...contractFactDates, today];
    const timelineEnd = timelineEndCandidates.reduce((m, d) => (d.getTime() > m.getTime() ? d : m));

    const total = tenders.length;
    const points: Array<Record<string, number | string | null>> = [];
    let cursor = monthStart(timelineStart);
    const end = monthStart(timelineEnd);
    while (cursor.getTime() <= end.getTime()) {
      const x = cursor.getTime();
      const plannedCount = contractPlanDates.filter((d) => d.getTime() <= x).length;
      const factCount = contractFactDates.filter((d) => d.getTime() <= x).length;
      points.push({
        iso: cursor.toISOString().slice(0, 10),
        label: monthLabel(cursor),
        planPct: Math.round((plannedCount / total) * 1000) / 10,
        factPct: x <= today.getTime() ? Math.round((factCount / total) * 1000) / 10 : null,
      });
      cursor = addMonths(cursor, 1);
    }
    return points;
  }, [tenders, contractPlanDates, contractFactDates, today]);

  const kpi = useMemo(() => computeTenderProcurementKpi(tenders, today), [tenders, today]);

  const conductSeries = useMemo(
    () => buildTenderMonthlyConductSeries(tenders, today),
    [tenders, today],
  );

  const conductChartData = useMemo(
    () =>
      conductSeries.map((p) => ({
        label: p.label,
        plan: conductChartMode === "monthly" ? p.planCount : p.planCumCount,
        fact:
          conductChartMode === "monthly"
            ? p.factCount
            : p.factCumCount,
      })),
    [conductSeries, conductChartMode],
  );

  useEffect(() => {
    logTenderConductedKpiDiagnostics(tenders);
  }, [tenders]);

  useEffect(() => {
    logTenderConductDynamicsDiagnostics(conductSeries);
  }, [conductSeries]);

  const financialResult = useMemo(
    () => computeTenderBudgetFinancialResult(tenders),
    [tenders],
  );

  const kpiDonutSegments = useTenderKpiDonutSegments(tenders, today);

  const financialCard = useMemo(() => {
    const { deviationRub } = financialResult;
    if (deviationRub < 0) {
      return {
        title: TENDER_BUDGET_DEVIATION_CARD_TITLE,
        mainRub: deviationRub,
        glowColor: COLORS.teal,
        gradient:
          "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(20,184,166,0.14) 100%)",
        waveColor: COLORS.teal,
        badgeTone: "teal" as const,
      };
    }
    if (deviationRub > 0) {
      return {
        title: TENDER_BUDGET_DEVIATION_CARD_TITLE,
        mainRub: deviationRub,
        glowColor: COLORS.red,
        gradient:
          "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(127,29,29,0.16) 100%)",
        waveColor: COLORS.red,
        badgeTone: "red" as const,
      };
    }
    return {
      title: TENDER_BUDGET_DEVIATION_CARD_TITLE,
      mainRub: 0,
      glowColor: COLORS.green,
      gradient:
        "linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(21,128,61,0.14) 100%)",
      waveColor: COLORS.green,
      badgeTone: "green" as const,
    };
  }, [financialResult]);

  const dependencySeries = useMemo(
    () =>
      chartPart === "project"
        ? buildGprTenderDependencySeriesProjectWide(gprTasksForPart, tenders, todayIso)
        : buildGprTenderDependencySeries(gprTasksForPart, tenders, todayIso, chartPart),
    [gprTasksForPart, tenders, todayIso, chartPart],
  );

  const dependencyInsights = useMemo(() => {
    const lagRows = dependencySeries
      .map((r) => ({ stage: r.stageShort, lag: (r.factGpr ?? 0) - (r.tenderReadiness ?? 0) }))
      .filter((r) => r.lag > 0)
      .sort((a, b) => b.lag - a.lag);
    const totalLag = lagRows.reduce((s, r) => s + r.lag, 0);
    const worst = lagRows[0];
    return {
      laggingStages: lagRows.length,
      totalLag: Math.round(totalLag),
      worstStage: worst ? `${worst.stage} (${Math.round(worst.lag)} п.п.)` : "нет",
    };
  }, [dependencySeries]);

  const tenderForecast = useMemo(() => {
    if (tenders.length === 0 || contractPlanDates.length === 0) return null;
    const total = tenders.length;
    const projectEnd = contractPlanDates.reduce((m, d) => (d.getTime() > m.getTime() ? d : m));
    const historyStart = contractPlanDates.reduce((m, d) => (d.getTime() < m.getTime() ? d : m));
    const factNowCount = contractFactDates.filter((d) => d.getTime() <= today.getTime()).length;
    const factNowPct = Math.round((factNowCount / total) * 1000) / 10;

    const windowStart = new Date(today.getTime() - 90 * DAY_MS);
    const recentCount = contractFactDates.filter(
      (d) => d.getTime() >= windowStart.getTime() && d.getTime() <= today.getTime(),
    ).length;
    const elapsedDays = Math.max(1, Math.round((today.getTime() - historyStart.getTime()) / DAY_MS));
    const baseRate = factNowCount / elapsedDays;
    const recentRate = recentCount / 90;
    const ratePerDay = Math.max(baseRate, recentRate);

    const rows: Array<Record<string, number | string | null>> = [];
    let cursor = monthStart(historyStart);
    const end = monthStart(projectEnd);
    while (cursor.getTime() <= end.getTime()) {
      const t = cursor.getTime();
      const planCount = contractPlanDates.filter((d) => d.getTime() <= t).length;
      const factCount = contractFactDates.filter((d) => d.getTime() <= t).length;
      const planPct = Math.round((planCount / total) * 1000) / 10;
      const factPct = t <= today.getTime() ? Math.round((factCount / total) * 1000) / 10 : null;
      let forecastPct: number | null = null;
      if (t >= today.getTime()) {
        const futureDays = Math.max(0, Math.round((t - today.getTime()) / DAY_MS));
        const projected = Math.min(total, factNowCount + ratePerDay * futureDays);
        forecastPct = Math.round((projected / total) * 1000) / 10;
      }
      rows.push({
        iso: cursor.toISOString().slice(0, 10),
        label: monthLabel(cursor),
        planPct,
        factPct,
        forecastPct,
      });
      cursor = addMonths(cursor, 1);
    }

    const lastForecast = rows[rows.length - 1]?.forecastPct;
    const endForecast = typeof lastForecast === "number" ? lastForecast : factNowPct;
    const riskLevel = endForecast >= 95 ? "green" : endForecast >= 80 ? "yellow" : "red";
    return {
      rows,
      projectEndIso: projectEnd.toISOString().slice(0, 10),
      factNowPct,
      endForecast,
      riskLevel: riskLevel as "green" | "yellow" | "red",
    };
  }, [tenders, contractPlanDates, contractFactDates, today]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-50">Закупка услуг (тендеры)</h2>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <TenderPremiumKpiCard
          glowColor={COLORS.green}
          gradient="linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(21,128,61,0.14) 100%)"
          waveColor={COLORS.green}
        >
          <div className="flex items-start gap-3">
            <TenderKpiIconBadge tone="green">
              <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
            </TenderKpiIconBadge>
            <div className="min-w-0 flex-1">
              <TenderKpiLabel>ПРОВЕДЕНО</TenderKpiLabel>
              <div className="mt-1.5 flex items-baseline gap-1 tabular-nums tracking-tight">
                <span className="text-4xl font-extrabold text-white">{kpi.conductedCount}</span>
                <span className="text-3xl font-medium text-slate-300/65">
                  из {kpi.totalCount} шт
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-1 flex-col justify-evenly">
            <TenderKpiSplitMoneyBlock
              label="ОБЪЕМ ПРОВЕДЕННЫХ ТЕНДЕРОВ, РУБ"
              factRub={kpi.conductedFactRub}
              planRub={kpi.conductedPlanRub}
              accentColor={COLORS.green}
            />
            <TenderKpiAmountBlock
              label="СРЕДНИЙ ЧЕК ТЕНДЕРА"
              amountRub={kpi.conductedAvgCheckRub}
              accentColor={COLORS.green}
            />
            <TenderKpiMetricBlock
              label="ВЫПОЛНЕНИЕ ОБЩЕГО ОБЪЕМА"
              value={pct1(kpi.totalVolumeExecutionPct)}
              tier="primary"
              accentColor={COLORS.green}
              sectionPt="pt-5"
            />
          </div>

          <div className="mt-auto space-y-1.5">
            <TenderKpiDivider />
            <div className="pt-3">
              <KpiDonutChart segments={kpiDonutSegments.conductedPipeline} chartHeight={100} />
            </div>
          </div>
        </TenderPremiumKpiCard>

        <TenderPremiumKpiCard
          glowColor={COLORS.red}
          gradient="linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.92) 55%, rgba(127,29,29,0.16) 100%)"
          waveColor={COLORS.red}
          waveOpacity={0.25}
        >
          <div className="flex items-start gap-3">
            <TenderKpiIconBadge tone="red">
              <CalendarDays className="h-5 w-5" strokeWidth={2} />
            </TenderKpiIconBadge>
            <div className="min-w-0 flex-1">
              <TenderKpiLabel>ПРОСРОЧЕНЫ</TenderKpiLabel>
              <div className="mt-1.5 flex items-baseline gap-1 tabular-nums tracking-tight">
                <span className="text-4xl font-extrabold text-white">{kpi.overdueCount}</span>
                <span className="text-3xl font-medium text-slate-300/65">
                  из {kpi.totalCount} шт
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-1 flex-col justify-evenly">
            <TenderKpiSplitMoneyBlock
              label="ОБЪЕМ ПРОСРОЧЕННЫХ ТЕНДЕРОВ, РУБ"
              factRub={kpi.overduePlanRub}
              planRub={kpi.totalPlanRub}
              accentColor={COLORS.red}
            />
            <TenderKpiAmountBlock
              label="СРЕДНИЙ ЧЕК ПРОСРОЧЕННОГО ТЕНДЕРА"
              amountRub={kpi.overdueAvgCheckRub}
              accentColor={COLORS.red}
            />
            <TenderKpiMetricBlock
              label="ДОЛЯ ПРОСРОЧЕННОГО ОБЪЕМА"
              value={pct1(kpi.overdueVolumeSharePct)}
              tier="primary"
              accentColor={COLORS.red}
              sectionPt="pt-5"
            />
          </div>

          <div className="mt-auto space-y-1.5">
            <TenderKpiDivider />
            <div className="pt-3">
              <KpiDonutChart segments={kpiDonutSegments.overdueReasons} chartHeight={100} />
            </div>
          </div>
        </TenderPremiumKpiCard>

        <TenderPremiumKpiCard
          glowColor={financialCard.glowColor}
          gradient={financialCard.gradient}
          waveColor={financialCard.waveColor}
          waveOpacity={0.25}
        >
          <div className="flex items-start gap-3">
            <TenderKpiIconBadge tone={financialCard.badgeTone}>
              <Wallet className="h-5 w-5" strokeWidth={2} />
            </TenderKpiIconBadge>
            <div className="min-w-0 flex-1">
              <TenderKpiLabel>{financialCard.title}</TenderKpiLabel>
              <div className="mt-1.5 tabular-nums tracking-tight">
                <span
                  className={`text-4xl font-extrabold text-white ${
                    financialResult.deviationRub < 0
                      ? "text-emerald-400"
                      : financialResult.deviationRub > 0
                        ? "text-[#ff5b6b]"
                        : ""
                  }`}
                >
                  {rubKpiSignedAmount(financialCard.mainRub)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-1 flex-col justify-evenly">
            <TenderKpiSplitMoneyBlock
              label="ЭКОНОМИЯ"
              factRub={financialResult.economyRub}
              planRub={financialResult.concludedPlanRub}
              accentColor={COLORS.green}
            />
            <TenderKpiAmountBlock
              label="ПЕРЕРАСХОД"
              amountRub={financialResult.overrunRub}
              accentColor={COLORS.red}
              valueClassName={financialResult.overrunRub > 0 ? "text-[#ff5b6b]" : undefined}
            />
            <TenderKpiMetricBlock
              label={TENDER_BUDGET_DEVIATION_PCT_LABEL}
              value={pctSigned1(financialResult.deviationPct)}
              tier="primary"
              accentColor={
                financialResult.deviationPct < 0
                  ? COLORS.teal
                  : financialResult.deviationPct > 0
                    ? COLORS.red
                    : COLORS.green
              }
              sectionPt="pt-5"
              valueClassName={
                financialResult.deviationPct < 0
                  ? "text-emerald-400"
                  : financialResult.deviationPct > 0
                    ? "text-[#ff5b6b]"
                    : undefined
              }
            />
          </div>

          <div className="mt-auto space-y-1.5">
            <TenderKpiDivider />
            <div className="pt-3">
              <KpiDonutChart segments={kpiDonutSegments.budgetDeviation} chartHeight={100} />
            </div>
          </div>
        </TenderPremiumKpiCard>
      </div>

      <div
        className="rounded-2xl border border-slate-600/45 bg-[#1e293b] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.06]"
        style={{
          background:
            "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold uppercase tracking-wide text-slate-50">
            Аналитика проведения тендеров (план / факт)
          </h3>
          <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
            {(
              [
                { id: "monthly" as const, label: "Помесячно" },
                { id: "cumulative" as const, label: "Нарастающим итогом" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setConductChartMode(m.id)}
                className={segmentedControlTabClass(conductChartMode === m.id, "dark")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 h-[400px] w-full">
          {conductSeries.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Недостаточно дат план/факт для построения динамики проведения тендеров
            </div>
          ) : (
            <TenderConductDynamicsChart chartData={conductChartData} mode={conductChartMode} />
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
          <div className="flex min-h-[3rem] flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h3 className="text-lg font-semibold leading-snug text-slate-50">План vs Факт (тендеры)</h3>
            <span className="text-sm font-semibold" style={{ color: factStatusColor }}>
              {trafficLabel(factStatus)}
            </span>
          </div>
          <p className="mt-1 text-sm leading-snug text-[#E6EDF3]">X: время, Y: доля завершенных тендеров, %.</p>
          <div className="mt-4 h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={planVsFactSeries} margin={{ top: 10, right: 10, left: 2, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.14)" />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis
                  min={0}
                  max={100}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: COLORS.card,
                    border: "1px solid rgba(148,163,184,0.35)",
                    color: "#e2e8f0",
                  }}
                  formatter={(value: unknown, name: unknown) => [
                    value == null ? "—" : `${value}%`,
                    String(name ?? "") === "planPct" ? "План тендеров" : "Факт тендеров",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="planPct"
                  stroke={COLORS.plan}
                  strokeWidth={2}
                  dot={{ r: 2, fill: COLORS.plan }}
                  name="planPct"
                />
                <Line
                  type="monotone"
                  dataKey="factPct"
                  stroke={factStatusColor}
                  strokeWidth={3}
                  dot={{ r: 4, fill: factStatusColor }}
                  name="factPct"
                  connectNulls={false}
                />
                <ReferenceLine
                  x={todayIso.slice(0, 7)}
                  stroke="rgba(148,163,184,0.45)"
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        <div className="mt-3 border-t border-slate-700/40 pt-3">
          <AnalyticsLegendList>
            <AnalyticsLegendItem markerColor={COLORS.plan} label="План тендеров" />
            <AnalyticsLegendItem markerColor={factStatusColor} label="Факт тендеров" />
          </AnalyticsLegendList>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-50">Зависимость (тендеры → ГПР)</h3>
        <p className="mt-1 text-xs text-slate-400">
          План ГПР, факт ГПР и пунктир готовности тендеров в едином формате, как в связке ТМЦ → ГПР.
        </p>
        <GPRTenderDependencyChart
          tasks={gprTasksForPart}
          tenders={tenders}
          activeProjectPart={chartPart}
          analyticDepth="presentation"
        />
        <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-900/30 p-4 text-xs text-slate-300">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Выводы</div>
          <div className="mt-2 space-y-1.5">
            <div>Отставание по тендерам: {dependencyInsights.laggingStages} этап(ов).</div>
            <div>Суммарный разрыв готовности: {dependencyInsights.totalLag} п.п.</div>
            <div>Наибольшее влияние на ГПР: {dependencyInsights.worstStage}.</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-50">Прогноз (тендерная готовность)</h3>
        <p className="mt-1 text-xs text-slate-400">
          Факт до сегодня, прогноз до конца проекта на основе текущего темпа заключения договоров.
        </p>
        <div className="mt-4 h-[340px] w-full">
          {tenderForecast == null ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 text-sm text-slate-500">
              Недостаточно данных по плановым датам тендеров
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tenderForecast.rows} margin={{ top: 10, right: 10, left: 2, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.14)" />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis
                  min={0}
                  max={100}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: COLORS.card,
                    border: "1px solid rgba(148,163,184,0.35)",
                    color: "#e2e8f0",
                  }}
                  formatter={(value: unknown, name: unknown) => {
                    const key = String(name ?? "");
                    const title =
                      key === "planPct"
                        ? "План тендеров"
                        : key === "factPct"
                          ? "Факт тендеров"
                          : "Прогноз тендеров";
                    return [value == null ? "—" : `${value}%`, title];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="planPct"
                  stroke={COLORS.plan}
                  strokeWidth={2}
                  dot={{ r: 2, fill: COLORS.plan }}
                  name="planPct"
                />
                <Line
                  type="monotone"
                  dataKey="factPct"
                  stroke={COLORS.green}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: COLORS.green }}
                  name="factPct"
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="forecastPct"
                  stroke={COLORS[tenderForecast.riskLevel]}
                  strokeWidth={3}
                  strokeDasharray="6 5"
                  dot={{ r: 4, fill: COLORS[tenderForecast.riskLevel] }}
                  name="forecastPct"
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        {tenderForecast ? (
          <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-900/30 p-4 text-xs text-slate-300">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Оценка риска</div>
            <div className="mt-2 space-y-1.5">
              <div>Факт на сегодня: {tenderForecast.factNowPct}%.</div>
              <div>Прогноз к завершению проекта ({tenderForecast.projectEndIso}): {tenderForecast.endForecast}%.</div>
              <div style={{ color: COLORS[tenderForecast.riskLevel] }}>
                {tenderForecast.riskLevel === "green"
                  ? "Зеленый: риск низкий."
                  : tenderForecast.riskLevel === "yellow"
                    ? "Желтый: умеренный риск."
                    : "Красный: высокий риск."}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
