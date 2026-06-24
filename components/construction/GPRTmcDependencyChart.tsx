"use client";

import {
  PDF_CHART_BLOCK_ATTR,
  PDF_SECTION_TITLE_ATTR,
} from "@/lib/pdf/constructionPdfConstants";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
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
  type Plugin,
  type ScriptableLineSegmentContext,
} from "chart.js";
import { type GPRTask, PROJECT_PART_KEY_TO_ID, toDate } from "@/lib/gprUtils";
import type { TMCItem } from "@/lib/tmcData";
import { filterTmcByProjectPart } from "@/lib/tmcData";
import { toLocalYmd } from "@/lib/gprReportDate";
import {
  buildGprTmcCompletionScatterTooltipDetail,
  buildGprTmcCompletionScatterPoints,
  buildGprTmcDependencyChartSeries,
  buildGprTmcDependencyChartSeriesProjectWide,
  GPR_TMC_COMPLETION_QUADRANT_LEGEND_ORDER,
  GPR_TMC_COMPLETION_QUADRANT_STYLES,
  gprTmcCompletionQuadrantDisplayLabel,
  GPR_TMC_COMPLETION_SCATTER_THRESHOLD_PCT,
  type ForecastPart,
  type GprTmcCompletionScatterQuadrant,
  type GprTmcCompletionScatterTooltipDetail,
} from "@/lib/gprTmcDependency";
import { gprTmcCompletionScatterExternalTooltip } from "@/lib/gprTmcCompletionScatterTooltip";
import {
  AnalyticsLegendItem,
  AnalyticsLegendList,
} from "@/components/construction/AnalyticsLegendItem";
import { Chart } from "@/components/charting/reactChartjsChart";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const TMC_LINE = "#f97316";
const GPR_STAGE_SLICE_LINE = "#e2e8f0";
const STAGES_DEFICIT_FILL = "rgba(239, 68, 68, 0.35)";

/** Верхний запас оси % — маркеры на 100% не обрезаются у границы plotArea. */
const GPR_TMC_PERCENT_AXIS_MAX = 105;
const GPR_TMC_PERCENT_DOMAIN_MAX = 100;

/** Scatter «% выполнения»: запас шкалы 110%, подписи только до 100%. */
const GPR_TMC_COMPLETION_CHART_AXIS_MAX = 110;
const GPR_TMC_COMPLETION_AXIS_TICK_VALUES = [0, 20, 40, 60, 80, 100] as const;

function formatGprTmcPercentAxisTick(value: string | number): string | number {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n) || n > GPR_TMC_PERCENT_DOMAIN_MAX) return "";
  return `${n}%`;
}

function formatGprTmcCompletionPercentAxisTick(value: string | number): string | number {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n);
  if (!(GPR_TMC_COMPLETION_AXIS_TICK_VALUES as readonly number[]).includes(rounded)) return "";
  return `${rounded}%`;
}

type GprTmcChartViewMode = "completion" | "stages";

const CHART_VIEW_MODES: { id: GprTmcChartViewMode; label: string }[] = [
  { id: "completion", label: "% выполнения" },
  { id: "stages", label: "Разрез по этапам" },
];

type CompletionChartPoint = {
  x: number;
  y: number;
  stageShort: string;
  stageTitle: string;
  quadrant: GprTmcCompletionScatterQuadrant;
};

type GprTmcCompletionGuidesPluginOpts = {
  colors: string[];
};

type CompletionPointZone = {
  tmcPercent: number;
  gprPercent: number;
  fill: string;
};

type GprTmcCompletionMatrixPluginOpts = {
  pointZones: CompletionPointZone[];
};

const COMPLETION_ZONE_AXIS_ORIGIN_PCT = 0;
/** Полупрозрачность заливки от осей до точки (0.08–0.15). */
const COMPLETION_ZONE_FILL_ALPHA = 0.12;
const COMPLETION_STAGE_LABEL_FONT = "600 11px system-ui, -apple-system, 'Segoe UI', sans-serif";
const COMPLETION_STAGE_LABEL_GAP_PX = 7;
const COMPLETION_STAGE_LABEL_HEIGHT_PX = 12;
const COMPLETION_STAGE_LABEL_CHART_PAD_PX = 4;

/** Прямоугольник от осей (0,0) до координат точки (ТМЦ, ГПР). */
function completionPointZoneBounds(
  tmcPercent: number,
  gprPercent: number,
): { x0: number; x1: number; y0: number; y1: number } | null {
  if (!Number.isFinite(tmcPercent) || !Number.isFinite(gprPercent)) return null;
  if (tmcPercent <= COMPLETION_ZONE_AXIS_ORIGIN_PCT || gprPercent <= COMPLETION_ZONE_AXIS_ORIGIN_PCT) {
    return null;
  }

  return {
    x0: COMPLETION_ZONE_AXIS_ORIGIN_PCT,
    x1: tmcPercent,
    y0: COMPLETION_ZONE_AXIS_ORIGIN_PCT,
    y1: gprPercent,
  };
}

const GUIDE_ALPHA_DEFAULT = 0.58;
const GUIDE_ALPHA_MUTED = 0.22;
const GUIDE_ALPHA_HOVER = 0.82;
const GUIDE_LINE_WIDTH = 1.75;
const GUIDE_LINE_WIDTH_HOVER = 2;

/** Пороговые линии 80% (режим «% выполнения» и «Разрез по этапам»). */
const GPR_TMC_THRESHOLD_LINE_WIDTH = 1.75;
const GPR_TMC_THRESHOLD_LINE_COLOR = "rgba(226, 232, 240, 0.78)";
const GPR_TMC_THRESHOLD_LINE_DASH: [number, number] = [6, 4];

function hexColorToRgba(hex: string, alpha: number): string {
  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6) return `rgba(148, 163, 184, ${alpha})`;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return `rgba(148, 163, 184, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

  if (boxLeft < chartArea.left + pad) {
    x += chartArea.left + pad - boxLeft;
  }
  if (boxRight > chartArea.right - pad) {
    x -= boxRight - (chartArea.right - pad);
  }
  if (boxTop < chartArea.top + pad) {
    y += chartArea.top + pad - boxTop;
  }
  if (boxBottom > chartArea.bottom - pad) {
    y -= boxBottom - (chartArea.bottom - pad);
  }

  return { x, y, align, baseline };
}

/** Заливка прямоугольников от осей (0,0) до координат каждой точки. */
const gprTmcCompletionMatrixPlugin: Plugin<"line"> = {
  id: "gprTmcCompletionMatrix",
  beforeDatasetsDraw(chart) {
    const pluginOpts = (
      chart.options.plugins as { gprTmcCompletionMatrix?: GprTmcCompletionMatrixPluginOpts } | undefined
    )?.gprTmcCompletionMatrix;
    const pointZones = pluginOpts?.pointZones ?? [];
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (pointZones.length === 0 || !xScale || !yScale) return;

    const { ctx } = chart;
    ctx.save();

    for (const zone of pointZones) {
      const bounds = completionPointZoneBounds(zone.tmcPercent, zone.gprPercent);
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

/** Пунктирные проекции от точки к осям X и Y. */
const gprTmcCompletionAxisGuidesPlugin: Plugin<"line"> = {
  id: "gprTmcCompletionAxisGuides",
  beforeDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0];
    const meta = chart.getDatasetMeta(0);
    if (!dataset?.data?.length || !meta?.data?.length) return;

    const pluginOpts = (
      chart.options.plugins as { gprTmcCompletionGuides?: GprTmcCompletionGuidesPluginOpts } | undefined
    )?.gprTmcCompletionGuides;
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

/** Пороговые линии 80% по осям ТМЦ и ГПР (режим «% выполнения»). */
const gprTmcCompletionThresholdPlugin: Plugin<"line"> = {
  id: "gprTmcCompletionThreshold",
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;
    const yScale = scales.y;
    if (!xScale || !yScale) return;

    const threshold = GPR_TMC_COMPLETION_SCATTER_THRESHOLD_PCT;
    const xLine = xScale.getPixelForValue(threshold);
    const yLine = yScale.getPixelForValue(threshold);

    ctx.save();
    ctx.strokeStyle = GPR_TMC_THRESHOLD_LINE_COLOR;
    ctx.lineWidth = GPR_TMC_THRESHOLD_LINE_WIDTH;
    ctx.setLineDash(GPR_TMC_THRESHOLD_LINE_DASH);

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

type GprTmcCompletionStageLabelsPluginOpts = {
  colors: string[];
};

/** Подписи кодов этапов (stageShort) рядом с точками. */
const gprTmcCompletionStageLabelsPlugin: Plugin<"line"> = {
  id: "gprTmcCompletionStageLabels",
  afterDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0];
    const meta = chart.getDatasetMeta(0);
    if (!dataset?.data?.length || !meta?.data?.length) return;

    const pluginOpts = (
      chart.options.plugins as
        | { gprTmcCompletionStageLabels?: GprTmcCompletionStageLabelsPluginOpts }
        | undefined
    )?.gprTmcCompletionStageLabels;
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

/** Горизонтальная линия порога обеспеченности (80%) для режима «Разрез по этапам». */
const gprTmcStagesThresholdPlugin: Plugin<"line"> = {
  id: "gprTmcStagesThreshold",
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    const yScale = scales.y;
    if (!yScale) return;

    const threshold = GPR_TMC_COMPLETION_SCATTER_THRESHOLD_PCT;
    const yLine = yScale.getPixelForValue(threshold);

    ctx.save();
    ctx.strokeStyle = GPR_TMC_THRESHOLD_LINE_COLOR;
    ctx.lineWidth = GPR_TMC_THRESHOLD_LINE_WIDTH;
    ctx.setLineDash(GPR_TMC_THRESHOLD_LINE_DASH);
    ctx.beginPath();
    ctx.moveTo(chartArea.left, yLine);
    ctx.lineTo(chartArea.right, yLine);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "600 10px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(203, 213, 225, 0.92)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("Порог обеспеченности", chartArea.right - 4, yLine - 4);
    ctx.restore();
  },
};

function formatStagePercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value * 10) / 10}%`;
}

function formatTmcGprGap(tmc: number | null, gpr: number | null): string | null {
  if (tmc == null || gpr == null || Number.isNaN(tmc) || Number.isNaN(gpr)) return null;
  const diff = Math.round((tmc - gpr) * 10) / 10;
  if (diff > 0) return `+${diff}%`;
  return `${diff}%`;
}

export function GPRTmcDependencyChart({
  tasks,
  tmcItems,
  activeProjectPart,
  analyticDepth = "work",
  reportAsOfIso: reportAsOfIsoProp,
  reportDateLabel: reportDateLabelProp,
}: {
  tasks: GPRTask[];
  tmcItems: TMCItem[];
  activeProjectPart: ForecastPart;
  analyticDepth?: "work" | "presentation";
  reportAsOfIso?: string;
  reportDateLabel?: string;
}) {
  void analyticDepth;
  void reportDateLabelProp;

  const [viewMode, setViewMode] = useState<GprTmcChartViewMode>("completion");
  const sessionYmd = useMemo(() => toLocalYmd(new Date()), []);
  const todayIso = reportAsOfIsoProp ?? sessionYmd;

  const chartSeries = useMemo(
    () =>
      activeProjectPart === "project"
        ? buildGprTmcDependencyChartSeriesProjectWide(tasks, tmcItems, todayIso)
        : buildGprTmcDependencyChartSeries(tasks, tmcItems, todayIso, activeProjectPart),
    [tasks, tmcItems, todayIso, activeProjectPart],
  );

  const completionPoints = useMemo(
    () => buildGprTmcCompletionScatterPoints(chartSeries),
    [chartSeries],
  );

  const labels = useMemo(() => chartSeries.map((s) => s.stageShort), [chartSeries]);
  const factArr = useMemo(
    () => chartSeries.map((s) => (s.factGpr == null ? null : s.factGpr)),
    [chartSeries],
  );
  const tmcArr = useMemo(
    () => chartSeries.map((s) => (s.tmcSupply == null ? null : s.tmcSupply)),
    [chartSeries],
  );

  const stagesScrollable = labels.length > 10;
  const stagesXTickRotation = stagesScrollable ? 0 : labels.length > 4 ? 45 : 0;
  const stagesChartMinWidthPx = stagesScrollable ? Math.max(640, labels.length * 52) : undefined;

  const stagesChartData = useMemo(() => {
    const segmentDeficitFill = (ctx: ScriptableLineSegmentContext) => {
      const i0 = ctx.p0DataIndex;
      const i1 = ctx.p1DataIndex;
      const hasDeficit = (idx: number) => {
        const gpr = factArr[idx];
        const tmc = tmcArr[idx];
        return gpr != null && tmc != null && tmc < gpr;
      };
      if (hasDeficit(i0) || hasDeficit(i1)) return STAGES_DEFICIT_FILL;
      return "rgba(0, 0, 0, 0)";
    };

    return {
      labels,
      datasets: [
        {
          label: "Выполнение ГПР",
          data: factArr,
          borderColor: GPR_STAGE_SLICE_LINE,
          backgroundColor: "transparent",
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: GPR_STAGE_SLICE_LINE,
          pointBorderColor: "rgba(15,23,42,0.6)",
          pointBorderWidth: 1,
          borderWidth: 2.5,
          fill: false,
          order: 0,
          spanGaps: false,
        },
        {
          label: "Обеспеченность ТМЦ",
          data: tmcArr,
          borderColor: TMC_LINE,
          backgroundColor: STAGES_DEFICIT_FILL,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: TMC_LINE,
          pointBorderColor: "rgba(15,23,42,0.5)",
          pointBorderWidth: 1,
          borderWidth: 2,
          fill: { target: "-1" },
          segment: { backgroundColor: segmentDeficitFill },
          order: 1,
          spanGaps: false,
        },
      ],
    };
  }, [labels, factArr, tmcArr]);

  const completionChartData = useMemo(
    () => ({
      datasets: [
        {
          label: "Этапы ГПР",
          parsing: {
            xAxisKey: "x",
            yAxisKey: "y",
          },
          data: completionPoints.map(
            (p): CompletionChartPoint => ({
              x: p.tmcPercent,
              y: p.gprPercent,
              stageShort: p.stageShort,
              stageTitle: p.stageTitle,
              quadrant: p.quadrant,
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
        tmcPercent: point.tmcPercent,
        gprPercent: point.gprPercent,
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

  const tasksForCompletionTooltip = useMemo(() => {
    if (activeProjectPart === "project") return tasks;
    const partId = PROJECT_PART_KEY_TO_ID[activeProjectPart];
    return tasks.filter((t) => t.partId === partId);
  }, [tasks, activeProjectPart]);

  const tmcForCompletionTooltip = useMemo(() => {
    if (activeProjectPart === "project") {
      return tmcItems.filter(
        (item) => item.projectPart === "residential" || item.projectPart === "parking",
      );
    }
    return filterTmcByProjectPart(tmcItems, activeProjectPart);
  }, [tmcItems, activeProjectPart]);

  const completionTooltipDetails = useMemo(
    (): GprTmcCompletionScatterTooltipDetail[] =>
      completionPoints.map((point) =>
        buildGprTmcCompletionScatterTooltipDetail(
          point.stageShort,
          tasksForCompletionTooltip,
          tmcForCompletionTooltip,
          point,
        ),
      ),
    [completionPoints, tasksForCompletionTooltip, tmcForCompletionTooltip],
  );

  const completionTooltipDetailsRef = useRef(completionTooltipDetails);
  completionTooltipDetailsRef.current = completionTooltipDetails;

  const completionExternalTooltip = useCallback(
    (context: Parameters<typeof gprTmcCompletionScatterExternalTooltip>[0]) => {
      gprTmcCompletionScatterExternalTooltip(
        context,
        (index) => completionTooltipDetailsRef.current[index],
      );
    },
    [],
  );

  useEffect(() => {
    return () => {
      const el = document.getElementById("gpr-tmc-completion-scatter-tooltip");
      if (el) el.style.opacity = "0";
    };
  }, []);

  const completionOptions: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: "nearest",
        intersect: true,
      },
      layout: {
        padding: { top: 48, right: 12, left: 8, bottom: 4 },
      },
      scales: {
        x: {
          type: "linear",
          position: "bottom",
          min: 0,
          max: GPR_TMC_COMPLETION_CHART_AXIS_MAX,
          grace: 0,
          grid: { color: "rgba(148,163,184,0.1)" },
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
            callback: formatGprTmcCompletionPercentAxisTick,
            values: [...GPR_TMC_COMPLETION_AXIS_TICK_VALUES],
          },
          border: { color: "rgba(148,163,184,0.2)" },
          title: {
            display: true,
            text: "Обеспеченность ТМЦ, %",
            color: "#94a3b8",
            font: { size: 11, weight: "500" },
            padding: { top: 8 },
          },
        },
        y: {
          type: "linear",
          position: "left",
          min: 0,
          max: GPR_TMC_COMPLETION_CHART_AXIS_MAX,
          grace: 0,
          beginAtZero: true,
          grid: { color: "rgba(148,163,184,0.1)" },
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
            callback: formatGprTmcCompletionPercentAxisTick,
            values: [...GPR_TMC_COMPLETION_AXIS_TICK_VALUES],
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
        gprTmcCompletionMatrix: {
          pointZones: completionPointZones,
        },
        gprTmcCompletionGuides: {
          colors: completionGuideColors,
        },
        gprTmcCompletionStageLabels: {
          colors: completionGuideColors,
        },
        tooltip: {
          enabled: false,
          external: completionExternalTooltip,
        },
      },
    }),
    [completionPointZones, completionGuideColors, completionExternalTooltip],
  );

  const stagesOptions: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      layout: {
        padding: {
          top: 12,
          right: 12,
          left: 4,
          bottom: stagesXTickRotation >= 45 ? 28 : 4,
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(148,163,184,0.08)" },
          ticks: {
            color: "#94a3b8",
            font: { size: labels.length > 10 ? 10 : 11 },
            maxRotation: stagesXTickRotation,
            minRotation: stagesXTickRotation,
            autoSkip: !stagesScrollable && labels.length > 16,
            maxTicksLimit: stagesScrollable ? undefined : labels.length > 20 ? 24 : undefined,
          },
          border: { color: "rgba(148,163,184,0.2)" },
        },
        y: {
          min: 0,
          max: GPR_TMC_PERCENT_AXIS_MAX,
          grace: 0,
          grid: { color: "rgba(148,163,184,0.1)" },
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
            callback: formatGprTmcPercentAxisTick,
            stepSize: 20,
          },
          border: { color: "rgba(148,163,184,0.2)" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.96)",
          titleColor: "#f1f5f9",
          bodyColor: "#cbd5e1",
          borderColor: "rgba(148,163,184,0.35)",
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex;
              if (i === undefined) return "";
              const row = chartSeries[i];
              return row ? `${row.stageShort} — ${row.stageTitle}` : "";
            },
            label: () => "",
            afterBody: (items) => {
              const i = items[0]?.dataIndex;
              if (i === undefined) return "";
              const row = chartSeries[i];
              if (!row) return "";
              const lines = [
                `Выполнение ГПР: ${formatStagePercent(row.factGpr)}`,
                `Обеспеченность ТМЦ: ${formatStagePercent(row.tmcSupply)}`,
              ];
              const gap = formatTmcGprGap(row.tmcSupply, row.factGpr);
              if (gap) lines.push(`Разница: ${gap}`);
              return lines;
            },
          },
        },
      },
    }),
    [chartSeries, labels.length, stagesScrollable, stagesXTickRotation],
  );

  return (
    <div
      className="min-w-0 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-6"
      {...{ [PDF_CHART_BLOCK_ATTR]: "" }}
      {...{ [PDF_SECTION_TITLE_ATTR]: "Зависимость выполнения ГПР от обеспеченности ТМЦ" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-50">
          Зависимость выполнения ГПР от обеспеченности ТМЦ
        </h3>

        <div
          className="ml-auto inline-flex shrink-0 rounded-lg border border-slate-600/70 bg-slate-900/50 p-0.5"
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

      <div className="mt-4 h-[260px] w-full min-w-0 sm:h-[300px] md:h-[340px]">
        {viewMode === "completion" ? (
          completionPoints.length > 0 ? (
            <Chart
              key="completion"
              type="line"
              data={completionChartData}
              options={completionOptions}
              plugins={[
                gprTmcCompletionMatrixPlugin,
                gprTmcCompletionThresholdPlugin,
                gprTmcCompletionAxisGuidesPlugin,
                gprTmcCompletionStageLabelsPlugin,
              ]}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 text-center text-sm text-slate-400">
              Недостаточно данных для режима «% выполнения» (нужны факт ГПР и обеспеченность ТМЦ
              по этапам).
            </div>
          )
        ) : chartSeries.length > 0 ? (
          <div className={stagesScrollable ? "h-full overflow-x-auto overflow-y-hidden" : "h-full"}>
            <div
              className="h-full"
              style={{ minWidth: stagesChartMinWidthPx ?? "100%" }}
            >
              <Chart
                key="stages"
                type="line"
                data={stagesChartData}
                options={stagesOptions}
                plugins={[gprTmcStagesThresholdPlugin]}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 text-center text-sm text-slate-400">
            Нет этапов ГПР для режима «Разрез по этапам».
          </div>
        )}
      </div>

      {viewMode === "completion" && completionPoints.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-700/50 pt-3">
          {GPR_TMC_COMPLETION_QUADRANT_LEGEND_ORDER.map((quadrantKey) => (
            <div key={quadrantKey} className="flex items-center gap-2 text-xs text-slate-400">
              {gprTmcCompletionQuadrantDisplayLabel(quadrantKey)}
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <svg
              width="16"
              height={GPR_TMC_THRESHOLD_LINE_WIDTH + 2}
              className="shrink-0"
              aria-hidden
            >
              <line
                x1="0"
                y1={(GPR_TMC_THRESHOLD_LINE_WIDTH + 2) / 2}
                x2="16"
                y2={(GPR_TMC_THRESHOLD_LINE_WIDTH + 2) / 2}
                stroke={GPR_TMC_THRESHOLD_LINE_COLOR}
                strokeWidth={GPR_TMC_THRESHOLD_LINE_WIDTH}
                strokeDasharray={`${GPR_TMC_THRESHOLD_LINE_DASH[0]} ${GPR_TMC_THRESHOLD_LINE_DASH[1]}`}
              />
            </svg>
            <span>⚪ Порог 80%</span>
          </div>
        </div>
      ) : null}

      {viewMode === "stages" && chartSeries.length > 0 ? (
        <div className="mt-3 border-t border-slate-700/50 pt-3">
          <AnalyticsLegendList>
            <AnalyticsLegendItem markerColor={GPR_STAGE_SLICE_LINE} label="Выполнение ГПР" />
            <AnalyticsLegendItem markerColor={TMC_LINE} label="Обеспеченность ТМЦ" />
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: STAGES_DEFICIT_FILL }}
                aria-hidden
              />
              <span className="text-[13px] font-medium leading-snug text-[#E6EDF3]">
                Дефицит обеспечения
              </span>
            </div>
          </AnalyticsLegendList>
        </div>
      ) : null}
    </div>
  );
}
