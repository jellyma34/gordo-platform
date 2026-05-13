/**
 * Единый источник стилей серий графика «Динамика поступлений» (факт / план).
 * Используйте в <Line /> и в легенде, чтобы внешний вид не расходился.
 */

export const CASHFLOW_INFLOW_FACT = {
  stroke: "#1e40af",
  strokeWidth: 2.25,
  dotR: 4,
  activeDotR: 5,
} as const;

/** Факт за границей текущего календарного месяца (ожидаемые поступления). */
export const CASHFLOW_INFLOW_FACT_FUTURE = {
  stroke: "#94a3b8",
  strokeWidth: 2,
  dotR: 3.75,
  activeDotR: 5,
  strokeOpacity: 0.9,
} as const;

export const CASHFLOW_INFLOW_PLAN = {
  stroke: "#ea580c",
  strokeWidth: 2,
  strokeDasharray: "6 4",
  dotR: 3.5,
  activeDotR: 4.5,
} as const;

export function cashflowInflowDotRingStroke(presDark: boolean): string {
  return presDark ? "#0f172a" : "#ffffff";
}

/** Пропсы Recharts <Line /> для факта (без type/dataKey/name). */
export function cashflowInflowFactLineProps(presDark: boolean) {
  const ring = cashflowInflowDotRingStroke(presDark);
  return {
    stroke: CASHFLOW_INFLOW_FACT.stroke,
    strokeWidth: CASHFLOW_INFLOW_FACT.strokeWidth,
    connectNulls: false as const,
    dot: {
      r: CASHFLOW_INFLOW_FACT.dotR,
      fill: CASHFLOW_INFLOW_FACT.stroke,
      stroke: ring,
      strokeWidth: 1,
    },
    activeDot: { r: CASHFLOW_INFLOW_FACT.activeDotR },
    isAnimationActive: false as const,
  };
}

/**
 * Базовые пропсы линии «факт — будущее» (stroke, strokeWidth, opacity).
 * Точки и activeDot задаются в графике: на стыке с текущим месяцем дублирующая точка скрыта.
 */
export function cashflowInflowFactFutureLineBaseProps(presDark: boolean) {
  const stroke = presDark ? "#9ca3af" : CASHFLOW_INFLOW_FACT_FUTURE.stroke;
  return {
    stroke,
    strokeWidth: CASHFLOW_INFLOW_FACT_FUTURE.strokeWidth,
    strokeOpacity: presDark ? 0.88 : CASHFLOW_INFLOW_FACT_FUTURE.strokeOpacity,
    connectNulls: false as const,
    isAnimationActive: false as const,
  };
}

/** Пропсы Recharts <Line /> для плана (без type/dataKey/name). */
export function cashflowInflowPlanLineProps(presDark: boolean) {
  const ring = cashflowInflowDotRingStroke(presDark);
  return {
    stroke: CASHFLOW_INFLOW_PLAN.stroke,
    strokeWidth: CASHFLOW_INFLOW_PLAN.strokeWidth,
    strokeDasharray: CASHFLOW_INFLOW_PLAN.strokeDasharray,
    dot: {
      r: CASHFLOW_INFLOW_PLAN.dotR,
      fill: CASHFLOW_INFLOW_PLAN.stroke,
      stroke: ring,
      strokeWidth: 1,
    },
    activeDot: { r: CASHFLOW_INFLOW_PLAN.activeDotR },
    isAnimationActive: false as const,
  };
}

/** Геометрия мини-легенды (viewBox), синхронно с радиусами точек. */
export const CASHFLOW_INFLOW_LEGEND_SWATCH = {
  viewBoxW: 40,
  viewBoxH: 12,
  midY: 6,
  lineStartX: 2,
  fact: {
    /** До внешнего края маркера (cx − r), визуально как на графике */
    lineEndX: 22,
    dotCx: 26,
  },
  plan: {
    lineEndX: 20.5,
    dotCx: 24,
  },
} as const;
