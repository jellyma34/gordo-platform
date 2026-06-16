"use client";

import { useMemo } from "react";
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
import { type GPRTask, type ProjectPartKey, formatGprScheduleDeviationDisplayDays } from "@/lib/gprUtils";
import type { TMCItem } from "@/lib/tmcData";
import {
  buildGprTmcDependencyChartSeries,
  buildGprTmcDependencyChartSeriesProjectWide,
  type ForecastPart,
} from "@/lib/gprTmcDependency";
import { GPR_PROGRESS_DELTA_CRITICAL_PP } from "@/lib/gprConstructionDeviationConstants";
import { formatDate, toLocalYmd } from "@/lib/gprReportDate";
import { toDate } from "@/lib/gprUtils";
import { formatGprProgressDeltaPp } from "./gprDependencyKpiShared";
import { Chart } from "@/components/charting/reactChartjsChart";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const PLAN_LINE = "#e2e8f0";
const FACT_LINE = "#22c55e";
const TMC_LINE = "#f97316";

export function GPRTmcDependencyChart({
  tasks,
  tmcItems,
  activeProjectPart,
  analyticDepth = "work",
  reportAsOfIso: reportAsOfIsoProp,
  reportDateLabel: reportDateLabelProp,
}: {
  tasks: GPRTask[];
  /** Может содержать все части (например после merge localStorage) — расчёт режет по activeProjectPart. */
  tmcItems: TMCItem[];
  activeProjectPart: ForecastPart;
  /** Презентация: KPI без раскрывающихся пояснений (формулы — только в рабочем разборе). */
  analyticDepth?: "work" | "presentation";
  /** YYYY-MM-DD (локальный календарь дня), единая с датой отчёта на дашборде ГПР. */
  reportAsOfIso?: string;
  /** Подпись DD.MM у KPI «отклонение на …». */
  reportDateLabel?: string;
}) {
  const sessionYmd = useMemo(() => toLocalYmd(new Date()), []);
  const todayIso = reportAsOfIsoProp ?? sessionYmd;
  const reportDateLabel = useMemo(
    () =>
      reportDateLabelProp?.trim()
        ? reportDateLabelProp.trim()
        : formatDate(toDate(todayIso) ?? new Date()),
    [reportDateLabelProp, todayIso],
  );

  const chartSeries = useMemo(
    () =>
      activeProjectPart === "project"
        ? buildGprTmcDependencyChartSeriesProjectWide(tasks, tmcItems, todayIso)
        : buildGprTmcDependencyChartSeries(tasks, tmcItems, todayIso, activeProjectPart),
    [tasks, tmcItems, todayIso, activeProjectPart],
  );

  const labels = useMemo(() => chartSeries.map((s) => s.stageShort), [chartSeries]);
  const planArr = useMemo(
    () => chartSeries.map((s) => (s.planGpr == null ? null : s.planGpr)),
    [chartSeries],
  );
  const factArr = useMemo(
    () => chartSeries.map((s) => (s.factGpr == null ? null : s.factGpr)),
    [chartSeries],
  );
  const tmcArr = useMemo(
    () => chartSeries.map((s) => (s.tmcSupply == null ? null : s.tmcSupply)),
    [chartSeries],
  );

  const xTickRotation = labels.length > 8 ? 90 : labels.length > 4 ? 45 : 0;

  const chartData = useMemo(() => {
    const segmentFill = (ctx: ScriptableLineSegmentContext) => {
      const i = ctx.p0DataIndex;
      const plan = planArr[i];
      const fact = factArr[i];
      if (plan == null || fact == null) {
        return "rgba(148, 163, 184, 0.08)";
      }
      const deviation = Math.abs(fact - plan);
      if (deviation <= GPR_PROGRESS_DELTA_CRITICAL_PP) {
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
        padding: {
          top: 6,
          right: 10,
          left: 4,
          bottom: xTickRotation >= 45 ? 28 : 4,
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(148,163,184,0.08)" },
          ticks: {
            color: "#94a3b8",
            font: { size: labels.length > 10 ? 10 : 11 },
            maxRotation: xTickRotation,
            minRotation: xTickRotation,
            autoSkip: labels.length > 16,
            maxTicksLimit: labels.length > 20 ? 24 : undefined,
          },
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
              const row = chartSeries[i];
              if (!row) return "";
              return `${row.stageShort} — ${row.stageTitle}`;
            },
            label: (ctx) => {
              const v = ctx.parsed.y;
              const val = v == null || Number.isNaN(v) ? "—" : `${v}%`;
              return ` ${ctx.dataset.label}: ${val}`;
            },
            afterBody: (items) => {
              const i = items[0]?.dataIndex;
              if (i === undefined) return "";
              const lines: string[] = [];
              const pp = chartSeries[i]?.progressDeltaPp;
              const dd = chartSeries[i]?.deviationDays;
              const dlab = reportDateLabel ? ` на ${reportDateLabel}` : "";
              if (pp != null) {
                lines.push(`Отклонение готовности${dlab}: ${formatGprProgressDeltaPp(pp)}`);
              }
              lines.push(`Отклонение по сроку${dlab}: ${formatGprScheduleDeviationDisplayDays(dd)}`);
              return lines;
            },
          },
        },
      },
    }),
    [chartSeries, labels.length, planArr, factArr, reportDateLabel, xTickRotation],
  );

  return (
    <div className="min-w-0 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-6">
      <h3 className="text-lg font-semibold text-slate-50">
        Зависимость выполнения ГПР от обеспеченности ТМЦ
      </h3>

      <div className="mt-4 h-[260px] w-full min-w-0 sm:h-[300px] md:h-[340px]">
        <Chart type="line" data={chartData} options={options} />
      </div>
    </div>
  );
}
