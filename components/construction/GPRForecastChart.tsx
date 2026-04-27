"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Chart as ChartJS } from "chart.js";
import type { ChartData, ChartOptions } from "chart.js/auto";
import type { GPRTask } from "@/lib/gprUtils";
import type { Tender } from "@/lib/tenderData";
import type { TMCItem } from "@/lib/tmcData";
import {
  buildGprTimeForecastModel,
  type ForecastPart,
  type GprTimeForecastModel,
} from "@/lib/gprTmcDependency";
import { Chart } from "@/components/charting/reactChartjsChart";

const PLAN_LINE = "#e2e8f0";
const FACT_LINE = "#22c55e";

const monthTickFmt = new Intl.DateTimeFormat("ru-RU", { month: "short", year: "numeric" });
const endDateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDateLong(ms: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ms));
}

/** Риск по отставанию факта от плана на сегодня (п.п.): >0 — отстаём. */
function colorFromPlanFactLag(lagPp: number | null): string {
  if (lagPp == null) return "#22c55e";
  if (lagPp <= 0) return "#22c55e";
  if (lagPp <= 12) return "#f59e0b";
  return "#ef4444";
}

function forecastAreaFillRgba(model: GprTimeForecastModel): string {
  const lag = model.planFactLagPp;
  if (lag == null) return "rgba(34, 197, 94, 0.08)";
  if (lag <= 0) return "rgba(34, 197, 94, 0.08)";
  if (lag <= 12) return "rgba(245, 158, 11, 0.08)";
  return "rgba(239, 68, 68, 0.12)";
}

function badgeStyleFromLag(lag: number | null): { bg: string; border: string; shadow: string; text: string } {
  const c = colorFromPlanFactLag(lag);
  if (lag == null || lag <= 0) {
    return {
      bg: "rgba(34, 197, 94, 0.15)",
      border: "rgba(34, 197, 94, 0.35)",
      shadow: "0 0 14px rgba(34, 197, 94, 0.45), 0 0 4px rgba(34, 197, 94, 0.25)",
      text: "text-emerald-100/95",
    };
  }
  if (lag <= 12) {
    return {
      bg: "rgba(245, 158, 11, 0.12)",
      border: "rgba(245, 158, 11, 0.4)",
      shadow: "0 0 14px rgba(245, 158, 11, 0.4), 0 0 4px rgba(245, 158, 11, 0.2)",
      text: "text-amber-100/95",
    };
  }
  return {
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.35)",
    shadow: "0 0 14px rgba(239, 68, 68, 0.4), 0 0 4px rgba(239, 68, 68, 0.2)",
    text: "text-red-100/95",
  };
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
  activeProjectPart: ForecastPart;
}) {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const model = useMemo(
    () => buildGprTimeForecastModel(tasks, tmcItems, tenders, todayIso, activeProjectPart),
    [tasks, tmcItems, tenders, todayIso, activeProjectPart],
  );

  const chartWrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartJS<"line"> | null>(null);
  const [badgePos, setBadgePos] = useState<{ left: number; top: number } | null>(null);

  const updateBadgePosition = useCallback(() => {
    const wrap = chartWrapRef.current;
    const chart = chartRef.current;
    if (!wrap || !chart?.canvas || !model?.forecastSeries.length) {
      setBadgePos(null);
      return;
    }
    const fcIdx = chart.data.datasets.findIndex((d) => d.label === "Прогноз ГПР");
    if (fcIdx < 0) {
      setBadgePos(null);
      return;
    }
    const meta = chart.getDatasetMeta(fcIdx);
    const last = meta?.data?.[meta.data.length - 1] as { x?: number; y?: number } | undefined;
    if (last == null || typeof last.x !== "number" || typeof last.y !== "number") {
      setBadgePos(null);
      return;
    }
    const { x, y } = last;
    const canvas = chart.canvas;
    const wrapRect = wrap.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    setBadgePos({
      left: x + (canvasRect.left - wrapRect.left),
      top: y + (canvasRect.top - wrapRect.top),
    });
  }, [model]);

  const updateBadgeRef = useRef(updateBadgePosition);
  updateBadgeRef.current = updateBadgePosition;

  useLayoutEffect(() => {
    const run = () => {
      requestAnimationFrame(() => updateBadgeRef.current());
    };
    run();
    const wrap = chartWrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(run);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [model]);

  const chartData = useMemo(() => {
    if (!model) {
      return { datasets: [] };
    }

    const factPast = model.factSeries.filter((p) => p.x <= model.todayMs);

    const forecastPts =
      model.factNow != null && model.forecastSeries.length >= 2
        ? model.forecastSeries.map((p) => ({ x: p.x, y: p.y }))
        : [];

    const factNow = model.factNow;
    const lag = model.planFactLagPp;
    const lineColor = colorFromPlanFactLag(lag);
    const areaFill = forecastAreaFillRgba(model);

    const planDs = {
      label: "План ГПР",
      data: model.planSeries.map((p) => ({ x: p.x, y: p.y })),
      borderColor: PLAN_LINE,
      backgroundColor: "transparent",
      tension: 0.38,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: PLAN_LINE,
      pointBorderColor: "rgba(15,23,42,0.6)",
      pointBorderWidth: 1,
      borderWidth: 2,
      fill: false,
      order: 0,
      parsing: { xAxisKey: "x", yAxisKey: "y" },
    };

    const factDs = {
      label: "Факт ГПР",
      data: factPast.map((p) => ({ x: p.x, y: p.y })),
      borderColor: FACT_LINE,
      backgroundColor: "transparent",
      tension: 0.38,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: FACT_LINE,
      pointBorderColor: "rgba(15,23,42,0.5)",
      pointBorderWidth: 1,
      borderWidth: 2.5,
      fill: false,
      order: 1,
      parsing: { xAxisKey: "x", yAxisKey: "y" },
    };

    const forecastDs =
      factNow != null && forecastPts.length >= 2
        ? {
            label: "Прогноз ГПР",
            data: forecastPts,
            borderColor: lineColor,
            backgroundColor: areaFill,
            tension: 0.4,
            borderDash: [6, 5],
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: lineColor,
            pointBorderColor: "rgba(15,23,42,0.55)",
            pointBorderWidth: 2,
            borderWidth: 3,
            fill: "origin" as const,
            order: 2,
            parsing: { xAxisKey: "x", yAxisKey: "y" },
          }
        : null;

    return {
      datasets: forecastDs ? [planDs, factDs, forecastDs] : [planDs, factDs],
    };
  }, [model]);

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
              padding: { top: 38, right: 56, left: 4, bottom: 4 },
            },
            animation: {
              duration: 450,
              onComplete: () => {
                updateBadgeRef.current();
              },
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
              gprForecastGlow: true,
              gprFactGlow: true,
              gprForecastFactNow: model.factNow ?? undefined,
              gprForecastPlanLagPp: model.planFactLagPp ?? undefined,
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
                    const fcLen = m.forecastSeries.length;

                    if (ds === 2 && di === 0) {
                      const lag = m.planFactLagPp;
                      const lagLine =
                        lag == null
                          ? "—"
                          : `${lag > 0 ? "+" : ""}${lag.toFixed(1).replace(/\.0$/, "")} п.п.`;
                      return [
                        "",
                        "Сегодня:",
                        `  факт: ${m.factNow == null ? "—" : `${m.factNow}%`}`,
                        `  план: ${m.planAtToday == null ? "—" : `${m.planAtToday}%`}`,
                        `  отставание от плана: ${lagLine}`,
                        `  ТМЦ: ${m.tmcPct == null ? "—" : `${m.tmcPct}%`}`,
                        `  тендеры: ${m.tenderPct == null ? "—" : `${m.tenderPct}%`}`,
                      ];
                    }
                    if (ds === 2 && fcLen > 0 && di === fcLen - 1) {
                      return [
                        "",
                        "Прогноз (до конца проекта):",
                        `  дата: ${m.forecastDateIso}`,
                        `  значение: ${m.forecastValue == null ? "—" : `${m.forecastValue}%`}`,
                        `  изменение к факту: ${m.changePct ?? "—"}`,
                        `  примечание: ${m.forecastReason}`,
                      ];
                    }
                    if (ds === 2 && di > 0 && di < fcLen - 1) {
                      return ["", "Точка прогноза по тем же датам, что и план (смещение от текущего отставания)."];
                    }
                    return [];
                  },
                },
              },
            },
          },
    [model],
  );

  const badgeUi = model ? badgeStyleFromLag(model.planFactLagPp) : null;
  const badgeLabel =
    model && model.forecastSeries.length >= 2
      ? `до ${endDateFmt.format(new Date(model.forecastMs))}`
      : "";

  return (
    <div className="mt-6 min-w-0 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-50">Прогноз выполнения ГПР</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
          Прогноз формируется на основе текущего факта выполнения, отклонения от планового графика, а также
          статусов тендеров и ТМЦ. Текущее отставание переносится на будущие этапы.
        </p>
      </div>

      <div ref={chartWrapRef} className="relative mt-4 h-[260px] w-full min-w-0 sm:h-[320px] md:h-[340px]">
        {!model || model.planSeries.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 text-sm text-slate-500">
            Недостаточно данных ГПР для временной диаграммы
          </div>
        ) : (
          <>
            <Chart
              ref={chartRef}
              type="line"
              data={chartData as ChartData<"line">}
              options={options}
            />
            {badgePos && model.forecastSeries.length >= 2 && badgeUi ? (
              <div
                className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeUi.text}`}
                style={{
                  left: badgePos.left,
                  top: badgePos.top,
                  transform: "translate(12px, -50%)",
                  background: badgeUi.bg,
                  borderColor: badgeUi.border,
                  boxShadow: badgeUi.shadow,
                }}
              >
                {badgeLabel}
              </div>
            ) : null}
          </>
        )}
      </div>

      {model && model.planSeries.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-slate-700/40 pt-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#22c55e]" aria-hidden />
            по плану или опережение
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#f59e0b]" aria-hidden />
            умеренное отставание от плана (до 12 п.п.)
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#ef4444]" aria-hidden />
            сильное отставание от плана (свыше 12 п.п.)
          </span>
        </div>
      ) : null}
    </div>
  );
}
