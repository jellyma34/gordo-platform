"use client";

import { useMemo, type CSSProperties } from "react";
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
  type ScriptableLineSegmentContext,
} from "chart.js";
import { type GPRTask, type ProjectPartKey } from "@/lib/gprUtils";
import type { TMCItem } from "@/lib/tmcData";
import { buildGprTmcDependencySeries } from "@/lib/gprTmcDependency";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const PLAN_LINE = "#e2e8f0";
const FACT_LINE = "#22c55e";
const TMC_LINE = "#f97316";

/** Допустимое |факт − план| по оси графика (п.п.) и порог по сроку (дн.). */
const THRESHOLD_DAYS = 14;

function formatDeviationDays(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "0 дн.";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d} дн.`;
}

function formatAvgDeviationDays(avg: number): string {
  const r = Math.round(avg);
  const sign = r > 0 ? "+" : "";
  return `${sign}${r} дн.`;
}

function tmcChartRiskLevel(series: { deviationDays: number | null }[]): "high" | "medium" | "low" {
  const days = series.map((s) => s.deviationDays).filter((d): d is number => d !== null);
  if (days.length === 0) return "medium";
  if (days.some((d) => d > THRESHOLD_DAYS)) return "high";
  if (days.every((d) => d <= 0)) return "low";
  return "medium";
}

/** Цвет маркера этапа в списке (референс: подготовка — красный, строительство — зелёный). */
function stageDeviationDotColor(groupKey: string): string {
  if (groupKey === "prep") return "#ef4444";
  if (groupKey === "build") return "#22c55e";
  if (groupKey === "network") return "#f59e0b";
  return "#94a3b8";
}

/** Подсветка числа отклонения по знаку (красный / зелёный + лёгкое свечение). */
function deviationListValueStyle(d: number | null): CSSProperties {
  if (d === null) {
    return { color: "#94a3b8", fontWeight: 700 };
  }
  if (d > 0) {
    return {
      color: "#ef4444",
      fontWeight: 700,
      textShadow: "0 0 8px rgba(239,68,68,0.35)",
    };
  }
  return {
    color: "#22c55e",
    fontWeight: 700,
    textShadow: "0 0 8px rgba(34,197,94,0.35)",
  };
}

function KpiMiniIconRuler() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" d="M4 18h16M6 18V9M10 18v-5M14 18V7M18 18v-3" />
    </svg>
  );
}

function KpiMiniIconChart() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16M7 15l3-4 4 6 5-10" />
    </svg>
  );
}

function KpiMiniIconAlert() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 17h.01M10.3 4.2h3.4L21 18H3L10.3 4.2z" />
    </svg>
  );
}

const Chart = dynamic(() => import("react-chartjs-2").then((m) => m.Chart), { ssr: false });

export function GPRTmcDependencyChart({
  tasks,
  tmcItems,
  activeProjectPart,
}: {
  tasks: GPRTask[];
  /** Может содержать все части (например после merge localStorage) — расчёт режет по activeProjectPart. */
  tmcItems: TMCItem[];
  activeProjectPart: ProjectPartKey;
}) {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const series = useMemo(
    () => buildGprTmcDependencySeries(tasks, tmcItems, todayIso, activeProjectPart),
    [tasks, tmcItems, todayIso, activeProjectPart],
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
  const tmcArr = useMemo(
    () => series.map((s) => (s.tmcSupply == null ? null : s.tmcSupply)),
    [series],
  );

  const kpiStats = useMemo(() => {
    const days = series.map((s) => s.deviationDays).filter((d): d is number => d !== null);
    const avgDev = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
    const risk = tmcChartRiskLevel(series);
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
          mutedClass: "text-amber-900/55",
          iconWrap: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25",
        };
      case "low":
        return {
          value: "Низкий",
          sub: "в норме",
          card: "border border-slate-600/50 bg-slate-900/40",
          valueClass: "text-slate-100",
          mutedClass: "text-slate-500",
          iconWrap: "bg-slate-800/90 text-sky-400/90 ring-1 ring-white/10",
        };
      default:
        return {
          value: "Средний",
          sub: "наблюдение",
          card: "border border-slate-600/50 bg-slate-900/40",
          valueClass: "text-slate-100",
          mutedClass: "text-slate-500",
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

    return {
      labels,
      datasets: [
        {
          label: "План ГПР",
          data: planArr,
          borderColor: PLAN_LINE,
          backgroundColor: "transparent",
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
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
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: FACT_LINE,
          pointBorderColor: "rgba(15,23,42,0.5)",
          pointBorderWidth: 1,
          borderWidth: 3,
          fill: {
            target: "-1",
          },
          segment: {
            backgroundColor: segmentFill,
          },
          order: 1,
        },
        {
          label: "Обеспеченность ТМЦ",
          data: tmcArr,
          borderColor: TMC_LINE,
          backgroundColor: "transparent",
          tension: 0.4,
          borderDash: [6, 4],
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: TMC_LINE,
          pointBorderColor: "rgba(15,23,42,0.5)",
          pointBorderWidth: 1,
          borderWidth: 2,
          fill: false,
          order: 2,
        },
      ],
    };
  }, [labels, planArr, factArr, tmcArr]);

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
              return series[i]?.stageFull ?? "";
            },
            label: (ctx) => {
              const v = ctx.parsed.y;
              const val = v == null || Number.isNaN(v) ? "—" : `${v}%`;
              return ` ${ctx.dataset.label}: ${val}`;
            },
            afterBody: (items) => {
              const i = items[0]?.dataIndex;
              if (i === undefined) return "";
              const p = planArr[i];
              const f = factArr[i];
              const lines: string[] = [];
              if (p != null && f != null) {
                const dev = f - p;
                const sign = dev > 0 ? "+" : "";
                lines.push(`Отклонение по %: ${sign}${dev} п.п.`);
              }
              const dd = series[i]?.deviationDays;
              lines.push(`Отклонение по сроку: ${formatDeviationDays(dd)}`);
              return lines;
            },
          },
        },
      },
    }),
    [series, planArr, factArr],
  );

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-50">
        Зависимость выполнения ГПР от обеспеченности ТМЦ
      </h3>

      <div className="mt-4 h-[340px] w-full">
        <Chart type="line" data={chartData} options={options} />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        Зелёная линия — факт ГПР, пунктир — обеспеченность ТМЦ.
        <br />
        Расхождение между ними указывает на влияние дефицита ресурсов.
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
            <div className="flex min-h-0 min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-600/50 bg-slate-900/40 px-3 py-3 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800/90 text-sky-400/90 ring-1 ring-white/10">
                <KpiMiniIconRuler />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Критический порог</div>
                <div className="value mt-0.5 text-base font-bold tabular-nums text-slate-100">{THRESHOLD_DAYS} дней</div>
                <div className="text-[11px] text-slate-500">задержка</div>
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-600/50 bg-slate-900/40 px-3 py-3 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800/90 text-sky-400/90 ring-1 ring-white/10">
                <KpiMiniIconChart />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Среднее отклонение</div>
                <div
                  className="value mt-0.5 text-base font-bold tabular-nums"
                  style={{ color: avgValueColor }}
                >
                  {kpiStats.avgDev === null ? "—" : formatAvgDeviationDays(kpiStats.avgDev)}
                </div>
                <div className="text-[11px] text-slate-500">по проекту</div>
              </div>
            </div>

            <div
              className={`flex min-h-0 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left ${riskCardUi.card}`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${riskCardUi.iconWrap}`}
              >
                <KpiMiniIconAlert />
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-[11px] font-medium uppercase tracking-wide ${riskCardUi.mutedClass}`}>
                  Риск срыва
                </div>
                <div className={`mt-0.5 text-base font-bold leading-tight ${riskCardUi.valueClass}`}>
                  {riskCardUi.value}
                </div>
                <div className={`text-[11px] ${riskCardUi.mutedClass}`}>{riskCardUi.sub}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
