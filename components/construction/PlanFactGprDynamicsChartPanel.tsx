"use client";

import { useLayoutEffect, useMemo, useRef, type Plugin, type RefObject } from "react";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip as ChartTooltip,
} from "chart.js";
import { Chart } from "@/components/charting/reactChartjsChart";
import {
  AnalyticsLegendItem,
  AnalyticsLegendList,
} from "@/components/construction/AnalyticsLegendItem";
import {
  auditPlanFactChartModel,
  computePlanFactGprChartLayout,
  formatPlanFactGridMonthLabel,
  PLAN_FACT_GPR_CHART_BOTTOM_PADDING_PX,
  PLAN_FACT_GPR_CHART_LABELS_COLUMN_MAX_PX,
  PLAN_FACT_GPR_CHART_LABELS_COLUMN_MIN_PX,
  PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
  PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX,
  PLAN_FACT_GPR_CHART_TOP_PADDING_PX,
  planFactGprRowDividerFractions,
  planFactGprRowDividerTops,
  type PlanFactWorkTypeChartModel,
} from "@/lib/planFactWorkTypeTimeline";
import {
  planFactFactPercentLabelPlugin,
  planFactMonthTodayLinePlugin,
} from "@/components/construction/planFactGprDynamicsChartPlugins";

let planFactGprChartPluginsRegistered = false;
function ensurePlanFactGprChartPluginsRegistered(): void {
  if (planFactGprChartPluginsRegistered) return;
  ChartJS.register(
    BarController,
    CategoryScale,
    LinearScale,
    BarElement,
    ChartTooltip,
    planFactMonthTodayLinePlugin,
    planFactFactPercentLabelPlugin,
  );
  planFactGprChartPluginsRegistered = true;
}
ensurePlanFactGprChartPluginsRegistered();

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" });

function fmtDate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_FMT.format(date);
}

const GANTT_FACT_LEGEND_GRAY = "rgba(148, 163, 184, 0.5)";

function ganttFactColorRankForLegend(color: string): number {
  const t = color.trim();
  if (t === "#ef4444") return 3;
  if (t === "#f59e0b") return 2;
  if (t === "#22c55e") return 1;
  return 0;
}

function pickGanttFactLegendColor(
  factBg: string[],
  factBars: Array<[number, number] | null>,
): string {
  let best = GANTT_FACT_LEGEND_GRAY;
  let bestRank = -1;
  for (let i = 0; i < factBg.length; i++) {
    if (factBars[i] == null) continue;
    const c = factBg[i] ?? GANTT_FACT_LEGEND_GRAY;
    const r = ganttFactColorRankForLegend(c);
    if (r > bestRank) {
      bestRank = r;
      best = c;
    }
  }
  return best;
}

function logPlanFactGprLayoutMetrics(payload: {
  containerWidth: number;
  labelsWidth: number;
  chartWidth: number;
  canvasWidth: number;
  chartAreaLeft: number;
  chartAreaRight: number;
  chartAreaWidth: number;
  chartAreaHeight: number;
  wrapperWidth: number;
  canvasClientWidth: number;
}) {
  console.log("[PlanFactGprDynamicsChart] layout", {
    containerWidth: payload.containerWidth,
    labelsWidth: payload.labelsWidth,
    chartWidth: payload.chartWidth,
    canvasWidth: payload.canvasWidth,
    chartAreaWidth: payload.chartAreaWidth,
    chartAreaLeft: payload.chartAreaLeft,
    chartAreaRight: payload.chartAreaRight,
    chartAreaHeight: payload.chartAreaHeight,
    wrapperWidth: payload.wrapperWidth,
    canvasClientWidth: payload.canvasClientWidth,
  });
  if (payload.chartAreaWidth < 300) {
    console.warn(
      "[PlanFactGprDynamicsChart] chartArea.width < 300px — полосы плана/факта могут быть невидимы",
      payload,
    );
  }
}

function createDatasetRenderAuditPlugin(model: PlanFactWorkTypeChartModel): Plugin<"bar"> {
  return {
    id: "planFactGprDatasetRenderAudit",
    afterDatasetsDraw(chart: ChartJS<"bar">) {
      const planMeta = chart.getDatasetMeta(0);
      const factMeta = chart.getDatasetMeta(1);
      const xScale = chart.scales.x;
      if (!xScale) return;

      model.labels.forEach((label, index) => {
        const planRange = model.planRanges[index] ?? null;
        const factRange = model.factRanges[index] ?? null;
        const planEl = planMeta.data[index] as BarElement | undefined;
        const factEl = factMeta.data[index] as BarElement | undefined;

        const rangeWidth = (range: [number, number] | null) =>
          range ? Math.abs(range[1] - range[0]) : 0;

        const pixelWidth = (el: BarElement | undefined) => {
          if (!el || !Number.isFinite(el.x) || !Number.isFinite(el.base)) return 0;
          return Math.abs(el.x - el.base);
        };

        const planBarWidthPx = pixelWidth(planEl);
        const factBarWidthPx = pixelWidth(factEl);
        const planBarWidth = rangeWidth(planRange);
        const factBarWidth = rangeWidth(factRange);
        const detail = model.rowDetails[index];

        const payload = {
          label,
          planStart: detail?.planStart ?? null,
          planEnd: detail?.planEnd ?? null,
          factStart: detail?.factStart ?? null,
          factEnd: detail?.factEnd ?? null,
          factPercent: model.factCompletionLabels[index] ?? null,
          planRange,
          factRange,
          planBarWidth,
          factBarWidth,
          planBarWidthPx,
          factBarWidthPx,
          factColor: model.factColors[index] ?? null,
          planColor: model.planColors[index] ?? null,
          planDatasetOrder: chart.data.datasets[0]?.order,
          factDatasetOrder: chart.data.datasets[1]?.order,
          factHiddenByPlan:
            factBarWidthPx > 0 &&
            planBarWidthPx > 0 &&
            (chart.data.datasets[0]?.order ?? 0) > (chart.data.datasets[1]?.order ?? 0),
          factBarZeroWidth: factBarWidthPx < 0.5,
        };

        if (label.includes("2.05")) {
          console.log("[PlanFactGprDynamicsChart] row 2.05 render audit", payload);
        }
        console.log("[PlanFactGprDynamicsChart] row render audit", payload);
      });

      console.log("[PlanFactGprDynamicsChart] chart datasets", {
        labels: chart.data.labels,
        planDataset: chart.data.datasets[0],
        factDataset: chart.data.datasets[1],
        xMin: model.xMin,
        xMax: model.xMax,
        todayX: model.todayX,
      });
    },
  };
}

function PlanFactGprRowDividers({ rowCount }: { rowCount: number }) {
  const tops = useMemo(() => planFactGprRowDividerTops(rowCount), [rowCount]);
  if (rowCount < 1 || tops.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
      {tops.map((top, index) => (
        <div
          key={index}
          className="absolute left-0 right-0"
          style={{
            top,
            height: 1,
            backgroundColor: PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR,
          }}
        />
      ))}
    </div>
  );
}

/** Разделители в chartArea — те же Y, что и {@link planFactGprRowDividerTops}, в координатах canvas. */
function createRowDividerChartPlugin(rowCount: number): Plugin<"bar"> {
  const fractions = planFactGprRowDividerFractions(rowCount);
  return {
    id: "planFactGprRowDividerChart",
    beforeDatasetsDraw(chart: ChartJS<"bar">) {
      const { ctx, chartArea } = chart;
      if (!chartArea || fractions.length === 0) return;
      ctx.save();
      ctx.strokeStyle = PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR;
      ctx.lineWidth = 1;
      for (const fraction of fractions) {
        const y = Math.round(chartArea.top + fraction * chartArea.height) + 0.5;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

function createLayoutAuditPlugin(refs: {
  wrapperRef: RefObject<HTMLDivElement | null>;
  labelsRef: RefObject<HTMLDivElement | null>;
  chartHostRef: RefObject<HTMLDivElement | null>;
}): Plugin<"bar"> {
  return {
    id: "planFactGprLayoutAudit",
    afterDraw(chart: ChartJS<"bar">) {
      const wrapper = refs.wrapperRef.current;
      const labelsEl = refs.labelsRef.current;
      const chartHost = refs.chartHostRef.current;
      const canvas = chart.canvas;
      const { chartArea } = chart;
      logPlanFactGprLayoutMetrics({
        containerWidth: wrapper?.clientWidth ?? 0,
        labelsWidth: labelsEl?.clientWidth ?? 0,
        chartWidth: chartHost?.clientWidth ?? 0,
        canvasWidth: canvas.width,
        canvasClientWidth: canvas.clientWidth,
        wrapperWidth: wrapper?.clientWidth ?? 0,
        chartAreaLeft: chartArea.left,
        chartAreaRight: chartArea.right,
        chartAreaWidth: chartArea.width,
        chartAreaHeight: chartArea.height,
      });
    },
  };
}

export function PlanFactGprDynamicsChartPanel({
  model,
}: {
  model: PlanFactWorkTypeChartModel;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const chartHostRef = useRef<HTMLDivElement>(null);
  const rowCount = model.labels.length;
  const chartLayout = useMemo(() => computePlanFactGprChartLayout(rowCount), [rowCount]);
  const chartRemountKey = useMemo(() => model.labels.join("\u0001"), [model.labels]);
  /** Grouped bars: план и факт в одной строке — как в «Детально» / «Все этапы» (в т.ч. одна строка 2.05). */
  const barGrouped = true;

  const audit = useMemo(() => auditPlanFactChartModel(model), [model]);

  const chartData = useMemo(
    () =>
      ({
        labels: model.labels,
        datasets: [
          {
            label: "План",
            data: model.planRanges,
            backgroundColor: model.planColors,
            borderColor: model.planColors,
            borderWidth: 0,
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 16,
            grouped: barGrouped,
            order: 1,
          },
          {
            label: "Факт",
            data: model.factRanges,
            backgroundColor: model.factColors,
            borderColor: model.factColors,
            borderWidth: 0,
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 12,
            grouped: barGrouped,
            order: 2,
          },
        ],
      }) as const,
    [model, barGrouped],
  );

  const datasetRenderAuditPlugin = useMemo(
    () => createDatasetRenderAuditPlugin(model),
    [model],
  );

  useLayoutEffect(() => {
    console.log("[PlanFactGprDynamicsChart] model before Chart.js", {
      labels: model.labels,
      planRanges: model.planRanges,
      factRanges: model.factRanges,
      planColors: model.planColors,
      factColors: model.factColors,
      factCompletionLabels: model.factCompletionLabels,
      rowDetails: model.rowDetails,
      originMonth: model.originMonth,
      xMin: model.xMin,
      xMax: model.xMax,
      todayX: model.todayX,
    });

    model.labels.forEach((label, index) => {
      const planRange = model.planRanges[index] ?? null;
      const factRange = model.factRanges[index] ?? null;
      const planBarWidth = planRange ? Math.abs(planRange[1] - planRange[0]) : 0;
      const factBarWidth = factRange ? Math.abs(factRange[1] - factRange[0]) : 0;
      const detail = model.rowDetails[index];
      const payload = {
        label,
        planStart: detail?.planStart ?? null,
        planEnd: detail?.planEnd ?? null,
        factStart: detail?.factStart ?? null,
        factEnd: detail?.factEnd ?? null,
        factPercent: model.factCompletionLabels[index] ?? null,
        planRange,
        factRange,
        planBarWidth,
        factBarWidth,
        factColor: model.factColors[index] ?? null,
      };
      if (label.includes("2.05")) {
        console.log("[PlanFactGprDynamicsChart] row 2.05 model", payload);
      }
    });

    console.log("[PlanFactGprDynamicsChart] chart dataset payload", chartData);
  }, [model, chartData]);

  useLayoutEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    console.info("[PlanFactGprDynamicsChart] data audit", audit);
  }, [audit]);

  const layoutAuditPlugin = useMemo(
    () =>
      createLayoutAuditPlugin({
        wrapperRef,
        labelsRef,
        chartHostRef,
      }),
    [],
  );

  const rowDividerChartPlugin = useMemo(
    () => createRowDividerChartPlugin(rowCount),
    [rowCount],
  );

  const planLegend = model.planColors[0] ?? "#94a3b8";
  const factLegend = pickGanttFactLegendColor(model.factColors, model.factRanges);

  const chartOptions = useMemo(
    () =>
      ({
        indexAxis: "y" as const,
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: {
          padding: {
            top: PLAN_FACT_GPR_CHART_TOP_PADDING_PX,
            right: 48,
            left: 4,
            bottom: PLAN_FACT_GPR_CHART_BOTTOM_PADDING_PX,
          },
        },
        interaction: { mode: "nearest", axis: "y", intersect: true },
        datasets: {
          bar: {
            categoryPercentage: 0.82,
            barPercentage: 0.9,
            grouped: barGrouped,
          },
        },
        plugins: {
          legend: { display: false },
          planFactMonthToday: { x: model.todayX },
          planFactFactPercentLabels: {
            labels: model.factCompletionLabels,
            factRanges: model.factRanges,
          },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(15,23,42,0.94)",
            borderColor: "rgba(148,163,184,0.35)",
            borderWidth: 1,
            titleColor: "#f8fafc",
            bodyColor: "#e2e8f0",
            padding: 10,
            callbacks: {
              title: (items: { dataIndex?: number }[]) => {
                const i = items[0]?.dataIndex;
                if (typeof i !== "number" || i < 0) return "";
                return model.labels[i] ?? "";
              },
              label: (ctx: { datasetIndex?: number; dataIndex?: number }) => {
                const i = ctx.dataIndex ?? 0;
                const d = model.rowDetails[i];
                if (!d) return "";
                if (d.hasDates === false) {
                  return ctx.datasetIndex === 0 ? "План: нет данных" : "Факт: нет данных";
                }
                if (ctx.datasetIndex === 0) {
                  return `План: ${fmtDate(d.planStart)} — ${fmtDate(d.planEnd)}`;
                }
                const factPct = model.factCompletionLabels[i] ?? "—";
                if (d.factStart && d.factEnd) {
                  return [
                    `Факт: ${fmtDate(d.factStart)} — ${fmtDate(d.factEnd)}`,
                    `Выполнение: ${factPct}`,
                  ];
                }
                return `Факт: нет данных • Выполнение: ${factPct}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: model.xMin,
            max: model.xMax,
            offset: false,
            grid: { color: "rgba(148,163,184,0.12)" },
            border: { display: false },
            ticks: {
              color: "#94a3b8",
              stepSize: 1,
              maxRotation: 0,
              font: { size: 10 },
              callback: (v: string | number) => {
                const t = Number(v);
                if (!Number.isFinite(t)) return "";
                const d = new Date(
                  model.originMonth.getFullYear(),
                  model.originMonth.getMonth() + Math.floor(t + 0.0001),
                  1,
                );
                return formatPlanFactGridMonthLabel(d);
              },
            },
            title: { display: false },
          },
          y: {
            type: "category",
            labels: model.labels,
            display: false,
            offset: false,
          },
        },
      }) as const,
    [model, barGrouped],
  );

  const gridTemplateColumns = `minmax(${PLAN_FACT_GPR_CHART_LABELS_COLUMN_MIN_PX}px, min(38%, ${PLAN_FACT_GPR_CHART_LABELS_COLUMN_MAX_PX}px)) minmax(0, 1fr)`;

  return (
    <div
      className="flex w-full min-w-0 flex-col"
      style={{ height: chartLayout.scrollContentHeightPx }}
    >
      <div
        ref={wrapperRef}
        className="relative grid w-full min-w-0"
        style={{
          height: chartLayout.chartBodyHeightPx,
          gridTemplateColumns,
        }}
      >
        <PlanFactGprRowDividers rowCount={rowCount} />
        <div
          ref={labelsRef}
          className="relative z-[1] overflow-hidden border-r border-slate-600/35"
          style={{
            height: chartLayout.chartBodyHeightPx,
            paddingTop: PLAN_FACT_GPR_CHART_TOP_PADDING_PX,
            paddingBottom: PLAN_FACT_GPR_CHART_BOTTOM_PADDING_PX,
          }}
        >
          {model.labels.map((label, index) => (
            <div
              key={`${index}::${label}`}
              className="flex items-center overflow-hidden pr-2 text-[11px] leading-snug text-slate-300"
              style={{ height: PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX }}
              title={label}
            >
              <span className="block w-full truncate">{label}</span>
            </div>
          ))}
        </div>

        <div
          ref={chartHostRef}
          className="relative z-[1] min-w-0 overflow-hidden"
          style={{ height: chartLayout.chartBodyHeightPx }}
        >
          <Chart
            key={chartRemountKey}
            type="bar"
            plugins={[
              rowDividerChartPlugin,
              planFactMonthTodayLinePlugin,
              layoutAuditPlugin,
              planFactFactPercentLabelPlugin,
              datasetRenderAuditPlugin,
            ]}
            data={chartData}
            options={{
              ...chartOptions,
              // Фиксируем высоту canvas = числу строк; ширину даёт responsive + grid 1fr.
              maintainAspectRatio: false,
            } as any}
            style={{
              display: "block",
              width: "100%",
              height: chartLayout.chartBodyHeightPx,
            }}
          />
        </div>
      </div>

      <div className="w-full shrink-0 pt-2">
        <AnalyticsLegendList>
          <AnalyticsLegendItem markerColor={planLegend} label="План" />
          <AnalyticsLegendItem markerColor={factLegend} label="Факт" />
        </AnalyticsLegendList>
      </div>
    </div>
  );
}
