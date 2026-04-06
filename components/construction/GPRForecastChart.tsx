"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Chart as ChartJS } from "chart.js";
import type { ChartData, ChartOptions, ScriptableLineSegmentContext } from "chart.js/auto";
import type { GPRTask, ProjectPartKey } from "@/lib/gprUtils";
import type { Tender } from "@/lib/tenderData";
import type { TMCItem } from "@/lib/tmcData";
import {
  buildGprTimeForecastModel,
  GPR_FORECAST_HORIZON_DAYS,
  type GprTimeForecastModel,
} from "@/lib/gprTmcDependency";

const PLAN_LINE = "#e2e8f0";
const FACT_LINE = "#22c55e";

const monthTickFmt = new Intl.DateTimeFormat("ru-RU", { month: "short", year: "numeric" });

const Chart = dynamic(() => import("react-chartjs-2").then((m) => m.Chart), { ssr: false });

function formatDateLong(ms: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ms));
}

/** Падение по сегменту прогноза: факт «сегодня» минус значение на конце сегмента (п.п.). */
function segmentDrop(ctx: ScriptableLineSegmentContext): number {
  const y0 = ctx.p0.parsed.y;
  const y1 = ctx.p1.parsed.y;
  if (typeof y0 !== "number" || typeof y1 !== "number") return 0;
  return y0 - y1;
}

function segmentBorderColor(ctx: ScriptableLineSegmentContext): string {
  const drop = segmentDrop(ctx);
  if (drop <= 0) return "#22c55e";
  if (drop <= 12) return "#f59e0b";
  return "#ef4444";
}

function segmentFillColor(ctx: ScriptableLineSegmentContext): string {
  const drop = segmentDrop(ctx);
  if (drop <= 0) return "rgba(34, 197, 94, 0.08)";
  if (drop <= 12) return "rgba(245, 158, 11, 0.08)";
  return "rgba(239, 68, 68, 0.12)";
}

function forecastPointColor(model: GprTimeForecastModel): string {
  if (model.factNow == null || model.forecastValue == null) return "#22c55e";
  const drop = model.factNow - model.forecastValue;
  if (drop <= 0) return "#22c55e";
  if (drop <= 12) return "#f59e0b";
  return "#ef4444";
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
      model.factNow != null && model.forecastValue != null
        ? model.forecastSeries.map((p) => ({ x: p.x, y: p.y }))
        : [];

    const fcColor = forecastPointColor(model);

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

    const forecastDs = {
      label: "Прогноз ГПР",
      data: forecastPts,
      borderColor: fcColor,
      backgroundColor: "transparent",
      tension: 0.4,
      borderDash: [6, 5],
      pointRadius: 4.5,
      pointHoverRadius: 6.5,
      pointBackgroundColor: fcColor,
      pointBorderColor: "rgba(15,23,42,0.55)",
      pointBorderWidth: 2,
      borderWidth: 3,
      fill: "origin" as const,
      segment: {
        borderColor: (ctx: ScriptableLineSegmentContext) => segmentBorderColor(ctx),
        backgroundColor: (ctx: ScriptableLineSegmentContext) => segmentFillColor(ctx),
      },
      order: 2,
      parsing: { xAxisKey: "x", yAxisKey: "y" },
    };

    return {
      datasets: forecastPts.length >= 2 ? [planDs, factDs, forecastDs] : [planDs, factDs],
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
              padding: { top: 36, right: 56, left: 4, bottom: 4 },
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
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-400">
          Прогноз на основе текущих данных ТМЦ и тендеров.
          <br />
          Пунктир — ожидаемое изменение.
        </p>
      </div>

      <div ref={chartWrapRef} className="relative mt-4 h-[340px] w-full">
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
            {badgePos && model.forecastSeries.length >= 2 && (
              <div
                className="pointer-events-none absolute z-10 whitespace-nowrap rounded-full border border-emerald-500/35 px-2 py-0.5 text-[11px] font-semibold text-emerald-100/95"
                style={{
                  left: badgePos.left + 10,
                  top: badgePos.top - 10,
                  background: "rgba(34, 197, 94, 0.15)",
                }}
              >
                &lt;{GPR_FORECAST_HORIZON_DAYS} дн.
              </div>
            )}
          </>
        )}
      </div>

      {model && model.planSeries.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-slate-700/40 pt-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#22c55e]" aria-hidden />
            без снижения к факту
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#f59e0b]" aria-hidden />
            умеренное падение
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#ef4444]" aria-hidden />
            сильное падение
          </span>
        </div>
      ) : null}
    </div>
  );
}
