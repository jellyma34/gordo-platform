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

export type MarketingDealsStyleMonthTickOptions = {
  presDark: boolean;
  /** Число меток (для размера шрифта — как в «Сделках»). */
  tickCount: number;
  /** См. reportingTail в сделках: приглушить отдельные месяцы. */
  isTickMuted?: (index: number) => boolean;
};

/**
 * Кастомный tick: полный контроль SVG — Recharts 3 иначе может оборачивать tick в rotate(-90).
 * Логика совпадает с SegmentMonthBarChart в SalesDealsSegmentMonthStackCharts.
 */
export function createMarketingDealsStyleMonthTickRenderer(
  opts: MarketingDealsStyleMonthTickOptions,
): (props: XAxisTickContentProps) => JSX.Element {
  const axisColor = opts.presDark ? "#94a3b8" : "#a1a7b3";
  const n = opts.tickCount;

  return function MarketingDealsStyleMonthTick(props: XAxisTickContentProps) {
    const { x, y, payload, index } = props;
    const muted = opts.isTickMuted?.(index ?? 0) === true;
    const fill = muted
      ? opts.presDark
        ? "rgba(148,163,184,0.4)"
        : "rgba(148,163,184,0.42)"
      : axisColor;
    const fs = n > 14 ? 8.5 : 9.5;
    const v = payload?.value;
    const label = v == null ? "" : String(v);
    const xf = typeof x === "number" ? x : Number(x);
    const yf = typeof y === "number" ? y : Number(y);
    return (
      <g transform={`translate(${xf},${yf})`}>
        <text
          x={0}
          y={0}
          fill={fill}
          fontSize={fs}
          textAnchor="end"
          dominantBaseline="central"
          transform="rotate(-45)"
        >
          {label}
        </text>
      </g>
    );
  };
}
