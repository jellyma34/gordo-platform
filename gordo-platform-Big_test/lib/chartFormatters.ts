/**
 * Единая точка импорта форматтеров для графиков маркетинга / плана продаж.
 * Используйте этот модуль в chart-компонентах вместо прямого импорта из salesPlanChartFormat,
 * если нужны оси cashflow (млн ₽) или компактные денежные подписи.
 */

import {
  formatCashflowChartUnitInteger,
  formatCashflowChartUnitTooltip,
  formatCashflowChartUnitYAxisTick,
  cashflowChartYAxisScale,
  rubToCashflowChartUnit,
} from "@/lib/cashflowChartUnits";
import {
  formatCompactCurrencyRu,
  formatCompactNumberWithoutCurrency,
} from "@/lib/formatCompactCurrencyRu";
import { dec1Fmt, formatChartAxisTickNumber } from "@/lib/salesPlanChartFormat";

/** Целые значения на оси (сделки, штуки, % без дробной части). */
export function formatAxisTick(n: number): string {
  return formatChartAxisTickNumber(n);
}

/** Ось Y графиков в единицах «млн ₽» (Динамика поступлений, Plan vs Fact). */
export function formatCashflowAxisTick(unit: number): string {
  return formatCashflowChartUnitYAxisTick(unit);
}

/** Прямой доступ к исходному форматтеру (если нужно старое имя). */
export { formatCashflowChartUnitYAxisTick };

/** Компактное число без валюты: «125,4 млн», «875 тыс». */
export function formatCompactNumber(n: number | null | undefined): string {
  return formatCompactNumberWithoutCurrency(n);
}

/** Компактная сумма с ₽: «125,4 млн ₽». */
export function formatCurrencyCompact(n: number | null | undefined): string {
  return formatCompactCurrencyRu(n);
}

/** Доля в процентах: «84,2%» или «—». */
export function formatPercent(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${dec1Fmt.format(pct)}%`;
}

export {
  cashflowChartYAxisScale,
  formatCashflowChartUnitInteger,
  formatCashflowChartUnitTooltip,
  rubToCashflowChartUnit,
};
