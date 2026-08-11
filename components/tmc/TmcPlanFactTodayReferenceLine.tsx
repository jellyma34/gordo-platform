"use client";

import { ReferenceLine } from "@/components/charting/rechartsClient";

/** Стиль эталона вертикали «Сегодня» для помесячных LineChart ТМЦ. */
export const TMC_PLAN_FACT_TODAY_LINE = {
  stroke: "rgba(148,163,184,0.45)",
  strokeDasharray: "4 4",
  strokeWidth: 1,
  label: "Сегодня",
  labelFill: "#94a3b8",
  labelFontSize: 9,
  labelFontWeight: 600,
} as const;

export type TmcPlanFactMonthAxisRow = {
  monthKey: string;
  label: string;
};

/** Режим агрегации линейных графиков Plan/Fact (заявки / договоры / поставки). */
export type TmcPlanFactValueMode = "monthly" | "cumulative";

/**
 * Нарастающий итог из помесячных plan/fact.
 * Исходный monthly-массив не мутируется.
 */
export function accumulatePlanFactMonthlyRows<T extends { plan: number; fact: number }>(
  rows: T[],
): T[] {
  let planCum = 0;
  let factCum = 0;
  return rows.map((r) => {
    planCum += r.plan;
    factCum += r.fact;
    return { ...r, plan: planCum, fact: factCum };
  });
}

/** YYYY-MM текущей календарной даты (локальное время, как у шкалы графиков). */
export function tmcReportMonthKey(reportDate: Date = new Date()): string {
  return `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * X-категория оси для ReferenceLine: label месяца, совпадающего с reportDate.
 * Если сегодня вне периода графика — null (линию не рисуем, период не расширяем).
 */
export function resolveTmcPlanFactTodayXLabel(
  rows: TmcPlanFactMonthAxisRow[],
  reportDate: Date = new Date(),
): string | null {
  if (rows.length === 0) return null;
  const mk = tmcReportMonthKey(reportDate);
  const row = rows.find((r) => r.monthKey === mk);
  return row?.label ?? null;
}

/**
 * Вертикальная пунктирная reference line «Сегодня» для Plan/Fact LineChart.
 * Не является серией данных и не попадает в legend.
 */
export function TmcPlanFactTodayReferenceLine({
  rows,
  reportDate = new Date(),
}: {
  rows: TmcPlanFactMonthAxisRow[];
  reportDate?: Date;
}) {
  const xLabel = resolveTmcPlanFactTodayXLabel(rows, reportDate);
  if (!xLabel) return null;

  return (
    <ReferenceLine
      x={xLabel}
      stroke={TMC_PLAN_FACT_TODAY_LINE.stroke}
      strokeDasharray={TMC_PLAN_FACT_TODAY_LINE.strokeDasharray}
      strokeWidth={TMC_PLAN_FACT_TODAY_LINE.strokeWidth}
      ifOverflow="discard"
      label={{
        value: TMC_PLAN_FACT_TODAY_LINE.label,
        position: "insideTop",
        fill: TMC_PLAN_FACT_TODAY_LINE.labelFill,
        fontSize: TMC_PLAN_FACT_TODAY_LINE.labelFontSize,
        fontWeight: TMC_PLAN_FACT_TODAY_LINE.labelFontWeight,
      }}
    />
  );
}
