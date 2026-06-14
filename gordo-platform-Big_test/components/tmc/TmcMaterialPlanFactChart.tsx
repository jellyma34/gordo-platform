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
import { formatCurrencyCompact } from "@/lib/chartFormatters";
import { formatTmcMaterialAxisTickLabel } from "@/lib/tmcMaterialAxisLabels";
import type { TmcMaterialPlanFactMode, TmcMaterialPlanFactRow } from "@/lib/tmcPresentationAnalytics";

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  plan: "rgba(148, 163, 184, 0.32)",
  planBorder: "rgba(148, 163, 184, 0.55)",
} as const;

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

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  ChartTooltip,
  tmcPlanCompletionLinePlugin,
);

function factColorForMaterial(plan: number, fact: number): string {
  if (plan <= 0) return COLORS.planBorder;
  const ratio = fact / plan;
  if (ratio >= 1) return COLORS.green;
  if (ratio >= 0.85) return COLORS.yellow;
  return COLORS.red;
}

function formatMaterialMetric(value: number, mode: TmcMaterialPlanFactMode): string {
  if (mode === "cost") {
    return `${new Intl.NumberFormat("ru-RU").format(Math.round(value))} ₽`;
  }
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

function formatMaterialAxisTick(value: number, mode: TmcMaterialPlanFactMode): string {
  if (mode === "cost") return formatCurrencyCompact(value);
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(".", ",")} млн`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)} тыс`;
  }
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
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

  const xMax = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      max = Math.max(max, row.plan, row.fact);
    }
    return max > 0 ? max * 1.08 : 1;
  }, [rows]);

  const chartHeight = useMemo(
    () => Math.min(720, Math.max(420, rows.length * 36 + 120)),
    [rows.length],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows.length === 0) return;

    chartRef.current?.destroy();

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
        layout: { padding: { top: 8, right: 12, left: 4, bottom: 8 } },
        interaction: { mode: "nearest", axis: "y", intersect: true },
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
              label: (ctx) => {
                const i = ctx.dataIndex ?? 0;
                const row = rows[i];
                if (!row) return "";
                if (ctx.datasetIndex === 0) {
                  return mode === "cost"
                    ? `Плановая стоимость: ${formatMaterialMetric(row.plan, mode)}`
                    : `Плановое количество: ${formatMaterialMetric(row.plan, mode)}`;
                }
                return mode === "cost"
                  ? `Фактическая стоимость: ${formatMaterialMetric(row.fact, mode)}`
                  : `Фактическое количество: ${formatMaterialMetric(row.fact, mode)}`;
              },
              afterBody: (items) => {
                const i = items[0]?.dataIndex;
                if (typeof i !== "number" || i < 0) return [];
                const row = rows[i];
                if (!row) return [];
                return [
                  `Отклонение: ${formatMaterialMetric(row.deviation, mode)}`,
                  `Выполнение: ${row.completionPct.toFixed(1).replace(".", ",")}%`,
                ];
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
              callback(tickValue) {
                const n = Number(tickValue);
                return Number.isFinite(n) ? formatMaterialAxisTick(n, mode) : "";
              },
            },
            title: {
              display: true,
              text: mode === "cost" ? "Стоимость поставок, ₽" : "Количество поставок",
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
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [mode, rows, xMax]);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
        Нет данных по ТМЦ для текущего среза
      </div>
    );
  }

  return (
    <div className="flex min-h-[420px] w-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ height: chartHeight }}>
        <div className="relative h-full min-h-[360px] w-full">
          <canvas ref={canvasRef} />
        </div>
      </div>
      <div className="mt-3 shrink-0 border-t border-slate-700/40 pt-3">
        <AnalyticsLegendList>
          <AnalyticsLegendItem markerColor={COLORS.planBorder} label="План" />
          <AnalyticsLegendItem markerColor={COLORS.green} label="Факт — выполнение" />
          <AnalyticsLegendItem markerColor={COLORS.yellow} label="Факт — отклонение" />
          <AnalyticsLegendItem markerColor={COLORS.red} label="Факт — сильное отставание" />
          <AnalyticsLegendItem
            markerColor="rgba(148,163,184,0.7)"
            label="100% плана (вертикальная отметка)"
          />
        </AnalyticsLegendList>
      </div>
    </div>
  );
}
