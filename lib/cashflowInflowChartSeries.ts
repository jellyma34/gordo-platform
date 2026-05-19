/**
 * Единый источник стилей серий графика «Динамика поступлений» (факт / план).
 * Используйте в <Line /> и в легенде, чтобы внешний вид не расходился.
 */

export const CASHFLOW_INFLOW_FACT = {
  stroke: "#1d4ed8",
  strokeWidth: 3,
  dotR: 5,
  activeDotR: 6.5,
} as const;

/** Мягкая secondary-линия плана (пастельный голубой, ниже контраста чем факт). */
export const CASHFLOW_INFLOW_PLAN = {
  stroke: "#AFC6FF",
  /** Подписи значений у точек плана */
  label: "#94A8D8",
  strokeWidth: 2.5,
  strokeOpacity: 0.88,
  strokeDasharray: "6 4",
  dotR: 3.5,
  activeDotR: 5,
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
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    connectNulls: false as const,
    dot: {
      r: CASHFLOW_INFLOW_FACT.dotR,
      fill: CASHFLOW_INFLOW_FACT.stroke,
      stroke: ring,
      strokeWidth: 1.5,
    },
    activeDot: {
      r: CASHFLOW_INFLOW_FACT.activeDotR,
      fill: CASHFLOW_INFLOW_FACT.stroke,
      stroke: ring,
      strokeWidth: 2,
    },
    isAnimationActive: false as const,
  };
}

/** Пропсы Recharts <Line /> для плана (без type/dataKey/name). */
export function cashflowInflowPlanLineProps(presDark: boolean) {
  const ring = cashflowInflowDotRingStroke(presDark);
  return {
    stroke: CASHFLOW_INFLOW_PLAN.stroke,
    strokeWidth: CASHFLOW_INFLOW_PLAN.strokeWidth,
    strokeOpacity: CASHFLOW_INFLOW_PLAN.strokeOpacity,
    strokeDasharray: CASHFLOW_INFLOW_PLAN.strokeDasharray,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    dot: {
      r: CASHFLOW_INFLOW_PLAN.dotR,
      fill: ring,
      stroke: CASHFLOW_INFLOW_PLAN.stroke,
      strokeWidth: 1.5,
      strokeOpacity: 0.95,
    },
    activeDot: {
      r: CASHFLOW_INFLOW_PLAN.activeDotR,
      fill: ring,
      stroke: CASHFLOW_INFLOW_PLAN.stroke,
      strokeWidth: 2,
    },
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
