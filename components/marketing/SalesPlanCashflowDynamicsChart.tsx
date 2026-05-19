"use client";

import { useMemo, useState } from "react";
import { usePlotArea, useXAxisScale, useYAxisScale } from "recharts";

import {
  cashflowRowsForChart,
  periodKeyToRuChartLabel,
  type CashflowChartMode,
  type CashflowChartRow,
  type CashflowSeriesRow,
} from "@/lib/buildCashflowSeries";
import {
  cashflowYAxisScale,
  formatCashflowCumulativePointLabel,
  formatCashflowMillionsLabel,
  formatCashflowTooltipRub,
  formatCashflowYAxisMlnRub,
} from "@/lib/salesPlanChartFormat";
import { MPL_PREMIUM_CHART_SHELL } from "@/lib/marketingPremiumUi";
import { useMarketingPresentationLight, useMarketingPresVisual } from "@/components/marketing/marketingPresentationLightContext";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import type { MarketingPaymentZaydetMonthVerifyRow } from "@/lib/paymentScheduleCsv";
import {
  cashflowInflowFactLineProps,
  cashflowInflowPlanLineProps,
  CASHFLOW_INFLOW_FACT,
  CASHFLOW_INFLOW_PLAN,
} from "@/lib/cashflowInflowChartSeries";
import { CashflowInflowChartLegendToolbar } from "@/components/marketing/CashflowInflowChartLegend";
import {
  createMarketingDealsStyleMonthTickRenderer,
  MARKETING_DEALS_STYLE_MONTH_X_AXIS,
} from "@/components/marketing/marketingDealsStyleMonthXAxis";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function snapLabelCenterY(y: number, yMin: number, yMax: number, step: number): number {
  if (step <= 1) return clamp(y, yMin, yMax);
  const snapped = Math.round(y / step) * step;
  return clamp(snapped, yMin, yMax);
}

/** Постоянная подпись у точки только от 1 млн ₽; &lt; 1 млн — только тултип. */
const CHART_LABEL_MIN_RUB = 1_000_000;
/** Факт: выделение крупных значений (подпись у точки). */
const CHART_LABEL_ALWAYS_SHOW_RUB = 5_000_000;
/** План: нижняя полоса — значения ≥ 3 млн, пики, первый и последний месяц (≥ 1 млн). */
const CHART_PLAN_BAND_THRESHOLD_RUB = 3_000_000;
const CHART_MARGIN_TOP_LIGHT_LABELS = 20;
/** Нижний отступ SVG: подписи месяцев оси X и запас под подписи значений у линий. */
const CHART_MARGIN_BOTTOM = 64;
/** Запас над зоной тиков оси X (px), включая мобильные переносы. */
const X_AXIS_LABEL_BAND_RESERVE = 36;
/** Факт: вертикальный зазор центра подписи над точкой (только текст, без налезания на линию). */
const LABEL_OFFSET_FACT_ABOVE = 4;
/** Доп. подъём синих подписей факта: презентация + нарастающий итог (плато у линии). */
const LABEL_OFFSET_FACT_CUMULATIVE_PRES_EXTRA = 8;
/** Базовый доп. подъём для всех cumulative-лейблов факта (до плато / collision). */
const LABEL_OFFSET_FACT_CUMULATIVE_BASE_EXTRA = 4;
/** Запас от нижнего края подписи факта до полосы подписей месяцев (направляющих больше нет). */
const FACT_LABEL_MARGIN_ABOVE_MONTH_AXIS_PX = 3;
/** План: нижний край подписи над пунктиром (симметрично LABEL_OFFSET_FACT_ABOVE). */
const LABEL_OFFSET_PLAN_ABOVE = 4;
/** labelY = pointY − offset (dominantBaseline central), привязка к точке. */
const POINT_LABEL_Y_OFFSET_FACT = 10;
const POINT_LABEL_Y_OFFSET_PLAN = 12;
/** Зазор нижнего края подписи над горизонтальной линией сетки (только при пересечении). */
const POINT_LABEL_GRID_LINE_CLEARANCE_PX = 5;
/** Нижний край подписи не заходит на маркер точки. */
const POINT_LABEL_POINT_CLEARANCE_PX = 5;
/** Минимальный зазор между центрами Fact и Plan на одном месяце. */
const FACT_PLAN_MIN_LABEL_GAP_PX = 18;
/** Доп. сдвиг при коллизии Fact/Plan (от базы pointY − offset). */
const FACT_PLAN_COLLISION_FACT_SHIFT_PX = 8;
const FACT_PLAN_COLLISION_PLAN_SHIFT_PX = 8;
/** Первая точка: подписи правее, чтобы не налезать на тики оси Y. */
const FIRST_POINT_LABEL_X_OFFSET_PX = 14;
/** Нарастающий итог: первая синяя подпись чуть ниже (зазор от «40» и линии плана). */
const CUMULATIVE_FIRST_FACT_LABEL_Y_EXTRA_DOWN_PX = 10;
/** План (plan_fact.csv): подпись под точкой. */
const PLAN_LABEL_GAP_BELOW_POINT_PX = 3;
/** Минимум между нижним краем подписи плана и линией (не заходить на точку). */
const PLAN_LABEL_LINE_CLEARANCE_PX = 4;

/** Подпись плана над линией: без крупного dy вверх (раньше до 25–35px от пунктира). */
const PLAN_LABEL_STAGGER_ABOVE: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: 0 },
  { dx: 14, dy: 0 },
  { dx: -14, dy: 0 },
  { dx: 22, dy: 0 },
  { dx: -22, dy: 0 },
  { dx: 0, dy: 4 },
  { dx: 12, dy: 3 },
  { dx: -12, dy: 3 },
  { dx: 0, dy: 8 },
  { dx: 18, dy: 5 },
  { dx: -18, dy: 5 },
];

/** План: правый край графика — только dx ≤ 0 (подпись не уходит вправо от точки). */
const PLAN_LABEL_STAGGER_LAST_INDEX: ReadonlyArray<{ dx: number; dy: number }> = (() => {
  const seen = new Set<string>();
  const out: { dx: number; dy: number }[] = [];
  const push = (dx: number, dy: number) => {
    const key = `${dx},${dy}`;
    if (seen.has(key) || dx > 0) return;
    seen.add(key);
    out.push({ dx, dy });
  };
  push(0, 0);
  push(-10, 0);
  for (const { dx, dy } of PLAN_LABEL_STAGGER_ABOVE) {
    push(dx, dy);
  }
  return out;
})();

/** Подпись факта по центру категории (ровнее «вертикальная сетка»). */
const LABEL_FACT_DX = 0;
/** Если маркер близко к нулю (низ графика), поднимаем подпись факта. */
const NEAR_X_AXIS_PX = 72;
const NEAR_AXIS_LIFT_MAX = 20;

/** Размеры подписей значений у линий (только текст, без фона). */
const BADGE_FONT_PX = 12;
const BADGE_H_PX = 24;
const BADGE_PAD_X = 9;

type PlotRect = { x: number; y: number; width: number; height: number };

/** Минимум пикселей между нижним краем подписи факта и полилинией факта (cumulative). */
const CUM_FACT_LINE_CLEARANCE_PX = 10;
/** Минимум между нижним краем подписи факта и точкой (месячный режим). */
const MONTHLY_FACT_LINE_CLEARANCE_PX = 7;
/** Шаг сетки по Y для выравнивания подписей факта. */
const FACT_LABEL_Y_SNAP_PX = 8;

function cumulativeFactPlateauExtraPx(minNeighborDyPx: number): number {
  if (!Number.isFinite(minNeighborDyPx)) return 0;
  if (minNeighborDyPx < 4) return 34;
  if (minNeighborDyPx < 8) return 27;
  if (minNeighborDyPx < 14) return 20;
  if (minNeighborDyPx < 22) return 14;
  if (minNeighborDyPx < 32) return 8;
  return 0;
}

function cumulativeFactMinNeighborDyPx(
  chartData: CashflowChartRow[],
  index: number,
  yScale: (v: number) => number | undefined,
): number {
  const row = chartData[index]!;
  const fv = row.fact;
  if (fv == null || !Number.isFinite(fv)) return Number.POSITIVE_INFINITY;
  const y0 = yScale(fv);
  if (y0 == null || !Number.isFinite(y0)) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (let j = index - 1; j >= 0; j--) {
    const v = chartData[j]!.fact;
    if (v != null && Number.isFinite(v)) {
      const y1 = yScale(v);
      if (y1 != null && Number.isFinite(y1)) best = Math.min(best, Math.abs(y0 - y1));
      break;
    }
  }
  for (let j = index + 1; j < chartData.length; j++) {
    const v = chartData[j]!.fact;
    if (v != null && Number.isFinite(v)) {
      const y1 = yScale(v);
      if (y1 != null && Number.isFinite(y1)) best = Math.min(best, Math.abs(y0 - y1));
      break;
    }
  }
  return best;
}

/** Категориальная ось X (месяц): Recharts `ScaleFunction` — приводим к узкой сигнатуре для подписей. */
type CashflowChartXScale = (label: string, opts?: { position?: string }) => number | undefined;

function factPointXForLabel(
  row: CashflowChartRow,
  index: number,
  chartLen: number,
  xScale: CashflowChartXScale,
  plot: PlotRect | null | undefined,
): number | null {
  let x = xScale(row.label, { position: "middle" }) ?? xScale(row.label);
  if (x == null && plot && chartLen > 0) {
    x = plot.x + ((index + 0.5) / chartLen) * plot.width;
  }
  return x != null && Number.isFinite(x) ? x : null;
}

/** Y полилинии факта в точке atX (линейная интерполяция между точками с ненулевым fact). */
function cumulativeFactPolylineYAtX(
  chartData: CashflowChartRow[],
  atX: number,
  yScale: (v: number) => number | undefined,
  xScale: CashflowChartXScale,
  plot: PlotRect | null | undefined,
): number | null {
  const n = chartData.length;
  type Pt = { x: number; y: number };
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const row = chartData[i]!;
    if (row.fact == null || !Number.isFinite(row.fact)) continue;
    const x = factPointXForLabel(row, i, n, xScale, plot);
    const y = yScale(row.fact);
    if (x == null || y == null || !Number.isFinite(y)) continue;
    pts.push({ x, y });
  }
  if (pts.length === 0) return null;
  if (atX <= pts[0]!.x) return pts[0]!.y;
  if (atX >= pts[pts.length - 1]!.x) return pts[pts.length - 1]!.y;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!;
    const b = pts[k]!;
    if (atX >= a.x && atX <= b.x) {
      const t = b.x === a.x ? 0 : (atX - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return null;
}

/** Доп. сдвиг вверх, если нижний край таблетки опускается ниже полилинии факта у pillCx. */
function cumulativeFactLineClearanceExtraPx(
  chartData: CashflowChartRow[],
  pillCx: number,
  pillBottomY: number,
  yScale: (v: number) => number | undefined,
  xScale: CashflowChartXScale,
  plot: PlotRect | null | undefined,
): number {
  const yLine = cumulativeFactPolylineYAtX(chartData, pillCx, yScale, xScale, plot);
  if (yLine == null || !Number.isFinite(yLine)) return 0;
  const limit = yLine - CUM_FACT_LINE_CLEARANCE_PX;
  if (pillBottomY <= limit) return 0;
  return Math.min(56, pillBottomY - limit + 2);
}

/** Сильнее разносить по dy при плато cumulative (перед общим stagger). */
const CUM_FACT_PLATEAU_STAGGER_PREFIX: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: 36 },
  { dx: 0, dy: 46 },
  { dx: 0, dy: 56 },
  { dx: 12, dy: 32 },
  { dx: -12, dy: 32 },
  { dx: 20, dy: 40 },
  { dx: -20, dy: 40 },
  { dx: 26, dy: 44 },
  { dx: -26, dy: 44 },
];

/** Согласовано с margin.left + YAxis.width в LineChart — таблетки не заезжают на подписи оси Y. */
const CHART_MARGIN_LEFT_PX = 10;
const CHART_Y_AXIS_WIDTH_PX = 88;
/** Зазор таблетки от границы области построения (сетка, подписи тиков). */
const BADGE_CLEAR_FROM_PLOT_EDGE_PX = 8;
const BADGE_CLEAR_FROM_CHART_TOP_PX = 6;
const BADGE_CLEAR_FROM_CHART_RIGHT_PX = 10;

function chartBadgeSafeBounds(
  plot: PlotRect | null | undefined,
  chartW: number,
  chartH: number,
): { safeLeft: number; safeRight: number; safeTop: number; plotBottomY: number } {
  const plotBottomY =
    plot && plot.height > 0 ? plot.y + plot.height : chartH - CHART_MARGIN_BOTTOM;
  if (plot && plot.width > 0 && plot.height > 0) {
    return {
      safeLeft: plot.x + BADGE_CLEAR_FROM_PLOT_EDGE_PX,
      safeRight: plot.x + plot.width - BADGE_CLEAR_FROM_PLOT_EDGE_PX,
      safeTop: plot.y + BADGE_CLEAR_FROM_CHART_TOP_PX,
      plotBottomY,
    };
  }
  const fallbackLeft = CHART_MARGIN_LEFT_PX + CHART_Y_AXIS_WIDTH_PX + BADGE_CLEAR_FROM_PLOT_EDGE_PX;
  return {
    safeLeft: fallbackLeft,
    safeRight: chartW - BADGE_CLEAR_FROM_CHART_RIGHT_PX,
    safeTop: BADGE_CLEAR_FROM_CHART_TOP_PX,
    plotBottomY,
  };
}

function prevDefinedNumber(arr: (number | null)[], i: number): number | null {
  for (let j = i - 1; j >= 0; j--) {
    const v = arr[j];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

function nextDefinedNumber(arr: (number | null)[], i: number): number | null {
  for (let j = i + 1; j < arr.length; j++) {
    const v = arr[j];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

/** Локальный максимум по ряду с пропусками null (факт). */
function isLocalPeakSparse(arr: (number | null)[], i: number): boolean {
  const v = arr[i];
  if (v == null || !Number.isFinite(v)) return false;
  const L = prevDefinedNumber(arr, i);
  const R = nextDefinedNumber(arr, i);
  if (L == null && R == null) return true;
  if (L == null) return v > R!;
  if (R == null) return v > L;
  return v > L && v > R;
}

function isLocalValleySparse(arr: (number | null)[], i: number): boolean {
  const v = arr[i];
  if (v == null || !Number.isFinite(v)) return false;
  const L = prevDefinedNumber(arr, i);
  const R = nextDefinedNumber(arr, i);
  if (L == null && R == null) return true;
  if (L == null) return v < R!;
  if (R == null) return v < L;
  return v < L && v < R;
}

function firstDefinedFactIndex(facts: (number | null)[]): number {
  for (let i = 0; i < facts.length; i++) {
    if (facts[i] != null && Number.isFinite(facts[i]!)) return i;
  }
  return -1;
}

function lastDefinedFactIndex(facts: (number | null)[]): number {
  for (let i = facts.length - 1; i >= 0; i--) {
    if (facts[i] != null && Number.isFinite(facts[i]!)) return i;
  }
  return -1;
}

type LabelSeries = "fact" | "plan";

type LabelCandidate = {
  series: LabelSeries;
  index: number;
  valueRub: number;
  priority: number;
};

function buildPeakBefore(peakAt: boolean[]): boolean[] {
  const n = peakAt.length;
  const out = new Array<boolean>(n).fill(false);
  let seen = false;
  for (let i = 0; i < n; i++) {
    out[i] = seen;
    if (peakAt[i]) seen = true;
  }
  return out;
}

function buildFactLabelCandidates(chartData: CashflowChartRow[], opts?: { minRub?: number }): LabelCandidate[] {
  const n = chartData.length;
  if (n === 0) return [];
  const facts = chartData.map((d) => d.fact);
  const firstF = firstDefinedFactIndex(facts);
  const lastF = lastDefinedFactIndex(facts);
  const peakAt = facts.map((_, i) => isLocalPeakSparse(facts, i));
  const peakBefore = buildPeakBefore(peakAt);
  const out: LabelCandidate[] = [];
  const seen = new Set<string>();
  const minRub = opts?.minRub ?? CHART_LABEL_MIN_RUB;

  for (let i = 0; i < n; i++) {
    const v = facts[i];
    if (v == null || !Number.isFinite(v) || v < minRub) continue;

    const peak = peakAt[i]!;
    const valley = isLocalValleySparse(facts, i);
    const dropAfterPeak = valley && peakBefore[i]!;
    const forceHigh = v >= CHART_LABEL_ALWAYS_SHOW_RUB;
    const endpoint = i === firstF || i === lastF;

    if (!(peak || dropAfterPeak || forceHigh || endpoint)) continue;

    const key = `f-${i}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let priority = v;
    if (forceHigh) priority += 4e9;
    if (endpoint) priority += 2e9;
    if (peak) priority += 1e9;
    if (dropAfterPeak) priority += 5e8;

    out.push({ series: "fact", index: i, valueRub: v, priority });
  }
  return out;
}

function gridLinePixelYs(yScale: (v: number) => number | undefined, tickValues: readonly number[]): number[] {
  const out: number[] = [];
  for (const v of tickValues) {
    const y = yScale(v);
    if (y != null && Number.isFinite(y)) out.push(y);
  }
  return out;
}

/** Не перекрывать маркер (подпись над точкой): при необходимости чуть поднять. */
function nudgePointLabelYAbovePoint(
  labelY: number,
  halfH: number,
  pointY: number,
  clearancePx = POINT_LABEL_POINT_CLEARANCE_PX,
): number {
  const maxBottom = pointY - clearancePx;
  if (labelY + halfH <= maxBottom) return labelY;
  return maxBottom - halfH;
}

/** Лёгкий подъём только если нижний край подписи попал на линию сетки. */
function nudgePointLabelYAboveGrid(labelY: number, halfH: number, gridLineYs: readonly number[]): number {
  let y = labelY;
  for (let guard = 0; guard < 3; guard++) {
    const bottom = y + halfH;
    let lift = 0;
    for (const gy of gridLineYs) {
      const nearBand = POINT_LABEL_GRID_LINE_CLEARANCE_PX + 2;
      if (bottom >= gy - nearBand && bottom <= gy + 1) {
        lift = Math.max(lift, bottom - gy + POINT_LABEL_GRID_LINE_CLEARANCE_PX + 2);
      }
    }
    if (lift <= 0.25) break;
    y -= lift;
  }
  return y;
}

type CashflowOverlayLabel = { key: string; x: number; y: number; text: string };

function overlayMonthIndices(
  n: number,
  factIndices: ReadonlySet<number> | null,
  planIndices: ReadonlySet<number> | null,
): number[] {
  if (factIndices === null && planIndices === null) {
    return Array.from({ length: n }, (_, i) => i);
  }
  const merged = new Set<number>();
  if (factIndices) for (const i of factIndices) merged.add(i);
  if (planIndices) for (const i of planIndices) merged.add(i);
  return [...merged].sort((a, b) => a - b);
}

function buildCashflowPointOverlayLabels(opts: {
  chartData: CashflowChartRow[];
  xCat: CashflowChartXScale;
  plot: PlotRect | null | undefined;
  yScale: (v: number) => number | undefined;
  gridLineYs: readonly number[];
  formatLabel: (rub: number) => string;
  factIndices: ReadonlySet<number> | null;
  planIndices: ReadonlySet<number> | null;
  planLabelBelowPoint?: boolean;
  /** Только первая подпись Fact: доп. сдвиг вниз (px), 0 — без сдвига. */
  firstPointFactLabelExtraDownPx?: number;
}): { fact: CashflowOverlayLabel[]; plan: CashflowOverlayLabel[] } {
  const {
    chartData,
    xCat,
    plot,
    yScale,
    gridLineYs,
    formatLabel,
    factIndices,
    planIndices,
    planLabelBelowPoint = false,
    firstPointFactLabelExtraDownPx = 0,
  } = opts;
  const halfH = BADGE_H_PX / 2;
  const n = chartData.length;
  const fact: CashflowOverlayLabel[] = [];
  const plan: CashflowOverlayLabel[] = [];
  const monthIndices = overlayMonthIndices(n, factIndices, planIndices);

  for (const index of monthIndices) {
    const row = chartData[index]!;
    const pointX = categoryPointX(row, index, n, xCat, plot);
    if (pointX == null) continue;
    const labelX = pointX + (index === 0 ? FIRST_POINT_LABEL_X_OFFSET_PX : 0);

    const showFact = factIndices === null || factIndices.has(index);
    const showPlan = planIndices === null || planIndices.has(index);

    const factValue = row.fact;
    const planValue = row.plan;
    const hasFact = showFact && factValue != null && Number.isFinite(factValue);
    const hasPlan = showPlan && planValue != null && Number.isFinite(planValue);

    let factPointY: number | null = null;
    let planPointY: number | null = null;
    let factY: number | null = null;
    let planY: number | null = null;

    if (hasFact) {
      factPointY = yScale(factValue) ?? null;
      if (factPointY != null) factY = factPointY - POINT_LABEL_Y_OFFSET_FACT;
    }
    if (hasPlan) {
      planPointY = yScale(planValue) ?? null;
      if (planPointY != null) {
        planY = planLabelBelowPoint
          ? planPointY + PLAN_LABEL_GAP_BELOW_POINT_PX + halfH
          : planPointY - POINT_LABEL_Y_OFFSET_PLAN;
      }
    }

    if (factY != null && planY != null && Math.abs(factY - planY) < FACT_PLAN_MIN_LABEL_GAP_PX) {
      factY -= FACT_PLAN_COLLISION_FACT_SHIFT_PX;
      planY += FACT_PLAN_COLLISION_PLAN_SHIFT_PX;
    }

    if (factY != null && factPointY != null && hasFact) {
      factY = nudgePointLabelYAbovePoint(factY, halfH, factPointY);
      factY = nudgePointLabelYAboveGrid(factY, halfH, gridLineYs);
      if (index === 0 && firstPointFactLabelExtraDownPx > 0) {
        factY += firstPointFactLabelExtraDownPx;
      }
      const text = formatLabel(factValue);
      if (text) fact.push({ key: `fact-${row.periodKey}-${index}`, x: labelX, y: factY, text });
    }

    if (planY != null && planPointY != null && hasPlan) {
      if (!planLabelBelowPoint) {
        planY = nudgePointLabelYAbovePoint(planY, halfH, planPointY);
      }
      planY = nudgePointLabelYAboveGrid(planY, halfH, gridLineYs);
      const text = formatLabel(planValue);
      if (text) plan.push({ key: `plan-${row.periodKey}-${index}`, x: labelX, y: planY, text });
    }
  }

  return { fact, plan };
}

/**
 * Помесячно и нарастающим итогом: ручной SVG-overlay у координат точек (без LabelList / auto labels).
 */
function CashflowPointLabelsOverlay({
  chartData,
  presDark,
  mode,
  yGridTickValues,
  planFactExecutionLabels = false,
}: {
  chartData: CashflowChartRow[];
  presDark: boolean;
  mode: CashflowChartMode;
  yGridTickValues: readonly number[];
  planFactExecutionLabels?: boolean;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();

  const factCandidates = useMemo(
    () =>
      mode === "monthly"
        ? buildFactLabelCandidates(chartData, planFactExecutionLabels ? { minRub: 0 } : undefined)
        : null,
    [chartData, mode, planFactExecutionLabels],
  );
  const planCandidates = useMemo(
    () =>
      mode === "monthly"
        ? buildPlanLabelCandidates(chartData, planFactExecutionLabels ? { minRub: 0, relaxBand: true } : undefined)
        : null,
    [chartData, mode, planFactExecutionLabels],
  );

  const factIndices = useMemo(
    () => (mode === "monthly" && factCandidates ? new Set(factCandidates.map((c) => c.index)) : null),
    [mode, factCandidates],
  );
  const planIndices = useMemo(
    () => (mode === "monthly" && planCandidates ? new Set(planCandidates.map((c) => c.index)) : null),
    [mode, planCandidates],
  );

  const formatLabel = useMemo(
    () =>
      mode === "cumulative"
        ? formatCashflowCumulativePointLabel
        : (rub: number) => formatCashflowMillionsLabel(rub, false),
    [mode],
  );

  const labels = useMemo(() => {
    if (!xScale || !yScale) return { fact: [] as CashflowOverlayLabel[], plan: [] as CashflowOverlayLabel[] };
    const xCat = xScale as unknown as CashflowChartXScale;
    const gridLineYs = gridLinePixelYs(yScale, yGridTickValues);
    return buildCashflowPointOverlayLabels({
      chartData,
      xCat,
      plot,
      yScale,
      gridLineYs,
      formatLabel,
      factIndices,
      planIndices,
      planLabelBelowPoint: planFactExecutionLabels,
      firstPointFactLabelExtraDownPx:
        mode === "cumulative" ? CUMULATIVE_FIRST_FACT_LABEL_Y_EXTRA_DOWN_PX : 0,
    });
  }, [
    chartData,
    xScale,
    yScale,
    plot,
    yGridTickValues,
    formatLabel,
    factIndices,
    planIndices,
    planFactExecutionLabels,
  ]);

  if (!xScale || !yScale) return null;

  const factFill = presDark ? "#93c5fd" : CASHFLOW_INFLOW_FACT.stroke;
  const planFill = presDark ? "#F0C896" : CASHFLOW_INFLOW_PLAN.label;
  const factLayerClass = mode === "monthly" ? "monthly-fact-labels" : "fact-labels-layer";
  const planLayerClass = mode === "monthly" ? "monthly-plan-labels" : "plan-labels-layer";

  return (
    <>
      <g className={factLayerClass} pointerEvents="none">
        {labels.fact.map((p) => (
          <text
            key={p.key}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill={factFill}
            fontSize={BADGE_FONT_PX}
            fontWeight={700}
            className="tabular-nums"
          >
            {p.text}
          </text>
        ))}
      </g>
      <g className={planLayerClass} pointerEvents="none">
        {labels.plan.map((p) => (
          <text
            key={p.key}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill={planFill}
            fontSize={BADGE_FONT_PX}
            fontWeight={500}
            className="tabular-nums"
          >
            {p.text}
          </text>
        ))}
      </g>
    </>
  );
}

function categoryPointX(
  row: CashflowChartRow,
  index: number,
  chartLen: number,
  xScale: CashflowChartXScale,
  plot: PlotRect | null | undefined,
): number | null {
  let cx = xScale(row.label, { position: "middle" }) ?? xScale(row.label);
  if (cx == null && plot && chartLen > 0) {
    cx = plot.x + ((index + 0.5) / chartLen) * plot.width;
  }
  return cx != null && Number.isFinite(cx) ? cx : null;
}

function buildPlanLabelCandidates(chartData: CashflowChartRow[], opts?: { minRub?: number; relaxBand?: boolean }): LabelCandidate[] {
  const n = chartData.length;
  if (n === 0) return [];
  const plans = chartData.map((d) => d.plan);
  const last = n - 1;
  const peakAt = plans.map((_, i) => isLocalPeakSparse(plans, i));
  const out: LabelCandidate[] = [];
  const seen = new Set<string>();
  const minRub = opts?.minRub ?? CHART_LABEL_MIN_RUB;

  for (let i = 0; i < n; i++) {
    const v = plans[i];
    if (v == null || !Number.isFinite(v) || v < minRub) continue;

    const peak = peakAt[i]!;
    const endpoint = i === 0 || i === last;
    const meetsBand = opts?.relaxBand ? true : v >= CHART_PLAN_BAND_THRESHOLD_RUB;
    if (!(meetsBand || peak || endpoint)) continue;

    const key = `p-${i}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let priority = v;
    if (meetsBand) priority += 3e9;
    if (endpoint) priority += 2e9;
    if (peak) priority += 1e9;

    out.push({ series: "plan", index: i, valueRub: v, priority });
  }
  return out;
}

function approxLabelWidthPx(text: string, fontPx: number): number {
  return Math.max(fontPx * 2, text.length * fontPx * 0.58);
}

const LABEL_COLLISION_PAD_X = 6;
const LABEL_COLLISION_PAD_Y = 5;

type LabelBBox = { left: number; top: number; right: number; bottom: number };

function labelBBoxCenteredPill(cx: number, cy: number, w: number, h: number): LabelBBox {
  const halfW = w / 2;
  const halfH = h / 2;
  return {
    left: cx - halfW - LABEL_COLLISION_PAD_X,
    top: cy - halfH - LABEL_COLLISION_PAD_Y,
    right: cx + halfW + LABEL_COLLISION_PAD_X,
    bottom: cy + halfH + LABEL_COLLISION_PAD_Y,
  };
}

function bboxesOverlap(a: LabelBBox, b: LabelBBox): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

/** Ступенчатые смещения (dx, dy): сначала без сдвига, затем «лесенка» по вертикали и горизонтали. */
const LABEL_STAGGER_TRIES: ReadonlyArray<{ dx: number; dy: number }> = (() => {
  const dys = [0, 12, 24, 36, 48, 8, 18, 30, 42, 16, 28, 40, 20, 32, 44, 52, 10, 22, 34];
  const dxs = [0, 14, -14, 22, -22, 30, -30, 8, -8, 18, -18, 26, -26];
  const t: { dx: number; dy: number }[] = [];
  for (const dy of dys) {
    for (const dx of dxs) {
      t.push({ dx, dy });
    }
  }
  return t;
})();

function labelOverlapsAny(box: LabelBBox, boxes: readonly LabelBBox[]): boolean {
  for (const b of boxes) {
    if (bboxesOverlap(box, b)) return true;
  }
  return false;
}

export function CashflowTooltip({
  active,
  payload,
  darkChrome,
  mplPremium,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: CashflowChartRow }>;
  darkChrome: boolean;
  mplPremium: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CashflowChartRow | undefined;
  if (!row) return null;
  const base = darkChrome
    ? "border-slate-500/40 bg-[#0b1220]/92 text-slate-100 backdrop-blur-md"
    : mplPremium
      ? "border-black/[0.05] bg-white/92 text-mpl-text shadow-[0_10px_28px_rgba(15,23,42,0.1)] backdrop-blur-md"
      : "border-slate-200/80 bg-white/95 text-slate-900 shadow-[0_10px_28px_rgba(15,23,42,0.08)] backdrop-blur-sm";
  return (
    <div className={`rounded-xl px-3.5 py-2.5 text-xs ring-1 ring-black/[0.04] ${base}`}>
      <div className={`font-semibold ${darkChrome ? "text-slate-200" : "text-slate-900"}`}>{row.label}</div>
      <div className={`mt-1.5 text-[12px] font-medium leading-snug tabular-nums ${darkChrome ? "text-slate-200" : "text-slate-800"}`}>
        <span style={{ color: CASHFLOW_INFLOW_PLAN.label }}>
          План: {row.plan != null ? formatCashflowTooltipRub(row.plan) : "—"}
        </span>
        {row.fact != null ? (
          <>
            <span className={darkChrome ? "text-slate-500" : "text-slate-400"}> / </span>
            <span className="text-[#1d4ed8]">Факт: {formatCashflowTooltipRub(row.fact)}</span>
          </>
        ) : null}
      </div>
      {row.fact != null && row.deviation != null ? (
        <div
          className={`mt-2 flex justify-between gap-4 border-t pt-1.5 tabular-nums ${darkChrome ? "border-slate-600/40" : mplPremium ? "border-black/[0.06]" : "border-slate-200/70"}`}
        >
          <span className={darkChrome ? "text-slate-400" : "text-mpl-muted"}>Отклонение</span>
          <span className={row.deviation >= 0 ? "text-emerald-400" : "text-rose-400"}>{formatCashflowTooltipRub(row.deviation)}</span>
        </div>
      ) : null}
    </div>
  );
}

function pillHorizontalOverlap(aL: number, aR: number, bL: number, bR: number, gap: number): boolean {
  return !(aR + gap < bL || aL - gap > bR);
}

/** Подписи Fact/Plan: единый ручной SVG-overlay (помесячно и нарастающим итогом). */
export function CashflowDynamicsSvgLabels({
  chartData,
  presDark,
  mode,
  presentation: _presentation,
  planFactExecutionLabels = false,
  yGridTickValues = [],
}: {
  chartData: CashflowChartRow[];
  presDark: boolean;
  mode: CashflowChartMode;
  presentation: boolean;
  planFactExecutionLabels?: boolean;
  yGridTickValues?: readonly number[];
}) {
  return (
    <CashflowPointLabelsOverlay
      chartData={chartData}
      presDark={presDark}
      mode={mode}
      yGridTickValues={yGridTickValues}
      planFactExecutionLabels={planFactExecutionLabels}
    />
  );
}

type Props = {
  rows: CashflowSeriesRow[];
  planScale: number;
  presentation: boolean;
  /** Зарезервировано для совместимости; под заголовком не отображается. */
  planSourceNote?: string;
  /** Граница включительно для отображения **плана** (YYYY-MM); `null` — текущий месяц. На факт не влияет. */
  factThroughPeriodKey?: string | null;
  /** Предупреждение, если факт поступлений из CSV не выделен (нет колонок притока). */
  factUnavailableMessage?: string | null;
  zaydetMonthVerify?: MarketingPaymentZaydetMonthVerifyRow[] | null;
  showZaydetCsvDebugTable?: boolean;
};

const explainKicker = "text-[10px] font-semibold uppercase tracking-wide text-slate-600";

/** Блок «Источники и формулы» — только рабочий режим: светлая аналитика в духе KPI / сделок. */
function CashflowDynamicsWorkModeCalculationExplain() {
  const formulaCard =
    "rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]";

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-100/90 via-white to-sky-50/45 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-semibold tracking-tight text-slate-900">Источники данных и формулы</h4>
        <span className="inline-flex shrink-0 items-center rounded-md border border-amber-200/90 bg-amber-50/95 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
          CRM: не подключена
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <span className="inline-flex rounded-md border border-amber-200/80 bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            План
          </span>
          <ul className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-slate-700">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400/90" aria-hidden />
              <span>
                Помесячные суммы по <span className="font-medium text-slate-900">графику платежей</span> (платёжный
                календарь).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400/90" aria-hidden />
              <span>
                Источник: отдельный <span className="font-medium text-slate-900">CSV графика платежей</span> (платёжный
                календарь), без файла факта поступлений.
              </span>
            </li>
          </ul>
        </div>
        <div className="min-w-0 rounded-xl border border-sky-200/70 bg-gradient-to-br from-sky-50/90 via-white to-blue-50/50 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <span className="inline-flex rounded-md border border-sky-200/80 bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900">
            Факт
          </span>
          <ul className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-slate-700">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sky-400/90" aria-hidden />
              <span>
                Источник: отдельный <span className="font-medium text-slate-900">CSV факта поступлений</span> (отчёт о
                притоке), не смешивается с CSV плана.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sky-400/90" aria-hidden />
              <span>
                <span className="font-medium text-slate-900">Помесячный факт</span> — колонки «зайдет …» с месяцем и годом
                в заголовке; значение месяца — из <span className="font-medium text-slate-900">нижней строки итогов</span>{" "}
                (итого/всего), без суммирования строк сделок и без колонок «План …».
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sky-400/90" aria-hidden />
              <span>
                Если в файле факта нет колонок «зайдет …» с месяцем и годом (или нет строки итогов), линия факта не
                строится.
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200/80 bg-white/70 p-3 sm:p-3.5">
        <h5 className={explainKicker}>Формулы</h5>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className={formulaCard}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Помесячный план</div>
            <p className="mt-1 text-[12px] font-medium leading-snug tracking-tight text-slate-900 tabular-nums">
              Plan_month = Σ payments in month
            </p>
          </div>
          <div className={formulaCard}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Помесячный факт</div>
            <p className="mt-1 text-[12px] font-medium leading-snug tracking-tight text-slate-900 tabular-nums">
              Fact_month = ячейка итогов по колонке «зайдет» за месяц
            </p>
          </div>
          <div className={formulaCard}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Нарастающий план</div>
            <p className="mt-1 text-[12px] font-medium leading-snug tracking-tight text-slate-900 tabular-nums">
              Plan_cum(n) = Σ Plan_i
            </p>
          </div>
          <div className={formulaCard}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Нарастающий факт</div>
            <p className="mt-1 text-[12px] font-medium leading-snug tracking-tight text-slate-900 tabular-nums">
              Fact_cum(n) = Σ Fact_i
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/70 p-3 sm:p-3.5">
        <h5 className={explainKicker}>Почему линии обрываются по-разному</h5>
        <ul className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-slate-700">
          <li className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
              <span>
                <span className="font-semibold text-slate-900">Факт</span> строится по колонкам с «зайдет» в
                заголовке; на графике отображается на весь горизонт загруженных данных (при пропусках месяцев —
                последнее известное помесячное значение).
              </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
            <span>
              <span className="font-semibold text-slate-900">План</span> в CSV задан на весь горизонт платежей, но на
              графике оранжевая линия рисуется только до отчётного месяца включительно; будущий план скрыт (без
              прогнозной части на оси).
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function SalesPlanCashflowDynamicsChart({
  rows,
  planScale,
  presentation,
  planSourceNote: _planSourceNote,
  factThroughPeriodKey,
  factUnavailableMessage,
  zaydetMonthVerify,
  showZaydetCsvDebugTable,
}: Props) {
  const [mode, setMode] = useState<CashflowChartMode>("monthly");
  const mplPremium = useMarketingPresentationLight();
  const presDark = useMarketingPresVisual(presentation) === "presDark";

  const chartData = useMemo(
    () => cashflowRowsForChart(rows, mode, planScale, { factThroughPeriodKey: factThroughPeriodKey ?? null }),
    [rows, mode, planScale, factThroughPeriodKey],
  );

  const { yDomainMax, yTicks } = useMemo(() => {
    const vals = chartData.flatMap((d) => [d.plan, d.fact].filter((x): x is number => x != null));
    const { domainMax, ticks } = cashflowYAxisScale(vals, { tickStep25Mln: true });
    return { yDomainMax: domainMax, yTicks: ticks };
  }, [chartData]);

  const monthXTick = useMemo(
    () =>
      createMarketingDealsStyleMonthTickRenderer({
        presDark,
        tickCount: Math.max(1, chartData.length),
        translateYPx: 6,
        tickFill: presDark ? "#cbd5e1" : "#374151",
        labelRotateDeg: 0,
      }),
    [presDark, chartData.length],
  );

  const cashflowMonthXAxis = useMemo(
    () => ({
      ...MARKETING_DEALS_STYLE_MONTH_X_AXIS,
      height: 34,
      tickMargin: 6,
      tick: monthXTick,
    }),
    [monthXTick],
  );

  const segmentSurface = presDark ? "dark" : mplPremium && presentation ? "premium" : "light";

  if (chartData.length === 0) {
    return (
      <div
        className={
          presDark
            ? "rounded-xl border border-slate-600/45 bg-[#1e293b]/80 p-4 text-sm text-slate-400"
            : mplPremium && presentation
              ? `${MPL_PREMIUM_CHART_SHELL} p-4 text-sm text-mpl-muted`
              : presentation
                ? "rounded-xl border border-mpl-border bg-mpl-card p-4 text-sm text-mpl-muted"
                : "rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"
        }
      >
        Нет данных поступлений по месяцам для графика.
      </div>
    );
  }

  const gridStroke = presDark ? "rgba(148,163,184,0.22)" : "#E5E7EB";
  const axisColor = presDark ? "#94a3b8" : "#475569";

  return (
    <div
      className={
        presDark
          ? "mb-7 overflow-visible rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5"
          : mplPremium && presentation
            ? `mb-7 overflow-visible p-4 sm:p-5 ${MPL_PREMIUM_CHART_SHELL}`
            : presentation
              ? "mb-7 overflow-visible rounded-2xl border border-mpl-border bg-mpl-chart p-4 shadow-sm sm:p-5"
              : "mb-7 overflow-visible rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      }
    >
      <div className="mb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3
            className={`text-sm font-semibold leading-tight ${presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900"}`}
          >
            Динамика поступлений
          </h3>
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setMode("monthly")}
              className={segmentedControlTabClass(mode === "monthly", segmentSurface)}
            >
              Помесячно
            </button>
            <button
              type="button"
              onClick={() => setMode("cumulative")}
              className={segmentedControlTabClass(mode === "cumulative", segmentSurface)}
            >
              Нарастающим итогом
            </button>
          </div>
        </div>
        <CashflowInflowChartLegendToolbar chrome={{ presDark, presentation }} className="mt-2" />
      </div>

      {factUnavailableMessage ? (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-[11px] font-medium leading-snug ${
            presDark
              ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
              : "border-amber-300 bg-amber-50 text-amber-950"
          }`}
          role="status"
        >
          {factUnavailableMessage}
        </div>
      ) : null}

      {showZaydetCsvDebugTable && zaydetMonthVerify && zaydetMonthVerify.length > 0 ? (
        <div
          className={`mb-3 overflow-x-auto rounded-lg border text-left ${
            presDark ? "border-slate-600/60 bg-slate-900/40" : "border-slate-200 bg-slate-50/90"
          }`}
        >
          <div
            className={`border-b px-3 py-2 text-[11px] font-semibold ${
              presDark ? "border-slate-600/50 text-slate-200" : "border-slate-200 text-slate-800"
            }`}
          >
            Сверка по месяцам (колонки «зайдет»): значения из нижней строки итогов в CSV; Parsed Cell Count = 1 на месяц (при дублях колонок в графике — левая колонка периода), ₽
          </div>
          <table className="min-w-full text-[11px]">
            <thead>
              <tr className={presDark ? "bg-slate-800/50 text-slate-300" : "bg-white text-slate-600"}>
                <th className="px-3 py-2 text-left font-semibold">Month</th>
                <th className="px-3 py-2 text-right font-semibold">Parsed Cell Count</th>
                <th className="px-3 py-2 text-right font-semibold">Total Sum</th>
                <th className="px-3 py-2 text-center font-semibold">OK</th>
              </tr>
            </thead>
            <tbody>
              {zaydetMonthVerify.map((row) => {
                const match = Math.abs(row.rawCsvSum - row.displayedValue) < 0.01;
                const fmt = (n: number) =>
                  n.toLocaleString("ru-RU", { useGrouping: true, minimumFractionDigits: 0, maximumFractionDigits: 6 });
                const cellCount = row.parsedCellCount ?? 0;
                return (
                  <tr
                    key={row.month}
                    className={
                      presDark ? "border-t border-slate-600/40 text-slate-200" : "border-t border-slate-200 text-slate-800"
                    }
                  >
                    <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-[10px] tabular-nums">
                      {row.month}
                      <span className={`ml-1.5 font-sans ${presDark ? "text-slate-400" : "text-slate-500"}`}>
                        ({periodKeyToRuChartLabel(row.month)})
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums">{cellCount}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums">{fmt(row.rawCsvSum)}</td>
                    <td className="px-3 py-2 text-center align-top font-semibold">
                      {match ? (
                        <span className={presDark ? "text-emerald-400" : "text-emerald-700"}>✓</span>
                      ) : (
                        <span className={presDark ? "text-rose-400" : "text-rose-600"}>≠</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="min-w-0 overflow-visible overflow-x-visible overflow-y-visible pt-1 pb-3">
        <div className="h-[320px] min-h-[320px] w-full overflow-visible [&_svg]:overflow-visible">
          <ResponsiveContainer
            width="100%"
            height="100%"
            className="!overflow-visible [&_svg]:overflow-visible"
            style={{ overflow: "visible" }}
          >
            <LineChart
              data={chartData}
              margin={{
                top: presDark ? 16 : CHART_MARGIN_TOP_LIGHT_LABELS,
                right: 18,
                left: CHART_MARGIN_LEFT_PX,
                bottom: CHART_MARGIN_BOTTOM,
              }}
            >
            <CartesianGrid
              strokeDasharray="4 4"
              stroke={gridStroke}
              vertical={false}
              horizontalValues={yTicks}
            />
            <XAxis dataKey="label" type="category" {...cashflowMonthXAxis} />
            <YAxis
              domain={[0, yDomainMax]}
              ticks={yTicks}
              tick={{ fill: axisColor, fontSize: 10, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCashflowYAxisMlnRub(Number(v))}
              width={88}
              allowDataOverflow
            />
            <Tooltip
              content={<CashflowTooltip darkChrome={presDark} mplPremium={mplPremium && presentation} />}
              cursor={{ stroke: presDark ? "rgba(148,163,184,0.28)" : "rgba(100,116,139,0.22)" }}
            />
            <Line type="monotone" dataKey="plan" name="План" {...cashflowInflowPlanLineProps(presDark)} />
            <Line type="monotone" dataKey="fact" name="Факт" {...cashflowInflowFactLineProps(presDark)} />
            <CashflowDynamicsSvgLabels
              chartData={chartData}
              presDark={presDark}
              mode={mode}
              presentation={presentation}
              yGridTickValues={yTicks}
            />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {!presentation ? <CashflowDynamicsWorkModeCalculationExplain /> : null}
    </div>
  );
}
