"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Chart as ChartJS } from "chart.js";
import type { ChartData, ChartOptions } from "chart.js/auto";
import {
  PDF_CHART_BLOCK_ATTR,
  PDF_SECTION_TITLE_ATTR,
} from "@/lib/pdf/constructionPdfConstants";
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

/** Обрезка плановой кривой на первой точке 100% (без горизонтального хвоста). */
function truncatePlanSeriesAtCompletion(
  series: ReadonlyArray<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  const completionIdx = series.findIndex((p) => p.y >= 100);
  const slice = completionIdx >= 0 ? series.slice(0, completionIdx + 1) : series;
  return slice.map((p) => ({ x: p.x, y: p.y }));
}

const FORECAST_BADGE_BG = "#0f172a";
const FORECAST_BADGE_BORDER = "rgba(249, 115, 22, 0.9)";
const FORECAST_BADGE_SHADOW = "0 6px 18px rgba(2, 6, 23, 0.55), 0 0 0 1px rgba(2, 6, 23, 0.4)";
const PLAN_BADGE_BORDER = "rgba(226, 232, 240, 0.92)";
const PLAN_BADGE_SHADOW = "0 6px 18px rgba(2, 6, 23, 0.55), 0 0 0 1px rgba(148, 163, 184, 0.25)";

const FORECAST_BADGE_GAP_PX = 16;
/** Воздух между нижней границей бейджа плана и верхней границей plotArea (12–16 px). */
const PLAN_BADGE_AIR_GAP_PX = 14;
const CHART_TOP_PADDING_MIN_PX = 38;
const BADGE_SAFETY_PX = 8;
const BADGE_PAIR_PAD_PX = 6;
const PLAN_LEADER_WIDTH_PX = 1;
const BADGE_FALLBACK_WIDTH_PX = 170;
const BADGE_FALLBACK_HEIGHT_PX = 28;

type BadgeSide = "right" | "above" | "left" | "below";

type ForecastBadgeLayout = {
  left: number;
  top: number;
  side: BadgeSide;
  offsetX: number;
  offsetY: number;
  gap: number;
};

/** Плановый бейдж: X — конечная дата, Y — от верхней границы plotArea. */
type PlanBadgeLayout = {
  centerX: number;
  top: number;
  badgeBottom: number;
  leaderEndX: number;
  leaderEndY: number;
};

type OverlayLayouts = {
  forecast: ForecastBadgeLayout | null;
  plan: PlanBadgeLayout | null;
};

function badgeTransform(side: BadgeSide, gap: number, offsetX: number, offsetY: number): string {
  const ox = offsetX ? ` + ${offsetX}px` : "";
  const oy = offsetY ? ` + ${offsetY}px` : "";
  switch (side) {
    case "left":
      return `translate(calc(-100% - ${gap}px${ox}), calc(-50%${oy}))`;
    case "above":
      return `translate(calc(-50%${ox}), calc(-100% - ${gap}px${oy}))`;
    case "below":
      return `translate(calc(-50%${ox}), calc(${gap}px${oy}))`;
    default:
      return `translate(calc(${gap}px${ox}), calc(-50%${oy}))`;
  }
}

function forecastBadgeBoundingRect(
  layout: ForecastBadgeLayout,
  width: number,
  height: number,
): { left: number; top: number; right: number; bottom: number } {
  const cx = layout.left + layout.offsetX;
  const cy = layout.top + layout.offsetY;
  const { side, gap } = layout;
  switch (side) {
    case "left":
      return { left: cx - gap - width, top: cy - height / 2, right: cx - gap, bottom: cy + height / 2 };
    case "above":
      return { left: cx - width / 2, top: cy - gap - height, right: cx + width / 2, bottom: cy - gap };
    case "below":
      return { left: cx - width / 2, top: cy + gap, right: cx + width / 2, bottom: cy + gap + height };
    default:
      return { left: cx + gap, top: cy - height / 2, right: cx + gap + width, bottom: cy + height / 2 };
  }
}

function planBadgeBoundingRect(
  layout: PlanBadgeLayout,
  width: number,
  height: number,
): { left: number; top: number; right: number; bottom: number } {
  return {
    left: layout.centerX - width / 2,
    top: layout.top,
    right: layout.centerX + width / 2,
    bottom: layout.top + height,
  };
}

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
  padding = 0,
): boolean {
  return !(
    a.right + padding < b.left ||
    b.right + padding < a.left ||
    a.bottom + padding < b.top ||
    b.bottom + padding < a.top
  );
}

function fitsInWrap(
  rect: { left: number; top: number; right: number; bottom: number },
  wrapWidth: number,
  wrapHeight: number,
  safety: number,
): boolean {
  return (
    rect.left >= safety &&
    rect.top >= safety &&
    rect.right <= wrapWidth - safety &&
    rect.bottom <= wrapHeight - safety
  );
}

function forecastPlacementCandidates(): Array<
  Pick<ForecastBadgeLayout, "side" | "offsetX" | "offsetY" | "gap">
> {
  const sides: BadgeSide[] = ["right", "above", "left", "below"];
  return sides.map((side) => ({
    side,
    offsetX: 0,
    offsetY: 0,
    gap: FORECAST_BADGE_GAP_PX,
  }));
}

function resolveForecastBadgeLayout(
  forecastAnchor: { left: number; top: number },
  forecastSize: { w: number; h: number },
  wrapWidth: number,
  wrapHeight: number,
  planRect: { left: number; top: number; right: number; bottom: number } | null,
): ForecastBadgeLayout {
  let best: ForecastBadgeLayout | null = null;
  let bestScore = -Infinity;

  for (const placement of forecastPlacementCandidates()) {
    const layout: ForecastBadgeLayout = { ...forecastAnchor, ...placement };
    const rect = forecastBadgeBoundingRect(layout, forecastSize.w, forecastSize.h);
    if (!fitsInWrap(rect, wrapWidth, wrapHeight, BADGE_SAFETY_PX)) continue;
    if (planRect && rectsOverlap(rect, planRect, BADGE_PAIR_PAD_PX)) continue;

    let score = placement.side === "right" ? 4 : placement.side === "above" ? 2 : 0;
    if (best == null || score > bestScore) {
      best = layout;
      bestScore = score;
    }
  }

  return (
    best ?? {
      ...forecastAnchor,
      side: "right",
      offsetX: 0,
      offsetY: 0,
      gap: FORECAST_BADGE_GAP_PX,
    }
  );
}

function computePlanBadgeTopPadding(badgeHeight: number): number {
  return Math.max(
    CHART_TOP_PADDING_MIN_PX,
    badgeHeight + PLAN_BADGE_AIR_GAP_PX + BADGE_SAFETY_PX,
  );
}

function canvasPointToWrap(
  chart: ChartJS,
  wrap: HTMLElement,
  canvasX: number,
  canvasY: number,
): { left: number; top: number } {
  const canvas = chart.canvas;
  const wrapRect = wrap.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  return {
    left: canvasX + (canvasRect.left - wrapRect.left),
    top: canvasY + (canvasRect.top - wrapRect.top),
  };
}

function computePlanBadgeLayout(
  chart: ChartJS,
  wrap: HTMLElement,
  badgeHeight: number,
): PlanBadgeLayout | null {
  const dsIdx = chart.data.datasets.findIndex((d) => d.label === "План ГПР");
  if (dsIdx < 0) return null;
  const meta = chart.getDatasetMeta(dsIdx);
  const last = meta?.data?.[meta.data.length - 1] as { x?: number; y?: number } | undefined;
  if (last == null || typeof last.x !== "number" || typeof last.y !== "number") return null;

  const planPoint = canvasPointToWrap(chart, wrap, last.x, last.y);
  const plotTop = canvasPointToWrap(chart, wrap, chart.chartArea.left, chart.chartArea.top).top;
  const badgeBottom = plotTop - PLAN_BADGE_AIR_GAP_PX;
  const badgeTop = badgeBottom - badgeHeight;

  return {
    centerX: planPoint.left,
    top: badgeTop,
    badgeBottom,
    leaderEndX: planPoint.left,
    leaderEndY: planPoint.top,
  };
}

function overlayLayoutsEqual(a: OverlayLayouts, b: OverlayLayouts): boolean {
  const sameForecast = (x: ForecastBadgeLayout | null, y: ForecastBadgeLayout | null) =>
    x === y ||
    (x != null &&
      y != null &&
      x.left === y.left &&
      x.top === y.top &&
      x.side === y.side &&
      x.offsetX === y.offsetX &&
      x.offsetY === y.offsetY &&
      x.gap === y.gap);
  const samePlan = (x: PlanBadgeLayout | null, y: PlanBadgeLayout | null) =>
    x === y ||
    (x != null &&
      y != null &&
      x.centerX === y.centerX &&
      x.top === y.top &&
      x.badgeBottom === y.badgeBottom &&
      x.leaderEndX === y.leaderEndX &&
      x.leaderEndY === y.leaderEndY);
  return sameForecast(a.forecast, b.forecast) && samePlan(a.plan, b.plan);
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
  const forecastBadgeRef = useRef<HTMLDivElement>(null);
  const planBadgeRef = useRef<HTMLDivElement>(null);
  const [overlayLayouts, setOverlayLayouts] = useState<OverlayLayouts>({ forecast: null, plan: null });
  const [chartTopPadding, setChartTopPadding] = useState(CHART_TOP_PADDING_MIN_PX);

  const planSeriesForChart = useMemo(
    () => (model ? truncatePlanSeriesAtCompletion(model.planSeries) : []),
    [model],
  );

  const planEndMs = planSeriesForChart.length > 0 ? planSeriesForChart[planSeriesForChart.length - 1]!.x : null;
  const showPlanBadge = planEndMs != null && planSeriesForChart.length > 0;

  const updateOverlays = useCallback(() => {
    const wrap = chartWrapRef.current;
    const chart = chartRef.current;
    if (!wrap || !chart?.canvas || !model) {
      setOverlayLayouts({ forecast: null, plan: null });
      return;
    }

    if (!chart.chartArea || chart.chartArea.width <= 0 || chart.chartArea.height <= 0) {
      return;
    }

    const forecastW = forecastBadgeRef.current?.offsetWidth ?? 0;
    const forecastH = forecastBadgeRef.current?.offsetHeight ?? 0;
    const planW = planBadgeRef.current?.offsetWidth ?? 0;
    const planH = planBadgeRef.current?.offsetHeight ?? 0;

    const planBadgeH = showPlanBadge ? (planH > 0 ? planH : BADGE_FALLBACK_HEIGHT_PX) : 0;
    const requiredTopPadding = showPlanBadge ? computePlanBadgeTopPadding(planBadgeH) : CHART_TOP_PADDING_MIN_PX;

    if (requiredTopPadding !== chartTopPadding) {
      setChartTopPadding(requiredTopPadding);
      return;
    }

    const getForecastAnchor = (): { left: number; top: number } | null => {
      if (model.forecastSeries.length < 2) return null;
      const dsIdx = chart.data.datasets.findIndex((d) => d.label === "Прогноз ГПР");
      if (dsIdx < 0) return null;
      const meta = chart.getDatasetMeta(dsIdx);
      const last = meta?.data?.[meta.data.length - 1] as { x?: number; y?: number } | undefined;
      if (last == null || typeof last.x !== "number" || typeof last.y !== "number") return null;
      return canvasPointToWrap(chart, wrap, last.x, last.y);
    };

    const planLayout = showPlanBadge ? computePlanBadgeLayout(chart, wrap, planBadgeH) : null;

    if (planLayout && planLayout.top < BADGE_SAFETY_PX) {
      const extraTopPadding =
        chartTopPadding + (BADGE_SAFETY_PX - planLayout.top) + PLAN_BADGE_AIR_GAP_PX;
      if (extraTopPadding > chartTopPadding) {
        setChartTopPadding(extraTopPadding);
        return;
      }
    }

    const planRect =
      planLayout && planW > 0
        ? planBadgeBoundingRect(planLayout, planW, planBadgeH)
        : planLayout
          ? planBadgeBoundingRect(planLayout, BADGE_FALLBACK_WIDTH_PX, planBadgeH)
          : null;

    const forecastAnchor = getForecastAnchor();
    const forecastLayout = forecastAnchor
      ? resolveForecastBadgeLayout(
          forecastAnchor,
          {
            w: forecastW > 0 ? forecastW : BADGE_FALLBACK_WIDTH_PX,
            h: forecastH > 0 ? forecastH : BADGE_FALLBACK_HEIGHT_PX,
          },
          wrap.clientWidth,
          wrap.clientHeight,
          planRect,
        )
      : null;

    const next: OverlayLayouts = { forecast: forecastLayout, plan: planLayout };
    setOverlayLayouts((prev) => (overlayLayoutsEqual(prev, next) ? prev : next));
  }, [model, planSeriesForChart, showPlanBadge, chartTopPadding]);

  const updateOverlaysRef = useRef(updateOverlays);
  updateOverlaysRef.current = updateOverlays;

  useLayoutEffect(() => {
    const run = () => {
      requestAnimationFrame(() => updateOverlaysRef.current());
    };
    run();
    const wrap = chartWrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(run);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [model, planSeriesForChart, chartTopPadding]);

  useLayoutEffect(() => {
    if (!overlayLayouts.forecast && !overlayLayouts.plan) return;
    const planH = planBadgeRef.current?.offsetHeight ?? 0;
    const forecastH = forecastBadgeRef.current?.offsetHeight ?? 0;
    if (planH <= 0 && forecastH <= 0) return;
    updateOverlaysRef.current();
  }, [overlayLayouts]);

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
      data: planSeriesForChart,
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
  }, [model, planSeriesForChart]);

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
              padding: { top: chartTopPadding, right: 56, left: 4, bottom: 4 },
            },
            animation: {
              duration: 450,
              onComplete: () => {
                updateOverlaysRef.current();
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
                    if (n > model.dataEndMs) return "";
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
                    const dsLabel = item.dataset.label;
                    const di = item.dataIndex;
                    const m = model as GprTimeForecastModel;
                    const fcLen = m.forecastSeries.length;

                    if (dsLabel === "Прогноз ГПР" && di === 0) {
                      const lag = m.planFactLagPp;
                      const lagLine =
                        lag == null
                          ? "—"
                          : `${lag > 0 ? "+" : ""}${lag.toFixed(1).replace(/\.0$/, "")}%`;
                      return [
                        "",
                        "Сегодня:",
                        `  факт: ${m.factNow == null ? "—" : `${m.factNow}%`}`,
                        `  план: ${m.planAtToday == null ? "—" : `${m.planAtToday}%`}`,
                        `  отставание готовности от плана: ${lagLine}`,
                        `  ТМЦ: ${m.tmcPct == null ? "—" : `${m.tmcPct}%`}`,
                        `  тендеры: ${m.tenderPct == null ? "—" : `${m.tenderPct}%`}`,
                      ];
                    }
                    if (dsLabel === "Прогноз ГПР" && fcLen > 0 && di === fcLen - 1) {
                      return [
                        "",
                        "Прогноз (до конца проекта):",
                        `  дата: ${m.forecastDateIso}`,
                        `  значение: ${m.forecastValue == null ? "—" : `${m.forecastValue}%`}`,
                        `  изменение к факту: ${m.changePct ?? "—"}`,
                        `  примечание: ${m.forecastReason}`,
                      ];
                    }
                    if (dsLabel === "Прогноз ГПР" && di > 0 && di < fcLen - 1) {
                      return [
                        "",
                        "Точка прогноза по тем же датам, что и план (смещение от текущего отставания).",
                      ];
                    }
                    return [];
                  },
                },
              },
            },
          },
    [model, chartTopPadding],
  );

  const forecastBadgeLabel =
    model && model.forecastSeries.length >= 2
      ? `до ${endDateFmt.format(new Date(model.forecastMs))}`
      : "";

  const planBadgeLabel =
    planEndMs != null ? `до ${endDateFmt.format(new Date(planEndMs))}` : "";

  return (
    <div
      className="mt-6 min-w-0 rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-6"
      {...{ [PDF_CHART_BLOCK_ATTR]: "" }}
      {...{ [PDF_SECTION_TITLE_ATTR]: "Прогноз выполнения ГПР" }}
    >
      <h3 className="text-lg font-semibold text-slate-50">Прогноз выполнения ГПР</h3>

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
            {overlayLayouts.plan && planBadgeLabel ? (
              <svg
                className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                aria-hidden
              >
                <line
                  x1={overlayLayouts.plan.centerX}
                  y1={overlayLayouts.plan.badgeBottom}
                  x2={overlayLayouts.plan.leaderEndX}
                  y2={overlayLayouts.plan.leaderEndY}
                  stroke={PLAN_LINE}
                  strokeWidth={PLAN_LEADER_WIDTH_PX}
                  strokeOpacity={0.85}
                />
              </svg>
            ) : null}
            {overlayLayouts.forecast && forecastBadgeLabel ? (
              <div
                ref={forecastBadgeRef}
                className="pointer-events-none absolute z-30 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold leading-none tracking-tight text-slate-50"
                style={{
                  left: overlayLayouts.forecast.left,
                  top: overlayLayouts.forecast.top,
                  transform: badgeTransform(
                    overlayLayouts.forecast.side,
                    overlayLayouts.forecast.gap,
                    overlayLayouts.forecast.offsetX,
                    overlayLayouts.forecast.offsetY,
                  ),
                  background: FORECAST_BADGE_BG,
                  borderColor: FORECAST_BADGE_BORDER,
                  borderWidth: 1,
                  boxShadow: FORECAST_BADGE_SHADOW,
                }}
              >
                {forecastBadgeLabel}
              </div>
            ) : null}
            {showPlanBadge && planBadgeLabel ? (
              <div
                ref={planBadgeRef}
                className="pointer-events-none absolute z-30 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold leading-none tracking-tight text-slate-100"
                style={{
                  left: overlayLayouts.plan?.centerX ?? -9999,
                  top: overlayLayouts.plan?.top ?? -9999,
                  transform: "translateX(-50%)",
                  visibility: overlayLayouts.plan ? "visible" : "hidden",
                  background: FORECAST_BADGE_BG,
                  borderColor: PLAN_BADGE_BORDER,
                  borderWidth: 1,
                  boxShadow: PLAN_BADGE_SHADOW,
                }}
              >
                {planBadgeLabel}
              </div>
            ) : null}
          </>
        )}
      </div>

      {model && model.planSeries.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-slate-700/40 pt-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#22c55e]" aria-hidden />
            По плану или с опережением
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#f59e0b]" aria-hidden />
            Отставание до 12%
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#ef4444]" aria-hidden />
            Отставание более 12%
          </span>
        </div>
      ) : null}
    </div>
  );
}
