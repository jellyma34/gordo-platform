"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { type ChartData, type ChartOptions, type ScriptableContext } from "chart.js/auto";
import type { GPRTask, ProjectPartKey } from "@/lib/gprUtils";
import type { Tender } from "@/lib/tenderData";
import type { TMCItem } from "@/lib/tmcData";
import {
  buildGprTimeForecastModel,
  GPR_FORECAST_DROP_STRONG_PP,
  GPR_FORECAST_HORIZON_DAYS,
  type GprTimeForecastModel,
} from "@/lib/gprTmcDependency";

const PLAN_LINE = "#e2e8f0";
const FACT_LINE = "#22c55e";
const FORECAST_OK = "#38bdf8";
const FORECAST_WARN = "#f59e0b";
const FORECAST_BAD = "#ef4444";

const monthTickFmt = new Intl.DateTimeFormat("ru-RU", { month: "short", year: "numeric" });

const Chart = dynamic(() => import("react-chartjs-2").then((m) => m.Chart), { ssr: false });

function formatDateLong(ms: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ms));
}

export function GPRForecastChart({
  tasks,
  tmcItems,
  tenders,
  activeProjectPart,
}: {
  tasks: GPRTask[];
  tmcItems: TMCItem[];
  tenders: Tender[];
  activeProjectPart: ProjectPartKey;
}) {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const model = useMemo(
    () => buildGprTimeForecastModel(tasks, tmcItems, tenders, todayIso, activeProjectPart),
    [tasks, tmcItems, tenders, todayIso, activeProjectPart],
  );

  const forecastStyle = useMemo(() => {
    if (!model || model.factNow == null || model.forecastValue == null) {
      return { line: FORECAST_OK, points: [FORECAST_OK, FORECAST_OK] as [string, string] };
    }
    const drop = model.factNow - model.forecastValue;
    if (drop <= 0) {
      return { line: FORECAST_OK, points: [FORECAST_OK, FORECAST_OK] as [string, string] };
    }
    if (drop > GPR_FORECAST_DROP_STRONG_PP) {
      return { line: FORECAST_BAD, points: [FACT_LINE, FORECAST_BAD] as [string, string] };
    }
    return { line: FORECAST_WARN, points: [FACT_LINE, FORECAST_WARN] as [string, string] };
  }, [model]);

  const chartData = useMemo(() => {
    if (!model) {
      return { datasets: [] };
    }

    const pointBg = (ctx: ScriptableContext<"line">) => {
      const i = ctx.dataIndex;
      return forecastStyle.points[i] ?? forecastStyle.line;
    };
    const pointR = (ctx: ScriptableContext<"line">) => (ctx.dataIndex === 0 ? 5 : 6);

    return {
      datasets: [
        {
          label: "План ГПР",
          data: model.planSeries.map((p) => ({ x: p.x, y: p.y })),
          borderColor: PLAN_LINE,
          backgroundColor: "transparent",
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: PLAN_LINE,
          pointBorderColor: "rgba(15,23,42,0.6)",
          pointBorderWidth: 1,
          borderWidth: 2,
          fill: false,
          order: 0,
          parsing: { xAxisKey: "x", yAxisKey: "y" },
        },
        {
          label: "Факт ГПР",
          data: model.factSeries.map((p) => ({ x: p.x, y: p.y })),
          borderColor: FACT_LINE,
          backgroundColor: "transparent",
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: FACT_LINE,
          pointBorderColor: "rgba(15,23,42,0.5)",
          pointBorderWidth: 1,
          borderWidth: 2.5,
          fill: false,
          order: 1,
          parsing: { xAxisKey: "x", yAxisKey: "y" },
        },
        {
          label: "Прогноз ГПР",
          data: model.forecastSeries.map((p) => ({ x: p.x, y: p.y })),
          borderColor: forecastStyle.line,
          backgroundColor: "transparent",
          tension: 0,
          borderDash: [8, 5],
          pointRadius: pointR,
          pointHoverRadius: 8,
          pointBackgroundColor: pointBg,
          pointBorderColor: "rgba(15,23,42,0.55)",
          pointBorderWidth: 2,
          borderWidth: 2.5,
          fill: false,
          order: 2,
          parsing: { xAxisKey: "x", yAxisKey: "y" },
        },
      ],
    };
  }, [model, forecastStyle]);

  const options: ChartOptions<"line"> = useMemo(
    () =>
      !model
        ? { responsive: true, maintainAspectRatio: false }
        : {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: "nearest",
              axis: "x",
              intersect: false,
            },
            layout: {
              padding: { top: 28, right: 12, left: 4, bottom: 4 },
            },
            scales: {
              x: {
                type: "linear",
                min: model.axisMinMs,
                max: model.axisMaxMs,
                grid: { color: "rgba(148,163,184,0.08)" },
                ticks: {
                  color: "#94a3b8",
                  font: { size: 11 },
                  maxTicksLimit: 12,
                  callback: (v) => {
                    const n = typeof v === "number" ? v : Number(v);
                    if (!Number.isFinite(n)) return "";
                    return monthTickFmt.format(new Date(n));
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
              gprForecastToday: {
                todayMs: model.todayMs,
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
                    if (typeof x !== "number") return "";
                    return formatDateLong(x);
                  },
                  label: (ctx) => {
                    const y = ctx.parsed.y;
                    const val = y == null || Number.isNaN(y) ? "—" : `${y}%`;
                    return ` ${ctx.dataset.label}: ${val}`;
                  },
                  afterBody: (items) => {
                    const item = items[0];
                    if (!item) return [];
                    const ds = item.datasetIndex;
                    const di = item.dataIndex;
                    const m = model as GprTimeForecastModel;

                    if (ds === 2 && di === 0) {
                      return [
                        "",
                        "Сегодня:",
                        `  факт: ${m.factNow == null ? "—" : `${m.factNow}%`}`,
                        `  ТМЦ: ${m.tmcPct == null ? "—" : `${m.tmcPct}%`}`,
                        `  тендеры: ${m.tenderPct == null ? "—" : `${m.tenderPct}%`}`,
                      ];
                    }
                    if (ds === 2 && di === 1) {
                      return [
                        "",
                        "Прогноз:",
                        `  период: +${GPR_FORECAST_HORIZON_DAYS} дней (${m.forecastDateIso})`,
                        `  прогноз: ${m.forecastValue == null ? "—" : `${m.forecastValue}%`}`,
                        `  изменение: ${m.changePct ?? "—"}`,
                        `  причина: ${m.forecastReason}`,
                      ];
                    }
                    return [];
                  },
                },
              },
            },
          },
    [model],
  );

  return (
    <div className="mt-6 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-slate-50">Прогноз выполнения ГПР</h3>
        <p className="mt-1 max-w-2xl text-xs text-slate-400">
          Прогноз показывает ожидаемое изменение выполнения проекта на ближайший период на основе текущих данных ТМЦ и
          тендеров. Ось X — время; отметка «Сегодня» и вертикальная линия; факт ГПР — до текущей даты; пунктир прогноза —
          от сегодня на {GPR_FORECAST_HORIZON_DAYS} дней (тот же расчёт штрафа по ТМЦ и тендерам). Цвет линии прогноза:
          синий — без снижения к факту, жёлтый — умеренное падение, красный — сильное (разрыв более{" "}
          {GPR_FORECAST_DROP_STRONG_PP} п.п.).
        </p>
      </div>

      <div className="mt-4 h-[340px] w-full">
        {!model || model.planSeries.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 text-sm text-slate-500">
            Недостаточно данных ГПР для временной диаграммы
          </div>
        ) : (
          <Chart type="line" data={chartData as ChartData<"line">} options={options} />
        )}
      </div>
    </div>
  );
}
