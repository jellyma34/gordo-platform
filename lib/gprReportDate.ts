import { toDate } from "@/lib/gprUtils";

/**
 * Календарная дата отчёта (локальные Y-M-D) для согласования расчётов плана/факта на срез.
 */
export function toLocalYmd(d: Date): string {
  const x = Number.isNaN(d.getTime()) ? new Date() : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Дата отчёта для UI: `reportDate` с бэкенда/состояния, иначе «сегодня».
 */
export function resolveGprReportAsOf(reportDate?: Date | string | null): Date {
  if (reportDate instanceof Date && !Number.isNaN(reportDate.getTime())) {
    return reportDate;
  }
  if (typeof reportDate === "string" && reportDate.trim()) {
    const d = toDate(reportDate.trim());
    if (d && !Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Короткий формат для подписей «факт − план на …» (DD.MM). */
export function formatDate(date: Date): string {
  const d = Number.isNaN(date.getTime()) ? new Date() : date;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}
