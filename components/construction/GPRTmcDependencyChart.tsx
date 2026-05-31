"use client";

import { useMemo, useState } from "react";
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
  buildGprTmcDependencySeries,
  buildGprTmcDependencySeriesProjectWide,
  type ForecastPart,
} from "@/lib/gprTmcDependency";
import {
  assessTmcDependencyRisk,
  buildTmcDependencyRiskExplanation,
} from "@/lib/gprTmcDependencyRisk";
import { GPR_PROGRESS_DELTA_CRITICAL_PP } from "@/lib/gprConstructionDeviationConstants";
import { formatDate, toLocalYmd } from "@/lib/gprReportDate";
import { toDate } from "@/lib/gprUtils";
import {
  formatGprProgressDeltaPp,
  stageDeviationDotColor,
  gprScheduleDeviationListStyle,
  KpiMiniIconRuler,
  KpiMiniIconChart,
  KpiMiniIconAlert,
  GprDepKpiAccordionCard,
  type GprDepKpiExplainKey,
  buildAvgDeviationExplanation,
  GPR_DEP_KPI_THRESHOLD_DAYS,
  KPI_THRESHOLD_EXPLAIN,
} from "./gprDependencyKpiShared";
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

  const series = useMemo(
    () =>
      activeProjectPart === "project"
        ? buildGprTmcDependencySeriesProjectWide(tasks, tmcItems, todayIso)
        : buildGprTmcDependencySeries(tasks, tmcItems, todayIso, activeProjectPart),
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
    const riskAssessment = assessTmcDependencyRisk(series);
    return { avgDev, risk: riskAssessment.level, riskAssessment };
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
    if (kpiStats.avgDev >= 0) return "#22c55e";
    if (kpiStats.avgDev <= -GPR_DEP_KPI_THRESHOLD_DAYS) return "#ef4444";
    return "#f59e0b";
  }, [kpiStats.avgDev]);

  const [kpiExplain, setKpiExplain] = useState<GprDepKpiExplainKey | null>(null);
  const toggleKpiExplain = (k: GprDepKpiExplainKey) => {
    setKpiExplain((prev) => (prev === k ? null : k));
  };
  const kpiInteractive = analyticDepth !== "presentation";

  const avgExplainText = useMemo(
    () => buildAvgDeviationExplanation(series, kpiStats.avgDev, reportDateLabel),
    [series, kpiStats.avgDev, reportDateLabel],
  );
  const riskExplainText = useMemo(
    () => buildTmcDependencyRiskExplanation(kpiStats.riskAssessment, reportDateLabel),
    [kpiStats.riskAssessment, reportDateLabel],
  );

  const riskFactorCount = kpiStats.riskAssessment.factors.length;

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
              const lines: string[] = [];
              const pp = series[i]?.progressDeltaPp;
              const dd = series[i]?.deviationDays;
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
    [series, planArr, factArr, reportDateLabel],
  );

  return (
    <div className="min-w-0 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-6">
      <h3 className="text-lg font-semibold text-slate-50">
        Зависимость выполнения ГПР от обеспеченности ТМЦ
      </h3>

      <div className="mt-4 h-[260px] w-full min-w-0 sm:h-[300px] md:h-[340px]">
        <Chart type="line" data={chartData} options={options} />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-400">
        Серая линия — плановый % по графику на дату отчёта, зелёная — факт выполнения ГПР (% completion корневых
        работ; тот же источник, что в карточке объекта). Пунктир — обеспеченность ТМЦ (%).
        <br />
        Сводное «Выполнение ГПР» в карточке — взвешенное по этапам; на графике — по каждому этапу отдельно. Риск
        срыва учитывает ТМЦ, срок (дни) и готовность (%).
      </p>

      <div className="mt-5 border-t border-slate-700/60 pt-5">
        <div className="flex min-w-0 flex-col flex-wrap gap-4 lg:flex-row lg:items-stretch lg:gap-4">
          <div className="w-full min-w-0 rounded-xl border border-slate-600/50 bg-slate-900/35 p-4 lg:w-[min(100%,45%)] lg:max-w-full lg:shrink-0 xl:max-w-[50%]">
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
                      style={gprScheduleDeviationListStyle(d)}
                    >
                      {formatGprScheduleDeviationDisplayDays(d)}
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
              interactive={kpiInteractive}
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
                  {GPR_DEP_KPI_THRESHOLD_DAYS} дн.
                </div>
                <div className="text-[11px] text-slate-500">норматив платформы · по сроку</div>
              </>
            </GprDepKpiAccordionCard>

            <GprDepKpiAccordionCard
              cardKey="avg"
              isOpen={kpiExplain === "avg"}
              onToggle={toggleKpiExplain}
              interactive={kpiInteractive}
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
                  {kpiStats.avgDev === null
                    ? "—"
                    : formatGprScheduleDeviationDisplayDays(kpiStats.avgDev, { decimals: true })}
                </div>
                <div className="text-[11px] text-slate-500">корневые этапы · дни</div>
              </>
            </GprDepKpiAccordionCard>

            <GprDepKpiAccordionCard
              cardKey="risk"
              isOpen={kpiExplain === "risk"}
              onToggle={toggleKpiExplain}
              interactive={kpiInteractive}
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
                  Риск срыва
                </div>
                <div className={`mt-0.5 text-base font-bold leading-tight ${riskCardUi.valueClass}`}>
                  {riskCardUi.value}
                </div>
                <div className="text-[11px]" style={{ color: "#A3B3C7" }}>
                  {riskFactorCount > 0
                    ? `${riskFactorCount} фактор(ов) · ТМЦ + срок + %`
                    : "ТМЦ + срок + готовность"}
                </div>
              </>
            </GprDepKpiAccordionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
