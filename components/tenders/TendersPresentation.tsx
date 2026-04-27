"use client";

import { useEffect, useMemo, useState } from "react";
import { mergeTenderSnapshotWithSeed, readTenderSnapshotFromStorage, type Tender } from "@/lib/tenderData";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import { PROJECT_PARTS, partIdToProjectPartKey, type ConstructionObjectScope } from "@/lib/gprUtils";
import { gprMockData } from "@/lib/gprMockData";
import { GPRTenderDependencyChart } from "@/components/construction/GPRTenderDependencyChart";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import {
  buildGprTenderDependencySeries,
  buildGprTenderDependencySeriesProjectWide,
  type ForecastPart,
} from "@/lib/gprTmcDependency";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
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
} as const;

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

function loadTendersForScope(scope: ConstructionObjectScope): Tender[] {
  let list = mergeTenderSnapshotWithSeed(undefined);
  if (typeof window !== "undefined") {
    try {
      list = mergeTenderSnapshotWithSeed(readTenderSnapshotFromStorage());
    } catch {
      list = mergeTenderSnapshotWithSeed(undefined);
    }
  }
  if (scope === "project") {
    return list.filter((t) => t.partId === 1 || t.partId === 2);
  }
  return list.filter((t) => t.partId === scope);
}

export function TendersPresentation({
  activePartScope,
  onChangePartScope,
  hidePartTabs,
}: {
  activePartScope: ConstructionObjectScope;
  onChangePartScope: (scope: ConstructionObjectScope) => void;
  hidePartTabs?: boolean;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((x) => x + 1);
    window.addEventListener("gordo-tenders-saved", bump);
    return () => window.removeEventListener("gordo-tenders-saved", bump);
  }, []);

  const tenders = useMemo(() => {
    void tick;
    return loadTendersForScope(activePartScope);
  }, [activePartScope, tick]);

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

  const distribution = useMemo(() => {
    let conducted = 0;
    let inProgress = 0;
    let overdue = 0;
    let noData = 0;
    for (const t of tenders) {
      const plan = parseIsoDate(t.planContractDate);
      const fact = parseIsoDate(t.factContractDate);
      if (fact) {
        conducted += 1;
      } else if (!plan) {
        noData += 1;
      } else if (plan.getTime() < today.getTime()) {
        overdue += 1;
      } else {
        inProgress += 1;
      }
    }
    const total = tenders.length;
    const riskScore = total > 0 ? (overdue * 1 + inProgress * 0.5) / total : 0;
    const riskPct = Math.round(riskScore * 100);
    return { conducted, inProgress, overdue, noData, total, riskPct };
  }, [tenders, today]);

  const donutData = useMemo(
    () => [
      { key: "conducted", name: "Проведены", value: distribution.conducted, fill: "url(#tenGreenGrad)" },
      { key: "inProgress", name: "В процессе", value: distribution.inProgress, fill: "url(#tenYellowGrad)" },
      { key: "overdue", name: "Просрочены", value: distribution.overdue, fill: "url(#tenRedGrad)" },
      { key: "noData", name: "Нет данных", value: distribution.noData, fill: "url(#tenGrayGrad)" },
    ],
    [distribution],
  );

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

  const partTabs = hidePartTabs ? null : (
    <div className="mb-4 flex flex-wrap justify-center sm:justify-start">
      <div className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5">
        {PROJECT_PARTS.map((part) => {
          const active = activePartScope === part.id;
          return (
            <button
              key={part.id}
              type="button"
              onClick={() => onChangePartScope(part.id)}
              className={segmentedControlTabClass(active, "dark")}
            >
              {part.name}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <section className="space-y-4">
      {partTabs}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">Закупка услуг (тендеры)</h2>
          <p className="mt-1 text-sm text-slate-400">
            Визуально единая аналитика с ГПР: те же паттерны UI, но отдельная логика метрик по тендерному циклу.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(
          [
            {
              label: "Всего тендеров",
              value: distribution.total,
              sub: "в части проекта",
              accent: "#94a3b8",
              subColor: "#94a3b8",
              bg: "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.03))",
              borderColor: "rgba(148,163,184,0.2)",
              glow: "rgba(148,163,184,0.15)",
            },
            {
              label: "Проведены",
              value: distribution.conducted,
              sub: "договор заключен",
              accent: COLORS.green,
              subColor: COLORS.green,
              bg: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.05))",
              borderColor: "rgba(34,197,94,0.4)",
              glow: "rgba(34,197,94,0.15)",
            },
            {
              label: "В процессе",
              value: distribution.inProgress,
              sub: "до даты договора",
              accent: COLORS.yellow,
              subColor: COLORS.yellow,
              bg: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(59,130,246,0.05))",
              borderColor: "rgba(245,158,11,0.4)",
              glow: "rgba(245,158,11,0.15)",
            },
            {
              label: "Просрочены",
              value: distribution.overdue,
              sub: "план < сегодня, факта нет",
              accent: COLORS.red,
              subColor: COLORS.red,
              bg: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(59,130,246,0.05))",
              borderColor: "rgba(239,68,68,0.4)",
              glow: "rgba(239,68,68,0.15)",
            },
          ] as const
        ).map((card) => (
          <div
            key={card.label}
            className="rounded-[20px] border p-5 text-left backdrop-blur-[12px] transition-all duration-200 hover:brightness-110"
            style={{
              background: card.bg,
              borderColor: card.borderColor,
              borderLeft: `4px solid ${card.accent}`,
              boxShadow: `0 0 20px ${card.glow}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = `0 0 26px ${card.glow}, 0 0 36px ${card.glow}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = `0 0 20px ${card.glow}`;
            }}
          >
            <div className="text-xs text-slate-200">{card.label}</div>
            <div className="mt-2 text-3xl font-bold tabular-nums text-white">{card.value}</div>
            <div className="mt-1 text-xs font-medium" style={{ color: card.subColor }}>
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
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

        <div className="flex h-full w-full flex-col rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
          <h3 className="text-lg font-semibold leading-snug text-slate-50">Распределение статусов</h3>
          <p className="mt-1 text-xs leading-snug text-slate-300">
            Проведены / в процессе / просрочены / нет данных.
          </p>
          <div className="relative mt-4 h-[220px] w-full">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <defs>
                  <linearGradient id="tenGreenGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#16a34a" />
                    <stop offset="100%" stopColor="#22c55e" />
                  </linearGradient>
                  <linearGradient id="tenYellowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#d97706" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                  <linearGradient id="tenRedGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#dc2626" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                  <linearGradient id="tenGrayGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#6b7280" />
                    <stop offset="100%" stopColor="#9ca3af" />
                  </linearGradient>
                </defs>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={2}
                  stroke="rgba(255,255,255,0.18)"
                >
                  {donutData.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div
              className="pointer-events-none absolute left-1/2 flex flex-col items-center justify-center text-center"
              style={{ top: "calc(10px + (100% - 20px) * 0.45)", transform: "translate(-50%, -50%)" }}
            >
              <div
                aria-hidden
                className="absolute left-1/2 top-1/2 aspect-square rounded-full"
                style={{
                  width: "min(100px, 26%)",
                  minWidth: 76,
                  maxWidth: 104,
                  transform: "translate(-50%, -50%)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  boxShadow: "0 0 32px rgba(255,255,255,0.06)",
                }}
              />
              <div className="relative z-[1]">
                <div
                  className="text-[30px] font-bold tabular-nums"
                  style={{
                    color: distribution.riskPct >= 60 ? COLORS.red : distribution.riskPct >= 35 ? COLORS.yellow : COLORS.green,
                    textShadow: "0 0 16px rgba(148,163,184,0.35)",
                  }}
                >
                  {distribution.riskPct}%
                </div>
                <div className="text-xs text-slate-400">Риск</div>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            Выше при большей доле просроченных тендеров и процедур «в процессе».
          </p>
          <div className="mt-4">
            <AnalyticsLegendList>
              <AnalyticsLegendItem markerColor={COLORS.green} label="Проведены" value={distribution.conducted} />
              <AnalyticsLegendItem markerColor={COLORS.yellow} label="В процессе" value={distribution.inProgress} />
              <AnalyticsLegendItem markerColor={COLORS.red} label="Просрочены" value={distribution.overdue} />
              <AnalyticsLegendItem markerColor={COLORS.gray} label="Нет данных" value={distribution.noData} />
            </AnalyticsLegendList>
          </div>
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
