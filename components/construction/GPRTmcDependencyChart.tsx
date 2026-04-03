"use client";

import { useMemo } from "react";
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
import { getStatusByDeviation, type GPRTask, type ProjectPartKey } from "@/lib/gprUtils";
import type { TMCItem } from "@/lib/tmcData";
import { buildGprTmcDependencySeries } from "@/lib/gprTmcDependency";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const PLAN_LINE = "#e2e8f0";
const FACT_LINE = "#22c55e";
const TMC_LINE = "#f97316";

/** Допустимое |факт − план| по оси графика (п.п.). */
const THRESHOLD_DAYS = 14;

function formatDeviationDays(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "0 дн.";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d} дн.`;
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
          label: "Обеспеченность ТМЦ",
          data: tmcArr,
          borderColor: TMC_LINE,
          backgroundColor: "transparent",
          tension: 0.4,
          borderDash: [6, 4],
          pointRadius: 3,
          pointHoverRadius: 5,
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">
            Зависимость выполнения ГПР от обеспеченности ТМЦ
          </h3>
          <p className="mt-1 max-w-xl text-xs text-slate-400">
            Заливка между планом и фактом: зелёный, если |факт − план| ≤ {THRESHOLD_DAYS} п.п. (в допуске);
            красный — отклонение больше порога. Знак не важен (опережение и отставание считаются одинаково).
            Линия ТМЦ без заливки.
          </p>
        </div>
        <p className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-100/95">
          Дефицит ТМЦ → просадка ГПР
        </p>
      </div>

      <div className="mt-4 h-[340px] w-full">
        <Chart type="line" data={chartData} options={options} />
      </div>

      <div className="mt-5 border-t border-slate-700/60 pt-4">
        <h4 className="text-sm font-semibold text-slate-200">Отклонения по этапам</h4>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          По сроку окончания корневой работы этапа: «+» — отставание, «−» — опережение. Цвет: зелёный — опережение;
          жёлтый — задержка до 14 дн.; красный — отставание свыше 14 дн. (та же логика, что в аналитике ГПР).
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {series.map((row) => {
            const d = row.deviationDays;
            const st = d === null ? null : getStatusByDeviation(d);
            const dotColor =
              st === null ? "#64748b" : st === "green" ? "#22c55e" : st === "yellow" ? "#f59e0b" : "#ef4444";
            const textColor =
              st === null ? "#94a3b8" : st === "green" ? "#86efac" : st === "yellow" ? "#fcd34d" : "#fca5a5";

            return (
              <li
                key={row.groupKey}
                className="flex items-center justify-between gap-3 text-xs"
                title={row.stageFull}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2 text-slate-300">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/10"
                    style={{ backgroundColor: dotColor }}
                    aria-hidden
                  />
                  <span className="stage-title min-w-0 flex-1 leading-snug" title={row.stageTitle}>
                    {row.stageTitle}
                  </span>
                </span>
                <span
                  className="shrink-0 tabular-nums text-[13px] font-semibold"
                  style={{ color: textColor }}
                >
                  {formatDeviationDays(d)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
