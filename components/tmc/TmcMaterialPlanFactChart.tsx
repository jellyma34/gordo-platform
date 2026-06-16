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
import type { Plugin } from "chart.js";
import { formatTmcMaterialAxisTickLabel } from "@/lib/tmcMaterialAxisLabels";
import type { TmcMaterialPlanFactMode, TmcMaterialPlanFactRow } from "@/lib/tmcPresentationAnalytics";

const COLORS = {
  green: "#22c55e",
  orange: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
  /** План — спокойный фирменный синий: читаем на тёмном фоне, слабее факта по насыщенности. */
  plan: "rgba(59, 130, 246, 0.34)",
  planBorder: "rgba(96, 165, 250, 0.62)",
  /** Серый индикатор строк без плана (не меняется при оформлении плановых полос). */
  noPlanFact: "rgba(148, 163, 184, 0.55)",
} as const;

const COMPLETION_AXIS_MAX = 100;
const COMPLETION_AXIS_STEP = 25;
const COST_ROW_HEIGHT_PX = 44;
const LABEL_RIGHT_PAD = 200;
const LABEL_LINE_HEIGHT = 14;
const LABEL_FONT = "600 11px system-ui, sans-serif";
const LABEL_SUB_FONT = "500 10px system-ui, sans-serif";
const LABEL_COLOR = "#e2e8f0";
const LABEL_MUTED = "#94a3b8";
/** Справочное плановое значение в подписи «Факт / План». */
const LABEL_PLAN_VALUE = "rgba(100, 116, 139, 0.52)";

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

/** Плагин зарегистрирован; пунктирные окончания плановых столбцов отключены. */
const tmcPlanCompletionLinePlugin: Plugin<"bar"> = {
  id: "tmcPlanCompletionLine",
};

/** Плагин зарегистрирован; вертикальный пунктир 100% отключён. */
const tmcCompletion100LinePlugin: Plugin<"bar"> = {
  id: "tmcCompletion100Line",
};

type PlanFactTooltipRow = {
  plan: number;
  fact: number;
  deviation: number;
  completionPct: number | null;
};

function completionTooltipLines(row: TmcMaterialPlanFactRow): string[] {
  if (row.plan <= 0) return ["Нет плана"];
  const execution = capCompletionPct(row.executionVsPlanPct);
  return [
    `План на дату: ${formatCompletionPctLabel(row.planBarPct)}`,
    `Факт на дату: ${formatCompletionPctLabel(row.factBarPct)}`,
    `Выполнение: ${formatCompletionPctLabel(execution)}`,
  ];
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

/** Подпись «Факт / План»: факт — основной акцент, план после « / » — приглушённый. */
function drawFactPlanRatioLabel(
  ctx: CanvasRenderingContext2D,
  factBar: BarElement,
  chartArea: { left: number; right: number },
  chartWidth: number,
  fact: number,
  plan: number,
) {
  if (!Number.isFinite(factBar.y)) return;

  const factText = formatCostAmount(fact);
  const planSuffix = ` / ${formatCostAmount(plan)}`;

  const endX = barEndX(factBar);
  const gap = 6;
  const x = endX + gap;
  const y = factBar.y;
  const maxLabelX = chartWidth - 4;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = LABEL_FONT;

  const factWidth = ctx.measureText(factText).width;
  const planWidth = ctx.measureText(planSuffix).width;
  const totalWidth = factWidth + planWidth;
  const maxWidth = maxLabelX - x;
  const fitsRight = maxWidth > 0 && totalWidth <= maxWidth;

  const drawAt = (baseX: number, baseY: number) => {
    ctx.font = LABEL_FONT;
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText(factText, baseX, baseY);
    ctx.fillStyle = LABEL_PLAN_VALUE;
    ctx.fillText(planSuffix, baseX + factWidth, baseY);
  };

  if (fitsRight) {
    drawAt(x, y);
    return;
  }

  drawAt(chartArea.left + 4, y + 14);
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

function formatCompletionPctLabel(pct: number): string {
  const capped = capCompletionPct(pct);
  const rounded = Math.round(capped * 10) / 10;
  if (Number.isInteger(rounded)) return `${Math.round(rounded)}%`;
  return `${rounded.toFixed(1).replace(".", ",")}%`;
}

/**
 * Подпись % выполнения у конца фактической полосы.
 * Зеркалит размещение подписи стоимости в cost-режиме: одна подпись рядом
 * с фактической полосой, без дублирующего «100 %» по плану.
 */
function createTmcCompletionBarLabelPlugin(rows: TmcMaterialPlanFactRow[]): Plugin<"bar"> {
  return {
    id: "tmcCompletionBarLabel",
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

        const factPct = capCompletionPct(row.factBarPct);
        drawBarEndLabels(
          ctx,
          factBar,
          chartArea,
          width,
          [formatCompletionPctLabel(factPct)],
          completionColor(row.executionVsPlanPct),
        );
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

        if (row.plan > 0) {
          drawFactPlanRatioLabel(ctx, factBar, chartArea, width, row.fact, row.plan);
        } else {
          drawBarEndLabels(ctx, factBar, chartArea, width, [`Факт: ${formatCostAmount(row.fact)}`]);
        }
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
  if (plan <= 0) return COLORS.noPlanFact;
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

export function TmcMaterialPlanFactChart({
  rows,
  mode,
}: {
  rows: TmcMaterialPlanFactRow[];
  mode: TmcMaterialPlanFactMode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartJS<"bar"> | null>(null);

  const costXMax = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      max = Math.max(max, row.plan, row.fact);
    }
    return ceilToNiceCostAxisMax(max);
  }, [rows]);

  const costAxisStep = useMemo(() => niceCostAxisStep(costXMax), [costXMax]);

  // Единая геометрия для обоих режимов: переключение «Стоимость ↔ % выполнения»
  // меняет только данные/шкалу, но не высоту строк, отступы и порядок материалов.
  const chartHeight = useMemo(() => {
    return Math.min(720, Math.max(360, rows.length * COST_ROW_HEIGHT_PX + 48));
  }, [rows.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows.length === 0) return;

    chartRef.current?.destroy();

    if (mode === "completion") {
      // Геометрия идентична cost-режиму: те же padding/thickness/порядок строк.
      // План — фоновая полоса 100 %, факт — поверх плановой (factBarPct, обрезан до 100).
      const completionLabelPlugin = createTmcCompletionBarLabelPlugin(rows);

      chartRef.current = new ChartJS(canvas, {
        type: "bar",
        data: {
          labels: rows.map((r) => r.name),
          datasets: [
            {
              label: "План",
              data: rows.map(() => [0, COMPLETION_AXIS_MAX]),
              backgroundColor: COLORS.plan,
              borderColor: COLORS.planBorder,
              borderWidth: 1,
              borderRadius: 4,
              maxBarThickness: 18,
              order: 2,
            },
            {
              label: "Факт",
              data: rows.map((r) =>
                r.plan > 0 ? [0, capCompletionPct(r.factBarPct)] : [0, 0],
              ),
              backgroundColor: rows.map((r) =>
                r.plan > 0 ? completionColor(r.executionVsPlanPct) : COLORS.noPlanFact,
              ),
              borderColor: rows.map((r) =>
                r.plan > 0 ? completionColor(r.executionVsPlanPct) : COLORS.noPlanFact,
              ),
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
        },
        plugins: [tmcCompletion100LinePlugin, completionLabelPlugin],
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
  }, [costAxisStep, costXMax, mode, rows]);

  if (rows.length === 0) {
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
