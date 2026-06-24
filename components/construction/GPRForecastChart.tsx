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

// Стиль бейджа даты прогноза фиксированный (тёмный фон + оранжевая рамка),
// см. требование: подпись должна читаться как самостоятельная информационная
// метка независимо от риск-цвета линии. Риск по-прежнему передаётся цветом
// самой линии прогноза, см. colorFromPlanFactLag выше.
const FORECAST_BADGE_BG = "#0f172a";
const FORECAST_BADGE_BORDER = "rgba(249, 115, 22, 0.9)";
const FORECAST_BADGE_SHADOW = "0 6px 18px rgba(2, 6, 23, 0.55), 0 0 0 1px rgba(2, 6, 23, 0.4)";

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
  const badgeRef = useRef<HTMLDivElement>(null);
  type BadgeSide = "right" | "above" | "left";
  const [badgePos, setBadgePos] = useState<
    { left: number; top: number; side: BadgeSide } | null
  >(null);

  // Подпись прогнозной точки рисуется поверх canvas в обёртке chartWrapRef.
  // Порядок выбора стороны: справа → сверху → слева. «Справа» предпочтительнее,
  // потому что в этой зоне (layout.padding.right канвы) под текстом гарантированно
  // нет линий графика. Если бейдж не помещается справа — пробуем «сверху»: это
  // ставит метку над точкой и так же уводит её с линии прогноза (линия в правом
  // конце заканчивается на самой точке, выше неё ничего нет). «Слева» — крайний
  // случай, когда метку приходится разместить внутри области графика; за счёт
  // непрозрачного фона и z-index линия под текстом не просвечивает.
  // Цена решения: позиция самой точки на canvas не меняется (см. requirement #6),
  // двигается ТОЛЬКО текстовая подпись.
  const BADGE_GAP_PX = 16;
  const BADGE_SAFETY_PX = 8;
  const BADGE_FALLBACK_WIDTH_PX = 170; // ≈ ширина «до 16 нояб. 2027 г.» с новыми отступами
  const BADGE_FALLBACK_HEIGHT_PX = 28;

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
    const left = x + (canvasRect.left - wrapRect.left);
    const top = y + (canvasRect.top - wrapRect.top);

    // Решаем сторону. Берём фактически измеренные размеры бейджа (если уже
    // отрендерен); иначе — оценку. На следующем пересчёте (ResizeObserver / смена
    // модели) размеры уточняются по реальному значению, поэтому fallback нужен
    // только на самый первый кадр.
    const wrapWidth = wrap.clientWidth;
    const measuredW = badgeRef.current?.offsetWidth ?? 0;
    const measuredH = badgeRef.current?.offsetHeight ?? 0;
    const badgeW = measuredW > 0 ? measuredW : BADGE_FALLBACK_WIDTH_PX;
    const badgeH = measuredH > 0 ? measuredH : BADGE_FALLBACK_HEIGHT_PX;
    const fitsRight = left + BADGE_GAP_PX + badgeW <= wrapWidth - BADGE_SAFETY_PX;
    const fitsAbove = top - BADGE_GAP_PX - badgeH >= BADGE_SAFETY_PX;
    const fitsLeft = left - BADGE_GAP_PX - badgeW >= BADGE_SAFETY_PX;

    let side: BadgeSide;
    if (fitsRight) side = "right";
    else if (fitsAbove) side = "above";
    else if (fitsLeft) side = "left";
    else side = "above"; // ультра-узкий контейнер: всё равно прячем линию под фоном

    setBadgePos({ left, top, side });
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

  // После первого рендера бейджа сверяем фактическую измеренную ширину и при
  // необходимости переключаем сторону. Это страхует случай, когда fallback-оценка
  // ширины оказалась неточной (другой шрифт / другая дата): эффект перерасчёта
  // отрабатывает до paint, поэтому пользователь не видит «вспышку» неправильного
  // расположения.
  useLayoutEffect(() => {
    if (!badgePos || !badgeRef.current || !chartWrapRef.current) return;
    const measuredW = badgeRef.current.offsetWidth;
    const measuredH = badgeRef.current.offsetHeight;
    if (measuredW <= 0 || measuredH <= 0) return;
    const wrapWidth = chartWrapRef.current.clientWidth;
    const fitsRight =
      badgePos.left + BADGE_GAP_PX + measuredW <= wrapWidth - BADGE_SAFETY_PX;
    const fitsAbove =
      badgePos.top - BADGE_GAP_PX - measuredH >= BADGE_SAFETY_PX;
    const fitsLeft =
      badgePos.left - BADGE_GAP_PX - measuredW >= BADGE_SAFETY_PX;

    let correct: BadgeSide;
    if (fitsRight) correct = "right";
    else if (fitsAbove) correct = "above";
    else if (fitsLeft) correct = "left";
    else correct = "above";

    if (correct !== badgePos.side) {
      setBadgePos((prev) => (prev ? { ...prev, side: correct } : prev));
    }
  }, [badgePos]);

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
      order: 0,
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
            order: 1,
            parsing: { xAxisKey: "x", yAxisKey: "y" },
          }
        : null;

    return {
      datasets: forecastDs ? [factDs, forecastDs] : [factDs],
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
                    // Правый отступ axisMaxMs − dataEndMs — это техническая зона
                    // для бейджа даты завершения прогноза. Подписи месяцев,
                    // попадающие в этот буфер (например, «март 2028» при реальном
                    // окончании проекта в ноябре 2027), не относятся к календарю
                    // проекта и должны быть скрыты. Положение точек, линий и
                    // прогноз при этом не меняются — режется ТОЛЬКО текст метки.
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
    [model],
  );

  const badgeLabel =
    model && model.forecastSeries.length >= 2
      ? `до ${endDateFmt.format(new Date(model.forecastMs))}`
      : "";

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
            {badgePos && model.forecastSeries.length >= 2 ? (
              <div
                ref={badgeRef}
                className="pointer-events-none absolute z-20 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold leading-none tracking-tight text-slate-50"
                style={{
                  left: badgePos.left,
                  top: badgePos.top,
                  transform:
                    badgePos.side === "left"
                      ? `translate(calc(-100% - ${BADGE_GAP_PX}px), -50%)`
                      : badgePos.side === "above"
                        ? `translate(-50%, calc(-100% - ${BADGE_GAP_PX}px))`
                        : `translate(${BADGE_GAP_PX}px, -50%)`,
                  background: FORECAST_BADGE_BG,
                  borderColor: FORECAST_BADGE_BORDER,
                  borderWidth: 1,
                  boxShadow: FORECAST_BADGE_SHADOW,
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
