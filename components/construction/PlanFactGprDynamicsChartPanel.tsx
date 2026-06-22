"use client";

import { useLayoutEffect, useMemo, useRef, type Plugin, type RefObject } from "react";
import type { BarElement, Chart as ChartJS } from "chart.js";
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
  PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX,
  PLAN_FACT_GPR_CHART_TOP_PADDING_PX,
  type PlanFactWorkTypeChartModel,
} from "@/lib/planFactWorkTypeTimeline";

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

  const audit = useMemo(() => auditPlanFactChartModel(model), [model]);

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
    [model],
  );

  const gridTemplateColumns = `minmax(${PLAN_FACT_GPR_CHART_LABELS_COLUMN_MIN_PX}px, min(38%, ${PLAN_FACT_GPR_CHART_LABELS_COLUMN_MAX_PX}px)) minmax(0, 1fr)`;

  return (
    <div
      className="flex w-full min-w-0 flex-col"
      style={{ height: chartLayout.scrollContentHeightPx }}
    >
      <div
        ref={wrapperRef}
        className="grid w-full min-w-0"
        style={{
          height: chartLayout.chartBodyHeightPx,
          gridTemplateColumns,
        }}
      >
        <div
          ref={labelsRef}
          className="overflow-hidden border-r border-slate-600/35"
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
          className="relative min-w-0 overflow-hidden"
          style={{ height: chartLayout.chartBodyHeightPx }}
        >
          <Chart
            type="bar"
            plugins={[layoutAuditPlugin]}
            data={
              {
                labels: model.labels,
                datasets: [
                  {
                    label: "План",
                    data: model.planRanges,
                    backgroundColor: model.planColors,
                    borderColor: model.planColors,
                    borderWidth: 0,
                    borderRadius: 4,
                    maxBarThickness: 18,
                    order: 1,
                  },
                  {
                    label: "Факт",
                    data: model.factRanges,
                    backgroundColor: model.factColors,
                    borderColor: model.factColors,
                    borderWidth: 0,
                    borderRadius: 4,
                    maxBarThickness: 18,
                    order: 0,
                  },
                ],
              } as const
            }
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
