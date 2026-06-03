"use client";

import { useMemo, useState } from "react";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions,
  type Plugin,
  type ScriptableLineSegmentContext,
} from "chart.js";
import { type GPRTask } from "@/lib/gprUtils";
import type { Tender } from "@/lib/tenderData";
import {
  buildGprTenderDependencyTimelineModel,
  formatGprTimelineMonthLabel,
  gprTenderDependencyKpiAtDate,
  type ForecastPart,
  type GprTenderDependencyTimelineModel,
} from "@/lib/gprTmcDependency";
import {
  computeGprTenderCoverage,
  GPR_TENDER_COVERAGE_RISK_THRESHOLD,
} from "@/lib/gprTenderCoverage";
import { formatGprProgressDeltaPp } from "./gprDependencyKpiShared";
import { formatDate, toLocalYmd } from "@/lib/gprReportDate";
import { toDate } from "@/lib/gprUtils";
import {
  formatInstallmentPlatformDateLabel,
  INSTALLMENT_FORECAST_TODAY_LINE,
} from "@/lib/installmentForecastChartTodayLine";
import { Chart } from "@/components/charting/reactChartjsChart";

type GprTenderReportDateLineOpts = {
  xMs: number | null;
  dateLabel: string;
};

/** Вертикаль отчётной даты под линиями графика; подпись DD.MM.YYYY над областью. */
const gprTenderReportDateLinePlugin: Plugin<"line"> = {
  id: "gprTenderReportDateLine",
  beforeDatasetsDraw(chart) {
    const opts = (
      chart.options.plugins as { gprTenderReportDateLine?: GprTenderReportDateLineOpts } | undefined
    )?.gprTenderReportDateLine;
    if (!opts || opts.xMs == null || !Number.isFinite(opts.xMs) || !chart.scales.x) return;

    const x = chart.scales.x.getPixelForValue(opts.xMs);
    const { ctx, chartArea } = chart;
    if (!Number.isFinite(x) || x < chartArea.left || x > chartArea.right) return;

    const xi = Math.round(x) + 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = INSTALLMENT_FORECAST_TODAY_LINE.stroke;
    ctx.lineWidth = INSTALLMENT_FORECAST_TODAY_LINE.strokeWidth;
    ctx.setLineDash([4, 5]);
    ctx.moveTo(xi, chartArea.top);
    ctx.lineTo(xi, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    if (opts.dateLabel) {
      ctx.font = `${INSTALLMENT_FORECAST_TODAY_LINE.labelFontWeight} ${INSTALLMENT_FORECAST_TODAY_LINE.labelFontSize}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(226, 232, 240, 0.92)";
      ctx.fillText(opts.dateLabel, x, chartArea.top - 6);
    }
    ctx.restore();
  },
};

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  gprTenderReportDateLinePlugin,
);

const PLAN_GPR_LINE = "#e2e8f0";
const FACT_GPR_LINE = "#22c55e";
const PLAN_TENDER_LINE = "#f59e0b";
const FACT_TENDER_LINE = "#eab308";

const THRESHOLD_PP = 15;

/** Режим линий на графике (KPI не зависят от режима). */
export type GprTenderChartViewMode = "plan" | "fact" | "all";

const CHART_VIEW_MODES: { id: GprTenderChartViewMode; label: string }[] = [
  { id: "plan", label: "План" },
  { id: "fact", label: "Факт" },
  { id: "all", label: "Все" },
];

type ChartSeriesKey = "planGpr" | "factGpr" | "planTender" | "factTender";

const SERIES_BY_VIEW_MODE: Record<GprTenderChartViewMode, ChartSeriesKey[]> = {
  plan: ["planGpr", "planTender"],
  fact: ["factGpr", "factTender"],
  all: ["planGpr", "factGpr", "planTender", "factTender"],
};

function pctLabel(v: number | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v}%`;
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  large,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  large?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-slate-600/50 bg-slate-900/40 px-4 py-3 ${
        large ? "sm:col-span-2 lg:col-span-1" : ""
      }`}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-0.5 font-bold tabular-nums text-slate-100 ${large ? "text-2xl" : "text-lg"}`}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function GPRTenderDependencyChart({
  tasks,
  tenders,
  activeProjectPart,
  reportAsOfIso: reportAsOfIsoProp,
  reportDateLabel: reportDateLabelProp,
}: {
  tasks: GPRTask[];
  tenders: Tender[];
  activeProjectPart: ForecastPart;
  analyticDepth?: "work" | "presentation";
  reportAsOfIso?: string;
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

  const part: ForecastPart = activeProjectPart === "project" ? "project" : activeProjectPart;

  const timeline = useMemo(
    (): GprTenderDependencyTimelineModel | null =>
      buildGprTenderDependencyTimelineModel(tasks, tenders, todayIso, part),
    [tasks, tenders, todayIso, part],
  );

  const kpiAtDate = useMemo(
    () => gprTenderDependencyKpiAtDate(tasks, tenders, todayIso, part),
    [tasks, tenders, todayIso, part],
  );

  const coverage = useMemo(
    () => computeGprTenderCoverage(tasks, tenders, part),
    [tasks, tenders, part],
  );

  const coverageAccent = useMemo(() => {
    if (coverage.coveragePercent == null) return undefined;
    if (coverage.belowRiskThreshold) return "#f59e0b";
    return "#22c55e";
  }, [coverage.belowRiskThreshold, coverage.coveragePercent]);

  /** По умолчанию «План» — две линии, удобнее для презентации руководству. */
  const [viewMode, setViewMode] = useState<GprTenderChartViewMode>("plan");

  const chartData = useMemo(() => {
    if (!timeline) {
      return { datasets: [] };
    }

    const planByX = new Map(timeline.planSeries.map((p) => [p.x, p.y]));
    const factByX = new Map(timeline.factSeries.map((p) => [p.x, p.y]));
    const visibleKeys = new Set(SERIES_BY_VIEW_MODE[viewMode]);

    const segmentFill = (ctx: ScriptableLineSegmentContext) => {
      const p0 = ctx.p0 as { parsed?: { x?: number } } | undefined;
      const x = p0?.parsed?.x;
      if (x == null) return "rgba(148, 163, 184, 0.08)";
      const plan = planByX.get(x);
      const fact = factByX.get(x);
      if (plan == null || fact == null) {
        return "rgba(148, 163, 184, 0.08)";
      }
      const deviation = Math.abs(fact - plan);
      if (deviation <= THRESHOLD_PP) {
        return "rgba(34, 197, 94, 0.25)";
      }
      return "rgba(239, 68, 68, 0.25)";
    };

    const allDatasets: Array<{
      seriesKey: ChartSeriesKey;
      label: string;
      data: { x: number; y: number }[];
      borderColor: string;
      backgroundColor: string;
      tension: number;
      pointRadius: number;
      pointHoverRadius: number;
      pointBackgroundColor: string;
      pointBorderColor: string;
      pointBorderWidth: number;
      borderWidth: number;
      fill: boolean | { target: string };
      borderDash?: number[];
      segment?: { backgroundColor: (ctx: ScriptableLineSegmentContext) => string };
      order: number;
      parsing: { xAxisKey: string; yAxisKey: string };
    }> = [
      {
        seriesKey: "planGpr",
        label: "План ГПР",
        data: timeline.planSeries.map((p) => ({ x: p.x, y: p.y })),
        borderColor: PLAN_GPR_LINE,
        backgroundColor: "transparent",
        tension: 0.38,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: PLAN_GPR_LINE,
        pointBorderColor: "rgba(15,23,42,0.6)",
        pointBorderWidth: 1,
        borderWidth: 2,
        fill: false,
        order: 0,
        parsing: { xAxisKey: "x", yAxisKey: "y" },
      },
      {
        seriesKey: "factGpr",
        label: "Факт ГПР",
        data: timeline.factSeries.map((p) => ({ x: p.x, y: p.y })),
        borderColor: FACT_GPR_LINE,
        backgroundColor: "transparent",
        tension: 0.38,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: FACT_GPR_LINE,
        pointBorderColor: "rgba(15,23,42,0.5)",
        pointBorderWidth: 1,
        borderWidth: 2.5,
        fill:
          viewMode === "all"
            ? { target: "-1" }
            : false,
        segment: viewMode === "all" ? { backgroundColor: segmentFill } : undefined,
        order: 1,
        parsing: { xAxisKey: "x", yAxisKey: "y" },
      },
      {
        seriesKey: "planTender",
        label: "План тендеров",
        data: timeline.planTenderSeries.map((p) => ({ x: p.x, y: p.y })),
        borderColor: PLAN_TENDER_LINE,
        backgroundColor: "transparent",
        tension: 0.38,
        borderDash: [6, 4],
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: PLAN_TENDER_LINE,
        pointBorderColor: "rgba(15,23,42,0.5)",
        pointBorderWidth: 1,
        borderWidth: 2,
        fill: false,
        order: 2,
        parsing: { xAxisKey: "x", yAxisKey: "y" },
      },
      {
        seriesKey: "factTender",
        label: "Факт тендеров",
        data: timeline.factTenderSeries.map((p) => ({ x: p.x, y: p.y })),
        borderColor: FACT_TENDER_LINE,
        backgroundColor: "transparent",
        tension: 0.38,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: FACT_TENDER_LINE,
        pointBorderColor: "rgba(15,23,42,0.5)",
        pointBorderWidth: 1,
        borderWidth: 2,
        fill: false,
        order: 3,
        parsing: { xAxisKey: "x", yAxisKey: "y" },
      },
    ];

    return {
      datasets: allDatasets
        .filter((d) => visibleKeys.has(d.seriesKey))
        .map(({ seriesKey: _sk, ...rest }) => rest),
    };
  }, [timeline, viewMode]);

  const options: ChartOptions<"line"> = useMemo(
    () =>
      !timeline
        ? { responsive: true, maintainAspectRatio: false }
        : {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "nearest", axis: "x", intersect: false },
            layout: { padding: { top: 28, right: 10, left: 4, bottom: 4 } },
            scales: {
              x: {
                type: "linear",
                min: timeline.axisMinMs,
                max: timeline.axisMaxMs,
                grid: { color: "rgba(148,163,184,0.08)" },
                ticks: {
                  color: "#94a3b8",
                  font: { size: 11 },
                  maxTicksLimit: 14,
                  callback: (v) => {
                    const n = typeof v === "number" ? v : Number(v);
                    if (!Number.isFinite(n)) return "";
                    return formatGprTimelineMonthLabel(n);
                  },
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
              gprTenderReportDateLine: {
                xMs: timeline.todayMs,
                dateLabel: formatInstallmentPlatformDateLabel(timeline.todayIso),
              },
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
                    const raw = items[0]?.raw as { x?: number } | undefined;
                    const x = raw?.x;
                    if (x == null || !Number.isFinite(x)) return "";
                    return formatGprTimelineMonthLabel(x);
                  },
                  label: (ctx) => {
                    const v = ctx.parsed.y;
                    const val = v == null || Number.isNaN(v) ? "—" : `${v}%`;
                    return ` ${ctx.dataset.label}: ${val}`;
                  },
                  afterBody: (items) => {
                    const raw = items[0]?.raw as { x?: number } | undefined;
                    const x = raw?.x;
                    if (x == null) return "";
                    const row = timeline.points.find((p) => p.monthMs === x);
                    if (!row) return "";
                    const lines: string[] = [];
                    const showPlanGpr = viewMode === "plan" || viewMode === "all";
                    const showFactGpr = viewMode === "fact" || viewMode === "all";
                    const showPlanT = viewMode === "plan" || viewMode === "all";
                    const showFactT = viewMode === "fact" || viewMode === "all";
                    if (showPlanGpr && showFactGpr && row.planGpr != null && row.factGpr != null) {
                      lines.push(`ГПР план vs факт: ${formatGprProgressDeltaPp(row.factGpr - row.planGpr)}`);
                    }
                    if (showPlanT && showFactT && row.planTenders != null && row.factTenders != null) {
                      lines.push(
                        `Тендеры план vs факт: ${formatGprProgressDeltaPp(row.factTenders - row.planTenders)}`,
                      );
                    }
                    if (viewMode === "plan" && row.planGpr != null && row.planTenders != null) {
                      lines.push(
                        `Закупки vs стройка (план): ${formatGprProgressDeltaPp(row.planTenders - row.planGpr)}`,
                      );
                    }
                    if (viewMode === "fact" && row.factGpr != null && row.factTenders != null) {
                      lines.push(
                        `Закупки vs стройка (факт): ${formatGprProgressDeltaPp(row.factTenders - row.factGpr)}`,
                      );
                    }
                    return lines;
                  },
                },
              },
            },
          },
    [timeline, viewMode],
  );

  const chartCaption = useMemo(() => {
    const base = `По оси X — месяцы календаря проекта. KPI и обеспеченность — на дату отчёта (${reportDateLabel}).`;
    if (viewMode === "plan") {
      return `${base} Режим «План»: сопоставление планового графика стройки (серая линия) и плановой готовности закупок (оранжевая, пунктир).`;
    }
    if (viewMode === "fact") {
      return `${base} Режим «Факт»: фактическое выполнение работ (зелёная) и фактическая готовность тендеров (жёлтая) на текущую дату.`;
    }
    return `${base} Режим «Все»: четыре линии план/факт ГПР и тендеров; заливка между планом и фактом ГПР — отклонение темпа.`;
  }, [reportDateLabel, viewMode]);

  return (
    <div className="mt-6 min-w-0 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-50">
          Зависимость выполнения ГПР от тендеров
        </h3>
        {coverage.belowRiskThreshold ? (
          <span className="rounded-full border border-amber-500/50 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">
            Обеспеченность ниже {GPR_TENDER_COVERAGE_RISK_THRESHOLD}%
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">Линии на графике</p>
        <div
          className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5"
          role="tablist"
          aria-label="Режим отображения графика"
        >
          {CHART_VIEW_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={viewMode === m.id}
              onClick={() => setViewMode(m.id)}
              className={segmentedControlTabClass(viewMode === m.id, "dark")}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 h-[260px] w-full min-w-0 sm:h-[300px] md:h-[340px]">
        {timeline ? (
          <Chart key={viewMode} type="line" data={chartData} options={options} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 text-center text-sm text-slate-400">
            Недостаточно дат ГПР и тендеров для построения календарной шкалы.
          </div>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-400">{chartCaption}</p>

      <div className="mt-5 border-t border-slate-700/60 pt-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="План ГПР" value={pctLabel(kpiAtDate.planGpr)} sub="на дату отчёта" />
          <KpiCard label="Факт ГПР" value={pctLabel(kpiAtDate.factGpr)} sub="на дату отчёта" />
          <KpiCard label="План тендеров" value={pctLabel(kpiAtDate.planTenders)} sub="на дату отчёта" />
          <KpiCard label="Факт тендеров" value={pctLabel(kpiAtDate.factTenders)} sub="на дату отчёта" />
          <KpiCard
            label="Обеспеченность ГПР тендерами"
            value={pctLabel(coverage.coveragePercent)}
            sub={`листовые работы · порог ${GPR_TENDER_COVERAGE_RISK_THRESHOLD}%`}
            accent={coverageAccent}
            large
          />
        </div>

        <div className="mt-5">
          <h4 className="text-sm font-semibold text-slate-200">Работы без обеспечивающих тендеров</h4>
          {coverage.unprovided.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">
              Все листовые работы с ненулевым весом обеспечены тендерами на дату отчёта.
            </p>
          ) : (
            <div className="mt-3 max-h-[280px] overflow-auto rounded-lg border border-slate-700/50">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="sticky top-0 bg-slate-900/95 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Шифр</th>
                    <th className="px-3 py-2 font-medium">Работа</th>
                    <th className="px-3 py-2 font-medium">Тендер</th>
                    <th className="px-3 py-2 font-medium">Причина</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40 text-slate-200">
                  {coverage.unprovided.map((row) => (
                    <tr key={`${row.partId}-${row.code}`} className="hover:bg-slate-800/40">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums font-medium">{row.code}</td>
                      <td className="max-w-[240px] px-3 py-2 leading-snug">{row.name}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-400">
                        {row.matchedTenderCode ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            Показано {coverage.unprovided.length} из {coverage.leafCount} листовых работ с весом в расчёте.
            Покрыто: {coverage.coveredLeafCount}.
          </p>
        </div>
      </div>
    </div>
  );
}
