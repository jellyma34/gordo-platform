"use client";

import type { XAxisTickContentProps } from "recharts";

/**
 * Единые настройки подписей месяцев по оси X — как в мини-графиках блока «Сделки»
 * ({@link SalesDealsSegmentMonthStackCharts} / SegmentMonthBarChart): диагональный текст,
 * без линии оси X, фиксированная высота полосы тиков.
 */
export const MARKETING_DEALS_STYLE_MONTH_X_AXIS = {
  angle: 0,
  textAnchor: "end" as const,
  tickMargin: 10,
  height: 62,
  interval: 0 as const,
  tickLine: false,
  axisLine: false,
} as const;

/** Подпись месяца с данными (мини-графики «Сделки», светлая тема). */
export const MARKETING_DEALS_MONTH_TICK_ACTIVE_LIGHT = "#1f2937";
/** Подпись месяца без данных (мини-графики «Сделки», светлая тема). */
export const MARKETING_DEALS_MONTH_TICK_MUTED_LIGHT = "#cbd5e1";

export type MarketingDealsStyleMonthTickOptions = {
  presDark: boolean;
  /** Число меток (для размера шрифта — как в «Сделках»). */
  tickCount: number;
  /**
   * Приглушить подпись месяца (нет сделок/выручки в этом месяце для текущего графика).
   * Если не задано — единый цвет оси для всех меток (кэшфлоу и др.).
   */
  isTickMuted?: (index: number) => boolean;
  /** Доп. сдвиг подписи вниз по SVG (px), для отдельных графиков. */
  translateYPx?: number;
  /** Переопределение цвета подписи (если нет isTickMuted). */
  tickFill?: string;
  /** Угол поворота подписи; по умолчанию -45 (сделки), 0 — горизонтально (кэшфлоу). */
  labelRotateDeg?: number;
};

/**
 * Кастомный tick: полный контроль SVG — Recharts 3 иначе может оборачивать tick в rotate(-90).
 * Логика совпадает с SegmentMonthBarChart в SalesDealsSegmentMonthStackCharts.
 */
export function createMarketingDealsStyleMonthTickRenderer(
  opts: MarketingDealsStyleMonthTickOptions,
): (props: XAxisTickContentProps) => JSX.Element {
  const axisColor = opts.presDark ? "#94a3b8" : "#a1a7b3";
  const highlightByData = opts.isTickMuted != null;
  const n = opts.tickCount;

  return function MarketingDealsStyleMonthTick(props: XAxisTickContentProps) {
    const { x, y, payload, index } = props;
    const muted = opts.isTickMuted?.(index ?? 0) === true;
    const fill = highlightByData
      ? muted
        ? opts.presDark
          ? "rgba(148,163,184,0.4)"
          : MARKETING_DEALS_MONTH_TICK_MUTED_LIGHT
        : opts.presDark
          ? "#e2e8f0"
          : MARKETING_DEALS_MONTH_TICK_ACTIVE_LIGHT
      : (opts.tickFill ?? axisColor);
    const fs = n > 14 ? 8.5 : 10;
    const v = payload?.value;
    const label = v == null ? "" : String(v);
    const xf = typeof x === "number" ? x : Number(x);
    const yf = typeof y === "number" ? y : Number(y);
    const dy = opts.translateYPx ?? 0;
    const rot = opts.labelRotateDeg ?? -45;
    const textAnchor = rot === 0 ? "middle" : "end";
    return (
      <g transform={`translate(${xf},${yf + dy})`}>
        <text
          x={0}
          y={0}
          fill={fill}
          fontSize={fs}
          fontWeight={500}
          textAnchor={textAnchor}
          dominantBaseline="central"
          transform={rot === 0 ? undefined : `rotate(${rot})`}
        >
          {label}
        </text>
      </g>
    );
  };
}
