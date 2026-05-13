"use client";

import { useId, useMemo, useState } from "react";
import { useChartHeight, useChartWidth, usePlotArea, useXAxisScale, useYAxisScale } from "recharts";

import {
  cashflowRowsForChart,
  periodKeyToRuChartLabel,
  type CashflowChartMode,
  type CashflowChartRow,
  type CashflowSeriesRow,
} from "@/lib/buildCashflowSeries";
import {
  cashflowYAxisScale,
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
import { cashflowInflowFactLineProps, cashflowInflowPlanLineProps } from "@/lib/cashflowInflowChartSeries";
import { CashflowInflowChartLegendToolbar } from "@/components/marketing/CashflowInflowChartLegend";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Постоянная подпись у точки только от 1 млн ₽; &lt; 1 млн — только тултип. */
const CHART_LABEL_MIN_RUB = 1_000_000;
/** Факт: выделение крупных значений (подпись у точки). */
const CHART_LABEL_ALWAYS_SHOW_RUB = 5_000_000;
/** План: нижняя полоса — значения ≥ 3 млн, пики, первый и последний месяц (≥ 1 млн). */
const CHART_PLAN_BAND_THRESHOLD_RUB = 3_000_000;
const CHART_MARGIN_TOP_LIGHT_LABELS = 40;
/** Нижний отступ SVG: полоса таблеток плана ниже области графика + подписи месяцев оси X. */
const CHART_MARGIN_BOTTOM = 82;
/** Запас над зоной тиков оси X (px), включая мобильные переносы. */
const X_AXIS_LABEL_BAND_RESERVE = 44;
/** Факт: зазор от точки до нижнего края таблетки + направляющая. */
const LABEL_OFFSET_FACT_ABOVE = 10;
const LABEL_FACT_DX = 10;
/** Если маркер близко к нулю (низ графика), поднимаем подпись факта. */
const NEAR_X_AXIS_PX = 72;
const NEAR_AXIS_LIFT_MAX = 28;

/** Общие размеры таблеток (факт / план) — единый BI-стиль. */
const BADGE_FONT_PX = 11;
const BADGE_H_PX = 22;
const BADGE_PAD_X = 9;
const BADGE_RX = 7;
/** Полоса плана: таблетки визуально ниже области графика. */
const PLAN_BAND_DROP_BELOW_PLOT_PX = 28;
const PLAN_BAND_ROW0_GAP_AFTER_PLOT_PX = 14;
const PLAN_BAND_INTER_ROW_GAP_PX = 12;
/** Подписи плана не ближе к нижнему краю SVG (зона месяцев оси X). */
const PLAN_BAND_CLEAR_ABOVE_CHART_BOTTOM = 26;
const CONNECTOR_GAP_TO_BADGE_PX = 4;

/** Согласовано с margin.left + YAxis.width в LineChart — таблетки не заезжают на подписи оси Y. */
const CHART_MARGIN_LEFT_PX = 10;
const CHART_Y_AXIS_WIDTH_PX = 88;
/** Зазор таблетки от границы области построения (сетка, подписи тиков). */
const BADGE_CLEAR_FROM_PLOT_EDGE_PX = 8;
const BADGE_CLEAR_FROM_CHART_TOP_PX = 10;
const BADGE_CLEAR_FROM_CHART_RIGHT_PX = 10;

type PlotRect = { x: number; y: number; width: number; height: number };

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

/** Направляющая от точки (pointCx) к таблетке; при сдвиге по X — ломаная (BI-стиль). */
function buildFactConnectorSegments(
  pointCx: number,
  pillCx: number,
  yFactPt: number,
  endY: number,
): ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number }> {
  if (Math.abs(pillCx - pointCx) < 1.5) {
    const y1 = Math.min(yFactPt, endY);
    const y2 = Math.max(yFactPt, endY);
    return [{ x1: pointCx, y1, x2: pointCx, y2 }];
  }
  const lo = Math.min(yFactPt, endY);
  const hi = Math.max(yFactPt, endY);
  const yJ = lo + (hi - lo) * 0.38;
  return [
    { x1: pointCx, y1: yFactPt, x2: pointCx, y2: yJ },
    { x1: pointCx, y1: yJ, x2: pillCx, y2: yJ },
    { x1: pillCx, y1: yJ, x2: pillCx, y2: endY },
  ];
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

/** Пик/впадина для плана (плотный ряд чисел). */
function isLocalPeakDense(arr: number[], i: number): boolean {
  const v = arr[i];
  if (!Number.isFinite(v)) return false;
  const n = arr.length;
  const lv = i > 0 ? arr[i - 1]! : Number.NEGATIVE_INFINITY;
  const rv = i < n - 1 ? arr[i + 1]! : Number.NEGATIVE_INFINITY;
  if (i === 0) return v > rv;
  if (i === n - 1) return v > lv;
  return v > lv && v > rv;
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

function buildFactLabelCandidates(chartData: CashflowChartRow[]): LabelCandidate[] {
  const n = chartData.length;
  if (n === 0) return [];
  const facts = chartData.map((d) => d.fact);
  const firstF = firstDefinedFactIndex(facts);
  const lastF = lastDefinedFactIndex(facts);
  const peakAt = facts.map((_, i) => isLocalPeakSparse(facts, i));
  const peakBefore = buildPeakBefore(peakAt);
  const out: LabelCandidate[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < n; i++) {
    const v = facts[i];
    if (v == null || !Number.isFinite(v) || v < CHART_LABEL_MIN_RUB) continue;

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

function buildPlanLabelCandidates(chartData: CashflowChartRow[]): LabelCandidate[] {
  const n = chartData.length;
  if (n === 0) return [];
  const plans = chartData.map((d) => d.plan);
  const last = n - 1;
  const peakAt = plans.map((_, i) => isLocalPeakDense(plans, i));
  const out: LabelCandidate[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < n; i++) {
    const v = plans[i]!;
    if (!Number.isFinite(v) || v < CHART_LABEL_MIN_RUB) continue;

    const peak = peakAt[i]!;
    const endpoint = i === 0 || i === last;
    const meetsBand = v >= CHART_PLAN_BAND_THRESHOLD_RUB;
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

const LABEL_COLLISION_PAD_X = 4;
const LABEL_COLLISION_PAD_Y = 3;

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

function CashflowTooltip({
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
    ? "border-slate-500/45 bg-[#0b1220]/95 text-slate-100"
    : mplPremium
      ? "border-black/[0.04] bg-white/90 text-mpl-text backdrop-blur-md"
      : "border-mpl-border bg-mpl-card text-mpl-text";
  return (
    <div className={`rounded-lg px-3 py-2 text-xs shadow-lg ring-1 ${base}`}>
      <div className={`font-semibold ${darkChrome ? "text-slate-200" : "text-mpl-text"}`}>{row.label}</div>
      <div className={`mt-1.5 text-[12px] font-medium leading-snug tabular-nums ${darkChrome ? "text-slate-200" : "text-mpl-text"}`}>
        {row.fact != null ? (
          <>
            <span className="text-[#1e40af]">Факт: {formatCashflowTooltipRub(row.fact)}</span>
            <span className={darkChrome ? "text-slate-500" : "text-mpl-muted"}> / </span>
            <span className="text-orange-500">План: {formatCashflowTooltipRub(row.plan)}</span>
          </>
        ) : (
          <span className="text-orange-500">План: {formatCashflowTooltipRub(row.plan)}</span>
        )}
      </div>
      {row.fact != null && row.deviation != null ? (
        <div
          className={`mt-2 flex justify-between gap-4 border-t pt-1.5 tabular-nums ${darkChrome ? "border-slate-600/40" : mplPremium ? "border-black/[0.06]" : "border-mpl-border"}`}
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

/**
 * Подписи в координатах SVG (Recharts 3): факт и план — таблетки с направляющими, BI-стиль.
 */
function CashflowDynamicsSvgLabels({
  chartData,
  presDark,
}: {
  chartData: CashflowChartRow[];
  presDark: boolean;
}) {
  const shadowFilterId = `cf-badge-sh-${useId().replace(/:/g, "")}`;
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const chartW = useChartWidth();
  const chartH = useChartHeight();
  const plot = usePlotArea();

  const planGuideStroke = "#ea580c";
  const factGuideStroke = presDark ? "rgba(96,165,250,0.75)" : "rgba(37,99,235,0.55)";

  const planPillFill = "#ffffff";
  const planPillStroke = presDark ? "rgba(234,88,12,0.62)" : "rgba(234,88,12,0.48)";
  const planPillText = presDark ? "#7c2d12" : "#9a3412";

  const factPillFill = "#ffffff";
  const factPillStroke = presDark ? "rgba(59,130,246,0.88)" : "rgba(37,99,235,0.72)";
  const factPillText = "#1d4ed8";

  const factCandidates = useMemo(() => buildFactLabelCandidates(chartData), [chartData]);
  const planCandidates = useMemo(() => buildPlanLabelCandidates(chartData), [chartData]);

  type Conn = {
    key: string;
    stroke: string;
    segs: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number }>;
  };
  type Pill = {
    key: string;
    cx: number;
    cy: number;
    pillW: number;
    pillH: number;
    text: string;
    fill: string;
    stroke: string;
    textFill: string;
  };

  const factLayer = useMemo((): { connectors: Conn[]; pills: Pill[] } => {
    if (!xScale || !yScale || chartW == null || chartH == null || chartW <= 0 || chartH <= 0) {
      return { connectors: [], pills: [] };
    }

    const { safeLeft, safeRight, safeTop, plotBottomY } = chartBadgeSafeBounds(plot, chartW, chartH);
    const labelBandTop = plotBottomY - X_AXIS_LABEL_BAND_RESERVE;
    const pillH = BADGE_H_PX;

    function proximityLiftFromAxis(yPt: number): number {
      const dist = plotBottomY - yPt;
      if (dist >= NEAR_X_AXIS_PX) return 0;
      return NEAR_AXIS_LIFT_MAX * (1 - Math.max(0, dist) / NEAR_X_AXIS_PX);
    }

    type Resolved = {
      key: string;
      priority: number;
      pointCx: number;
      pillCx: number;
      pillCy: number;
      text: string;
      pillW: number;
      yFactPt: number;
      box: LabelBBox;
    };

    const sorted = [...factCandidates].sort((a, b) => {
      if (b.valueRub !== a.valueRub) return b.valueRub - a.valueRub;
      return b.priority - a.priority;
    });
    const keptBoxes: LabelBBox[] = [];
    const resolved: Resolved[] = [];

    for (const c of sorted) {
      const row = chartData[c.index]!;
      const n = chartData.length;
      let cx = xScale(row.label, { position: "middle" }) ?? xScale(row.label);
      if (cx == null && plot && n > 0) {
        cx = plot.x + ((c.index + 0.5) / n) * plot.width;
      }
      if (cx == null) continue;
      const yFactPt = row.fact != null ? yScale(row.fact) : null;
      if (row.fact == null || yFactPt == null) continue;

      const liftF = proximityLiftFromAxis(yFactPt);
      const chartLabelText = formatCashflowMillionsLabel(c.valueRub, false);
      const pillW = approxLabelWidthPx(chartLabelText, BADGE_FONT_PX) + 2 * BADGE_PAD_X;
      const halfW = pillW / 2;
      const halfH = pillH / 2;
      const factPillCenterYMax = labelBandTop - CONNECTOR_GAP_TO_BADGE_PX - halfH;
      const minCenterX = safeLeft + halfW;
      const maxCenterX = safeRight - halfW;
      let anchorX = cx - LABEL_FACT_DX;
      anchorX = clamp(anchorX, minCenterX, maxCenterX);

      let best: Resolved | null = null;
      for (let ti = 0; ti < LABEL_STAGGER_TRIES.length; ti++) {
        const { dx, dy } = LABEL_STAGGER_TRIES[ti]!;
        const pillCx = clamp(anchorX + dx, minCenterX, maxCenterX);
        const pillCy = clamp(
          yFactPt - LABEL_OFFSET_FACT_ABOVE - liftF - halfH - dy,
          safeTop + halfH,
          factPillCenterYMax,
        );
        const box = labelBBoxCenteredPill(pillCx, pillCy, pillW, pillH);
        const candidate: Resolved = {
          key: `fact-${row.periodKey}-${c.index}`,
          priority: c.priority,
          pointCx: cx,
          pillCx,
          pillCy,
          text: chartLabelText,
          pillW,
          yFactPt,
          box,
        };
        if (!labelOverlapsAny(box, keptBoxes)) {
          best = candidate;
          break;
        }
        best = candidate;
      }

      if (best && !labelOverlapsAny(best.box, keptBoxes)) {
        keptBoxes.push(best.box);
        resolved.push(best);
      }
    }

    const pills: Pill[] = resolved.map((r) => ({
      key: r.key,
      cx: r.pillCx,
      cy: r.pillCy,
      pillW: r.pillW,
      pillH,
      text: r.text,
      fill: factPillFill,
      stroke: factPillStroke,
      textFill: factPillText,
    }));

    const connectors: Conn[] = resolved.map((r) => {
      const pillBottom = r.pillCy + pillH / 2;
      const endY = pillBottom - CONNECTOR_GAP_TO_BADGE_PX;
      const segs = buildFactConnectorSegments(r.pointCx, r.pillCx, r.yFactPt, endY);
      return {
        key: `${r.key}-conn`,
        stroke: factGuideStroke,
        segs,
      };
    });

    return { connectors, pills };
  }, [chartData, factCandidates, xScale, yScale, chartW, chartH, plot, presDark]);

  const planBand = useMemo((): { connectors: Conn[]; pills: Pill[] } => {
    if (!xScale || !yScale || chartW == null || chartH == null || chartW <= 0 || chartH <= 0 || planCandidates.length === 0) {
      return { connectors: [], pills: [] };
    }

    const { safeLeft, safeRight, plotBottomY } = chartBadgeSafeBounds(plot, chartW, chartH);
    const maxPillCenterY = chartH - PLAN_BAND_CLEAR_ABOVE_CHART_BOTTOM - BADGE_H_PX / 2;
    let row0Center =
      plotBottomY +
      PLAN_BAND_DROP_BELOW_PLOT_PX +
      PLAN_BAND_ROW0_GAP_AFTER_PLOT_PX +
      BADGE_H_PX / 2;
    let row1Center = row0Center + BADGE_H_PX + PLAN_BAND_INTER_ROW_GAP_PX;
    if (row1Center > maxPillCenterY) {
      row1Center = maxPillCenterY;
      row0Center = Math.max(
        plotBottomY + BADGE_H_PX / 2 + 6,
        row1Center - BADGE_H_PX - PLAN_BAND_INTER_ROW_GAP_PX,
      );
    }
    const rowCenters: [number, number] = [row0Center, row1Center];

    type Raw = { key: string; index: number; cx: number; yLine: number; text: string; pillW: number };
    const raws: Raw[] = [];
    const n = chartData.length;

    for (const c of planCandidates) {
      const row = chartData[c.index]!;
      let cx = xScale(row.label, { position: "middle" }) ?? xScale(row.label);
      if (cx == null && plot && n > 0) {
        cx = plot.x + ((c.index + 0.5) / n) * plot.width;
      }
      if (cx == null) continue;
      const yLine = yScale(row.plan);
      if (yLine == null) continue;
      const text = formatCashflowMillionsLabel(c.valueRub, false);
      const tw = approxLabelWidthPx(text, BADGE_FONT_PX);
      const pillW = tw + 2 * BADGE_PAD_X;
      raws.push({
        key: `plan-${row.periodKey}-${c.index}`,
        index: c.index,
        cx,
        yLine,
        text,
        pillW,
      });
    }
    raws.sort((a, b) => a.index - b.index);

    type Occ = { left: number; right: number; row: 0 | 1 };
    const occ: Occ[] = [];
    type PlanPillPlaced = Pill & { yLine: number };
    const pillsInternal: PlanPillPlaced[] = [];
    const gap = 6;

    const nudges = [0, 14, -14, 22, -22, 8, -8, 18, -18, 28, -28, 4, -4, 12, -12, 20, -20];

    for (const r of raws) {
      const halfW = r.pillW / 2;
      let placed: { cx: number; cy: number; row: 0 | 1 } | null = null;

      nudgeLoop: for (const nudge of nudges) {
        let cx = r.cx + nudge;
        let left = cx - halfW;
        let right = cx + halfW;
        if (left < safeLeft) {
          cx = safeLeft + halfW;
          left = cx - halfW;
          right = cx + halfW;
        }
        if (right > safeRight) {
          cx = safeRight - halfW;
          left = cx - halfW;
          right = cx + halfW;
        }

        const overlapsOn = (which: 0 | 1) =>
          occ.some((o) => o.row === which && pillHorizontalOverlap(left, right, o.left, o.right, gap));
        const row0Free = !overlapsOn(0);
        const row1Free = !overlapsOn(1);
        const row: 0 | 1 | null = row0Free ? 0 : row1Free ? 1 : null;
        if (row === null) continue nudgeLoop;

        placed = { cx, cy: rowCenters[row], row };
        break nudgeLoop;
      }

      if (!placed) continue;

      const { cx, cy, row } = placed;
      occ.push({ left: cx - halfW, right: cx + halfW, row });
      pillsInternal.push({
        key: r.key,
        cx,
        cy,
        pillW: r.pillW,
        pillH: BADGE_H_PX,
        text: r.text,
        fill: planPillFill,
        stroke: planPillStroke,
        textFill: planPillText,
        yLine: r.yLine,
      });
    }

    const connectors: Conn[] = pillsInternal.map((p) => {
      const pillTop = p.cy - p.pillH / 2;
      const endY = pillTop - CONNECTOR_GAP_TO_BADGE_PX;
      const y1 = Math.min(p.yLine, endY);
      const y2 = Math.max(p.yLine, endY);
      return {
        key: `${p.key}-conn`,
        stroke: planGuideStroke,
        segs: [{ x1: p.cx, y1, x2: p.cx, y2 }],
      };
    });

    const pills: Pill[] = pillsInternal.map(({ yLine: _y, ...rest }) => rest);

    return { connectors, pills };
  }, [chartData, planCandidates, xScale, yScale, chartW, chartH, plot, presDark]);

  if (!xScale || !yScale || chartW == null || chartH == null || chartW <= 0 || chartH <= 0) {
    return null;
  }

  const renderPill = (p: Pill) => (
    <g key={p.key} transform={`translate(${p.cx - p.pillW / 2},${p.cy - p.pillH / 2})`} filter={`url(#${shadowFilterId})`}>
      <rect
        width={p.pillW}
        height={p.pillH}
        rx={BADGE_RX}
        ry={BADGE_RX}
        fill={p.fill}
        stroke={p.stroke}
        strokeWidth={1}
      />
      <text
        x={p.pillW / 2}
        y={p.pillH / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={p.textFill}
        fontSize={BADGE_FONT_PX}
        fontWeight={600}
        className="tabular-nums"
      >
        {p.text}
      </text>
    </g>
  );

  const allConnectors = [...planBand.connectors, ...factLayer.connectors];

  return (
    <g pointerEvents="none">
      <defs>
        <filter id={shadowFilterId} x="-35%" y="-35%" width="170%" height="170%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="1" stdDeviation="1.25" floodColor="#0f172a" floodOpacity="0.1" />
        </filter>
      </defs>
      {allConnectors.flatMap((c) =>
        c.segs.map((s, i) => (
          <line
            key={`${c.key}-${i}`}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={c.stroke}
            strokeWidth={1}
            strokeDasharray="2 4"
            opacity={0.55}
          />
        )),
      )}
      {factLayer.pills.map(renderPill)}
      {planBand.pills.map(renderPill)}
    </g>
  );
}

type Props = {
  rows: CashflowSeriesRow[];
  planScale: number;
  presentation: boolean;
  /** Зарезервировано для совместимости; под заголовком не отображается. */
  planSourceNote?: string;
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
                <span className="font-semibold text-slate-900">Факт</span> строится только по колонкам с «зайдет» в
                заголовке; пропуски по оси X не заполняются из сальдо и других столбцов.
              </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
            <span>
              <span className="font-semibold text-slate-900">План</span> задан графиком платежей на весь горизонт CSV:
              будущие месяцы уже содержат запланированные суммы, поэтому пунктир плана продолжается вперёд по календарю
              графика.
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
  factUnavailableMessage,
  zaydetMonthVerify,
  showZaydetCsvDebugTable,
}: Props) {
  const [mode, setMode] = useState<CashflowChartMode>("monthly");
  const mplPremium = useMarketingPresentationLight();
  const presDark = useMarketingPresVisual(presentation) === "presDark";

  const chartData = useMemo(() => cashflowRowsForChart(rows, mode, planScale), [rows, mode, planScale]);

  const { yDomainMax, yTicks } = useMemo(() => {
    const vals = chartData.flatMap((d) => [d.plan, d.fact].filter((x): x is number => x != null));
    const { domainMax, ticks } = cashflowYAxisScale(vals);
    return { yDomainMax: domainMax, yTicks: ticks };
  }, [chartData]);

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

  const gridStroke = presDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.35)";
  const axisColor = presDark ? "#94a3b8" : "#64748b";

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
      <div className="mb-4">
        <h3
          className={`mb-2 text-sm font-semibold leading-tight ${presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900"}`}
        >
          Динамика поступлений (млн&nbsp;₽)
        </h3>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <CashflowInflowChartLegendToolbar chrome={{ presDark, presentation }} />
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

      <div className="min-w-0 overflow-visible overflow-x-visible overflow-y-visible pt-3 pb-4">
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
                top: presDark ? 30 : CHART_MARGIN_TOP_LIGHT_LABELS,
                right: 12,
                left: CHART_MARGIN_LEFT_PX,
                bottom: CHART_MARGIN_BOTTOM,
              }}
            >
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} axisLine={{ stroke: gridStroke }} tickLine={false} />
            <YAxis
              domain={[0, yDomainMax]}
              ticks={yTicks}
              tick={{ fill: axisColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCashflowYAxisMlnRub(Number(v))}
              width={88}
              allowDataOverflow
            />
            <Tooltip
              content={<CashflowTooltip darkChrome={presDark} mplPremium={mplPremium && presentation} />}
              cursor={{ stroke: presDark ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.35)" }}
            />
            <Line type="monotone" dataKey="fact" name="Факт" {...cashflowInflowFactLineProps(presDark)} />
            <Line type="monotone" dataKey="plan" name="План" {...cashflowInflowPlanLineProps(presDark)} />
            <CashflowDynamicsSvgLabels chartData={chartData} presDark={presDark} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {!presentation ? <CashflowDynamicsWorkModeCalculationExplain /> : null}
    </div>
  );
}
