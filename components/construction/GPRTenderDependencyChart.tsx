"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import {
  PDF_CHART_BLOCK_ATTR,
  PDF_SECTION_TITLE_ATTR,
} from "@/lib/pdf/constructionPdfConstants";
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
  buildGprTenderCompletionScatterPoints,
  buildGprTenderCompletionScatterTooltipDetail,
  buildGprTenderDependencySeries,
  buildGprTenderDependencySeriesProjectWide,
  buildGprTenderDependencyTimelineModel,
  formatGprTimelineMonthLabel,
  GPR_TMC_COMPLETION_QUADRANT_LEGEND_ORDER,
  GPR_TMC_COMPLETION_QUADRANT_STYLES,
  GPR_TMC_COMPLETION_SCATTER_THRESHOLD_PCT,
  gprTenderCompletionQuadrantDisplayLabel,
  type ForecastPart,
  type GprTenderCompletionScatterTooltipDetail,
  type GprTenderDependencyTimelineModel,
} from "@/lib/gprTmcDependency";
import {
  computeGprTenderCoverage,
  GPR_TENDER_COVERAGE_RISK_THRESHOLD,
} from "@/lib/gprTenderCoverage";
import { gprTenderCompletionScatterExternalTooltip } from "@/lib/gprTenderCompletionScatterTooltip";
import { toLocalYmd } from "@/lib/gprReportDate";
import {
  formatInstallmentPlatformDateLabel,
  INSTALLMENT_FORECAST_TODAY_LINE,
} from "@/lib/installmentForecastChartTodayLine";
import { Chart } from "@/components/charting/reactChartjsChart";

type GprTenderReportDateLineOpts = {
  xMs: number | null;
  dateLabel: string;
};

const GPR_TENDER_COMPLETION_CHART_AXIS_MAX = 110;
const GPR_TENDER_COMPLETION_AXIS_TICK_VALUES = [0, 20, 40, 60, 80, 100] as const;
const COMPLETION_ZONE_AXIS_ORIGIN_PCT = 0;
const COMPLETION_ZONE_FILL_ALPHA = 0.12;
const COMPLETION_STAGE_LABEL_FONT = "600 11px system-ui, -apple-system, 'Segoe UI', sans-serif";
const COMPLETION_STAGE_LABEL_GAP_PX = 7;
const COMPLETION_STAGE_LABEL_HEIGHT_PX = 12;
const COMPLETION_STAGE_LABEL_CHART_PAD_PX = 4;
const GUIDE_ALPHA_DEFAULT = 0.58;
const GUIDE_ALPHA_MUTED = 0.22;
const GUIDE_ALPHA_HOVER = 0.82;
const GUIDE_LINE_WIDTH = 1.75;
const GUIDE_LINE_WIDTH_HOVER = 2;
const GPR_TENDER_THRESHOLD_LINE_WIDTH = 1.75;
const GPR_TENDER_THRESHOLD_LINE_COLOR = "rgba(226, 232, 240, 0.78)";
const GPR_TENDER_THRESHOLD_LINE_DASH: [number, number] = [6, 4];

function formatGprTenderCompletionPercentAxisTick(value: string | number): string | number {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n);
  if (!(GPR_TENDER_COMPLETION_AXIS_TICK_VALUES as readonly number[]).includes(rounded)) return "";
  return `${rounded}%`;
}

function hexColorToRgba(hex: string, alpha: number): string {
  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6) return `rgba(148, 163, 184, ${alpha})`;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return `rgba(148, 163, 184, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function completionPointZoneBounds(
  xPercent: number,
  yPercent: number,
): { x0: number; x1: number; y0: number; y1: number } | null {
  if (!Number.isFinite(xPercent) || !Number.isFinite(yPercent)) return null;
  if (xPercent <= COMPLETION_ZONE_AXIS_ORIGIN_PCT || yPercent <= COMPLETION_ZONE_AXIS_ORIGIN_PCT) {
    return null;
  }
  return {
    x0: COMPLETION_ZONE_AXIS_ORIGIN_PCT,
    x1: xPercent,
    y0: COMPLETION_ZONE_AXIS_ORIGIN_PCT,
    y1: yPercent,
  };
}

function completionZoneToPixelRect(
  xScale: { getPixelForValue: (value: number) => number },
  yScale: { getPixelForValue: (value: number) => number },
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): { left: number; top: number; width: number; height: number } | null {
  if (x0 >= x1 || y0 >= y1) return null;
  const left = xScale.getPixelForValue(x0);
  const right = xScale.getPixelForValue(x1);
  const top = yScale.getPixelForValue(y1);
  const bottom = yScale.getPixelForValue(y0);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

function resolveCompletionStageLabelPosition(
  ctx: CanvasRenderingContext2D,
  text: string,
  pointX: number,
  pointY: number,
  chartArea: { left: number; right: number; top: number; bottom: number },
): { x: number; y: number; align: CanvasTextAlign; baseline: CanvasTextBaseline } {
  ctx.font = COMPLETION_STAGE_LABEL_FONT;
  const width = ctx.measureText(text).width;
  const height = COMPLETION_STAGE_LABEL_HEIGHT_PX;
  const gap = COMPLETION_STAGE_LABEL_GAP_PX;
  const pad = COMPLETION_STAGE_LABEL_CHART_PAD_PX;

  let align: CanvasTextAlign = "left";
  let baseline: CanvasTextBaseline = "bottom";
  let x = pointX + gap;
  let y = pointY - gap;

  if (x + width > chartArea.right - pad) {
    align = "right";
    x = pointX - gap;
  }
  if (y - height < chartArea.top + pad) {
    baseline = "top";
    y = pointY + gap;
  }

  const boxLeft = align === "left" ? x : x - width;
  const boxRight = align === "left" ? x + width : x;
  const boxTop = baseline === "bottom" ? y - height : y;
  const boxBottom = baseline === "bottom" ? y : y + height;

  if (boxLeft < chartArea.left + pad) x += chartArea.left + pad - boxLeft;
  if (boxRight > chartArea.right - pad) x -= boxRight - (chartArea.right - pad);
  if (boxTop < chartArea.top + pad) y += chartArea.top + pad - boxTop;
  if (boxBottom > chartArea.bottom - pad) y -= boxBottom - (chartArea.bottom - pad);

  return { x, y, align, baseline };
}

type CompletionPointZone = {
  xPercent: number;
  yPercent: number;
  fill: string;
};

type GprTenderCompletionMatrixPluginOpts = {
  pointZones: CompletionPointZone[];
  enabled?: boolean;
};

type GprTenderCompletionGuidesPluginOpts = {
  colors: string[];
  enabled?: boolean;
};

type GprTenderCompletionStageLabelsPluginOpts = {
  colors: string[];
  enabled?: boolean;
};

type GprTenderCompletionThresholdPluginOpts = {
  enabled?: boolean;
};

type CompletionChartPoint = {
  x: number;
  y: number;
  stageShort: string;
  stageTitle: string;
};

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

const gprTenderCompletionMatrixPlugin: Plugin<"line"> = {
  id: "gprTenderCompletionMatrix",
  beforeDatasetsDraw(chart) {
    const pluginOpts = (
      chart.options.plugins as { gprTenderCompletionMatrix?: GprTenderCompletionMatrixPluginOpts } | undefined
    )?.gprTenderCompletionMatrix;
    if (pluginOpts?.enabled === false) return;
    const pointZones = pluginOpts?.pointZones ?? [];
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (pointZones.length === 0 || !xScale || !yScale) return;

    const { ctx } = chart;
    ctx.save();
    for (const zone of pointZones) {
      const bounds = completionPointZoneBounds(zone.xPercent, zone.yPercent);
      if (!bounds) continue;
      const rect = completionZoneToPixelRect(
        xScale,
        yScale,
        bounds.x0,
        bounds.x1,
        bounds.y0,
        bounds.y1,
      );
      if (!rect) continue;
      ctx.fillStyle = zone.fill;
      ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
    }
    ctx.restore();
  },
};

const gprTenderCompletionAxisGuidesPlugin: Plugin<"line"> = {
  id: "gprTenderCompletionAxisGuides",
  beforeDatasetsDraw(chart) {
    const pluginOpts = (
      chart.options.plugins as { gprTenderCompletionGuides?: GprTenderCompletionGuidesPluginOpts } | undefined
    )?.gprTenderCompletionGuides;
    if (pluginOpts?.enabled !== true) return;

    const dataset = chart.data.datasets[0];
    const meta = chart.getDatasetMeta(0);
    if (!dataset?.data?.length || !meta?.data?.length) return;

    const colors = pluginOpts?.colors ?? [];
    const active = chart.getActiveElements();
    const hoveredIndex =
      active.length > 0 && active[0]?.datasetIndex === 0 ? active[0]?.index ?? null : null;
    const anyHovered = hoveredIndex != null;
    const { ctx, chartArea } = chart;

    meta.data.forEach((el, index) => {
      const point = el as { x: number; y: number };
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      const isHovered = hoveredIndex === index;
      const alpha = isHovered
        ? GUIDE_ALPHA_HOVER
        : anyHovered
          ? GUIDE_ALPHA_MUTED
          : GUIDE_ALPHA_DEFAULT;
      const color = colors[index] ?? "#94a3b8";

      ctx.save();
      ctx.strokeStyle = hexColorToRgba(color, alpha);
      ctx.lineWidth = isHovered ? GUIDE_LINE_WIDTH_HOVER : GUIDE_LINE_WIDTH;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(point.x, chartArea.bottom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(chartArea.left, point.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });
  },
};

const gprTenderCompletionThresholdPlugin: Plugin<"line"> = {
  id: "gprTenderCompletionThreshold",
  beforeDatasetsDraw(chart) {
    const pluginOpts = (
      chart.options.plugins as
        | { gprTenderCompletionThreshold?: GprTenderCompletionThresholdPluginOpts }
        | undefined
    )?.gprTenderCompletionThreshold;
    if (pluginOpts?.enabled !== true) return;

    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;
    const yScale = scales.y;
    if (!xScale || !yScale) return;

    const threshold = GPR_TMC_COMPLETION_SCATTER_THRESHOLD_PCT;
    const xLine = xScale.getPixelForValue(threshold);
    const yLine = yScale.getPixelForValue(threshold);

    ctx.save();
    ctx.strokeStyle = GPR_TENDER_THRESHOLD_LINE_COLOR;
    ctx.lineWidth = GPR_TENDER_THRESHOLD_LINE_WIDTH;
    ctx.setLineDash(GPR_TENDER_THRESHOLD_LINE_DASH);
    ctx.beginPath();
    ctx.moveTo(xLine, chartArea.top);
    ctx.lineTo(xLine, chartArea.bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(chartArea.left, yLine);
    ctx.lineTo(chartArea.right, yLine);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },
};

const gprTenderCompletionStageLabelsPlugin: Plugin<"line"> = {
  id: "gprTenderCompletionStageLabels",
  afterDatasetsDraw(chart) {
    const pluginOpts = (
      chart.options.plugins as
        | { gprTenderCompletionStageLabels?: GprTenderCompletionStageLabelsPluginOpts }
        | undefined
    )?.gprTenderCompletionStageLabels;
    if (pluginOpts?.enabled !== true) return;

    const dataset = chart.data.datasets[0];
    const meta = chart.getDatasetMeta(0);
    if (!dataset?.data?.length || !meta?.data?.length) return;

    const colors = pluginOpts?.colors ?? [];
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.font = COMPLETION_STAGE_LABEL_FONT;

    meta.data.forEach((el, index) => {
      const point = el as { x: number; y: number };
      const raw = dataset.data[index] as CompletionChartPoint | undefined;
      if (!raw?.stageShort || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      const label = raw.stageShort.trim();
      if (!label) return;
      const color = colors[index] ?? "#e2e8f0";
      const { x, y, align, baseline } = resolveCompletionStageLabelPosition(
        ctx,
        label,
        point.x,
        point.y,
        chartArea,
      );
      ctx.fillStyle = hexColorToRgba(color, 0.92);
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      ctx.fillText(label, x, y);
    });
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
  gprTenderCompletionMatrixPlugin,
  gprTenderCompletionAxisGuidesPlugin,
  gprTenderCompletionThresholdPlugin,
  gprTenderCompletionStageLabelsPlugin,
);
const PLAN_GPR_LINE = "#e2e8f0";
const FACT_GPR_LINE = "#22c55e";
const PLAN_TENDER_LINE = "#f59e0b";
const FACT_TENDER_LINE = "#eab308";
const THRESHOLD_PP = 15;

type GprTenderChartBlockMode = "completion" | "stages";

const BLOCK_VIEW_MODES: { id: GprTenderChartBlockMode; label: string }[] = [
  { id: "completion", label: "% выполнения" },
  { id: "stages", label: "Разрез по этапам" },
];

export type GprTenderChartViewMode = "plan" | "fact" | "all";

const TIMELINE_VIEW_MODES: { id: GprTenderChartViewMode; label: string }[] = [
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

export function GPRTenderDependencyChart({
  tasks,
  tenders,
  activeProjectPart,
  reportAsOfIso: reportAsOfIsoProp,
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
  const part: ForecastPart = activeProjectPart === "project" ? "project" : activeProjectPart;

  const [blockMode, setBlockMode] = useState<GprTenderChartBlockMode>("completion");
  const [timelineViewMode, setTimelineViewMode] = useState<GprTenderChartViewMode>("plan");

  const tenderSeries = useMemo(
    () =>
      part === "project"
        ? buildGprTenderDependencySeriesProjectWide(tasks, tenders, todayIso)
        : buildGprTenderDependencySeries(tasks, tenders, todayIso, part),
    [tasks, tenders, todayIso, part],
  );

  const completionPoints = useMemo(
    () => buildGprTenderCompletionScatterPoints(tenderSeries),
    [tenderSeries],
  );

  const timeline = useMemo(
    (): GprTenderDependencyTimelineModel | null =>
      buildGprTenderDependencyTimelineModel(tasks, tenders, todayIso, part),
    [tasks, tenders, todayIso, part],
  );

  const coverage = useMemo(
    () => computeGprTenderCoverage(tasks, tenders, part),
    [tasks, tenders, part],
  );

  const completionChartData = useMemo(
    () => ({
      datasets: [
        {
          label: "Этапы ГПР",
          parsing: { xAxisKey: "x", yAxisKey: "y" },
          data: completionPoints.map(
            (p): CompletionChartPoint => ({
              x: p.tenderPercent,
              y: p.gprPercent,
              stageShort: p.stageShort,
              stageTitle: p.stageTitle,
            }),
          ),
          showLine: false,
          borderWidth: 0,
          pointBackgroundColor: completionPoints.map((p) => p.color),
          pointBorderColor: completionPoints.map(() => "rgba(15, 23, 42, 0.65)"),
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBorderWidth: 1,
        },
      ],
    }),
    [completionPoints],
  );

  const completionPointZones = useMemo(
    (): CompletionPointZone[] =>
      completionPoints.map((point) => ({
        xPercent: point.tenderPercent,
        yPercent: point.gprPercent,
        fill: hexColorToRgba(
          GPR_TMC_COMPLETION_QUADRANT_STYLES[point.quadrant].solid,
          COMPLETION_ZONE_FILL_ALPHA,
        ),
      })),
    [completionPoints],
  );

  const completionGuideColors = useMemo(
    () => completionPoints.map((p) => p.color),
    [completionPoints],
  );

  const completionTooltipDetails = useMemo(
    (): GprTenderCompletionScatterTooltipDetail[] =>
      completionPoints.map((point) => buildGprTenderCompletionScatterTooltipDetail(point)),
    [completionPoints],
  );

  const completionTooltipDetailsRef = useRef(completionTooltipDetails);
  completionTooltipDetailsRef.current = completionTooltipDetails;

  const completionExternalTooltip = useCallback(
    (context: Parameters<typeof gprTenderCompletionScatterExternalTooltip>[0]) => {
      gprTenderCompletionScatterExternalTooltip(
        context,
        (index) => completionTooltipDetailsRef.current[index],
      );
    },
    [],
  );

  useEffect(() => {
    return () => {
      const el = document.getElementById("gpr-tender-completion-scatter-tooltip");
      if (el) el.style.opacity = "0";
    };
  }, []);

  const completionOptions: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "nearest", intersect: true },
      layout: { padding: { top: 48, right: 12, left: 8, bottom: 4 } },
      scales: {
        x: {
          type: "linear",
          position: "bottom",
          min: 0,
          max: GPR_TENDER_COMPLETION_CHART_AXIS_MAX,
          grace: 0,
          grid: { color: "rgba(148,163,184,0.1)" },
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
            callback: formatGprTenderCompletionPercentAxisTick,
            values: [...GPR_TENDER_COMPLETION_AXIS_TICK_VALUES],
          },
          border: { color: "rgba(148,163,184,0.2)" },
          title: {
            display: true,
            text: "Завершение тендеров, %",
            color: "#94a3b8",
            font: { size: 11, weight: "500" },
            padding: { top: 8 },
          },
        },
        y: {
          type: "linear",
          position: "left",
          min: 0,
          max: GPR_TENDER_COMPLETION_CHART_AXIS_MAX,
          grace: 0,
          beginAtZero: true,
          grid: { color: "rgba(148,163,184,0.1)" },
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
            callback: formatGprTenderCompletionPercentAxisTick,
            values: [...GPR_TENDER_COMPLETION_AXIS_TICK_VALUES],
            padding: 6,
          },
          border: { color: "rgba(148,163,184,0.2)" },
          title: {
            display: true,
            text: "Выполнение ГПР, %",
            color: "#94a3b8",
            font: { size: 11, weight: "500" },
            padding: { bottom: 4 },
          },
        },
      },
      plugins: {
        legend: { display: false },
        gprTenderCompletionMatrix: { pointZones: completionPointZones, enabled: true },
        gprTenderCompletionGuides: { colors: completionGuideColors, enabled: true },
        gprTenderCompletionStageLabels: { colors: completionGuideColors, enabled: true },
        gprTenderCompletionThreshold: { enabled: true },
        tooltip: { enabled: false, external: completionExternalTooltip },
      },
    }),
    [completionPointZones, completionGuideColors, completionExternalTooltip],
  );

  const timelineChartData = useMemo(() => {
    if (!timeline) return { datasets: [] };

    const planByX = new Map(timeline.planSeries.map((p) => [p.x, p.y]));
    const factByX = new Map(timeline.factSeries.map((p) => [p.x, p.y]));
    const visibleKeys = new Set(SERIES_BY_VIEW_MODE[timelineViewMode]);

    const segmentFill = (ctx: ScriptableLineSegmentContext) => {
      const p0 = ctx.p0 as { parsed?: { x?: number } } | undefined;
      const x = p0?.parsed?.x;
      if (x == null) return "rgba(148, 163, 184, 0.08)";
      const plan = planByX.get(x);
      const fact = factByX.get(x);
      if (plan == null || fact == null) return "rgba(148, 163, 184, 0.08)";
      return Math.abs(fact - plan) <= THRESHOLD_PP
        ? "rgba(34, 197, 94, 0.25)"
        : "rgba(239, 68, 68, 0.25)";
    };

    const allDatasets = [
      {
        seriesKey: "planGpr" as const,
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
        seriesKey: "factGpr" as const,
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
        fill: timelineViewMode === "all" ? { target: "-1" } : false,
        segment: timelineViewMode === "all" ? { backgroundColor: segmentFill } : undefined,
        order: 1,
        parsing: { xAxisKey: "x", yAxisKey: "y" },
      },
      {
        seriesKey: "planTender" as const,
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
        seriesKey: "factTender" as const,
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
  }, [timeline, timelineViewMode]);

  const timelineOptions: ChartOptions<"line"> = useMemo(
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
              gprTenderCompletionMatrix: { pointZones: [], enabled: false },
              gprTenderCompletionGuides: { colors: [], enabled: false },
              gprTenderCompletionStageLabels: { colors: [], enabled: false },
              gprTenderCompletionThreshold: { enabled: false },
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
                    return `${ctx.dataset.label}: ${val}`;
                  },
                },
              },
            },
          },
    [timeline],
  );

  return (
    <div
      className="mt-6 min-w-0 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-6"
      {...{ [PDF_CHART_BLOCK_ATTR]: "" }}
      {...{ [PDF_SECTION_TITLE_ATTR]: "Зависимость выполнения ГПР от тендеров" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-50">
            Зависимость выполнения ГПР от тендеров
          </h3>
          {coverage.belowRiskThreshold ? (
            <span className="mt-2 inline-flex rounded-full border border-amber-500/50 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">
              Обеспеченность ниже {GPR_TENDER_COVERAGE_RISK_THRESHOLD}%
            </span>
          ) : null}
        </div>

        <div
          className="ml-auto inline-flex shrink-0 rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5"
          role="tablist"
          aria-label="Режим отображения графика"
        >
          {BLOCK_VIEW_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={blockMode === m.id}
              onClick={() => setBlockMode(m.id)}
              className={segmentedControlTabClass(blockMode === m.id, "dark")}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {blockMode === "stages" ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-400">Линии на графике</p>
          <div
            className="inline-flex rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5"
            role="tablist"
            aria-label="Режим линий на графике"
          >
            {TIMELINE_VIEW_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={timelineViewMode === m.id}
                onClick={() => setTimelineViewMode(m.id)}
                className={segmentedControlTabClass(timelineViewMode === m.id, "dark")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className={
          blockMode === "completion"
            ? "mt-4 h-[260px] w-full min-w-0 sm:h-[300px] md:h-[340px]"
            : "mt-3 h-[420px] w-full min-w-0 sm:h-[480px] md:h-[540px]"
        }
      >
        {blockMode === "completion" ? (
          completionPoints.length > 0 ? (
            <Chart
              key="tender-completion"
              type="line"
              data={completionChartData}
              options={completionOptions}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 text-center text-sm text-slate-400">
              Недостаточно данных для режима «% выполнения» (нужны факт ГПР и завершённые
              тендеры по этапам).
            </div>
          )
        ) : timeline ? (
          <Chart
            key={`tender-stages-${timelineViewMode}`}
            type="line"
            data={timelineChartData}
            options={timelineOptions}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 text-center text-sm text-slate-400">
            Недостаточно дат ГПР и тендеров для построения календарной шкалы.
          </div>
        )}
      </div>

      {blockMode === "completion" && completionPoints.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-700/50 pt-3">
          {GPR_TMC_COMPLETION_QUADRANT_LEGEND_ORDER.map((quadrantKey) => (
            <div key={quadrantKey} className="flex items-center gap-2 text-xs text-slate-400">
              {gprTenderCompletionQuadrantDisplayLabel(quadrantKey)}
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <svg
              width="16"
              height={GPR_TENDER_THRESHOLD_LINE_WIDTH + 2}
              className="shrink-0"
              aria-hidden
            >
              <line
                x1="0"
                y1={(GPR_TENDER_THRESHOLD_LINE_WIDTH + 2) / 2}
                x2="16"
                y2={(GPR_TENDER_THRESHOLD_LINE_WIDTH + 2) / 2}
                stroke={GPR_TENDER_THRESHOLD_LINE_COLOR}
                strokeWidth={GPR_TENDER_THRESHOLD_LINE_WIDTH}
                strokeDasharray={`${GPR_TENDER_THRESHOLD_LINE_DASH[0]} ${GPR_TENDER_THRESHOLD_LINE_DASH[1]}`}
              />
            </svg>
            <span>⚪ Порог 80%</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
