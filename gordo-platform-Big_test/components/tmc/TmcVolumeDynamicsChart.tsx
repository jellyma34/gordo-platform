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
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import { formatTmcMaterialAxisTickLabel } from "@/lib/tmcMaterialAxisLabels";
import type { TmcVolumeDynamicsRow } from "@/lib/tmcPresentationAnalytics";

const COLORS = {
  remaining: "#f59e0b",
} as const;

const ROW_HEIGHT_PX = 44;
const LABEL_RIGHT_PAD = 180;
const LABEL_FONT = "600 11px system-ui, sans-serif";
const LABEL_COLOR = "#e2e8f0";

type BarElementGeom = { x: number; y: number; base: number; height?: number };

function barEndX(bar: BarElementGeom): number {
  const end = Number.isFinite(bar.x) ? bar.x : bar.base;
  const start = Number.isFinite(bar.base) ? bar.base : end;
  return Math.max(end, start);
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(n);
}

function fmtQtyWithUnit(n: number, unit: string): string {
  const formatted = fmtQty(n);
  if (formatted === "—") return formatted;
  return unit && unit !== "—" ? `${formatted} ${unit}` : formatted;
}

function ceilToNiceAxisMax(rawMax: number): number {
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

function niceAxisStep(max: number): number {
  const targetTicks = 5;
  const rough = max / targetTicks;
  if (rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / magnitude;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * magnitude;
}

function drawBarEndLabel(
  ctx: CanvasRenderingContext2D,
  anchorBar: BarElementGeom,
  chartArea: { left: number; right: number },
  chartWidth: number,
  text: string,
) {
  if (!Number.isFinite(anchorBar.y) || !text) return;

  const endX = barEndX(anchorBar);
  const gap = 6;
  const x = endX + gap;
  const y = anchorBar.y;
  const maxLabelX = chartWidth - 4;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = LABEL_FONT;
  ctx.fillStyle = LABEL_COLOR;

  const textWidth = ctx.measureText(text).width;
  const fitsRight = maxLabelX - x >= textWidth;

  if (fitsRight) {
    ctx.fillText(text, x, y);
    return;
  }

  ctx.fillText(text, chartArea.left + 4, y + 14);
}

function createTmcRemainingBarLabelPlugin(rows: TmcVolumeDynamicsRow[]): Plugin<"bar"> {
  return {
    id: "tmcRemainingBarLabel",
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data?.length) return;

      const { ctx, chartArea, width } = chart;
      ctx.save();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const bar = meta.data[i] as unknown as BarElementGeom | undefined;
        if (!row || !bar || !Number.isFinite(bar.y)) continue;

        drawBarEndLabel(ctx, bar, chartArea, width, fmtQtyWithUnit(row.remainingQty, row.unit));
      }

      ctx.restore();
    },
  };
}

ChartJS.register(CategoryScale, LinearScale, BarController, BarElement, ChartTooltip);

export function TmcVolumeDynamicsChart({
  rows,
  allProcured = false,
}: {
  rows: TmcVolumeDynamicsRow[];
  allProcured?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartJS<"bar"> | null>(null);

  const xMax = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      max = Math.max(max, row.remainingQty);
    }
    return ceilToNiceAxisMax(max);
  }, [rows]);

  const axisStep = useMemo(() => niceAxisStep(xMax), [xMax]);

  const chartHeight = useMemo(() => {
    return Math.min(720, Math.max(320, rows.length * ROW_HEIGHT_PX + 48));
  }, [rows.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows.length === 0) return;

    chartRef.current?.destroy();
    const labelPlugin = createTmcRemainingBarLabelPlugin(rows);

    chartRef.current = new ChartJS(canvas, {
      type: "bar",
      data: {
        labels: rows.map((r) => r.name),
        datasets: [
          {
            label: "Осталось докупить",
            data: rows.map((r) => r.remainingQty),
            backgroundColor: COLORS.remaining,
            borderColor: COLORS.remaining,
            borderWidth: 0,
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 18,
          },
        ],
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
              label: (item) => {
                const i = item.dataIndex;
                const row = typeof i === "number" ? rows[i] : undefined;
                if (!row) return "";
                return `Осталось докупить: ${fmtQtyWithUnit(row.remainingQty, row.unit)}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: xMax,
            grid: { color: "rgba(148,163,184,0.12)" },
            border: { display: false },
            ticks: {
              color: "#94a3b8",
              font: { size: 10 },
              stepSize: axisStep,
              callback(tickValue) {
                const n = Number(tickValue);
                return Number.isFinite(n) ? fmtQty(n) : "";
              },
            },
            title: {
              display: true,
              text: "Объём",
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
      plugins: [labelPlugin],
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [axisStep, rows, xMax]);

  if (rows.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center px-6 text-center text-sm text-slate-400">
        {allProcured
          ? "Все позиции ТМЦ обеспечены закупками"
          : "Нет данных для построения графика закупок"}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="min-h-[320px] w-full overflow-y-auto" style={{ height: chartHeight }}>
        <div className="relative h-full min-h-[320px] w-full">
          <canvas ref={canvasRef} />
        </div>
      </div>

      <div className="mt-3 border-t border-slate-700/40 pt-3">
        <AnalyticsLegendList>
          <AnalyticsLegendItem markerColor={COLORS.remaining} label="Осталось докупить" />
        </AnalyticsLegendList>
      </div>
    </div>
  );
}
