"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip as ChartTooltip,
} from "chart.js";
import type { ChartOptions, Plugin } from "chart.js";
import { formatTmcMaterialAxisTickLabel } from "@/lib/tmcMaterialAxisLabels";
import type { TmcMaterialPlanFactMode, TmcMaterialPlanFactRow } from "@/lib/tmcPresentationAnalytics";

const COLORS = {
  green: "#22c55e",
  orange: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
  plan: "rgba(148, 163, 184, 0.32)",
  planBorder: "rgba(148, 163, 184, 0.55)",
} as const;

const COMPLETION_AXIS_MAX = 100;
const COMPLETION_AXIS_STEP = 25;
const COMPLETION_ROW_HEIGHT_PX = 72;
const COST_ROW_HEIGHT_PX = 44;
const LABEL_RIGHT_PAD = 200;
const COMPLETION_LABEL_RIGHT_PAD = 44;
const COMPLETION_PREFIX_PX = 0;
const LABEL_LINE_HEIGHT = 14;
const LABEL_FONT = "600 11px system-ui, sans-serif";
const LABEL_SUB_FONT = "500 10px system-ui, sans-serif";
const LABEL_COLOR = "#e2e8f0";
const LABEL_MUTED = "#94a3b8";

/** Округление максимума оси стоимости до «красивого» значения (30 млн, 50 млн …). */
function ceilToNiceCostAxisMax(rawMax: number): number {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return 1;
  const value = rawMax * 1.02;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;
  const niceFractions = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const f of niceFractions) {
    if (fraction <= f) return f * magnitude;
  }
  return 10 * magnitude;
}

function niceCostAxisStep(max: number): number {
  const targetTicks = 5;
  const rough = max / targetTicks;
  if (rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / magnitude;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * magnitude;
}

function capCompletionPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(COMPLETION_AXIS_MAX, Math.max(0, pct));
}

const rubFullFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

type TmcCompletionRow = Omit<TmcMaterialPlanFactRow, "completionPct"> & {
  completionPct: number | null;
};

/** Вертикальная отметка 100% плана на правом крае плановой полосы. */
const tmcPlanCompletionLinePlugin: Plugin<"bar"> = {
  id: "tmcPlanCompletionLine",
  afterDatasetsDraw(chart) {
    const planMeta = chart.getDatasetMeta(0);
    if (!planMeta?.data?.length) return;
    const { ctx } = chart;
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const bar of planMeta.data) {
      const element = bar as { x: number; y: number; height: number };
      if (!Number.isFinite(element.x) || !Number.isFinite(element.y)) continue;
      const half = (element.height ?? 16) / 2 + 4;
      ctx.beginPath();
      ctx.moveTo(element.x, element.y - half);
      ctx.lineTo(element.x, element.y + half);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  },
};

/** Вертикальная линия-ориентир 100% в режиме «% выполнения». */
const tmcCompletion100LinePlugin: Plugin<"bar"> = {
  id: "tmcCompletion100Line",
  afterDatasetsDraw(chart) {
    const xScale = chart.scales.x;
    if (!xScale) return;
    const x = xScale.getPixelForValue(100);
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },
};

type PlanFactTooltipRow = {
  plan: number;
  fact: number;
  deviation: number;
  completionPct: number | null;
};

function completionTooltipLines(row: TmcCompletionRow): string[] {
  if (row.plan <= 0) return ["Нет плана"];
  const pct = capCompletionPct(row.completionPct ?? 0);
  return [`Выполнение: ${formatCompletionPctLabel(pct)}`];
}

function planFactTooltipLines(row: PlanFactTooltipRow): string[] {
  if (row.plan <= 0) {
    const lines = ["План: Нет плана"];
    if (row.fact > 0) lines.push(`Факт: ${formatCostAmount(row.fact)}`);
    lines.push(`Отклонение: ${formatSignedCostAmount(row.deviation)}`);
    return lines;
  }

  const pct = capCompletionPct(row.completionPct ?? (row.plan > 0 ? (row.fact / row.plan) * 100 : 0));
  return [
    `План: ${formatCostAmount(row.plan)}`,
    `Факт: ${formatCostAmount(row.fact)}`,
    `Отклонение: ${formatSignedCostAmount(row.deviation)}`,
    `Выполнение: ${formatCompletionPctLabel(pct)}`,
  ];
}

type BarElement = { x: number; y: number; base: number; height?: number };

function barEndX(bar: BarElement): number {
  const end = Number.isFinite(bar.x) ? bar.x : bar.base;
  const start = Number.isFinite(bar.base) ? bar.base : end;
  return Math.max(end, start);
}

/** Пара «факт / план»: «14 162 788 / 27 129 555». */
function formatFactPlanRatio(fact: number, plan: number): string {
  return `${formatCostAmount(fact)} / ${formatCostAmount(plan)}`;
}

/** Подписи справа от конца фактической полосы; при нехватке места — под строкой. */
function drawBarEndLabels(
  ctx: CanvasRenderingContext2D,
  factBar: BarElement,
  chartArea: { left: number; right: number },
  chartWidth: number,
  lines: string[],
  primaryColor = LABEL_COLOR,
  secondaryColor = LABEL_MUTED,
) {
  if (!Number.isFinite(factBar.y) || lines.length === 0) return;

  const endX = barEndX(factBar);
  const gap = 6;
  const x = endX + gap;
  const y = factBar.y;
  const maxLabelX = chartWidth - 4;
  const maxWidth = maxLabelX - x;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const measureLines = (font: string) => {
    ctx.font = font;
    return lines.map((line) => ctx.measureText(line).width);
  };

  const primaryWidths = measureLines(LABEL_FONT);
  const fitsRight =
    maxWidth > 0 &&
    primaryWidths.every((w) => w <= maxWidth) &&
    primaryWidths.reduce((a, b) => Math.max(a, b), 0) <= maxWidth;

  const drawStack = (baseX: number, baseY: number, below = false) => {
    let cy = baseY - ((lines.length - 1) * LABEL_LINE_HEIGHT) / 2;
    if (below) cy = baseY + 14;
    for (let i = 0; i < lines.length; i++) {
      ctx.font = i === 0 ? LABEL_FONT : LABEL_SUB_FONT;
      ctx.fillStyle = i === 0 ? primaryColor : secondaryColor;
      ctx.fillText(lines[i]!, baseX, cy);
      cy += LABEL_LINE_HEIGHT;
    }
  };

  if (fitsRight) {
    drawStack(x, y);
    return;
  }

  drawStack(chartArea.left + 4, y, true);
}

function createTmcCompletionDualBarLabelPlugin(rows: TmcCompletionRow[]): Plugin<"bar"> {
  return {
    id: "tmcCompletionDualBarLabel",
    afterDatasetsDraw(chart) {
      const factMeta = chart.getDatasetMeta(1);
      if (!factMeta?.data?.length) return;
      const { ctx, chartArea, width } = chart;
      ctx.save();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const factBar = factMeta.data[i] as unknown as BarElement | undefined;
        if (!row || !factBar || !Number.isFinite(factBar.y)) continue;

        if (row.plan <= 0) {
          ctx.fillStyle = LABEL_MUTED;
          ctx.font = LABEL_FONT;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText("Нет плана", chartArea.left + 4, factBar.y);
          continue;
        }

        const pct = capCompletionPct(row.completionPct ?? 0);
        drawBarEndLabels(ctx, factBar, chartArea, width, [formatCompletionPctLabel(pct)]);
      }

      ctx.restore();
    },
  };
}

function createTmcCostBarLabelPlugin(rows: TmcMaterialPlanFactRow[]): Plugin<"bar"> {
  return {
    id: "tmcCostBarLabel",
    afterDatasetsDraw(chart) {
      const factMeta = chart.getDatasetMeta(1);
      if (!factMeta?.data?.length) return;
      const { ctx, chartArea, width } = chart;
      ctx.save();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const factBar = factMeta.data[i] as unknown as BarElement;
        if (!row || !Number.isFinite(factBar?.y)) continue;

        if (row.plan <= 0 && row.fact <= 0) continue;

        const label =
          row.plan > 0
            ? formatFactPlanRatio(row.fact, row.plan)
            : `Факт: ${formatCostAmount(row.fact)}`;

        drawBarEndLabels(ctx, factBar, chartArea, width, [label]);
      }

      ctx.restore();
    },
  };
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  ChartTooltip,
  tmcPlanCompletionLinePlugin,
  tmcCompletion100LinePlugin,
);

function factColorForMaterial(plan: number, fact: number): string {
  if (plan <= 0) return COLORS.planBorder;
  const ratio = fact / plan;
  if (ratio >= 1) return COLORS.green;
  if (ratio >= 0.85) return COLORS.orange;
  return COLORS.red;
}

function completionColor(pct: number): string {
  if (pct >= 100) return COLORS.green;
  if (pct < 70) return COLORS.red;
  if (pct < 95) return COLORS.orange;
  return COLORS.green;
}

/** Полная сумма с разделителем тысяч: «14 200 000». */
function formatCostAmount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  return `${sign}${rubFullFmt.format(Math.round(Math.abs(value)))}`;
}

function formatSignedCostAmount(value: number): string {
  if (value === 0) return formatCostAmount(0);
  const sign = value < 0 ? "−" : "+";
  return `${sign}${rubFullFmt.format(Math.round(Math.abs(value)))}`;
}

function formatCompletionPctLabel(pct: number): string {
  return `${Math.round(capCompletionPct(pct))}%`;
}

export function TmcMaterialPlanFactChart({
  rows,
  mode,
}: {
  rows: TmcMaterialPlanFactRow[];
  mode: TmcMaterialPlanFactMode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartJS<"bar"> | null>(null);

  const completionRows = useMemo<TmcCompletionRow[]>(
    () =>
      rows
        .map(
          (row): TmcCompletionRow => ({
            ...row,
            completionPct: row.plan > 0 ? (row.fact / row.plan) * 100 : null,
          }),
        )
        .sort((a, b) => {
          const aHasPlan = a.plan > 0;
          const bHasPlan = b.plan > 0;
          if (aHasPlan && !bHasPlan) return -1;
          if (!aHasPlan && bHasPlan) return 1;
          if (a.completionPct != null && b.completionPct != null) {
            return a.completionPct - b.completionPct;
          }
          return b.fact - a.fact;
        }),
    [rows],
  );

  const displayRows = mode === "completion" ? completionRows : rows;

  const costXMax = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      max = Math.max(max, row.plan, row.fact);
    }
    return ceilToNiceCostAxisMax(max);
  }, [rows]);

  const costAxisStep = useMemo(() => niceCostAxisStep(costXMax), [costXMax]);

  const chartHeight = useMemo(() => {
    const rowHeight = mode === "completion" ? COMPLETION_ROW_HEIGHT_PX : COST_ROW_HEIGHT_PX;
    return Math.min(720, Math.max(360, displayRows.length * rowHeight + 48));
  }, [displayRows.length, mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || displayRows.length === 0) return;

    chartRef.current?.destroy();

    if (mode === "completion") {
      const labelPlugin = createTmcCompletionDualBarLabelPlugin(completionRows);

      const options: ChartOptions<"bar"> = {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            top: 4,
            right: COMPLETION_LABEL_RIGHT_PAD,
            left: COMPLETION_PREFIX_PX,
            bottom: 4,
          },
        },
        interaction: { mode: "nearest", axis: "y", intersect: true },
        datasets: {
          bar: {
            categoryPercentage: 0.94,
            barPercentage: 0.92,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(15,23,42,0.94)",
            borderColor: "rgba(148,163,184,0.35)",
            borderWidth: 1,
            titleColor: "#f8fafc",
            bodyColor: "#e2e8f0",
            padding: 10,
            callbacks: {
              title: (items) => {
                const i = items[0]?.dataIndex;
                if (typeof i !== "number" || i < 0) return "";
                return completionRows[i]?.name ?? "";
              },
              label: () => "",
              afterBody: (items) => {
                const i = items[0]?.dataIndex;
                if (typeof i !== "number" || i < 0) return [];
                const row = completionRows[i];
                if (!row) return [];
                return completionTooltipLines(row);
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: COMPLETION_AXIS_MAX,
            grid: { color: "rgba(148,163,184,0.12)" },
            border: { display: false },
            ticks: {
              color: "#94a3b8",
              font: { size: 10 },
              stepSize: COMPLETION_AXIS_STEP,
              callback(tickValue) {
                const n = Number(tickValue);
                return Number.isFinite(n) ? `${Math.round(n)}%` : "";
              },
            },
            title: {
              display: true,
              text: "% выполнения поставок",
              color: "#94a3b8",
              font: { size: 11 },
            },
          },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: "#cbd5e1",
              font: { size: 11, lineHeight: 1.2 },
              autoSkip: false,
              callback(tickValue) {
                const label =
                  typeof tickValue === "string"
                    ? tickValue
                    : String(this.getLabelForValue(tickValue));
                return formatTmcMaterialAxisTickLabel(label);
              },
            },
          },
        },
      };

      chartRef.current = new ChartJS(canvas, {
        type: "bar",
        data: {
          labels: completionRows.map((r) => r.name),
          datasets: [
            {
              label: "План",
              data: completionRows.map((row) => (row.plan > 0 ? 100 : 0)),
              backgroundColor: COLORS.plan,
              borderColor: COLORS.planBorder,
              borderWidth: 1,
              borderRadius: 4,
              maxBarThickness: 12,
              order: 2,
            },
            {
              label: "Факт",
              data: completionRows.map((row) =>
                row.plan > 0 && row.completionPct != null
                  ? capCompletionPct(row.completionPct)
                  : 0,
              ),
              backgroundColor: completionRows.map((row) =>
                row.plan > 0 && row.completionPct != null
                  ? completionColor(row.completionPct)
                  : COLORS.planBorder,
              ),
              borderColor: completionRows.map((row) =>
                row.plan > 0 && row.completionPct != null
                  ? completionColor(row.completionPct)
                  : COLORS.planBorder,
              ),
              borderWidth: 0,
              borderRadius: 4,
              maxBarThickness: 10,
              order: 1,
            },
          ],
        },
        options,
        plugins: [tmcCompletion100LinePlugin, labelPlugin],
      });
    } else {
      const costLabelPlugin = createTmcCostBarLabelPlugin(rows);

      chartRef.current = new ChartJS(canvas, {
        type: "bar",
        data: {
          labels: rows.map((r) => r.name),
          datasets: [
            {
              label: "План",
              data: rows.map((r) => [0, r.plan]),
              backgroundColor: COLORS.plan,
              borderColor: COLORS.planBorder,
              borderWidth: 1,
              borderRadius: 4,
              maxBarThickness: 18,
              order: 2,
            },
            {
              label: "Факт",
              data: rows.map((r) => [0, r.fact]),
              backgroundColor: rows.map((r) => factColorForMaterial(r.plan, r.fact)),
              borderColor: rows.map((r) => factColorForMaterial(r.plan, r.fact)),
              borderWidth: 0,
              borderRadius: 4,
              maxBarThickness: 14,
              order: 1,
            },
          ] as const,
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 4, right: LABEL_RIGHT_PAD, left: 0, bottom: 4 } },
          interaction: { mode: "nearest", axis: "y", intersect: true },
          datasets: {
            bar: {
              categoryPercentage: 0.94,
              barPercentage: 0.92,
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              backgroundColor: "rgba(15,23,42,0.94)",
              borderColor: "rgba(148,163,184,0.35)",
              borderWidth: 1,
              titleColor: "#f8fafc",
              bodyColor: "#e2e8f0",
              padding: 10,
              callbacks: {
                title: (items) => {
                  const i = items[0]?.dataIndex;
                  if (typeof i !== "number" || i < 0) return "";
                  return rows[i]?.name ?? "";
                },
                label: () => "",
                afterBody: (items) => {
                  const i = items[0]?.dataIndex;
                  if (typeof i !== "number" || i < 0) return [];
                  const row = rows[i];
                  if (!row) return [];
                  return planFactTooltipLines({
                    plan: row.plan,
                    fact: row.fact,
                    deviation: row.deviation,
                    completionPct: row.completionPct,
                  });
                },
              },
            },
          },
          scales: {
            x: {
              type: "linear",
              min: 0,
              max: costXMax,
              grid: { color: "rgba(148,163,184,0.12)" },
              border: { display: false },
              ticks: {
                color: "#94a3b8",
                font: { size: 10 },
                stepSize: costAxisStep,
                callback(tickValue) {
                  const n = Number(tickValue);
                  return Number.isFinite(n) ? formatCostAmount(n) : "";
                },
              },
              title: {
                display: true,
                text: "Стоимость поставок",
                color: "#94a3b8",
                font: { size: 11 },
              },
            },
            y: {
              grid: { display: false },
              border: { display: false },
              ticks: {
                color: "#cbd5e1",
                font: { size: 11, lineHeight: 1.2 },
                autoSkip: false,
                callback(tickValue) {
                  const label =
                    typeof tickValue === "string"
                      ? tickValue
                      : String(this.getLabelForValue(tickValue));
                  return formatTmcMaterialAxisTickLabel(label);
                },
              },
            },
          },
        },
        plugins: [tmcPlanCompletionLinePlugin, costLabelPlugin],
      });
    }

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [completionRows, costAxisStep, costXMax, displayRows.length, mode, rows]);

  if (displayRows.length === 0) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-sm text-slate-500">
        {mode === "completion"
          ? "Нет данных по ТМЦ для расчёта % выполнения"
          : "Нет данных по ТМЦ для текущего среза"}
      </div>
    );
  }

  return (
    <div className="min-h-[360px] w-full overflow-y-auto" style={{ height: chartHeight }}>
      <div className="relative h-full min-h-[360px] w-full">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
