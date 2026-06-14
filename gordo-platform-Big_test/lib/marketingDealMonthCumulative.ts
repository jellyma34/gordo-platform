import { normalizeMonthKey } from "@/lib/normalizeMonthKey";

/** Конец календарного месяца `YYYY-MM` (локальное время), включительно. */
export function periodKeyEndOfMonthInclusiveLocalMs(periodKey: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  return new Date(y, mo, 0, 23, 59, 59, 999).getTime();
}

/** Число сделок с `dealDateMs` ≤ конца месяца `periodKey`. */
export function cumulativeDealCountAsOfMonth(
  dealRows: readonly { dealDateMs: number }[],
  periodKey: string,
): number | null {
  const endMs = periodKeyEndOfMonthInclusiveLocalMs(periodKey);
  if (endMs == null) return null;
  let n = 0;
  for (const r of dealRows) {
    const t = r.dealDateMs;
    if (typeof t === "number" && Number.isFinite(t) && t <= endMs) n++;
  }
  return n;
}

/** Накопленное число сделок на конец каждого месяца из списка ключей (порядок как в ряду графика). */
export function cumulativeDealCountThroughMonthMap(
  dealRows: readonly { dealDateMs: number }[],
  periodKeysSorted: readonly string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pk of periodKeysSorted) {
    if (!/^\d{4}-\d{2}$/.test(pk)) continue;
    const v = cumulativeDealCountAsOfMonth(dealRows, pk);
    if (v != null) out[pk] = v;
  }
  return out;
}

export function previousCalendarMonthKey(periodKey: string): string | null {
  const mk = normalizeMonthKey(periodKey) ?? periodKey;
  if (!/^\d{4}-\d{2}$/.test(mk)) return null;
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * `currentDealsCount === previousDealsCount` по накопленным сделкам на конец месяца / конец предыдущего месяца
 * (снимок из JSON) — новых продаж в выбранном месяце не было.
 */
export function isStagnantDealMonthNoNewSales(
  dealRows: readonly { dealDateMs: number }[],
  monthPeriodKey: string,
): boolean {
  const cur = normalizeMonthKey(monthPeriodKey) ?? monthPeriodKey;
  if (!/^\d{4}-\d{2}$/.test(cur)) return false;
  const prev = previousCalendarMonthKey(cur);
  if (!prev) return false;
  const c = cumulativeDealCountAsOfMonth(dealRows, cur);
  const p = cumulativeDealCountAsOfMonth(dealRows, prev);
  if (c == null || p == null) return false;
  return c === p;
}
