"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions,
  type ScriptableContext,
  type ScriptableLineSegmentContext,
} from "chart.js";
import { type GPRTask, type ProjectPartKey } from "@/lib/gprUtils";
import type { Tender } from "@/lib/tenderData";
import {
  buildGprTenderDependencySeries,
  type GprTenderDependencyPoint,
} from "@/lib/gprTmcDependency";
import {
  GPR_DEP_KPI_THRESHOLD_DAYS,
  formatDeviationDays,
  formatAvgDeviationDays,
  stageDeviationDotColor,
  deviationListValueStyle,
  KpiMiniIconRuler,
  KpiMiniIconChart,
  KpiMiniIconAlert,
  GprDepKpiAccordionCard,
  type GprDepKpiExplainKey,
  KPI_THRESHOLD_EXPLAIN,
  buildAvgDeviationExplanation,
} from "./gprDependencyKpiShared";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const PLAN_LINE = "#e2e8f0";
const FACT_LINE = "#22c55e";
const TENDER_LINE = "#f59e0b";

/** Допустимое |факт − план| по оси графика (п.п.) — как у графика ТМЦ. */
const THRESHOLD_DAYS = GPR_DEP_KPI_THRESHOLD_DAYS;

/** Порог отставания готовности тендеров от факта ГПР (п.п.) для красной точки. */
const TENDER_LAG_CRITICAL_PP = 15;

function tenderChartRiskLevel(series: GprTenderDependencyPoint[]): "high" | "medium" | "low" {
  const comparisons = series
    .map((s) => ({ tr: s.tenderReadiness, fg: s.factGpr }))
    .filter((x): x is { tr: number; fg: number } => x.tr !== null && x.fg !== null);
  if (comparisons.length === 0) return "medium";
  const lags = comparisons.filter(({ tr, fg }) => tr < fg);
  if (lags.length > 0) return "high";
  const allAhead = comparisons.every(({ tr, fg }) => tr > fg);
  if (allAhead) return "low";
  return "medium";
}

function tenderRiskKpiExplanationText(risk: "high" | "medium" | "low"): string {
  if (risk === "high") {
    return "По одному или нескольким этапам доля готовности тендеров ниже факта ГПР (%): тендеры отстают от хода работ — высокий риск замедления.";
  }
  if (risk === "low") {
    return "По всем этапам с данными готовность тендеров выше факта ГПР — договорная база опережает ход работ по %.";
  }
  return "Готовность тендеров не отстаёт от факта ГПР по этапам с данными, но нет устойчивого опережения по всем точкам — риск оценивается как средний.";
}

const Chart = dynamic(() => import("react-chartjs-2").then((m) => m.Chart), { ssr: false });

export function GPRTenderDependencyChart({
  tasks,
  tenders,
  activeProjectPart,
}: {
  tasks: GPRTask[];
  tenders: Tender[];
  activeProjectPart: ProjectPartKey;
}) {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const series = useMemo(
    () => buildGprTenderDependencySeries(tasks, tenders, todayIso, activeProjectPart),
    [tasks, tenders, todayIso, activeProjectPart],
  );

  const labels = useMemo(() => series.map((s) => s.stageShort), [series]);
  const planArr = useMemo(
    () => series.map((s) => (s.planGpr == null ? null : s.planGpr)),
    [series],
  );
  const factArr = useMemo(
    () => series.map((s) => (s.factGpr == null ? null : s.factGpr)),
    [series],
  );
  const tenderArr = useMemo(
    () => series.map((s) => (s.tenderReadiness == null ? null : s.tenderReadiness)),
    [series],
  );

  const kpiStats = useMemo(() => {
    const days = series.map((s) => s.deviationDays).filter((d): d is number => d !== null);
    const avgDev = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
    const risk = tenderChartRiskLevel(series);
    return { avgDev, risk };
  }, [series]);

  const riskCardUi = useMemo(() => {
    switch (kpiStats.risk) {
      case "high":
        return {
          value: "Высокий",
          sub: "требует внимания",
          card: "border border-[rgba(245,158,11,0.5)] bg-[rgba(245,158,11,0.08)]",
          valueClass: "text-[#f59e0b]",
          iconWrap: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25",
        };
      case "low":
        return {
          value: "Низкий",
          sub: "в норме",
          card: "border border-slate-600/50 bg-slate-900/40",
          valueClass: "text-slate-100",
          iconWrap: "bg-slate-800/90 text-sky-400/90 ring-1 ring-white/10",
        };
      default:
        return {
          value: "Средний",
          sub: "наблюдение",
          card: "border border-slate-600/50 bg-slate-900/40",
          valueClass: "text-slate-100",
          iconWrap: "bg-slate-800/90 text-sky-400/90 ring-1 ring-white/10",
        };
    }
  }, [kpiStats.risk]);

  const avgValueColor = useMemo(() => {
    if (kpiStats.avgDev === null) return "#e2e8f0";
    if (kpiStats.avgDev < 0) return "#22c55e";
    if (kpiStats.avgDev > 0) return "#ef4444";
    return "#e2e8f0";
  }, [kpiStats.avgDev]);

  const [kpiExplain, setKpiExplain] = useState<GprDepKpiExplainKey | null>(null);
  const toggleKpiExplain = (k: GprDepKpiExplainKey) => {
    setKpiExplain((prev) => (prev === k ? null : k));
  };

  const avgExplainText = useMemo(
    () => buildAvgDeviationExplanation(series, kpiStats.avgDev),
    [series, kpiStats.avgDev],
  );
  const riskExplainText = useMemo(() => tenderRiskKpiExplanationText(kpiStats.risk), [kpiStats.risk]);

  const chartData = useMemo(() => {
    const segmentFill = (ctx: ScriptableLineSegmentContext) => {
      const i = ctx.p0DataIndex;
      const plan = planArr[i];
      const fact = factArr[i];
      if (plan == null || fact == null) {
        return "rgba(148, 163, 184, 0.08)";
      }
      const deviation = Math.abs(fact - plan);
      if (deviation <= THRESHOLD_DAYS) {
        return "rgba(34, 197, 94, 0.25)";
      }
      return "rgba(239, 68, 68, 0.25)";
    };

    const tenderPointColor = (ctx: ScriptableContext<"line">) => {
      const i = ctx.dataIndex;
      const tr = tenderArr[i];
      const fg = factArr[i];
      if (tr == null || fg == null) return TENDER_LINE;
      if (tr >= fg) return TENDER_LINE;
      const gap = fg - tr;
      return gap > TENDER_LAG_CRITICAL_PP ? "#ef4444" : "#f59e0b";
    };

    return {
      labels,
      datasets: [
        {
          label: "План ГПР",
          data: planArr,
          borderColor: PLAN_LINE,
          backgroundColor: "transparent",
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: PLAN_LINE,
          pointBorderColor: "rgba(15,23,42,0.6)",
          pointBorderWidth: 1,
          borderWidth: 2,
          fill: false,
          order: 0,
        },
        {
          label: "Факт ГПР",
          data: factArr,
          borderColor: FACT_LINE,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: FACT_LINE,
          pointBorderColor: "rgba(15,23,42,0.5)",
          pointBorderWidth: 1,
          borderWidth: 2.5,
          fill: {
            target: "-1",
          },
          segment: {
            backgroundColor: segmentFill,
          },
          order: 1,
        },
        {
          label: "Готовность тендеров",
          data: tenderArr,
          borderColor: TENDER_LINE,
          backgroundColor: "transparent",
          tension: 0.4,
          borderDash: [6, 4],
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: tenderPointColor,
          pointBorderColor: "rgba(15,23,42,0.5)",
          pointBorderWidth: 1,
          borderWidth: 2,
          fill: false,
          order: 2,
        },
      ],
    };
  }, [labels, planArr, factArr, tenderArr]);

  const options: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      layout: {
        padding: { top: 6, right: 10, left: 4, bottom: 4 },
      },
      scales: {
        x: {
          grid: { color: "rgba(148,163,184,0.08)" },
          ticks: { color: "#94a3b8", font: { size: 11 }, maxRotation: 0 },
          border: { color: "rgba(148,163,184,0.2)" },
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: "rgba(148,163,184,0.1)" },
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
            callback: (v) => `${v}%`,
          },
          border: { color: "rgba(148,163,184,0.2)" },
        },
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#cbd5e1",
            boxWidth: 10,
            padding: 16,
            font: { size: 12 },
          },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.96)",
          titleColor: "#f1f5f9",
          bodyColor: "#cbd5e1",
          borderColor: "rgba(148,163,184,0.35)",
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex;
              if (i === undefined) return "";
              return series[i]?.stageTitle ?? "";
            },
            label: (ctx) => {
              const v = ctx.parsed.y;
              const val = v == null || Number.isNaN(v) ? "—" : `${v}%`;
              return ` ${ctx.dataset.label}: ${val}`;
            },
            afterBody: (items) => {
              const i = items[0]?.dataIndex;
              if (i === undefined) return "";
              const row = series[i];
              if (!row) return "";
              const p = planArr[i];
              const f = factArr[i];
              const lines: string[] = [];
              if (p != null && f != null) {
                const dev = f - p;
                const sign = dev > 0 ? "+" : "";
                lines.push(`Отклонение по %: ${sign}${dev} п.п.`);
              }
              lines.push(`Отклонение по сроку: ${formatDeviationDays(row.deviationDays)}`);
              lines.push("");
              lines.push(
                `Тендеры: всего ${row.tenderStats.total}, с договором ${row.tenderStats.completed}, отставание договора >14 дн.: ${row.tenderStats.delayed}, риск 1–14 дн.: ${row.tenderStats.riskContracts}`,
              );
              if (row.tenderReadiness != null) {
                lines.push(`Готовность тендеров: ${row.tenderReadiness}%`);
              } else {
                lines.push("Готовность тендеров: —");
              }
              lines.push("");
              lines.push(row.insight);
              return lines;
            },
          },
        },
      },
    }),
    [series, planArr, factArr],
  );

  return (
    <div className="mt-6 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-50">
        Зависимость выполнения ГПР от тендеров
      </h3>

      <div className="mt-4 h-[340px] w-full">
        <Chart type="line" data={chartData} options={options} />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        Зелёная линия — факт ГПР, пунктир — готовность тендеров.
        <br />
        Отставание тендеров от графика ГПР указывает на риск замедления работ.
      </p>

      <div className="mt-5 border-t border-slate-700/60 pt-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-4">
          <div className="w-full min-w-0 rounded-xl border border-slate-600/50 bg-slate-900/35 p-4 lg:w-[45%] lg:max-w-[50%] lg:shrink-0">
            <h4 className="text-sm font-semibold text-slate-200">Отклонения по этапам</h4>
            <ul className="mt-3 space-y-2.5 text-xs leading-snug">
              {series.map((row) => {
                const d = row.deviationDays;
                const dot = stageDeviationDotColor(row.groupKey);
                return (
                  <li
                    key={row.groupKey}
                    className="flex items-baseline justify-between gap-3"
                    title={row.stageFull}
                  >
                    <span className="flex min-w-0 flex-1 items-baseline gap-2 text-slate-200">
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full ring-1 ring-black/20"
                        style={{ backgroundColor: dot }}
                        aria-hidden
                      />
                      <span className="stage-title min-w-0 leading-snug">{row.stageTitle}</span>
                    </span>
                    <span
                      className="value shrink-0 tabular-nums text-sm font-bold leading-snug"
                      style={deviationListValueStyle(d)}
                    >
                      {formatDeviationDays(d)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3">
            <GprDepKpiAccordionCard
              cardKey="threshold"
              isOpen={kpiExplain === "threshold"}
              onToggle={toggleKpiExplain}
              shellClassName="border border-slate-600/50 bg-slate-900/40"
              explanation={KPI_THRESHOLD_EXPLAIN}
              iconSlot={
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800/90 text-sky-400/90 ring-1 ring-white/10">
                  <KpiMiniIconRuler />
                </span>
              }
            >
              <>
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Критический порог</div>
                <div className="value mt-0.5 text-base font-bold tabular-nums text-slate-100">
                  {GPR_DEP_KPI_THRESHOLD_DAYS} дней
                </div>
                <div className="text-[11px] text-slate-500">задержка</div>
              </>
            </GprDepKpiAccordionCard>

            <GprDepKpiAccordionCard
              cardKey="avg"
              isOpen={kpiExplain === "avg"}
              onToggle={toggleKpiExplain}
              shellClassName="border border-slate-600/50 bg-slate-900/40"
              explanation={avgExplainText}
              iconSlot={
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800/90 text-sky-400/90 ring-1 ring-white/10">
                  <KpiMiniIconChart />
                </span>
              }
            >
              <>
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Среднее отклонение</div>
                <div
                  className="value mt-0.5 text-base font-bold tabular-nums"
                  style={{ color: avgValueColor }}
                >
                  {kpiStats.avgDev === null ? "—" : formatAvgDeviationDays(kpiStats.avgDev)}
                </div>
                <div className="text-[11px] text-slate-500">по проекту</div>
              </>
            </GprDepKpiAccordionCard>

            <GprDepKpiAccordionCard
              cardKey="risk"
              isOpen={kpiExplain === "risk"}
              onToggle={toggleKpiExplain}
              shellClassName={riskCardUi.card}
              explanation={riskExplainText}
              iconSlot={
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${riskCardUi.iconWrap}`}
                >
                  <KpiMiniIconAlert />
                </span>
              }
            >
              <>
                <div
                  className="text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: "#E6EDF3" }}
                >
                  Риск тендеров
                </div>
                <div className={`value mt-0.5 text-base font-bold leading-tight ${riskCardUi.valueClass}`}>
                  {riskCardUi.value}
                </div>
                <div className="text-[11px]" style={{ color: "#A3B3C7" }}>
                  {riskCardUi.sub}
                </div>
              </>
            </GprDepKpiAccordionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
